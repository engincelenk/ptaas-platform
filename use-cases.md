# PTaaS Platform – Funktionen & Use Cases

**Datum:** 2026-06-21  
**Projektname:** ptaas-platform  
**Version:** 1.0

---

## Funktionale Domänen

```
1. Identity & Access      → Wer darf was
2. Organisation & Projekt → Womit wird gearbeitet
3. Target Management      → Was wird getestet
4. Scan Engine            → Wie wird getestet
5. Findings               → Was wurde gefunden
6. KI-Analyse             → Was bedeutet es
7. Reporting              → Was wird kommuniziert
```

---

## Akteure

| Akteur | Beschreibung |
|--------|-------------|
| **Security Engineer** | Führt Scans durch, analysiert Findings, koordiniert Fixes |
| **CISO / Manager** | Liest Reports, verwaltet Team, überwacht Risiko |
| **Developer** | Empfängt Findings, implementiert Fixes, aktualisiert Status |
| **System** | Automatisierte Prozesse: Scans, Notifications, KI-Analyse |

---

## Use Cases

---

### Domäne 1: Identity & Access

#### UC-01 — Registrierung & Onboarding
**Akteur:** Security Engineer  
**Ziel:** Zugang zur Plattform erhalten und einsatzbereit sein

**Ablauf:**
1. User öffnet Registrierungsseite
2. Gibt Name, E-Mail, Passwort ein (min. 12 Zeichen, Komplexitätsprüfung)
3. Bestätigt E-Mail-Adresse via Link
4. Legt Organisation an (Name, optional Logo)
5. Richtet MFA ein (TOTP via Authenticator App — Pflicht)
6. Wird auf Dashboard weitergeleitet

**Abnahmekriterien:**
- MFA ist verpflichtend — ohne Setup kein Zugang zum Dashboard
- Passwort wird mit Argon2 gehasht, niemals im Klartext gespeichert
- Alle Schritte im Audit Log erfasst

---

#### UC-02 — Login
**Akteur:** Alle  
**Ziel:** Sicher einloggen

**Ablauf:**
1. User gibt E-Mail + Passwort ein
2. Gibt MFA-Code ein (TOTP)
3. Erhält Access Token (15min) + Refresh Token (7d, httpOnly Cookie)
4. Wird auf Dashboard weitergeleitet

**Alternativablauf — fehlgeschlagener Login:**
- Nach 5 Fehlversuchen: temporäre Kontosperrung (15 Minuten)
- Jeder Fehlversuch wird mit IP und Zeitstempel geloggt

---

#### UC-03 — Team verwalten
**Akteur:** Admin  
**Ziel:** Teammitglieder einladen, Rollen zuweisen

**Ablauf:**
1. Admin öffnet Organisations-Einstellungen
2. Gibt E-Mail-Adresse eines neuen Mitglieds ein
3. Wählt Rolle: Security Engineer / Developer / Viewer
4. System sendet Einladungslink (24h gültig)
5. Neues Mitglied akzeptiert, richtet Account + MFA ein

**Rollen & Berechtigungen:**

| Aktion | Admin | Security Engineer | Developer | Viewer |
|--------|-------|-------------------|-----------|--------|
| Scans starten | ✓ | ✓ | ✗ | ✗ |
| Findings lesen | ✓ | ✓ | ✓ | ✓ |
| Findings bearbeiten | ✓ | ✓ | eigene | ✗ |
| Reports exportieren | ✓ | ✓ | ✗ | ✓ |
| Team verwalten | ✓ | ✗ | ✗ | ✗ |
| Projekte anlegen | ✓ | ✓ | ✗ | ✗ |

---

#### UC-04 — Audit Log lesen
**Akteur:** Admin, Security Engineer  
**Ziel:** Nachvollziehen wer wann was getan hat

**Logged werden:**
- Login / Logout / fehlgeschlagene Versuche
- MFA-Setup und -Änderungen
- Passwortänderungen
- Projekt- und Target-Änderungen
- Scan-Start und -Abschluss
- Finding-Statusänderungen
- Team-Änderungen (Einladung, Rollenänderung, Entfernung)
- Report-Exports

**Nicht geloggt:**
- Passwörter, Tokens, Secrets (niemals)

---

### Domäne 2: Organisation & Projekt

#### UC-05 — Projekt anlegen
**Akteur:** Admin, Security Engineer  
**Ziel:** Neuen Test-Scope organisieren

**Ablauf:**
1. User klickt "Neues Projekt"
2. Gibt Projektname und optionale Beschreibung ein
3. Definiert Scope-Grenzen (welche Domains / IPs sind erlaubt)
4. Projekt wird erstellt, User kann Targets hinzufügen

---

#### UC-06 — Dashboard lesen
**Akteur:** Alle  
**Ziel:** Schneller Überblick über Sicherheitsstatus

**Dashboard zeigt:**
- Gesamtzahl offener Findings (gruppiert nach Severity: Critical / High / Medium / Low)
- Risk Score pro Projekt (0–100)
- Trend: Vergleich zu letzter Woche (besser / gleich / schlechter)
- Zuletzt durchgeführte Scans mit Status
- Top 5 kritischste offene Findings
- OWASP Top 10 Abdeckung (welche Kategorien betroffen)

---

### Domäne 3: Target Management

#### UC-07 — Target hinzufügen
**Akteur:** Admin, Security Engineer  
**Ziel:** Scan-Ziel definieren

**Unterstützte Target-Typen:**
- Domain (`example.com`)
- Subdomain (`app.example.com`)
- IP-Adresse (`192.168.1.1`)
- IP-Range (`192.168.1.0/24`)
- URL (`https://example.com/api`)

---

#### UC-08 — Domain Verification ← rechtlich kritisch
**Akteur:** Security Engineer  
**Ziel:** Autorisierung für Scan nachweisen — kein Scan ohne Verification

**Verification-Methoden (User wählt eine):**

**Methode A — DNS TXT Record:**
1. Plattform generiert eindeutigen Token: `ptaas-verify=abc123xyz`
2. User fügt Token als DNS TXT Record für die Domain ein
3. User klickt "Verifizieren"
4. Plattform führt DNS-Lookup durch und prüft Token
5. Bei Erfolg: Target verifiziert, Scan freigegeben

**Methode B — HTTP File:**
1. Plattform generiert Datei `ptaas-verify.txt` mit Token
2. User hostet Datei unter `https://domain.com/.well-known/ptaas-verify.txt`
3. Plattform ruft URL ab und prüft Inhalt
4. Bei Erfolg: Target verifiziert

**Methode C — Meta Tag:**
1. Plattform generiert Meta Tag: `<meta name="ptaas-verify" content="abc123xyz">`
2. User fügt Tag in `<head>` der Website ein
3. Plattform ruft Startseite ab und prüft Tag
4. Bei Erfolg: Target verifiziert

**Sicherheitsregel:** Kein Scan startet ohne erfolgreich abgeschlossene Verification. Auch nicht im lokalen Betrieb. Ausnahme: `localhost` und `127.0.0.1` für Entwicklungstests.

---

### Domäne 4: Scan Engine

#### UC-09 — Scan konfigurieren & starten
**Akteur:** Security Engineer  
**Ziel:** Gezielten Sicherheitsscan starten

**Konfigurationsoptionen:**
- Scan-Typ: Quick Scan (häufigste Schwachstellen, ~5min) / Full Scan (alle Templates, ~30–60min)
- Nuclei Template-Kategorien: CVEs, Misconfigurations, Exposures, Technologies, OWASP
- Optionale Scan-Credentials (Basic Auth, Bearer Token, Cookie — gespeichert in Secrets)
- Ausschlüsse: bestimmte Pfade oder Endpunkte aus dem Scan nehmen

**Ablauf:**
1. User wählt Projekt und verifizierten Target
2. Konfiguriert Scan-Parameter
3. Klickt "Scan starten"
4. Job landet in BullMQ Queue
5. Scanner Worker nimmt Job auf (max. 30s Latenz)
6. Scan läuft, User sieht Live-Fortschritt

---

#### UC-10 — Scan live beobachten
**Akteur:** Security Engineer  
**Ziel:** Scan-Fortschritt in Echtzeit verfolgen

**Live-Anzeige via WebSocket / SSE:**
- Fortschrittsbalken (x von y Templates abgeschlossen)
- Aktuelle Aktivität ("Prüfe CVE-2024-XXXX auf example.com")
- Erste Findings erscheinen sofort wenn gefunden
- Scanner-Status: Running / Paused / Completed / Failed
- Laufzeit und geschätzte Restzeit

---

#### UC-11 — Geplanter Scan (recurring)
**Akteur:** Security Engineer, System  
**Ziel:** Automatische Wiederholung ohne manuellen Trigger

**Ablauf:**
1. User aktiviert "Scheduled Scan" für ein Projekt
2. Wählt Intervall: täglich / wöchentlich / monatlich
3. System erstellt wiederkehrenden BullMQ Job
4. Scans laufen automatisch, Ergebnisse werden verglichen mit letztem Scan
5. Neue Findings → Notification an Security Engineer
6. Keine neuen Findings → stiller Erfolgseintrag im Audit Log

---

### Domäne 5: Findings

#### UC-12 — Findings lesen & filtern
**Akteur:** Alle  
**Ziel:** Überblick über gefundene Schwachstellen gewinnen

**Filter-Optionen:**
- Severity: Critical / High / Medium / Low / Info
- Status: Open / In Progress / Fixed / Verified / Closed / False Positive
- OWASP-Kategorie (A01–A10)
- CWE-Nummer
- Target / Projekt
- Zugewiesen an (Person)
- Zeitraum

**Ansichten:**
- Liste (sortierbar nach Severity, Datum, Status)
- Semantische Suche (pgvector: "SQL Injection auf Login-Endpoint")

---

#### UC-13 — Finding im Detail lesen
**Akteur:** Alle  
**Ziel:** Schwachstelle vollständig verstehen

**Finding-Detail enthält:**
- Titel und Beschreibung (technisch)
- KI-Erklärung in Plain Language (UC-18)
- Severity + CVSS Score + Begründung
- OWASP-Kategorie + CWE-Nummer
- Betroffene URL / Endpoint
- HTTP Request und Response als Beweis (aus MinIO)
- Screenshot falls vorhanden
- Remediation-Vorschlag (KI-generiert)
- Kommentare und Aktivitäts-History
- Verlinkung zu CVE / Nuclei Template

---

#### UC-14 — Finding triagen
**Akteur:** Security Engineer  
**Ziel:** Findings qualitativ bewerten und priorisieren

**Aktionen:**
- Severity anpassen (mit Begründung)
- Als False Positive markieren (mit Begründung — für KI-Lernkontext)
- Einem Developer zuweisen
- Kommentar hinzufügen
- Priority Flag setzen

---

#### UC-15 — Finding-Status aktualisieren
**Akteur:** Developer, Security Engineer  
**Ziel:** Fortschritt beim Fix dokumentieren

**Finding-Lifecycle:**
```
Open → In Progress → Fixed → Verified → Closed
                  ↘ False Positive
                  ↘ Accepted Risk (bewusst akzeptiert)
         Verified kann auch → Reopened (wenn Re-Scan negativ)
```

---

#### UC-16 — Re-Scan nach Fix
**Akteur:** Security Engineer  
**Ziel:** Verifizieren dass eine gemeldete Schwachstelle tatsächlich behoben ist

**Ablauf:**
1. Developer setzt Finding auf "Fixed"
2. Security Engineer klickt "Verification Scan starten"
3. Scan läuft nur gegen das spezifische Finding (gezielter Test, nicht Full Scan)
4. Ergebnis:
   - Schwachstelle nicht mehr vorhanden → Status: "Verified" ✓
   - Schwachstelle noch vorhanden → Status: "Reopened" ✗, Notification an Developer

---

### Domäne 6: KI-Analyse

#### UC-17 — Automatische KI-Analyse bei neuem Finding
**Akteur:** System  
**Ziel:** Finding sofort verständlich und actionable machen

**Ablauf (automatisch nach jedem neuen Finding):**
1. Neues Finding landet in DB
2. System ruft Claude API auf (Vercel AI SDK)
3. Prompt enthält: Finding-Typ, Payload, HTTP Request/Response, Ziel-Kontext
4. Claude liefert strukturierten Output:
   - Plain-Language-Erklärung ("Was ist das Problem?")
   - Business Impact ("Was kann ein Angreifer damit tun?")
   - Remediation-Vorschlag (konkreter Fix-Schritt)
   - False-Positive-Wahrscheinlichkeit (0–100%)
   - Verwandte Findings (via pgvector Similarity Search)
5. Alles wird am Finding gespeichert

---

#### UC-18 — Semantische Suche
**Akteur:** Security Engineer, Developer  
**Ziel:** Findings in natürlicher Sprache suchen

**Beispiele:**
- "SQL Injection auf Login"
- "Alle Authentication-Probleme"
- "XSS im Admin-Bereich"
- "Ähnliche Findings wie CVE-2024-1234"

**Technologie:** pgvector (Embeddings via Claude API oder OpenAI Embeddings)

---

#### UC-19 — Risk Score berechnen
**Akteur:** System  
**Ziel:** Gesamtrisiko eines Projekts quantifizieren

**Berechnung (KI-basiert):**
- CVSS Scores aller offenen Findings
- Severity-Gewichtung (Critical zählt mehr)
- Anzahl offener vs. behobener Findings
- Trend (neu aufgetaucht vs. schon bekannt)
- Ergebnis: Score 0–100 pro Projekt, mit Ampel-Anzeige (Grün / Gelb / Rot)

---

### Domäne 7: Reporting

#### UC-20 — Executive Report exportieren
**Akteur:** CISO / Manager, Security Engineer  
**Ziel:** Management-taugliche Zusammenfassung erstellen

**Inhalt Executive Report (PDF):**
- Zusammenfassung in nicht-technischer Sprache (KI-generiert)
- Risk Score mit Trend
- Findings nach Severity (Zahlen, keine technischen Details)
- Top 3 empfohlene Maßnahmen (KI-priorisiert)
- OWASP Top 10 Abdeckung (Grafik)
- Zeitraum und getestete Assets

---

#### UC-21 — Technical Report exportieren
**Akteur:** Security Engineer  
**Ziel:** Vollständige technische Dokumentation aller Findings

**Inhalt Technical Report (PDF):**
- Alle Findings mit vollständigen technischen Details
- HTTP Requests/Responses als Beweis
- CVSS Score + Begründung
- CWE / OWASP Mapping
- Remediation pro Finding
- Scan-Konfiguration und Timeline
- Signatur / Autorisierungsnachweis (wer hat den Test autorisiert)

---

#### UC-22 — JSON Export
**Akteur:** Security Engineer  
**Ziel:** Maschinenlesbarer Export für externe Tools

**Einsatzfälle:**
- Import in eigene SIEM-Systeme
- Integration in Ticketing (Jira, GitHub Issues) — manuell Phase 1
- Archivierung
- Eigene Weiterverarbeitung

---

### Kritische User Flows

#### Flow 1 — Erster Scan (Onboarding bis Finding)
```
Registrierung (UC-01)
    → MFA einrichten
    → Organisation anlegen
    → Projekt anlegen (UC-05)
    → Target hinzufügen (UC-07)
    → Domain verifizieren (UC-08)
    → Scan starten (UC-09)
    → Live beobachten (UC-10)
    → Finding lesen (UC-13) mit KI-Erklärung
```
**Ziel:** Unter 10 Minuten vom Signup zum ersten Finding.

---

#### Flow 2 — Finding → Fix → Verified
```
Finding zugewiesen (UC-14)
    → Developer liest KI-Erklärung + Remediation (UC-13)
    → Status: "In Progress" (UC-15)
    → Fix implementiert
    → Status: "Fixed" (UC-15)
    → Security Engineer triggert Re-Scan (UC-16)
    → Status: "Verified" ✓  oder  "Reopened" ✗
```

---

#### Flow 3 — Management-Reporting
```
CISO öffnet Dashboard (UC-06)
    → Risk Score + Trend lesen
    → Compliance-Status prüfen
    → Executive Report exportieren (UC-20)
    → PDF an Stakeholder
```

---

## Was Phase 1 explizit NICHT tut

| Feature | Warum nicht Phase 1 |
|---------|---------------------|
| Subdomain Discovery | Erfordert eigenen Recon-Service (Phase 2) |
| JavaScript-Rendering beim Scan | Headless Browser-Overhead (Phase 2) |
| API Security (OpenAPI-Import) | Eigenes Scanner-Modul (Phase 2) |
| GitHub / Jira / Slack Integration | Webhooks + Connector-Aufwand (Phase 2) |
| SSO / SAML | Enterprise-Feature (Phase 3) |
| Autonome KI-Scan-Strategien | LangGraph-Komplexität (Phase 3) |
| Continuous Monitoring / Alerting | Erfordert stabiles Online-Deployment zuerst (Phase 2) |
