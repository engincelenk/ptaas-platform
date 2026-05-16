# IT-Support – Betrieb & Support PTaaS Platform

**Datum:** 2026-05-15  
**Rolle:** IT-Support  
**Phase:** Phase 1 MVP / Beta

---

## 1. Support-Level

| Level | Name | Zuständig | Antwortzeit | Kanäle |
|-------|------|-----------|------------|--------|
| L1 | User Support | Support-Bot + Dokumentation | < 24h | In-App Chat, Email |
| L2 | Technical Support | Fullstack Developer (On-Call) | < 4h (Werktag) | Email, Slack |
| L3 | Engineering | Entwicklungs-Team | < 2h (P1) | Intern (PagerDuty) |

**Phase 1 / Beta:** Da kein dedizierten Support-Team, übernimmt das Dev-Team L1-L3 rotierend.

---

## 2. Häufige Probleme & Lösungen (FAQ)

### 2.1 Authentifizierung

**Problem: Nutzer kommt nach MFA-Setup nicht mehr rein**
```
Ursache: TOTP-Code abgelaufen oder Zeitversatz
Lösung:  1. Backup-Codes nutzen (wurden beim Setup angezeigt)
          2. Support kontaktieren → MFA zurücksetzen via Clerk Admin
          3. Nutzer wird per Email verifiziert und MFA neu einrichten
```

**Problem: "Session expired" nach kurzer Zeit**
```
Ursache: JWT Access Token TTL = 15 Min (Sicherheitskonfiguration)
Lösung:  Normales Verhalten — Clerk erneuert Token automatisch.
          Wenn Problem anhält: Browser-Cache leeren, erneut einloggen.
```

### 2.2 Scan-Probleme

**Problem: Scan bleibt auf "QUEUED" hängen**
```
Ursache A: Queue-Worker ausgefallen
  Check: Grafana → "Scan Queue" Dashboard → Waiting Jobs > 0?
  Fix:   kubectl rollout restart deployment/nest-api -n ptaas-prod
  
Ursache B: Kubernetes Job startet nicht
  Check: kubectl get jobs -n scanners
  Fix:   kubectl delete job <stuck-job> -n scanners (Job wird neu erstellt)
```

**Problem: Scan schlägt mit FAILED fehl**
```
Ursache: Target nicht erreichbar, Timeout, oder Scanner-Bug
Prüfung: findings → scan.error Feld lesen
Häufigste Gründe:
  - Target-URL nicht erreichbar (Firewall, SSL-Fehler)
  - Scan-Timeout (> 5 Min) → Target zu langsam
  - Ungültige URL (HTTP-Redirect-Loop)
Lösung:  Nutzer informieren, Target-URL prüfen lassen
```

**Problem: Scan findet keine Findings obwohl Probleme bekannt**
```
Ursache: Scanner-Scope in Phase 1 limitiert (nur Header, SSL, Ports)
Erklärung: Phase 1 prüft keine Code-Schwachstellen (XSS, SQLi via HTTP)
Lösung:  In Dokumentation auf Phase-1-Limitierungen hinweisen
          Phase 2 wird erweiterte Checks bringen
```

### 2.3 Findings & Reports

**Problem: PDF-Report ist leer / korrupt**
```
Ursache: Puppeteer-Timeout oder S3-Fehler
Check:   CloudWatch Logs → Report-Service → Fehlercode
Fix:     Report erneut generieren (Button im UI)
         Falls anhaltend: S3-Bucket-Permissions prüfen
```

**Problem: Nutzer sieht Findings nicht obwohl Scan completed**
```
Ursache: RLS-Problem oder falsches Tenant-Context
Check:   Ist der Nutzer im richtigen Tenant? (Clerk Admin prüfen)
         DB: SELECT COUNT(*) FROM findings WHERE scan_id = '...' AND tenant_id = '...'
Fix:     Tenant-Membership in Clerk korrigieren
```

### 2.4 Account & Billing

**Problem: Nutzer wurde aus dem Team entfernt, kann sich aber noch einloggen**
```
Ursache: JWT noch gültig (bis zu 15 Min nach Entfernung)
Lösung:  Clerk Admin → User-Session invalidieren
          Token-Revocation ist in Phase 1 nicht implementiert (Phase 2)
```

---

## 3. Onboarding-Plan für Beta-Nutzer

### Beta-Onboarding-Checkliste (für jeden neuen Beta-Nutzer)

1. **Einladungs-Email** (automatisch via Clerk)
   - Link zu Registrierung
   - Beta-Programm-Informationen
   - Link zur Dokumentation

2. **In-App Onboarding-Wizard** (nach erster Anmeldung)
   - Schritt 1: MFA einrichten
   - Schritt 2: Erstes Projekt anlegen (mit Beispiel-URL)
   - Schritt 3: Ersten Scan starten und Ergebnis ansehen
   - Schritt 4: Support-Kanal + Dokumentation zeigen

3. **Personalisiertes Onboarding-Call** (optional, für strategische Beta-Nutzer)
   - 30 Min Zoom-Call
   - Walkthrough der Platform
   - Feedback-Runde

### Dokumentationsstruktur

```
docs.ptaas.io/
├── getting-started/
│   ├── quick-start.md           → In 5 Min zum ersten Scan
│   ├── create-project.md
│   ├── run-your-first-scan.md
│   └── understanding-findings.md
├── concepts/
│   ├── severity-levels.md       → Was bedeuten CVSS-Werte?
│   ├── scan-types.md
│   └── false-positives.md
├── troubleshooting/
│   ├── scan-stuck.md
│   ├── login-issues.md
│   └── missing-findings.md
└── api-reference/
    └── openapi.yaml             → Swagger-Doku
```

---

## 4. SLA-Empfehlung

### Beta-Phase (Monat 1-3)
| Metrik | Ziel | Kommunikation |
|--------|------|---------------|
| Uptime | > 99% (erlaubt ~7h Downtime/Monat) | Status Page |
| L2 Antwortzeit | < 8h (Werktage) | Email |
| P1 (Plattform down) | < 2h | PagerDuty + Email |
| Geplante Wartungen | Ankündigung 48h vorher | Email + Status Page |

### Phase 2+ (Production SLA)
| Tier | Uptime | L2 Antwort | P1 |
|------|--------|-----------|-----|
| Free | 99% | < 48h | < 8h |
| Pro | 99.5% | < 8h | < 4h |
| Enterprise | 99.9% | < 2h | < 1h |

---

## 5. Monitoring & Alerting aus Support-Sicht

### Status Page (öffentlich)

```
status.ptaas.io
  ├── API              ● Operational
  ├── Scan Engine      ● Operational
  ├── Reports          ● Operational
  └── Database         ● Operational

Letzter Vorfall: —
```

**Tool:** Statuspage.io oder selbst gehostetes Upptime

### Interne Alerts (für Support-Team)

| Alert | Trigger | Aktion |
|-------|---------|--------|
| Scan Queue Stuck | > 10 Jobs warten > 10 Min | L3 prüft Worker-Status |
| Error Rate hoch | > 5% 5xx in 5 Min | L3 sofort aktiv |
| PDF-Report-Fehler | > 3 Fehler in 1h | L2 prüft S3 + Puppeteer |
| Login-Fehler-Spike | > 20 Fehler in 5 Min | L2 prüft Clerk Status |

### Weekly Health Check

Jeden Montag (automatisiert):
- Scan-Erfolgsrate der letzten Woche
- Neue False-Positive-Meldungen
- Durchschnittliche Scan-Dauer
- Offene Support-Tickets

---

## 6. Feedback-Prozess

### Beta-Feedback-Kanäle

| Kanal | Zweck | Frequenz |
|-------|-------|---------|
| In-App "Feedback" Button | Direktes Feature-Feedback | Jederzeit |
| NPS-Survey | Gesamtzufriedenheit | Wöchentlich (Beta) |
| GitHub Issues | Bug-Reports | Jederzeit |
| Beta-Community (Discord) | Diskussion, Feature Requests | Täglich |
| 1:1 Calls | Tiefes Feedback von Key-Usern | Monatlich |

### Feedback → Backlog

```
Feedback eingeht
    → L1 klassifiziert: Bug / Feature Request / Frage
    → Bug: GitHub Issue erstellen → QA triagiert
    → Feature Request: PO bewertet → ggf. ins Backlog
    → Frage: Dokumentation prüfen → ggf. Doku ergänzen
```

---

## 7. Incident Response Prozess

### Severity-Klassifizierung

| P1 | Platform komplett ausgefallen | PagerDuty → L3 sofort |
|----|------------------------------|----------------------|
| P2 | Scans starten nicht | PagerDuty → L3 < 2h |
| P3 | Reports generieren nicht | L2 < 4h |
| P4 | Einzelner Nutzer hat Probleme | L1/L2 < 24h |

### Incident-Protokoll

```
1. Alert feuert → L3 übernimmt (PagerDuty)
2. Status Page: "Wir untersuchen ein Problem mit [Komponente]"
3. Root Cause Analysis (RCA) läuft
4. Fix deployed
5. Status Page: "Problem behoben"
6. Post-Mortem (intern) innerhalb 48h
7. Lessons Learned → Backlog-Item
```
