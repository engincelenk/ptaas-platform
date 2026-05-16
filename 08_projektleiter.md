# Projektleiter – Planung & Organisation PTaaS Platform

**Datum:** 2026-05-15  
**Rolle:** Projektleiter  
**Phase:** Phase 1 MVP

---

## 1. Projektphasen & Meilensteine

```
Monat 1                  Monat 2                  Monat 3
│◄── Sprint 1 ──►│◄── Sprint 2 ──►│◄─ Sprint 3 ─►│◄── Sprint 4 ──►│◄─ Sprint 5 ─►│
│  Woche 1-2     │  Woche 3-5     │  Woche 6-8   │  Woche 9-11    │ Woche 12-14  │
│                │                │              │                │              │
│ M1: Setup ✓    │ M2: API ready  │ M3: Scanner  │ M4: Frontend   │ M5: Beta     │
│                │                │    ready     │    complete    │    Launch    │
```

### Meilensteine

| # | Meilenstein | Datum | Abnahme-Kriterium |
|---|------------|-------|------------------|
| M1 | **Setup Complete** | Woche 2 | Login/Register funktioniert, CI/CD deployed, DB Schema migriert |
| M2 | **Backend API Complete** | Woche 5 | Alle Phase-1-APIs dokumentiert + Integration Tests grün |
| M3 | **Scanner Engine Ready** | Woche 8 | Web Security + SSL + Port Scanner liefern echte Findings |
| M4 | **Frontend Complete** | Woche 11 | Dashboard, Findings, Reports vollständig und testbar |
| M5 | **Beta Launch** | Woche 14 | 10 Beta-Nutzer aktiv, 0 CRITICAL Bugs, Scan Success Rate > 90% |

---

## 2. Ressourcenbedarf

### Team-Besetzung Phase 1

| Rolle | FTE | Wochenstunden | Hauptaufgaben |
|-------|-----|--------------|---------------|
| Fullstack Developer 1 | 1.0 | 40h | NestJS Backend, Prisma, Queue, Scanner-API |
| Fullstack Developer 2 | 1.0 | 40h | Next.js Frontend, UI-Komponenten, WebSocket |
| Security / Scanner Dev | 1.0 | 40h | Python Scanner-Worker, Security-Checks, K8s-Isolation |
| DevOps Engineer | 0.5 | 20h | AWS Setup, CI/CD, Kubernetes, Monitoring |
| Product Owner / CTO | 0.5 | 20h | Anforderungen, Architektur, Code Review |
| **Gesamt** | **4.0 FTE** | **160h/Woche** | — |

### Externe Dienste / Kosten

| Dienst | Kosten / Monat | Zweck |
|--------|---------------|-------|
| AWS Infrastruktur | ~430 € | EKS, RDS, Redis, S3 |
| Clerk (Auth) | ~25 € (Pro) | Auth, MFA, Organizations |
| Vercel (Frontend) | ~20 € | Next.js Hosting |
| GitHub (Team) | ~16 € | Repository, Actions |
| Grafana Cloud | ~0–50 € | Monitoring (Free Tier reicht initial) |
| **Gesamt** | **~550 € / Monat** | — |

**Personalkosten-Schätzung:** 4 FTE × 3,5 Monate × ~6.000 € (Freelancer-Ø) = ~84.000 €

---

## 3. Zeitschätzung Phase 1

### Detaillierter Zeitplan

| Sprint | Woche | Fokus | Aufgaben |
|--------|-------|-------|---------|
| Sprint 1 | 1-2 | Setup & Auth | Monorepo-Setup, CI/CD Pipeline, Clerk Integration, Prisma Schema, Docker Compose |
| Sprint 2 | 3-5 | Backend Core | Projects API, Scans API, BullMQ Queue, Multi-Tenant RLS, Findings API, Rate Limiting |
| Sprint 3 | 6-8 | Scanner Engine | Web Security Worker, SSL/TLS Worker, Port Scanner, K8s Job Template, Scope Validation |
| Sprint 4 | 9-11 | Frontend | Dashboard, Projekt-Management, Scan-UI, Findings-Tabelle, Reports, WebSocket Client |
| Sprint 5 | 12-14 | Integration & Launch | E2E Tests, Load Tests, Security Hardening, Staging Deployment, Beta Onboarding |

---

## 4. Risiken & Gegenmaßnahmen

| # | Risiko | Wahrsch. | Impact | Gegenmaßnahme | Verantwortlich |
|---|--------|----------|--------|---------------|----------------|
| R-01 | Scanner-Qualität zu niedrig (zu viele FPs) | HOCH | HOCH | Manuelle Validierung mit 3 Test-Targets vor Launch; FP-Rate < 20% als Abnahmekriterium | Scanner Dev |
| R-02 | Scope Creep — Features aus Phase 2 landen in Phase 1 | SEHR HOCH | MITTEL | Wöchentlicher Scope-Check; jede Feature-Anfrage durch PO priorisiert | PO/CTO |
| R-03 | Tenant-Isolation-Bug (Datenleck) | MITTEL | KRITISCH | RLS von Anfang an; IDOR-Test-Suite; Security Review vor Beta | Security Dev |
| R-04 | AWS-Kosten explodieren durch Scanner-Läufe | MITTEL | MITTEL | Scan-Limits pro Tier; Budget-Alert bei > 600 €/Monat | DevOps |
| R-05 | Clerk-Integration komplexer als erwartet | NIEDRIG | MITTEL | 1 Woche Buffer in Sprint 1; Fallback: Auth0 | Dev 1 |
| R-06 | Kubernetes-Setup verzögert | MITTEL | MITTEL | Docker Compose als Fallback für Staging; K8s erst für Prod | DevOps |
| R-07 | Beta-Nutzer finden kritischen Bug | MITTEL | HOCH | Staging entspricht Production; Load Tests vor Launch | QA + DevOps |

---

## 5. Kommunikationsplan

### Interne Kommunikation

| Meeting | Frequenz | Teilnehmer | Dauer | Zweck |
|---------|----------|-----------|-------|-------|
| Daily Standup | Täglich | Alle | 15 Min | Status, Blocker, Abhängigkeiten |
| Sprint Planning | Alle 2 Wochen | Alle | 2h | Aufgaben für nächsten Sprint |
| Sprint Review | Alle 2 Wochen | Alle | 1h | Demo der fertigen Features |
| Sprint Retro | Alle 2 Wochen | Alle | 45 Min | Prozess-Verbesserung |
| Tech Sync | Wöchentlich | Dev 1, Dev 2, Scanner Dev | 30 Min | Architektur-Abstimmung |
| Security Review | Einmalig (vor Beta) | Alle | 3h | Security-Checkliste durchgehen |

### Reporting

| Report | Frequenz | Empfänger | Inhalt |
|--------|----------|-----------|--------|
| Sprint Status | Alle 2 Wochen | Stakeholder | Erledigtes, Offen, Risiken |
| Beta-Metriken | Wöchentlich | PO/CTO | Scans, Findings, Nutzer-Feedback |
| Tech-Debt Log | Monatlich | Dev-Team | Bekannte Tech-Schulden, Pläne |

### Tooling
- **Aufgaben:** GitHub Projects (Kanban)
- **Code:** GitHub Repository (Monorepo)
- **Kommunikation:** Slack / Discord
- **Docs:** Confluence oder Notion
- **Bugs:** GitHub Issues

---

## 6. Projektstrukturplan (PSP)

```
PTaaS Platform Phase 1
│
├── 1. Planung & Setup
│   ├── 1.1 Monorepo-Setup (Turborepo / nx)
│   ├── 1.2 Docker Compose (lokale Entwicklung)
│   ├── 1.3 GitHub Repository + Branch-Strategie
│   ├── 1.4 CI/CD Pipeline (GitHub Actions)
│   └── 1.5 AWS-Basis-Setup (ECR, EKS, RDS, S3)
│
├── 2. Backend
│   ├── 2.1 Auth-Integration (Clerk JWT, Middleware)
│   ├── 2.2 Multi-Tenant Isolation (RLS, Tenant Context)
│   ├── 2.3 Projects API (CRUD)
│   ├── 2.4 Scans API (Create, Status, Cancel)
│   ├── 2.5 Queue-System (BullMQ, Job Events)
│   ├── 2.6 Findings API (CRUD, Filter, Status)
│   ├── 2.7 Reports API (PDF + JSON)
│   ├── 2.8 Audit Logging
│   └── 2.9 WebSocket Gateway (Real-time Events)
│
├── 3. Scanner Engine
│   ├── 3.1 Worker-Basis-Framework (shared, api_client)
│   ├── 3.2 Web Security Worker (Headers, CORS, Cookies)
│   ├── 3.3 SSL/TLS Worker
│   ├── 3.4 Port Scanner Worker
│   ├── 3.5 K8s Job Template + Controller
│   └── 3.6 Scope Validation + IP-Blacklist
│
├── 4. Frontend
│   ├── 4.1 Auth-Seiten (Login, Register, MFA)
│   ├── 4.2 Dashboard (KPIs, Scan-Status, Charts)
│   ├── 4.3 Projekt-Management (Liste, Detail, CRUD)
│   ├── 4.4 Scan-Management (Starten, Status, History)
│   ├── 4.5 Findings-Ansicht (Tabelle, Filter, Detail)
│   ├── 4.6 Report-Download
│   ├── 4.7 Team-Settings
│   └── 4.8 WebSocket Integration (Real-time Updates)
│
├── 5. Qualitätssicherung
│   ├── 5.1 Unit Tests (≥ 80% Coverage)
│   ├── 5.2 Integration Tests (alle API-Endpunkte)
│   ├── 5.3 Security Tests (Tenant Isolation, RBAC, IDOR)
│   ├── 5.4 E2E Tests (5 kritische User Flows)
│   └── 5.5 Load Tests (k6)
│
└── 6. Beta Launch
    ├── 6.1 Staging-Deployment (Production-gleich)
    ├── 6.2 Security Review + Pentesting (intern)
    ├── 6.3 Beta-Nutzer Onboarding (10 Nutzer)
    ├── 6.4 Monitoring & Alerting aktiv
    └── 6.5 Support-Prozess eingerichtet
```

---

## 7. Definition of Project Success (Phase 1)

**Phase 1 ist erfolgreich wenn:**

1. 10 Beta-Nutzer können sich selbst registrieren und onboarden
2. Scan auf reales Ziel findet nachweislich echte Schwachstellen
3. Kein CRITICAL Security-Bug in der Plattform selbst
4. Uptime > 99.5% in den ersten 30 Tagen nach Beta-Launch
5. Ø Scan-Dauer < 3 Minuten für Standard-Web-Scan
6. NPS der Beta-Nutzer ≥ 30
7. Alle Must-Have User Stories abgenommen
