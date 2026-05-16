# Product Owner – Produkt & Anforderungen PTaaS Platform

**Datum:** 2026-05-15  
**Rolle:** Product Owner  
**Phase:** Phase 1 MVP

---

## 1. User Stories

### Epics & User Stories Phase 1

#### Epic 1: Authentifizierung & Onboarding
| ID | User Story | Priorität |
|----|-----------|----------|
| US-01 | Als neuer Nutzer möchte ich mich registrieren können, damit ich Zugang zur Plattform erhalte | Must |
| US-02 | Als Nutzer möchte ich mich sicher einloggen (MFA), damit mein Account geschützt ist | Must |
| US-03 | Als Team-Admin möchte ich Teammitglieder einladen können, damit wir zusammenarbeiten können | Must |
| US-04 | Als Nutzer möchte ich mein Passwort zurücksetzen können, damit ich bei Verlust wieder Zugang bekomme | Must |

#### Epic 2: Projekt-Management
| ID | User Story | Priorität |
|----|-----------|----------|
| US-05 | Als Security-Analyst möchte ich ein Projekt erstellen und Ziel-URLs definieren, damit ich Scans für spezifische Assets starten kann | Must |
| US-06 | Als Team-Admin möchte ich Projekte verwalten (bearbeiten, löschen), damit ich den Überblick behalte | Must |
| US-07 | Als Nutzer möchte ich alle meine Projekte in einer Übersicht sehen, damit ich schnell navigieren kann | Must |

#### Epic 3: Scan-Management
| ID | User Story | Priorität |
|----|-----------|----------|
| US-08 | Als Security-Analyst möchte ich einen Scan starten können, damit ich Schwachstellen finden kann | Must |
| US-09 | Als Nutzer möchte ich den Scan-Fortschritt in Echtzeit sehen, damit ich weiß wann der Scan fertig ist | Must |
| US-10 | Als Nutzer möchte ich laufende Scans abbrechen können, damit ich Ressourcen sparen kann | Should |
| US-11 | Als Nutzer möchte ich vergangene Scans einsehen können, damit ich Trends erkennen kann | Must |

#### Epic 4: Findings-Management
| ID | User Story | Priorität |
|----|-----------|----------|
| US-12 | Als Security-Analyst möchte ich alle gefundenen Schwachstellen einsehen, damit ich sie priorisieren kann | Must |
| US-13 | Als Security-Analyst möchte ich Findings nach Severity / Status filtern, damit ich mich auf Kritisches fokussieren kann | Must |
| US-14 | Als Security-Analyst möchte ich ein Finding als "False Positive" markieren, damit die Liste bereinigt bleibt | Must |
| US-15 | Als Security-Analyst möchte ich Finding-Status setzen (Open, Fixed, Won't Fix), damit ich den Remediation-Prozess verfolge | Must |
| US-16 | Als Entwickler möchte ich Remediation-Hinweise zu jedem Finding sehen, damit ich Schwachstellen gezielt beheben kann | Must |

#### Epic 5: Reporting
| ID | User Story | Priorität |
|----|-----------|----------|
| US-17 | Als Manager möchte ich einen PDF-Report herunterladen, damit ich Ergebnisse mit Stakeholdern teilen kann | Must |
| US-18 | Als Security-Engineer möchte ich einen JSON-Export erhalten, damit ich Findings in eigene Tools importieren kann | Should |
| US-19 | Als Nutzer möchte ich auf dem Dashboard eine Übersicht aller KPIs sehen, damit ich den Security-Status sofort erkenne | Must |

---

## 2. Priorisiertes Backlog (MoSCoW)

### Must Have (MVP — ohne geht kein Launch)
- [ ] Registrierung + Login + MFA (Clerk)
- [ ] Team-Verwaltung + RBAC (Owner/Admin/Member/Viewer)
- [ ] Projekt CRUD mit Ziel-URL-Definition
- [ ] Scan starten + Queue-basierte Ausführung
- [ ] Real-time Scan-Status (WebSocket)
- [ ] Web Security Scanner (≥5 Check-Kategorien)
- [ ] Findings-Liste mit Severity, CVSS, Remediation
- [ ] Finding-Status-Management (Open, Fixed, False Positive)
- [ ] Dashboard KPI-Übersicht
- [ ] PDF-Report Export
- [ ] Audit Logs
- [ ] Rate Limiting + Scope Validation

### Should Have (Phase 1 — wenn Zeit bleibt)
- [ ] JSON-Export Findings
- [ ] Scan abbrechen
- [ ] Email-Benachrichtigung bei Scan-Abschluss
- [ ] Findings-Kommentare (intern)
- [ ] SSL/TLS Scanner
- [ ] Port Scanner

### Could Have (Phase 2 — bewusst ausgespart)
- [ ] AI Finding-Erklärung
- [ ] Attack Surface Management
- [ ] API Security Scanner
- [ ] GitHub/Jira Integration
- [ ] Headless Browser Crawling

### Won't Have (Phase 1 — explizit ausgeschlossen)
- SSO / SAML
- Compliance Reports (CIS, ISO27001)
- Multi-Region
- On-Premise Option
- Bug Bounty Workflow

---

## 3. MVP-Definition

**Das Minimum, das wertvoll ist:**

Ein Security-Analyst kann sich registrieren, ein Projekt anlegen, einen automatisierten Web-Security-Scan starten, die Ergebnisse nach Severity filtern und einen PDF-Report herunterladen.

**Abnahme-Kriterien MVP:**
1. Scan auf `https://testphp.vulnweb.com` findet ≥ 3 echte Schwachstellen
2. PDF-Report enthält alle Findings mit Severity + Remediation
3. Zwei Tenants sehen gegenseitig keine Daten
4. API antwortet bei p95 < 200ms (Nicht-Scan-Endpunkte)
5. Kein CRITICAL Security-Finding in der eigenen Plattform

---

## 4. KPIs & Erfolgsmessung

### Produkt-KPIs (nach Launch)

| KPI | Phase 1 Ziel | Messung |
|-----|-------------|---------|
| Registrierte Nutzer | 50 (Beta) | Clerk Dashboard |
| Aktive Projekte | 20 | DB Query |
| Gestartete Scans | 100 / Monat | DB Query |
| Scan Success Rate | > 90% | DB: completed / total |
| Report Downloads | 30 / Monat | S3 Logs |
| Gefundene Findings (gesamt) | > 500 | DB Query |
| Ø Scan-Dauer | < 3 Minuten | Scan timestamps |
| Ø False Positive Rate | < 15% | Markierte FPs / Findings |
| NPS (Beta-Nutzer) | ≥ 30 | Survey |

### Technische KPIs

| KPI | Ziel |
|-----|------|
| Uptime | > 99.5% |
| API Latenz p95 | < 200ms |
| Queue Latenz | < 30 Sek bis Scan-Start |
| Fehlerquote API | < 1% |

---

## 5. Roadmap

### Phase 1 — Foundation MVP (Monat 1–3)
**Ziel:** Funktionierende Plattform mit Kern-Scan-Funktionalität

```
Woche 1-2:   Setup, Auth, CI/CD
Woche 3-5:   Backend APIs, DB, Queue
Woche 6-8:   Scanner Engine (Web, SSL, Ports)
Woche 9-11:  Frontend (Dashboard, Findings, Reports)
Woche 12-14: Integration, Testing, Beta Launch
```

**Launch-Kriterium:** 10 Beta-Nutzer, 0 CRITICAL Bugs, Scan-Erfolgsrate > 90%

---

### Phase 2 — Advanced Security Platform (Monat 4–7)
**Ziel:** Echte Differenzierung durch AI + ASM + DevSecOps

- AI Finding Explanation & Risk Prioritization (Claude API)
- Attack Surface Management (Subdomain Discovery, DNS)
- Headless Browser Crawling (Playwright-based)
- API Security Scanner
- GitHub / GitLab / Jira Integration
- Email + Slack Notifications
- Findings Trending (Vorher/Nachher Vergleich)

---

### Phase 3 — AI Security Operating System (Monat 8–14)
**Ziel:** Marktführende AI-Native Features

- AI Pentest Assistant (interaktiv)
- False Positive Reduction (ML-Modell)
- Autonomous Remediation Suggestions
- Compliance Mapping (NIS2, ISO 27001, DSGVO)
- SIEM Integration (Splunk, Elastic)
- API für Partner-Integrationen

---

### Phase 4 — Enterprise & Scale (Monat 15–24)
**Ziel:** Enterprise-Readiness

- SSO / SAML
- On-Premise Option
- Multi-Region Deployment
- SLA Tiers
- MSP/Partner-Portal
- ISO 27001 Zertifizierung

---

### Phase 5 — Autonomous Security Platform (Jahr 3+)
**Ziel:** Vollautomatische Security Operations

- Autonomous Penetration Testing
- Real-time Threat Intelligence Integration
- Predictive Vulnerability Management
- Bug Bounty Workflow
