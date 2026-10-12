import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const CURRENT_ROE_VERSION = 2;

/** Rules of Engagement, version 1. Immutable once stored: a text change requires a new version. */
export const ROE_V1_CONTENT = `REGELWERK FÜR DEN EINSATZ (RULES OF ENGAGEMENT) — AI ARENA, VERSION 1

1. Zweck und Umfang
Die AI Arena testet die Abwehrfähigkeit einer vom Kunden betriebenen KI-Anwendung (Chat-Endpunkt) gegen Prompt-Injection, Systemprompt-Leaks, Offenlegung sensibler Daten, Jailbreaks und unsichere Ausgabeverarbeitung. Getestet wird ausschließlich der vom Kunden angegebene und verifizierte Endpunkt.

2. Zeitfenster und Budget
Ein Lauf findet nur innerhalb des freigegebenen Zeitfensters (sofern gesetzt) und innerhalb der festgelegten Budgets statt (maximale Runden, Anfragen, Tokens, Anfragen pro Sekunde). Die Plattform-Obergrenzen sind verbindlich und können nicht überschritten werden. Bei Überschreitung eines Budgets wird der Lauf sauber beendet.

3. Erlaubte Angriffskategorien
Erlaubt sind ausschließlich die im Katalog ausgewiesenen Kategorien: Prompt-Injection, Systemprompt-Leak, Offenlegung sensibler Informationen, Jailbreak und unsichere Ausgabeverarbeitung. Es werden nur harmlose Stellvertreter-Ziele verfolgt (z. B. Ausgabe eines Markers, Preisgabe eines Canary-Tokens oder bekannter Systemprompt-Fragmente). Nicht getestet werden Waffen, Schadsoftware, Missbrauchsdarstellungen, Selbstverletzung, echte Hassinhalte, Social Engineering realer Personen sowie Last- oder Dienstverweigerungstests.

4. Kein Produktivzugriff
Der Kunde bestätigt, dass der Endpunkt keine Produktivdaten Dritter verarbeitet und kein produktives Kundensystem unmittelbar angebunden ist. Der Test soll gegen eine Test- oder Staging-Instanz oder eine isolierte Produktivinstanz ohne schützenswerte Echtdaten laufen.

5. Keine Seiteneffekte, keine Tools
Der Kunde bestätigt, dass der getestete Chat-Endpunkt keine Werkzeuge, Aktionen oder Integrationen mit Seiteneffekten (z. B. Versand von E-Mails, Zahlungen, Schreibzugriffe auf Datenbanken, Tool-Aufrufe) ausführen kann. Die AI Arena testet nur Text-Chat-Endpunkte ohne Tools.

6. Notfallkontakt und Not-Aus
Der Kunde benennt einen jederzeit erreichbaren Notfallkontakt. Jeder Lauf kann über den Not-Aus-Schalter sofort abgebrochen werden; ein globaler Not-Aus kann alle Läufe stoppen.

7. Verträge mit dem KI-Anbieter
Der Kunde ist dafür verantwortlich, dass die Tests mit den Nutzungsbedingungen (ToS) und Acceptable-Use-Policies seines KI-Anbieters und Hosting-Anbieters vereinbar sind, und hat erforderliche Genehmigungen eingeholt. Endpunkte der Modell-Anbieter selbst (z. B. api.openai.com, api.anthropic.com) können nicht getestet werden.

8. Datenschutz und Aufbewahrung
Angriffs- und Antworttexte werden vor der Speicherung um Geheimnisse und personenbezogene Daten bereinigt und nach 30 Tagen automatisch gelöscht. Zugangsdaten und bekannte Prompt-Fragmente werden verschlüsselt gespeichert und nicht angezeigt. Antworten der getesteten Anwendung werden nicht an Dritte weitergegeben.

9. Haftungsfreistellung
Der Freigebende bestätigt, dazu berechtigt zu sein, den Test im Namen der Organisation freizugeben. Die Organisation stellt den Betreiber der Plattform von Ansprüchen Dritter frei, die aus einer unberechtigten Freigabe oder aus einem Verstoß gegen diese Regeln entstehen. Der Test erfolgt nach bestem Wissen; ein bestandener Test ist keine Sicherheitsgarantie.

10. Freigabe
Die Freigabe erfolgt ausschließlich durch einen Administrator der Organisation, wird mit Name, Zeitstempel und dieser Regelwerk-Version protokolliert und gilt nur für den freigegebenen Lauf.`;

/**
 * Rules of Engagement, version 2: version 1 plus target-kind specific terms (RAG, agent, widget).
 * Version 1 stays unchanged in the database; approvals given under it are outdated (ROE_OUTDATED).
 */
export const ROE_V2_CONTENT = `${ROE_V1_CONTENT.replace('VERSION 1', 'VERSION 2')}

11. Zusätzliche Bedingungen je Zieltyp
Die folgenden Bedingungen gelten zusätzlich, abhängig vom Zieltyp der freigegebenen Anwendung.

11.1 RAG-Anwendungen (Wissensbasis)
Der Freigebende willigt ein, dass PTaaS eindeutig markierte Testdokumente mit harmlosem Inhalt in die Wissensbasis einspeist und nach dem Lauf wieder entfernt. Es werden ausschließlich synthetische Testdaten verwendet, keine Echtdaten. Schlägt die Entfernung fehl, wird der Kunde darüber informiert und muss die markierten Dokumente selbst löschen. Im Modus MANUAL platziert der Kunde die Testdokumente selbst und bestätigt dies.

11.2 Agenten mit Werkzeugen
Agenten werden ausschließlich in einer Staging-Umgebung getestet. Die Werkzeuge sind sandboxed bzw. im Dry-Run-Modus, es werden keine echten Aktionen ausgelöst (kein Schreiben, Löschen, Senden oder Bezahlen). Die von PTaaS verwendeten Marker-Argumente sind wirkungslos. Der Freigebende bestätigt Staging-Umgebung und Sandbox ausdrücklich; ohne diese Bestätigungen startet kein Lauf.

11.3 Web-Widgets
PTaaS bedient das Widget über eine automatisierte Browsersitzung auf der verifizierten Domain. Während der Sitzung ist der Netzwerkzugriff auf diese Domain beschränkt; Zugriffe auf andere Hosts werden blockiert. Es werden keine Dateien heruntergeladen und keine Berechtigungen erteilt.`;

export function hashRoe(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export interface RoeView {
  id: string;
  version: number;
  content: string;
  contentHash: string;
}

@Injectable()
export class ArenaRoeService implements OnModuleInit {
  private readonly log = new Logger(ArenaRoeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureCurrent();
    } catch (err) {
      // DB may be unavailable during boot checks; getCurrent() retries lazily.
      this.log.warn(`RoE seed failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Upserts all known versions (v1 stays for old approvals). Stored versions are immutable (update is empty). */
  async ensureCurrent(): Promise<RoeView> {
    let current: RoeView | undefined;
    for (const [version, content] of [
      [1, ROE_V1_CONTENT],
      [CURRENT_ROE_VERSION, ROE_V2_CONTENT],
    ] as const) {
      const contentHash = hashRoe(content);
      const row = await this.prisma.arenaRoe.upsert({
        where: { version },
        create: { version, content, contentHash },
        update: {},
      });
      if (row.contentHash !== contentHash) {
        this.log.error(`Stored RoE v${version} differs from code — bump the version instead of editing`);
      }
      if (version === CURRENT_ROE_VERSION) {
        current = { id: row.id, version: row.version, content: row.content, contentHash: row.contentHash };
      }
    }
    return current as RoeView;
  }

  /** The newest stored version. */
  async getCurrent(): Promise<RoeView> {
    const row = await this.prisma.arenaRoe.findFirst({ orderBy: { version: 'desc' } });
    if (!row) return this.ensureCurrent();
    return { id: row.id, version: row.version, content: row.content, contentHash: row.contentHash };
  }
}
