# PTaaS Benutzeranleitung — CISO

**Zielgruppe:** CISOs, CIOs, Head of Security und alle Führungskräfte, die die Security-Lage ihrer Organisation überblicken, Entscheidungen treffen und Compliance nachweisen müssen.  
**Fokus:** Risikolagebild, Entscheidungsrelevanz, Management-Reporting — kein technisches Detail nötig  
**Zugriff:** Admin-Rolle empfohlen (für vollständige Dashboard-Daten)

---

## Inhaltsverzeichnis

1. [Login & Zugang](#1-login--zugang)
2. [CISO Dashboard View](#2-ciso-dashboard-view)
3. [KPI-Karten lesen und interpretieren](#3-kpi-karten-lesen-und-interpretieren)
4. [SLA-Management](#4-sla-management)
5. [Risk Acceptances verwalten](#5-risk-acceptances-verwalten)
6. [Executive Reports](#6-executive-reports)
7. [Security Posture](#7-security-posture)
8. [Analytics & Trends](#8-analytics--trends)
9. [Compliance-Übersicht (NIS2)](#9-compliance-übersicht-nis2)
10. [CVE & Threat Intelligence](#10-cve--threat-intelligence)
11. [Team & Zugriffsverwaltung](#11-team--zugriffsverwaltung)
12. [Organisations-Einstellungen](#12-organisations-einstellungen)

---

## 1. Login & Zugang

### 1.1 Login

1. App-URL aufrufen (z.B. `https://eure-instanz.ptaas.io`)
2. E-Mail und Passwort eingeben → **"Sign in"**
3. 6-stelligen MFA-Code aus der Authenticator-App eingeben
4. Du landest auf dem Dashboard

### 1.2 SSO (Single Sign-On)

Falls eure Organisation SSO konfiguriert hat:
- **"Sign in with SSO"** klicken
- Organisations-Slug eingeben
- Weiterleitung zum IdP (Entra ID / Okta / etc.)
- MFA-Schritt entfällt wenn euer IdP MFA erzwingt

### 1.3 Passwort vergessen

- Login-Screen → **"Passwort vergessen?"**
- E-Mail eingeben → Reset-Link kommt per E-Mail (30 Minuten gültig)

---

## 2. CISO Dashboard View

### 2.1 CISO View aktivieren

Das Dashboard hat standardmäßig die normale Ansicht. Als CISO aktivierst du die **erweiterte Entscheidungsansicht**:

1. Dashboard aufrufen
2. Oben rechts: Button **"CISO View"** klicken
3. Button wird lila-hervorgehoben (aktiv)
4. Der **AI-Briefing-Block** erscheint oberhalb der KPI-Karten

> Der Toggle-Zustand wird nicht gespeichert — bei jedem Login neu aktivieren.

### 2.2 AI-Briefing-Block — drei Panels

Der CISO-Briefing-Block liefert auf einen Blick die drei wichtigsten Informationen:

#### Panel 1: Risikolage
Zeigt ob und wie viele kritische Findings offen sind:
- Keine kritischen Findings → **"Lage stabil"**
- Kritische Findings vorhanden → **"X kritische Findings offen. Sofortiger Handlungsbedarf."**

#### Panel 2: Was erfordert deine Entscheidung?
Zeigt was ohne Führungsentscheidung blockiert ist:
- Anzahl Findings ohne zugewiesenen Owner
- Anzahl SLA-Überschreitungen
- → Grundlage für deine nächste Runde mit dem Security-Team

#### Panel 3: Security-Score
- Numerischer Gesamt-Score (0–100)
- **Rot** = kritisches Risikoniveau
- **Orange** = hohes Risikoniveau
- **Gelb** = mittleres Risikoniveau
- **Grün** = akzeptables Niveau

### 2.3 Action-Banner (Warning)

Wenn kritische Findings ohne Owner existieren, erscheint ein **orangefarbener Banner** über dem Briefing-Block:

> "X Critical Findings erfordern deine Entscheidung — Mindestens Y davon haben die SLA-Frist überschritten — Owner zuweisen oder Risiko akzeptieren."

**→ Klicke "Jetzt ansehen"** um die betroffenen Findings direkt zu sehen.

Diese Banner sind deine **tägliche Prioritätenliste als CISO**.

---

## 3. KPI-Karten lesen und interpretieren

### 3.1 Die fünf KPI-Karten

| Karte | Was sie sagt | Gut wenn... |
|-------|-------------|-------------|
| **Open Findings** | Gesamtzahl offener Schwachstellen | Trend sinkt |
| **Critical** | Kritische offene Findings | 0 oder sinkend |
| **High** | Hohe offene Findings | Trend sinkt |
| **Verified Fixed** | Bestätigte Behebungen | Trend steigt |
| **Avg Risk Score** | Durchschnittliches Risiko (0–100) | Unter 30 = gut |

### 3.2 Farbcodierung

- **Rot** — Soforthandlungsbedarf, SLA-kritisch
- **Orange** — Erhöhtes Risiko, Aufmerksamkeit nötig
- **Grün** — Akzeptabler Zustand

### 3.3 Was die Zahlen bedeuten — Handlungsableitung

| Situation | Interpretation | Empfohlene Aktion |
|-----------|---------------|-------------------|
| Critical > 0, steigend | Neue Angriffsflächen entdeckt oder bestehende nicht behoben | Security-Team-Meeting, Priorisierung |
| Critical = 0 | Kein akutes P0-Risiko | Routine-Monitoring |
| Verified Fixed steigt | Team behebt effektiv | Positiv kommunizieren |
| Avg Risk Score > 60 | Systemisches Risikoproblem | Strukturmaßnahme, ggf. externe Hilfe |
| SLA-Breaches vorhanden | Prozess-Problem oder Kapazitätsmangel | Resource-Entscheidung nötig |

---

## 4. SLA-Management

### 4.1 SLA-Seite aufrufen

Sidebar → **"SLA"**

### 4.2 SLA-Fristen kennen

| Severity | Frist | Begründung |
|----------|-------|------------|
| **CRITICAL** | 7 Tage | Aktives Exploit-Risiko |
| **HIGH** | 30 Tage | Hohe Ausnutzbarkeit |
| **MEDIUM** | 90 Tage | Mittlere Dringlichkeit |
| **LOW** | 180 Tage | Langfristige Hygiene |

### 4.3 SLA-Übersicht lesen

Die SLA-Seite zeigt:
- **Breached (rot)** — Frist überschritten → sofort eskalieren
- **At Risk (orange)** — Frist in <48h → proaktiv handeln
- **On Track (grün)** — innerhalb der Frist

### 4.4 Eskalation-Workflow

Wenn SLA-Breaches vorliegen:

1. **Klicke auf das betroffene Finding** → öffnet Finding-Detail
2. Prüfe ob ein **Owner zugewiesen** ist
3. Wenn kein Owner → Owner im "Remediation"-Tab zuweisen
4. Wenn Owner vorhanden, aber kein Fortschritt → direktes Gespräch

### 4.5 Was als CISO zu entscheiden ist

Einige Findings können nicht innerhalb der SLA-Frist behoben werden. Als CISO entscheidest du:

- **Risk Acceptance** — Risiko bewusst akzeptieren (mit Begründung und Ablaufdatum)
- **Fristerhöhung** (intern) — Owner mehr Zeit geben, aber dokumentieren warum
- **Priorisierung** — andere Features/Projekte zurückstellen damit das Team die Frist einhält

---

## 5. Risk Acceptances verwalten

### 5.1 Was ist eine Risk Acceptance?

Eine Risk Acceptance dokumentiert die bewusste Entscheidung, ein bekanntes Risiko zu akzeptieren — weil:
- Die Behebung wirtschaftlich unverhältnismäßig wäre
- Das Finding in einem Legacy-System sitzt das nicht mehr geändert werden kann
- Ein kompensierendes Kontroll vorliegt

### 5.2 Risk Acceptance erstellen

1. Finding öffnen → Tab **"Remediation"** → **"Accept Risk"**
2. Felder ausfüllen:
   - **Begründung** (Pflichtfeld) — warum wird das Risiko akzeptiert?
   - **Ablaufdatum** — wann wird die Entscheidung erneut bewertet?
   - **Owner** — wer ist für die Entscheidung verantwortlich?
3. **"Save Risk Acceptance"**

### 5.3 Ablaufende Risk Acceptances

Im Dashboard erscheint ein **Hinweis-Banner** wenn Risk Acceptances in den nächsten 30 Tagen ablaufen:

> "X Risk Acceptances laufen demnächst ab — Review erforderlich"

→ Entscheide: verlängern oder endlich beheben?

### 5.4 Risk-Acceptance-Übersicht

Dashboard → unten: **"Expiring Risk Acceptances"** Panel zeigt alle ablaufenden Einträge mit Ablaufdatum und Begründung.

---

## 6. Executive Reports

### 6.1 Was ist ein Executive Report?

Ein auf Management ausgerichteter PDF-Report mit:
- **Executive Summary** — Lage in 3–5 Sätzen
- **Risk Score** mit Trend
- **OWASP Top 10 Heatmap** — welche Schwachstellenklassen dominieren
- **Handlungsempfehlungen** (High-Level)
- **Keine technischen Details** (kein HTTP-Code, kein CVSS-Vektor)

Ideal für: Vorstandsmeetings, Auditor-Berichte, Kunden-Kommunikation.

### 6.2 Executive Report erstellen

1. Sidebar → **"Projects"** → Projekt wählen → Tab **"Reports"**
2. **"+ New Report"**
3. Report-Typ: **"Executive Report"**
4. Konfigurieren:
   - **Titel** (z.B. "Quartalsbericht Q3 2026 – Sicherheitslage")
   - **Berichtszeitraum** (Von/Bis)
   - **Findings-Scope** — welche Severity-Level einschließen?
5. **"Generate Report"**
6. Fortschritt-Ring zeigt Generierung → bei Abschluss: grüner Checkmark
7. **"Download PDF"**

### 6.3 Report teilen

- **"Share Link"** → zeitlich begrenzter Download-Link (7 Tage gültig)
- Link per E-Mail an Stakeholder senden
- Kein Login in der App nötig um den Report herunterzuladen

### 6.4 Report-Inhalte verstehen

**Executive Summary:** KI-generierte Zusammenfassung der Sicherheitslage. Fachlich geprüft werden sollte:
- Stimmt die Tenor-Aussage?
- Sind die genannten kritischen Bereiche korrekt?

**OWASP Heatmap:** Zeigt in welchen Kategorien die meisten Schwachstellen liegen. Wichtig für:
- Training-Budgets (welche Schulungen braucht das Dev-Team?)
- Architektur-Entscheidungen (welche Bereiche brauchen Code-Review?)

**Trend-Darstellung:** Zeigt ob sich die Lage verbessert oder verschlechtert. Argument für:
- Budget-Gespräche ("Investition zeigt Wirkung")
- Ressourcen-Anfragen ("Wir kommen nicht nach — mehr Kapazität nötig")

---

## 7. Security Posture

Sidebar → **"Posture"**

### 7.1 Was die Posture-Seite zeigt

Die Posture-Ansicht gibt einen **organisationsweiten Überblick** über die Security-Reife:

| Bereich | Inhalt |
|---------|--------|
| **Overall Risk Score** | Gesamt-Score mit historischem Trend |
| **Projekt-Ranking** | Projekte nach Risiko sortiert |
| **Asset Coverage** | Wie viele Assets werden aktiv gescannt? |
| **Scan-Frequency** | Wie oft werden Systeme gescannt? |
| **Remediation Velocity** | Wie schnell werden Findings behoben? |

### 7.2 Posture-Score interpretieren

| Score | Bewertung | Empfehlung |
|-------|-----------|------------|
| 0–20 | Sehr gut | Weiter so — Routine-Monitoring |
| 21–40 | Gut | Einzelne Bereiche verbessern |
| 41–60 | Mittel | Investition in Remediation nötig |
| 61–80 | Kritisch | Sofortmaßnahmen, ggf. externe Hilfe |
| 81–100 | Notfall | Krisenmodus — Executive Attention |

### 7.3 Schwächste Projekte identifizieren

Die Projekt-Ranking-Tabelle zeigt:
- Name, Risk Score, offene Critical/High-Findings
- Klicke auf ein Projekt → direkte Navigation zur Findings-Liste

→ Nutze diese Ansicht um zu entscheiden wo Security-Investment am dringendsten benötigt wird.

---

## 8. Analytics & Trends

Sidebar → **"Analytics"**

### 8.1 Für CISO relevante Charts

#### Remediation Velocity (MTTR)
**Mean Time to Remediate** — wie lange braucht das Team durchschnittlich um ein Finding zu beheben:
- **Critical MTTR < 7 Tage** = SLA eingehalten ✅
- **Critical MTTR > 7 Tage** = SLA-Problem → Eskalation

#### SLA Compliance Rate
Prozentualer Anteil der Findings der innerhalb der SLA-Frist behoben wurde:
- **> 90%** = exzellent
- **70–90%** = akzeptabel
- **< 70%** = strukturelles Problem

#### Finding Trend
Neue Findings vs. behobene Findings:
- **Grün > Rot** = Rückstand wird abgebaut → positive Entwicklung
- **Rot > Grün** = Rückstand wächst → mehr Kapazität oder weniger neue Features nötig

#### OWASP Distribution (Pie Chart)
Zeigt welche Schwachstellenklassen dominieren — Grundlage für:
- Secure-Coding-Trainings (z.B. "60% XSS → Frontend-Training priorisieren")
- Architektur-Reviews

### 8.2 Zeitraum wählen

Oben rechts: **7d / 30d / 90d / 1y / Gesamt**

Für Quartalsberichte: **90d** wählen.  
Für Jahresberichte: **1y** wählen.

### 8.3 Daten exportieren

Analytics-Seite → **"Export"** → CSV-Download der Rohdaten für eigene Auswertungen in Excel/BI-Tools.

---

## 9. Compliance-Übersicht (NIS2)

Sidebar → **"Compliance"**

### 9.1 NIS2-Relevanz

Die NIS2-Richtlinie (Network and Information Systems Directive 2) verpflichtet Unternehmen in kritischen Sektoren zu:
- Risikomanagement-Maßnahmen
- Incident-Reporting (24h Erstmeldung, 72h Detailbericht)
- Supply-Chain-Sicherheit
- Nachweispflicht der Security-Maßnahmen

### 9.2 Compliance-Dashboard lesen

| Spalte | Bedeutung |
|--------|-----------|
| **Anforderung** | NIS2-Artikel oder -Kontrolle |
| **Status** | COMPLIANT / PARTIAL / NON_COMPLIANT |
| **Findings** | Wie viele offene Findings berühren diese Anforderung |
| **Aktion** | Was zu tun ist |

### 9.3 Compliance-Status verbessern

Für jede **NON_COMPLIANT**-Anforderung:
1. Klicke die Zeile → Detailansicht mit betroffenen Findings
2. Findings dem zuständigen Team zuweisen
3. Nach Behebung: Compliance-Status aktualisiert sich automatisch

### 9.4 Compliance-Report erstellen

Compliance → **"Export Compliance Report"** → PDF mit:
- Aktueller Compliance-Score
- Detailliertes Mapping Findings ↔ NIS2-Anforderungen
- Nachweisdokument für Auditoren

---

## 10. CVE & Threat Intelligence

### 10.1 CVE Intelligence aufrufen

Sidebar → **"CVE Intel"**

### 10.2 Was du als CISO brauchst

**CISA KEV-Einträge:**
- CVEs die **aktiv ausgenutzt** werden
- Wenn eine KEV-CVE eure Assets betrifft: sofortige Eskalation an Security Engineer

**EPSS > 50%:**
- CVEs mit hoher Exploit-Wahrscheinlichkeit in den nächsten 30 Tagen
- Priorisierungs-Signal für das Security-Team

### 10.3 Threat Briefing

Sidebar → **"Threat Intel"**

- Täglich aktuelle Informationen über aktive Bedrohungskampagnen
- Relevanz-Filter: zeigt nur was eure Branche/euren Tech-Stack betrifft
- **Keine technische Tiefe nötig** — Briefing-Format für Management

### 10.4 Entscheidungsrahmen: Wann eskaliere ich?

| Situation | Aktion |
|-----------|--------|
| KEV-CVE betrifft euer kritisches System | Sofort Security Engineer + Management informieren |
| EPSS >50% + offenes Finding in eurem Stack | Priorisierung in nächstem Sprint-Planning |
| EPSS <10% | Normale Priorisierung nach CVSS/Risk Score |
| Neue CVE ohne Finding | Security Engineer beauftragen zu prüfen |

---

## 11. Team & Zugriffsverwaltung

### 11.1 Mitglieder verwalten

Sidebar → **"Settings"** → **"Members"**

### 11.2 Neues Mitglied einladen

1. **"Invite Member"**
2. E-Mail-Adresse eingeben
3. Rolle wählen:
   - **ADMIN** — voller Zugriff inkl. Org-Einstellungen, Mitgliederverwaltung
   - **MEMBER** — Zugriff auf Projekte und Findings, kein Org-Admin
4. **"Send Invite"** → Einladungs-E-Mail wird gesendet

### 11.3 Rollen verstehen

| Rolle | Was sie darf |
|-------|-------------|
| **ADMIN** | Alles: Mitglieder einladen/entfernen, Org-Einstellungen, alle Projekte |
| **MEMBER** | Projekte einsehen, Findings bearbeiten, Scans starten, Reports erstellen |

> Als CISO empfiehlt sich die **ADMIN-Rolle** für vollständigen Zugriff auf alle Daten und die Mitgliederverwaltung.

### 11.4 Mitglied entfernen

1. Members-Liste → Mitglied suchen
2. **"Remove"** → Bestätigung
3. Zugriff wird sofort entzogen

### 11.5 Eigene Rolle prüfen

Settings → Members → dein Name → aktuelle Rolle sichtbar.

---

## 12. Organisations-Einstellungen

Sidebar → **"Settings"** (Admin-Bereich)

### 12.1 Organisations-Profil

- **Organisations-Name** und **Slug** änderbar
- **Logo hochladen** — erscheint in PDF-Reports
- **Branche** und **Unternehmensgröße** — beeinflusst KI-Empfehlungen

### 12.2 SAML SSO konfigurieren

Settings → **"SSO"**:

1. **IdP Metadata URL** eingeben (von Entra ID / Okta / etc.)
2. **Entity ID** und **ACS URL** aus der Plattform in deinen IdP kopieren
3. **"Test SSO"** → Test-Login durchführen
4. **"Enable SSO"** → ab sofort können Nutzer per SSO einloggen

> Nach SSO-Aktivierung: Passwort-Login kann optional deaktiviert werden (erhöht Sicherheit).

### 12.3 Scan-Policies verwalten

Settings → **"Scan Policies"**:
- Definiere welche Scan-Profile für eure Organisation erlaubt sind
- Beispiel: "Nur SCHNELL und STANDARD — kein KOMPLETT ohne Genehmigung"

### 12.4 Audit-Log

Settings → **"Audit Log"**:
- Unveränderlicher Log aller sicherheitsrelevanten Aktionen
- Zeigt: wer, was, wann
- Filterbar nach Nutzer, Aktion, Zeitraum
- Exportierbar als CSV für Compliance-Nachweise

**Wichtige Audit-Events:**
| Event | Bedeutung |
|-------|-----------|
| `user.login` | Login-Versuche (inkl. fehlgeschlagene) |
| `user.invited` | Neue Mitglieder |
| `user.removed` | Entfernte Zugänge |
| `finding.status_changed` | Status-Änderungen |
| `risk_acceptance.created` | Neue Risk Acceptances |
| `scan.started` | Jeder gestartete Scan |
| `report.generated` | Erstellte Reports |

---

## Management-Summary: Tägliche CISO-Routine (5 Minuten)

1. **Dashboard öffnen** → CISO View aktivieren
2. **AI-Briefing lesen** — Risikolage, Entscheidungsbedarf, Score
3. **Action-Banner prüfen** — gibt es kritische Findings ohne Owner?
4. **Entscheidungen treffen:**
   - Owner zuweisen wenn fehlend
   - Risk Acceptance erstellen wenn nötig
   - Security Engineer bei KEV-CVEs informieren
5. **SLA-Seite** kurz prüfen — gibt es neue Breaches?

---

## Häufige Fragen (CISO)

**F: Wie erkläre ich dem Vorstand was der "Security Score" bedeutet?**  
A: Der Score (0–100) misst das gewichtete Risiko aller offenen Schwachstellen. 0 = keine Schwachstellen, 100 = kritische ungepatchte Systeme. Ein Score unter 30 gilt als akzeptabler Betriebszustand. Vergleichbar mit einem Kredit-Score — höher ist schlechter.

**F: Ein Auditor fragt nach Nachweisen unserer Security-Maßnahmen. Was gebe ich ihm?**  
A: (1) Executive Report der letzten 12 Monate, (2) Audit-Log Export, (3) Compliance-Report (NIS2), (4) Risk-Acceptance-Dokumentation mit Begründungen. Alle als PDF aus der Plattform abrufbar.

**F: Wir haben ein kritisches Finding das wir technisch nicht schnell beheben können. Was tun?**  
A: Risk Acceptance erstellen mit: (1) klarer Begründung, (2) kompensierende Kontrolle dokumentieren (z.B. WAF-Regel, Netzwerksegmentierung), (3) Ablaufdatum setzen (max. 90 Tage), (4) Owner für regelmäßiges Review benennen.

**F: Wie oft sollten wir Scans durchführen?**  
A: Empfehlung: Kritische Produktionssysteme wöchentlich (SCHNELL-Scan), monatlich STANDARD-Scan, quartalsweise KOMPLETT-Scan. Neue Deployments: immer vor Go-Live scannen.

**F: Was ist der Unterschied zwischen einem Finding als FALSE_POSITIVE markieren und einer Risk Acceptance?**  
A: **False Positive** = das Finding ist kein echtes Sicherheitsproblem (Fehlalarm des Scanners). **Risk Acceptance** = das Finding ist ein echtes Problem, wird aber bewusst nicht behoben. Beide müssen dokumentiert werden, aber Risk Acceptances sind compliance-relevant und haben Ablaufdaten.

**F: Muss ich selbst in der Plattform arbeiten oder reicht der wöchentliche Report?**  
A: Beide Optionen sind valide. Der wöchentliche Executive Report deckt die Lage ab. Für zeitkritische Entscheidungen (KEV-CVEs, neue kritische Findings) empfiehlt sich jedoch direkter Dashboard-Zugriff oder eine Alert-Konfiguration per Slack/E-Mail.
