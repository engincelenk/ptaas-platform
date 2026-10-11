# PTaaS Benutzeranleitung — Security Engineer

**Zielgruppe:** Security Engineers und Pentester, die Scans konfigurieren, Findings technisch bewerten, Reports erstellen und den gesamten Pentest-Prozess steuern.  
**Zugriff:** Member-Rolle (Scan-Konfiguration, Reports) · Admin für Org-weite Einstellungen  
**Sprache:** Deutsch (UI teilweise englisch)

---

## Inhaltsverzeichnis

1. [Login & MFA](#1-login--mfa)
2. [Dashboard — Technische Sicht](#2-dashboard--technische-sicht)
3. [Projekte verwalten](#3-projekte-verwalten)
4. [Targets hinzufügen & verifizieren](#4-targets-hinzufügen--verifizieren)
5. [Scans konfigurieren & starten](#5-scans-konfigurieren--starten)
6. [Scan-Fortschritt überwachen](#6-scan-fortschritt-überwachen)
7. [Scan-Queue](#7-scan-queue)
8. [Findings analysieren — Security Engineer View](#8-findings-analysieren--security-engineer-view)
9. [CVE-Enrichment & Exploit-Intelligence](#9-cve-enrichment--exploit-intelligence)
10. [Findings triagieren & priorisieren](#10-findings-triagieren--priorisieren)
11. [Evidence & Beweise](#11-evidence--beweise)
12. [Verifikation & Retest](#12-verifikation--retest)
13. [Reports erstellen](#13-reports-erstellen)
14. [SLA-Tracking](#14-sla-tracking)
15. [CVE Intelligence Dashboard](#15-cve-intelligence-dashboard)
16. [Analytics & Trends](#16-analytics--trends)
17. [Compliance](#17-compliance)
18. [Integrations & Webhooks](#18-integrations--webhooks)
19. [Scan-Policies konfigurieren](#19-scan-policies-konfigurieren)
20. [Methodologie-Bibliothek](#20-methodologie-bibliothek)

---

## 1. Login & MFA

Identisch mit der Developer-Anleitung (Abschnitt 1–2). MFA ist verpflichtend.

**SSO:** Falls eure Organisation SAML SSO nutzt:
- Login-Screen → **"Sign in with SSO"**
- Organization Slug eingeben → Weiterleitung zum IdP

---

## 2. Dashboard — Technische Sicht

### 2.1 KPI-Karten

| Karte | Bedeutung für Security Engineer |
|-------|--------------------------------|
| **Open Findings** | Gesamtlast — wie viel zu triagieren ist |
| **Critical** | Findings die sofort Attention brauchen (SLA: 7 Tage) |
| **High** | SLA: 30 Tage |
| **Verified Fixed** | Erfolgreiche Remediations — Baseline für Report |
| **Avg Risk Score** | Gesamtposteur — steigt/sinkt mit Findings |

### 2.2 SLA-Breach-Banner

Ein roter Banner erscheint wenn SLA-Fristen überschritten wurden:
- **Critical ohne Fix >7 Tage** → im Banner
- **High ohne Fix >30 Tage** → im Banner
- Klicke auf Details → SLA-Seite mit vollständiger Liste

### 2.3 OWASP Heatmap

Weiter unten auf dem Dashboard: eine Heatmap der OWASP Top 10-Kategorien.
- Farbe = Anzahl Findings in dieser Kategorie
- Klicke eine Zelle → Findings-Liste gefiltert nach dieser OWASP-Kategorie

### 2.4 Trend-Chart

Zeigt über die Zeit:
- **New Findings** (rot) — neu entdeckte Schwachstellen pro Woche
- **Resolved Findings** (grün) — behobene Schwachstellen pro Woche

Wenn grün > rot: der Rückstand wird abgebaut.

### 2.5 Top-Projekte nach Risiko

Tabelle der risikoreichsten Projekte (sortiert nach Risk Score):
- Klicke auf Projektname → direkt zur Projekt-Findings-Liste

---

## 3. Projekte verwalten

### 3.1 Neues Projekt erstellen

1. Sidebar → **"Projects"** → **"+ New Project"** (oder Dashboard → "+ New Project")
2. **Projektname** eingeben (z.B. "Produktions-API v2")
3. Optional: Beschreibung hinzufügen
4. Klicke **"Create"**

### 3.2 Projekt-Einstellungen

Im Projekt → **"Settings"** Tab:
- Namen und Beschreibung ändern
- Projekt archivieren (Findings bleiben erhalten)
- Projekt löschen (nur Admin)

### 3.3 Projekt-Übersicht lesen

| Bereich | Information |
|---------|-------------|
| **Risk Score** | Aktueller Gesamt-Risikoscore des Projekts |
| **Targets** | Anzahl konfigurierter Scan-Targets |
| **Open Findings** | Aufgeteilt nach Severity |
| **Last Scan** | Datum und Status des letzten Scans |

---

## 4. Targets hinzufügen & verifizieren

**Targets** sind die Assets (Domains, IP-Adressen) die gescannt werden sollen.

### 4.1 Target hinzufügen

1. Projekt öffnen → Tab **"Targets"** → **"+ Add Target"**
2. **Target-Typ** wählen:
   - **DOMAIN** — für Domains und Subdomains (z.B. `example.com`)
   - **IP** — für einzelne IP-Adressen oder CIDR-Ranges (z.B. `192.168.1.0/24`)
   - **URL** — für spezifische URLs
3. **Wert** eingeben
4. Klicke **"Add"**

### 4.2 Domain-Ownership verifizieren

Bevor ein Scan auf einer Domain gestartet werden kann, muss die Ownership verifiziert werden (Schutz vor unerlaubten Scans).

**Methode: DNS TXT Record**

1. Im Target → **"Verify Ownership"**
2. Du siehst einen TXT-Record-Eintrag:
   ```
   Name:  _ptaas-verify.example.com
   Value: ptaas-verify=abc123def456...
   ```
3. Erstelle diesen TXT-Record bei deinem DNS-Provider (z.B. Cloudflare, Route53)
4. DNS-Propagation abwarten (typisch 5–60 Minuten)
5. Klicke **"Verify now"**
6. Status wechselt zu ✅ **VERIFIED**

> **Tipp:** DNS-TTL auf 60s setzen vor dem Hinzufügen — beschleunigt die Propagation.

### 4.3 Asset Discovery (automatisch)

Nach der Verifikation kann die Plattform automatisch Subdomains und verwandte Assets entdecken (ASM — Attack Surface Management):
- Subdomains werden automatisch als neue Targets vorgeschlagen
- Siehst du unter **"Assets"** → **"Discovered"**

---

## 5. Scans konfigurieren & starten

### 5.1 Scan starten

1. Projekt → Tab **"Targets"**
2. Beim gewünschten Target → **"Start Scan"**
3. Das **Scan-Konfigurations-Dialog** öffnet sich

### 5.2 Scan-Profil auswählen

Drei visuelle Profil-Kacheln:

| Profil | Dauer | Rate | Scope | Wann nutzen |
|--------|-------|------|-------|-------------|
| **⚡ SCHNELL** | ~5 min | 100 req/s | Häufige Schwachstellen (Nuclei) | Quick-Check, PR-Gates |
| **🔍 STANDARD** | 30–60 min | 30 req/s | Alle Nuclei-Templates | Reguläre Audits |
| **🕷 KOMPLETT** | 1–2 h | 30 req/s | Spider + Active Scan (ZAP) | Vollständige Web-App-Audits |

Zusätzlich: **🔌 API Scan (ZAP)** — für REST/GraphQL APIs mit OpenAPI-Spec.

### 5.3 Template-Kategorien (SCHNELL & STANDARD)

Nach Profil-Auswahl (Nuclei-basiert) kannst du Template-Kategorien auswählen/abwählen:

| Kategorie | Was wird geprüft |
|-----------|-----------------|
| **CVEs** | Bekannte CVE-Schwachstellen |
| **Misconfigurations** | Server- und App-Fehlkonfigurationen |
| **Exposures** | Sensible Dateien, offene Verzeichnisse |
| **Technology Detection** | Stack-Fingerprinting |
| **Generic Vulns** | XSS, SSRF, SQLi etc. |

### 5.4 KI-Scope-Empfehlung

Klicke **"KI-Empfehlung"** (Sparkles-Icon) → die KI analysiert das Target und empfiehlt welche Kategorien für diesen Zieltyp sinnvoll sind. Empfehlung wird direkt angewendet (überschreibbar).

### 5.5 Scan-Policy anwenden (optional)

Falls Scan-Policies konfiguriert sind (z.B. "Nur OWASP Top 10", "Keine CVEs"):
- Dropdown "Scan Policy" → Policy wählen
- Policy schränkt welche Templates verwendet werden

### 5.6 Authentifizierung (optional)

Für Scans hinter Login:

| Credential-Typ | Wann nutzen |
|---------------|-------------|
| **Bearer Token** | API-Endpunkte mit JWT/OAuth |
| **Basic Auth** | HTTP Basic Authentication |
| **Cookie** | Session-basierte Web-Apps |
| **API Key Header** | APIs mit X-API-Key etc. |

Credential-Wert eingeben → wird AES-256-GCM verschlüsselt gespeichert.

### 5.7 ZAP-spezifische Optionen (KOMPLETT / API Scan)

**Web Crawl (ZAP):**
- **Crawl Depth** — wie tief der Spider folgt (Standard: 5)

**API Scan (ZAP):**
- **OpenAPI Spec URL** — URL zu einer swagger.json/openapi.yaml
- Oder: OpenAPI-Spec direkt als YAML/JSON einfügen

### 5.8 Scan starten

Klicke **"Start Scan"** → Scan wird in die Queue gelegt → automatische Weiterleitung zur Scan-Detailseite.

---

## 6. Scan-Fortschritt überwachen

### 6.1 Scan-Detailseite

- Echtzeit-Fortschrittsbalken (0–100%)
- Aktuelle Aktivität (z.B. "Checking CVE-2024-1234 on api.example.com")
- Findings-Zähler (live aktualisiert)
- Verbindungsstatus zum SSE-Stream

### 6.2 Status-Bedeutungen

| Status | Bedeutung |
|--------|-----------|
| **QUEUED** | Wartet auf freien Worker-Slot |
| **RUNNING** | Scan läuft aktiv |
| **COMPLETED** | Abgeschlossen — Findings verfügbar |
| **FAILED** | Fehler — Fehlermeldung anzeigen |
| **CANCELLED** | Manuell abgebrochen |

### 6.3 Kritisches Finding mid-scan

Wenn während eines laufenden Scans ein **CRITICAL Finding** entdeckt wird, erscheint sofort ein roter Alert-Banner:
> "Kritisches Finding entdeckt! — [Titel des Findings]"

→ Du kannst sofort reagieren ohne auf den Scan-Abschluss zu warten. Klicke "Schließen" um den Banner zu verbergen.

### 6.4 Scan-Fehler verstehen

Bei FAILED zeigt die Plattform:
- **Fehlerursache** (z.B. "Target nicht erreichbar", "Nuclei binary nicht gefunden")
- In der vollständigen Fehlermeldung sind Lösungsvorschläge nummeriert

---

## 7. Scan-Queue

### 7.1 Queue aufrufen

Sidebar → **"Scan-Queue"**

### 7.2 Was die Queue zeigt

Alle aktiven und geplanten Scans organisationsweit:

| Spalte | Bedeutung |
|--------|-----------|
| **Status** | QUEUED / RUNNING / COMPLETED / FAILED |
| **Projekt** | Zugehöriges Projekt |
| **Target** | Gescannte Domain/IP |
| **Typ** | QUICK / FULL / WEB_CRAWL / API_SCAN |
| **Fortschritt** | Prozentualer Fortschritt (bei RUNNING) |
| **Gestartet** | Startzeitpunkt |

Die Queue **aktualisiert sich automatisch alle 10 Sekunden**.

### 7.3 Mehrere Scans gleichzeitig

- Scans laufen parallel wenn mehrere Worker verfügbar sind
- In der lokalen Entwicklung läuft standardmäßig 1 Worker

---

## 8. Findings analysieren — Security Engineer View

### 8.1 Engineer View auswählen

Finding öffnen → Tab **"Security Engineer"**

### 8.2 CVSS Scorecard

**Zuerst sichtbar** (Engineer-Priorität: technische Metriken vor Plain-Language):

| Element | Bedeutung |
|---------|-----------|
| **Score** (große Zahl) | CVSS v3.x Base Score (0.0–10.0) |
| **Farbkodierung** | Rot ≥9.0 / Orange ≥7.0 / Gelb ≥4.0 / Grün <4.0 |
| **Fortschrittsbalken** | Visuelle Darstellung des Scores |
| **CVSS Vector** | Vollständiger Vektor-String (z.B. AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H) |

**CVSS Vector lesen:**
- `AV:N` — Attack Vector: Network (über Netzwerk angreifbar)
- `AC:L` — Attack Complexity: Low (kein spezielles Setup nötig)
- `PR:N` — Privileges Required: None (kein Login nötig)
- `UI:N` — User Interaction: None (kein Benutzer-Klick nötig)
- `S:U` — Scope: Unchanged
- `C:H/I:H/A:H` — Confidentiality/Integrity/Availability: High

### 8.3 CVE-Details Panel

Wenn das Finding eine CVE enthält:
- **CVE-IDs** als klickbare Links zur NVD
- **NVD-Beschreibung** der Schwachstelle
- **EPSS Score** — Exploit Prediction Scoring System (0–100%)
- **EPSS Percentile** — im Vergleich zu allen anderen CVEs
- **CISA KEV** — ob die CVE aktiv ausgenutzt wird
- **Priority Score** — PTaaS-eigener kombinierter Score

### 8.4 HTTP Request/Response Block

Wenn der Scanner das Finding durch einen HTTP-Request bewiesen hat:

```
Request:
GET /admin/debug HTTP/1.1
Host: example.com
...

Response:
HTTP/1.1 200 OK
Content-Type: application/json
{"debug": true, "dbPassword": "..."}
```

→ Dies ist der **Proof-of-Concept** — direkt verwertbar für den Report.

### 8.5 CWE-IDs

Unterhalb der CVSS-Scorecard: Liste der zugehörigen **CWE-Schwachstellen-Typen** (z.B. CWE-79 XSS, CWE-89 SQL Injection).

### 8.6 AI-Analyse (im Accordion)

Im Engineer View ist die KI-Erklärung **eingeklappt** (Accordion):
- Klicke auf **"AI Analysis"** um sie aufzuklappen
- Nützlich als Schnell-Referenz, nicht primäre Info-Quelle für Engineers

### 8.7 Related Findings

Ähnliche Findings im gleichen Projekt werden vorgeschlagen:
- Gleiche CVE / gleiche Schwachstellenklasse
- Hilft Muster zu erkennen (z.B. XSS an 5 verschiedenen Endpoints)

---

## 9. CVE-Enrichment & Exploit-Intelligence

### 9.1 EPSS Score verstehen

**EPSS (Exploit Prediction Scoring System)** gibt die Wahrscheinlichkeit an, dass eine CVE in den nächsten 30 Tagen aktiv ausgenutzt wird:

| EPSS | Interpretation |
|------|----------------|
| >50% | Sehr hohes Exploit-Risiko — sofort handeln |
| 10–50% | Hohes Risiko — priorisieren |
| <10% | Moderates Risiko — normal bearbeiten |

### 9.2 CISA KEV (Known Exploited Vulnerabilities)

Eine CVE auf der CISA KEV-Liste wird **aktiv in freier Wildbahn ausgenutzt**:
- Bundesbehörden (USA) haben Deadline für Remediation
- Für alle anderen: höchste Priorität (P0)
- Erscheint mit pulsierendem roten Badge im Finding

### 9.3 Priority Score

Der **PTaaS Priority Score** (0–100) kombiniert:
- CVSS Base Score
- EPSS Score
- KEV Status
- Erreichbarkeit des Targets

→ Bessere Priorisierungsbasis als reiner CVSS-Score.

### 9.4 CVE Intelligence Dashboard

Sidebar → **"CVE Intel"**:
- Überblick über CVEs die eure Targets betreffen
- Filterbar nach Severity, EPSS, KEV-Status
- Zeigt welche Projekte/Targets betroffen sind

---

## 10. Findings triagieren & priorisieren

### 10.1 AI Triage-Empfehlungen

In der Findings-Liste → **"AI Triage"** Button (Sparkles-Icon):

1. Klicke **"AI Triage"**
2. Die KI analysiert alle Findings und gibt Empfehlungen:
   - Welche als FALSE_POSITIVE markiert werden sollten
   - Welche sofort bearbeitet werden müssen
   - Begründung je Empfehlung + Confidence-Score

3. Empfehlungen reviewen → Häkchen setzen bei zustimmenden → **"Apply selected"**

> **Wichtig:** AI-Empfehlungen immer manuell validieren. Confidence <70% bedeutet: manuell prüfen.

### 10.2 False Positives identifizieren

FP-Wahrscheinlichkeit >50% im Finding:
1. HTTP Request/Response prüfen — ist das Finding reproduzierbar?
2. CVE-Beschreibung gegen eure Stack-Version prüfen
3. Wenn FP bestätigt: Status → **FALSE_POSITIVE** + Kommentar mit Begründung

### 10.3 Risk Acceptance

Für Findings die nicht behoben werden können/sollen:

1. Finding Detail → Tab **"Remediation"** → **"Accept Risk"**
2. Begründung eingeben (Pflichtfeld)
3. Ablaufdatum setzen (wann soll die Akzeptanz ablaufen?)
4. Verantwortlichen (Owner) zuweisen
5. **"Save Risk Acceptance"**

Abgelaufene Risk Acceptances erscheinen im Dashboard als Warning.

### 10.4 Owner zuweisen

Im Finding Detail → Tab **"Remediation"**:
- **"Assigned To"** Dropdown → Teammitglied wählen
- **"Due Date"** setzen
- Klicke **"Save"**

→ Das Teammitglied wird benachrichtigt und das Finding erscheint in deren "Assigned to me"-Filter.

---

## 11. Evidence & Beweise

### 11.1 Evidence-Tab

Finding → Tab **"Evidence"**:
- Automatisch gesammelte Beweise vom Scanner
- Screenshots (bei ZAP-Scans)
- HTTP Request/Response Logs
- Terminal-Output des Scanners

### 11.2 Manuell Evidence hochladen

Im Evidence-Tab → **"Upload Evidence"**:
- Screenshots (PNG, JPG)
- Logs (TXT, LOG)
- Dokumente (PDF)
- Max. Dateigröße: 50 MB

Hochgeladene Files werden in **MinIO** gespeichert (verschlüsselt, SSE-S3).

### 11.3 Evidence in Reports

Beim Report-Export werden relevante Evidence-Dateien automatisch eingebunden (konfigurierbar im Report-Dialog).

---

## 12. Verifikation & Retest

### 12.1 Retest anfordern

Finding Detail → **"Request Retest"**:
1. Optional: Retest-Notiz eingeben (was wurde geändert)
2. **"Request Retest"** → neuer Scan mit Fokus auf dieses Finding
3. Weiterleitung zur Scan-Seite

### 12.2 Verifikation-States

Nach einem Retest gibt es drei Zustände:

| State | Bedeutung | Aktion |
|-------|-----------|--------|
| **✅ VERIFIED (PASSED)** | Schwachstelle behoben | Status → VERIFIED |
| **⚠ PARTIAL** | Teilweise behoben | Nochmal reviewen |
| **❌ FAILED** | Schwachstelle noch vorhanden | Status → OPEN |

### 12.3 Manuelle Verifikation

Ohne automatischen Retest kannst du auch manuell verifizieren:

Tab **"Retest"**:
- **"Fix confirmed"** → VERIFIED
- **"Fix not confirmed"** → OPEN

---

## 13. Reports erstellen

### 13.1 Report-Konfiguration öffnen

Projekt → Tab **"Reports"** → **"+ New Report"**

### 13.2 Report-Typ wählen

| Typ | Zielgruppe | Inhalt |
|-----|-----------|--------|
| **Executive Report** | C-Level, Management | Zusammenfassung, Risk Score, OWASP-Übersicht, Empfehlungen — kein technisches Detail |
| **Technical Report** | Security Engineers, Entwickler | Vollständige Findings mit CVSS, HTTP-Beweise, Remediation-Steps, Timeline |

### 13.3 Report konfigurieren

- **Titel** und **Berichtszeitraum** festlegen
- **Findings auswählen** — welche Severity-Level einschließen?
- **Evidence einbinden** — Screenshots und Proof-of-Concept?
- **Branding** — Firmenlogo einbinden? (Admin-Einstellung)

### 13.4 Report generieren

1. **"Generate Report"** klicken
2. Fortschrittsring (SVG-Ring-Animation) zeigt den Generierungs-Status
3. Bei Abschluss: Ring wird zu einem grünen Checkmark
4. **"Download PDF"** → PDF-Report herunterladen

### 13.5 Report teilen

Generierte Reports werden in MinIO gespeichert und können als Link geteilt werden (zeitlich begrenzte Signed URLs):
- **"Share Link"** → Link in Zwischenablage kopieren
- Link ist 7 Tage gültig

---

## 14. SLA-Tracking

### 14.1 SLA-Seite aufrufen

Sidebar → **"SLA"**

### 14.2 SLA-Fristen

| Severity | SLA-Frist |
|----------|----------|
| **CRITICAL** | 7 Tage |
| **HIGH** | 30 Tage |
| **MEDIUM** | 90 Tage |
| **LOW** | 180 Tage |

### 14.3 Was du auf der SLA-Seite siehst

- **Breach-Übersicht** — wie viele Findings haben SLA überschritten
- **At-Risk** — Findings kurz vor Überschreitung
- **Finding-Liste** — sortiert nach Dringlichkeit
- **Inline-Status** — Status direkt in der SLA-Tabelle änderbar

### 14.4 SLA-Breaches managen

Für jedes SLA-überschrittene Finding:
1. Status auf IN_PROGRESS setzen → informiert den Owner
2. Owner zuweisen falls noch keiner
3. Retest beauftragen wenn Fix vorliegt
4. Oder: Risk Acceptance erstellen wenn Fix nicht möglich

---

## 15. CVE Intelligence Dashboard

Sidebar → **"CVE Intel"**

### 15.1 Inhalt

- **KEV-Liste** — alle CVEs auf der CISA KEV-Liste die eure Assets betreffen
- **EPSS-Ranking** — CVEs nach Exploit-Wahrscheinlichkeit sortiert
- **Betroffene Projekte** — welche eurer Projekte von welchen CVEs betroffen sind

### 15.2 Threat Briefing

Sidebar → **"Threat Intel"**

- Täglich aktualisierter Threat Intelligence Feed
- CVEs die aktiv in Kampagnen ausgenutzt werden
- Relevanz-Filter nach eurer Tech-Stack

---

## 16. Analytics & Trends

Sidebar → **"Analytics"**

### 16.1 Verfügbare Charts

| Chart | Was es zeigt |
|-------|-------------|
| **Finding Trend** | Neue vs. behobene Findings über Zeit |
| **OWASP Distribution** | Welche Schwachstellenklassen dominieren |
| **Severity Breakdown** | Verteilung nach Schweregrad |
| **Mean Time to Remediate (MTTR)** | Durchschnittliche Behebungszeit |
| **SLA Compliance Rate** | % der Findings innerhalb SLA-Frist behoben |

### 16.2 Zeitraum filtern

- Buttons oben rechts: **7d / 30d / 90d / 1y / Gesamt**
- Charts aktualisieren sich sofort

### 16.3 Projekt-Drill-Down

Klicke einen Projekt-Namen in der Trend-Ansicht → Zoom in projektspezifische Analytics.

---

## 17. Compliance

Sidebar → **"Compliance"**

### 17.1 NIS2 Compliance

- Mapping eurer Findings auf NIS2-Anforderungen
- Compliance-Score nach NIS2-Artikel
- Lücken-Report: welche Kontrollen fehlen?

### 17.2 Compliance-Status-Übersicht

| Status | Bedeutung |
|--------|-----------|
| **COMPLIANT** | Anforderung erfüllt |
| **PARTIAL** | Teilweise erfüllt — Action nötig |
| **NON_COMPLIANT** | Nicht erfüllt — kritische Lücke |

---

## 18. Integrations & Webhooks

### 18.1 Verfügbare Integrationen

Sidebar → **"Settings"** → **"Integrations"**

| Integration | Funktion |
|-------------|----------|
| **Jira** | Findings automatisch als Jira-Tickets erstellen |
| **Slack** | Benachrichtigungen in Slack-Channels |
| **GitHub** | Issues in GitHub-Repositories |

### 18.2 Jira-Integration einrichten

1. Settings → Integrations → **"Jira"**
2. Jira-URL eingeben (z.B. `https://yourcompany.atlassian.net`)
3. E-Mail und **API Token** eingeben (Jira Account Settings → Security → API Tokens)
4. **"Test Connection"** → bei Erfolg: **"Save"**
5. Projekt-Mapping: welches PTaaS-Projekt → welches Jira-Projekt?

### 18.3 Slack-Integration einrichten

1. Settings → Integrations → **"Slack"**
2. **"Connect with Slack"** → Slack OAuth-Flow
3. Channel auswählen
4. Trigger konfigurieren: bei CRITICAL / HIGH / Scan Complete / SLA Breach

### 18.4 Webhooks

Settings → **"Webhooks"**:

1. **"+ Add Webhook"**
2. **URL** — deine Endpunkt-URL
3. **Events** auswählen:
   - `finding.created` — neues Finding
   - `finding.status_changed` — Status-Änderung
   - `scan.completed` — Scan fertig
   - `scan.failed` — Scan fehlgeschlagen
   - `sla.breach` — SLA-Frist überschritten
4. **Secret** setzen (für HMAC-Signatur-Verifikation)
5. **"Save"** → Webhook wird bei jedem Event gefeuert

**Webhook-Payload Beispiel (`finding.created`):**
```json
{
  "event": "finding.created",
  "timestamp": "2026-07-06T10:30:00Z",
  "data": {
    "findingId": "clx...",
    "title": "SQL Injection in /api/users",
    "severity": "CRITICAL",
    "projectId": "clx...",
    "targetValue": "example.com"
  }
}
```

---

## 19. Scan-Policies konfigurieren

Scan-Policies definieren welche Templates bei Scans in eurer Organisation verwendet werden.

### 19.1 Neue Policy erstellen

Settings → **"Scan Policies"** → **"+ New Policy"**:

1. **Name** (z.B. "Nur OWASP Top 10")
2. **Template-Kategorien** auswählen (inkl./exkl.)
3. **Maximale Anfragen/Sekunde** festlegen
4. **"Save"**

### 19.2 Policy auf Scans anwenden

Beim Scan-Start → **"Scan Policy"** Dropdown → Policy wählen.

---

## 20. Methodologie-Bibliothek

Sidebar → **"Methodology"**

### 20.1 Inhalt

- Standardisierte Pentest-Methodologien (OWASP Testing Guide, PTES)
- Checklisten für manuelle Tests
- Template-Bibliothek für Finding-Beschreibungen

### 20.2 Finding-Beschreibung aus Template

Finding erstellen → **"Use Template"**:
1. Template-Kategorie wählen
2. Template auswählen (z.B. "Cross-Site Scripting (Reflected)")
3. Template-Text wird vorbefüllt — anpassen und spezifizieren

---

## Häufige Fragen (Security Engineer)

**F: Scan schlägt fehl mit "Target nicht erreichbar".**  
A: (1) IP/Domain korrekt? (2) Firewall-Freigabe nötig? Scanner-IP whitelisten: IP des Scanner-Workers in `docker inspect ptaas-scanner`. (3) Target vom Scanner-Netzwerk aus erreichbar?

**F: Nuclei findet keine Findings obwohl bekannte Schwachstellen vorhanden sind.**  
A: (1) Templates aktuell? `nuclei -update-templates` ausführen. (2) Rate-Limiting des Targets? Rate auf 10 req/s reduzieren. (3) Richtiger Template-Scope gewählt? Bei Auth-Problemen: Credentials im Scan hinterlegen.

**F: Wie erstelle ich einen Report für nur bestimmte Findings?**  
A: Filter in der Findings-Liste setzen → gewünschte Findings selektieren → "Export" → "Selected only". Alternativ: im Report-Dialog Severity und Status-Filter konfigurieren.

**F: EPSS zeigt 0% für eine bekannte CVE — ist das korrekt?**  
A: EPSS wird täglich aktualisiert. Neue CVEs haben anfangs 0%. Prüfe den KEV-Status und nutze den CVSS Score als Fallback-Priorisierung.

**F: Kann ich mehrere Scans gleichzeitig auf demselben Target starten?**  
A: Nein — das System verhindert parallele Scans auf demselben Target um Rate-Limiting und Fehlalarme zu vermeiden. Warte bis der laufende Scan abgeschlossen ist.
