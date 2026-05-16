# PTaaS Platform – Projektbriefing

**Datum:** 2026-05-15  
**Projektname:** ptaas-platform  
**Typ:** Kommerzielles SaaS-Produkt  
**Kategorie:** AI-native Security Operations & Pentest Automation Platform

---

## Vision

Eine moderne, AI-native Penetration Testing as a Service (PTaaS) Plattform, die kontinuierliche Security Validation, Attack Surface Management, Pentest Automation, AI-Assisted Analysis, Risk Correlation, DevSecOps-Integration und Compliance Reporting vereint.

Die Plattform ist kein einfacher Vulnerability Scanner — sie ist ein **Security Operating System** für Unternehmen.

---

## Produktziele

| Ziel | Beschreibung |
|------|-------------|
| Schwachstellen frühzeitig erkennen | Continuous Scanning statt One-Shot-Tests |
| Angriffsflächen sichtbar machen | Attack Surface Graph mit Zusammenhängen |
| Risiken intelligent priorisieren | AI-basierte Risk Scoring Engine |
| Pentest-Prozesse automatisieren | Queue-basierte Scan Pipeline |
| DevSecOps integrieren | GitHub/GitLab/Jira/Slack Integrationen |
| Reports automatisieren | Executive + Technical + Compliance Reports |
| Kollaboration ermöglichen | Multi-Tenant, RBAC, Findings Workflow |

---

## Technologie-Stack

| Schicht | Technologie |
|---------|------------|
| Frontend | Next.js, React, TypeScript, TailwindCSS, shadcn/ui, Framer Motion |
| Backend | NestJS, TypeScript |
| Scanner Engine | Python Microservices |
| Datenbanken | PostgreSQL, Redis |
| Infrastructure | Docker, Kubernetes |
| Cloud | AWS oder Azure |
| Observability | OpenTelemetry, Prometheus, Grafana |
| CI/CD | GitHub Actions |

---

## Kernmodule

1. **Attack Surface Management** — Subdomain Discovery, DNS, Asset Discovery, API Discovery
2. **Continuous Pentest Automation** — Web Security, API Security, Headless Crawling
3. **AI Security Engine** — Risk Prioritization, Finding Explanation, Remediation, False Positive Reduction
4. **Security Collaboration** — Multi-Tenant, RBAC, Findings Workflow, Audit Logs
5. **DevSecOps & Automation** — GitHub, Jira, Slack, Webhooks, CI/CD Gates
6. **Reporting & Compliance** — PDF/JSON Export, CWE/OWASP Mapping, CVSS Scoring

---

## Phasen

| Phase | Fokus | Status |
|-------|-------|--------|
| Phase 1 | Foundation & MVP | **Aktuell** |
| Phase 2 | Advanced Security Platform | Geplant |
| Phase 3 | AI Security Operating System | Geplant |
| Phase 4 | Enterprise & Scale | Geplant |
| Phase 5 | Autonomous Security Platform | Geplant |

---

## Monetarisierung

| Tier | Features |
|------|----------|
| Free | Limitierte Scans, kleine Projekte, Community |
| Pro | Mehr Assets, Teams, API, AI Features |
| Enterprise | SSO, On-Prem, Compliance, SIEM, SLA, Multi-Region |

---

## Sicherheitsanforderungen (Pflicht)

- MFA, RBAC, Audit Logging, Rate Limiting
- CSP, Secure Headers, Secret Management
- Tenant Isolation, Encrypted Secrets
- Scan Worker Isolation, Container Sandboxing, Ephemeral Workers

---

## Phase 1 MVP — Scope

**Ziel:** Stabile Plattformbasis mit minimalem aber vollständigem Feature-Set

**In Scope:**
- Auth (MFA, RBAC)
- Projekt-Management
- Dashboard
- Scan Queue (Queue-basiert)
- Basic Web Security Scanner
- Findings Management
- Reports (PDF, JSON)
- Audit Logs

**Out of Scope (Phase 1):**
- AI Engine
- Headless Browser Crawling
- API Security
- DevSecOps Integrationen
- SSO/SAML
