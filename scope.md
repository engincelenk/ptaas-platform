# PTaaS Platform – Projektbriefing

**Datum:** 2026-06-21  
**Projektname:** ptaas-platform  
**Typ:** Internes Projekt (keine Monetarisierung, kein Tier-Modell)  
**Kategorie:** AI-native Security Operations & Pentest Automation Platform

---

## Vision

Eine moderne, AI-native Penetration Testing as a Service (PTaaS), die kontinuierliche Security Validation, Attack Surface Management, Pentest Automation, AI-Assisted Analysis, Risk Correlation, DevSecOps-Integration und Compliance Reporting vereint.

Die Plattform ist kein einfacher Vulnerability Scanner — sie ist ein **Security Operating System** für Unternehmen.

---

## Zielgruppe & Personas

### Primäre Zielgruppe
KMUs und Mid-Market-Unternehmen, die keine eigene Security-Abteilung haben, sowie Security Engineers in wachsenden Tech-Unternehmen.

### User Personas

| Persona | Rolle | Hauptziel | Kernfeatures |
|---------|-------|-----------|--------------|
| **Security Engineer** | Führt Scans durch, analysiert Findings | Schwachstellen schnell finden & priorisieren | Scanner, Findings, Attack Surface |
| **CISO / Manager** | Liest Reports, trifft Entscheidungen | Risiko-Überblick, Compliance-Nachweis | Dashboard, Reports, Risk Score |
| **Developer** | Empfängt Findings, fixt Bugs | Verständliche Findings mit Remediation | Findings-Workflow, DevSecOps-Integration |

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

### Kernstack

| Schicht | Technologie | Zweck |
|---------|------------|-------|
| Frontend | Next.js 15+, React, TypeScript, TailwindCSS, shadcn/ui, Motion | UI, Server Components, SSR |
| Backend | NestJS, TypeScript | API Gateway, Business Logic, Auth, Queue-Management |
| ORM | Prisma | Typsicherer Datenbankzugriff, Migrations |
| Schema Validation | Zod | Input-Validierung auf allen API-Endpoints und im Frontend |
| Scanner Engine | Python Microservices (Nuclei) | Security-Tool-Orchestrierung |
| Message Queue | BullMQ (Redis-basiert) | Scan Job Queue, Worker Dispatch, Retry-Logik |
| Realtime | WebSockets / SSE | Live Scan-Fortschritt, Notifications |
| Primary DB | PostgreSQL + pgvector | Transaktionale Daten + KI-Embeddings (ein Dienst) |
| Cache / Queue | Redis | Sessions, Rate Limiting, BullMQ Backend |
| Object Storage | MinIO | Evidence, Reports, Exports, Payloads (S3-kompatibel) |
| Logging | Pino | Strukturiertes JSON-Logging (lokal + prod identisch) |
| Monorepo | npm workspaces | `apps/web`, `apps/api`, `packages/types`, `packages/db` |
| Testing | Vitest (Unit), Playwright (E2E) | Automatisierte Tests |
| API Docs | Scalar | API-Dokumentation (NestJS Swagger-Integration) |
| Deployment | Docker Compose | Lokal und Online identische Konfiguration |
| CI/CD | GitHub Actions | Lint, Typecheck, Tests bei jedem Push |
| Observability | Prometheus + Grafana | Aktiviert ab Online-Deployment (M7) |

### KI-Stack

KI ist ein First-Class-Bürger der Plattform — kein nachträgliches Add-on. Alle Module sind KI-aware entworfen.

| KI-Feature | Technologie | Milestone |
|------------|-------------|-----------|
| Finding-Erklärung (Plain Language) | Anthropic Claude API | M5 |
| Remediation-Vorschläge | Claude API (strukturierter Output) | M5 |
| False Positive Einschätzung | Claude API + Finding-History als Kontext | M5 |
| Risk Scoring & Priorisierung | Claude API | M5 |
| Semantische Suche über Findings | pgvector (PostgreSQL Extension) | M5 |
| KI-Workflow-Integration | Vercel AI SDK (provider-agnostisch) | M5 |
| Autonome Scan-Strategien | LangChain / LangGraph | Phase 3+ |

### Datenbankarchitektur

| Store | Technologie | Einsatz |
|-------|-------------|---------|
| Primary DB + Vektor | PostgreSQL + pgvector | Alle Daten + semantische Suche (ein Dienst) |
| Cache / Queue Backend | Redis | Sessions, Rate Limiting, BullMQ Jobs |
| Object Storage | MinIO (lokal) / S3-kompatibel (online) | Evidence, PDFs, Payloads, Exports |

### Secrets-Management

| Phase | Strategie |
|-------|-----------|
| Lokal (Phase 1) | `.env`-Dateien (git-ignored), `.env.example` mit Dummy-Werten im Repo |
| Online (Phase 2) | Docker Secrets + IONOS Umgebungsvariablen |
| Skaliert (Phase 3+) | Infisical (Self-hosted) wenn mehrere Server/Teams |

### Bewusst nicht verwendet (mit Begründung)

| Technologie | Warum nicht |
|-------------|-------------|
| ~~Kubernetes~~ | Massiver Ops-Overhead für Phase 1. Docker Compose reicht. Migration ab Phase 3+ |
| ~~Turborepo~~ | Overhead ohne Nutzen für kleines Team. npm workspaces reicht. |
| ~~Infisical (lokal)~~ | Eigener Dienst für lokale Entwicklung unnötig. .env ist ausreichend. |
| ~~Meilisearch~~ | pgvector + PostgreSQL Full-Text ersetzt es vollständig |
| ~~HashiCorp Vault~~ | Docker Secrets + IONOS-Env reichen für Phase 2 |
| ~~Cloud (AWS/GCP/Azure)~~ | Zu hohe laufende Kosten. IONOS VPS ab Phase 2 |
| ~~Prometheus + Grafana (lokal)~~ | Erst ab Online-Deployment sinnvoll (M7) |

---

## Architektur

### Muster: Modularer Monolith (Phase 1)

Phase 1 nutzt einen **modularen Monolithen** (NestJS), der sauber nach Domänen getrennt ist:
- `auth` — Authentifizierung, Sessions, MFA
- `organizations` — Multi-Tenancy, RBAC
- `projects` — Projekt- und Asset-Management
- `targets` — Domain Verification, Scope-Management
- `scans` — Queue, Worker, Fortschritt
- `findings` — Lifecycle, KI-Analyse, Suche
- `reports` — PDF/JSON-Export
- `audit` — unveränderlicher Audit Trail

Die **Python Scanner Engine** bleibt als separater Docker-Container (fachlich begründet: Security-Tool-Ökosystem ist Python).

Aufteilung in echte Microservices erst ab Phase 3, wenn Skalierungsanforderungen es erfordern.

### C4 Container-Übersicht

```
[Browser]
    ↓ HTTPS (Cloudflare ab M7)
[Next.js Frontend]  ←→  [Vercel AI SDK ↔ Claude API]
    ↓ REST / WebSocket
[NestJS API — Modularer Monolith]
    ├── PostgreSQL + pgvector  (Prisma ORM)
    ├── Redis  (Cache, Rate Limiting, BullMQ)
    └── MinIO  (Evidence, Reports, Payloads)
            ↓ Job Dispatch via BullMQ
    [Python Scanner Worker — Nuclei]
         (isoliertes Docker-Netzwerk, nur Scan-Ziel erreichbar)
```

### Lokal → Online Strategie

**Kernprinzip:** Dieselbe `docker-compose.yml` läuft lokal und auf dem IONOS VPS. Der einzige Unterschied sind Umgebungsvariablen (`.env`). Keine Architekturänderung beim Wechsel.

```
Phase 1 (lokal):    Docker Compose auf Entwicklungsrechner
Phase 2 (online):   Docker Compose auf IONOS VPS + Cloudflare davor
Phase 3+ (scale):   Docker Swarm / K8s wenn nötig
```

**Online-Infrastruktur (Phase 2) — Kostenübersicht:**

| Dienst | Kosten |
|--------|--------|
| IONOS VPS XL (8 vCPU, 16GB RAM) | ~€25/Monat |
| Cloudflare (DNS, SSL, CDN, WAF) | **Gratis** |
| Let's Encrypt (SSL-Zertifikat) | **Gratis** |
| GitHub Actions (CI/CD) | **Gratis** (bis 2.000 min/Monat) |
| Claude API (Pay-per-Token) | ~€10–30/Monat (nutzungsabhängig) |
| **Gesamt** | **~€35–55/Monat** |

### Architecture Decision Records (ADRs)

---

#### ADR-001 — Modularer Monolith vs. Microservices

**Status:** Accepted — 2026-06-21

**Entscheidung:** Modularer Monolith (NestJS)

**Begründung:**
Solo-Entwickler, MVP-Zeithorizont, Anforderungen noch nicht vollständig stabil. Microservices erfordern Team > 20, operative Reife und unabhängige Deployment-Zyklen — keines davon trifft zu. NestJS ist explizit für dieses Pattern gebaut.

**Alternativen erwogen:**
- Microservices → Abgelehnt: 3–4x Ops-Overhead, verteilte Transaktionen, zu früh für diese Projektgröße
- Einfacher Monolith (ohne Modul-Trennung) → Abgelehnt: wird bei 8 Domänen zur "Big Ball of Mud", Refactoring teuer

**Konsequenzen:**
- Migration zu Microservices ab Phase 3 möglich — Modulgrenzen sind bereits die zukünftigen Service-Grenzen
- Skalierung nur als Ganzes (Phase 1 ausreichend)

---

#### ADR-002 — Scan Queue: BullMQ vs. Alternativen

**Status:** Accepted — 2026-06-21

**Entscheidung:** BullMQ mit `concurrency: 1` (sequentielles Scanning)

**Begründung:**
Kein paralleles Scanning geplant, geringe Last erwartet. Redis ist sowieso im Stack (Sessions, Rate Limiting) — BullMQ fügt null extra Infrastruktur hinzu. Beste NestJS-Integration (`@nestjs/bullmq`), Job-Persistenz, Retry-Logik out-of-the-box.

**Alternativen erwogen:**
- NATS JetStream → Abgelehnt: eigener Dienst, kein nativer NestJS-Support, overkill für sequentielle Jobs
- RabbitMQ → Abgelehnt: eigener Dienst (AMQP), komplexeres Setup, Mehrwert erst bei Multi-Service-Kommunikation (Phase 3+)
- pg-boss (PostgreSQL-Queue) → Abgelehnt: da Redis eh da ist, kein Vorteil; weniger NestJS-Integration
- Concurrency auf 1 → kein paralleles Scanning, bewusste Einschränkung für Phase 1

---

#### ADR-003 — ORM: Prisma vs. Drizzle

**Status:** Accepted — 2026-06-21

**Entscheidung:** Prisma

**Begründung:**
Beste Developer Experience im Node.js-Ökosystem, Schema als Single Source of Truth, automatische Migrations, Prisma Studio für visuelles Debugging, pgvector-Support, bewährte NestJS-Integration. Performance-Unterschied zu Drizzle irrelevant bei erwarteter Last.

**Alternativen erwogen:**
- Drizzle → Abgelehnt: jünger, Migrations-Tooling noch nicht ausgereift, kein Studio-Tool, weniger NestJS-Ressourcen; Performance-Vorteil spielt bei unserer Last keine Rolle
- Raw SQL (keine ORM) → Abgelehnt: kein Typsystem, Migrations manuell, zu fehleranfällig

---

#### ADR-004 — Scanner: Nuclei vs. OWASP ZAP

**Status:** Accepted — 2026-06-21

**Entscheidung:** Nuclei

**Begründung:**
Template-basiert mit 7.000+ Community-Templates (CVEs, Misconfigurations, Exposures), leichtgewichtiges Go-Binary, JSON-Output direkt in DB schreibbar, aktiv maintained (ProjectDiscovery), neue CVE-Templates oft innerhalb von Stunden verfügbar. Perfekt für automatisierte Scan-Pipeline.

**Alternativen erwogen:**
- OWASP ZAP → Abgelehnt: Java-basiert (schweres Image, mehr RAM), komplexere Automatisierungs-API, langsamer beim Start; sinnvoll wenn interaktives Web-Crawling mit JS-Rendering gebraucht wird (Phase 2)
- Kombination Nuclei + ZAP → Phase 2: Nuclei für Template-Scans, ZAP für tiefes Crawling

---

#### ADR-005 — KI: Claude API vs. Ollama

**Status:** Accepted — 2026-06-21

**Entscheidung:** Anthropic Claude API via Vercel AI SDK

**Begründung:**
State of the art Reasoning-Qualität für Security-Analyse, zuverlässiger strukturierter JSON-Output, sofort einsatzbereit, provider-agnostisch durch Vercel AI SDK (Wechsel zu GPT-4o / Gemini ohne Code-Änderung möglich). Kosten: ~€10–30/Monat bei normaler Nutzung.

**Alternativen erwogen:**
- Ollama (lokales LLM) → Abgelehnt: deutlich schlechtere Qualität bei Security-Analyse, GPU-Hardware nötig, unzuverlässiger JSON-Output; sinnvoll nur wenn Offline-Betrieb Pflicht
- Hybrid (Ollama lokal / Claude API online) → Abgelehnt: unterschiedlicher Output in verschiedenen Umgebungen führt zu schwer reproduzierbaren Bugs

**Datenschutz-Hinweis:**
Security-Findings enthalten sensible Daten. Findings werden vor API-Call pseudonymisiert wo möglich. Kunden müssen informiert werden, dass Findings-Metadaten an externe KI-API gesendet werden. Anthropic's API speichert keine Daten für Training (API-Nutzungsbedingungen).

---

#### ADR-006 — Scanner Worker Isolation

**Status:** Accepted — 2026-06-21

**Entscheidung:** Docker Network Policy + Ephemeral Container pro Scan

**Begründung:**
Zwei Maßnahmen kombiniert ohne extra Tooling: (1) Scanner-Container in isoliertem Docker-Netzwerk — kein Zugriff auf interne API, DB oder Redis, nur Scan-Ziel erreichbar. (2) Frischer Container pro Scan — kein persistenter State, kompromittierter Container stirbt nach Scan automatisch. Funktioniert identisch lokal und auf IONOS.

**Alternativen erwogen:**
- gVisor (Kernel-Level-Sandboxing) → Phase 2+: deutlich sicherer gegen Container-Breakouts, aber komplexes Setup, ~20% Performance-Overhead, nicht trivial mit Docker Compose
- Firecracker (MicroVMs) → Phase 3+: maximale Isolation, aber erheblicher Infrastruktur-Aufwand

**Konsequenzen:**
- Container-Startup-Zeit pro Scan: ~2–5s Overhead (akzeptabel)
- gVisor-Migration für Online-Betrieb mit echten Kunden evaluieren (Phase 2)

---

## Kernmodule

1. **Attack Surface Management** — Subdomain Discovery, DNS, Asset Discovery, API Discovery
2. **Continuous Pentest Automation** — Web Security, Nuclei-basiertes Scanning
3. **AI Security Engine** — Finding-Analyse, Risk Prioritization, Remediation, False Positive Reduktion
4. **Security Collaboration** — Multi-Tenant, RBAC, Findings Workflow, Audit Logs
5. **DevSecOps & Automation** — GitHub, Jira, Slack, Webhooks, CI/CD Gates
6. **Reporting & Compliance** — PDF/JSON Export, CWE/OWASP Mapping, CVSS Scoring

---

## Phasen

| Phase | Fokus | Deployment | Status |
|-------|-------|------------|--------|
| Phase 1 | Foundation & MVP | Lokal (Docker Compose) | ✅ Abgeschlossen |
| Phase 2 | Online-Deployment + Attack Surface Management | IONOS VPS + Cloudflare | ✅ Abgeschlossen |
| Phase 3 | Advanced Security + AI Operating System | Skalierbare Infra | ✅ Abgeschlossen (2026-07-05) |
| Phase 4 | Enterprise & Scale | Multi-Region | ✅ Abgeschlossen (2026-07-06) |
| Phase 5 | Autonomous Security Platform | — | 🔜 Nicht definiert |

---

## ISO 27001

Anforderungen, Dokument-Checkliste und Milestone-Mapping: → **[ISO27001.md](./ISO27001.md)**

---

## Sicherheitsanforderungen (Pflicht)

### Plattform-Sicherheit
- MFA (TOTP), RBAC (4 Rollen), Audit Logging, Rate Limiting (NestJS ThrottlerGuard)
- CSP, Security Headers (helmet.js), Zod-Validierung auf allen Endpoints
- Tenant Isolation (alle DB-Queries mit org_id gefiltert)
- Passwort-Hashing: Argon2 (kein bcrypt, kein MD5/SHA1)
- JWT: Access Token 15min / Refresh Token 7d / httpOnly Cookie / SameSite=Strict
- **Refresh Token Rotation mit Token Family Detection:** Bei jedem `/auth/refresh` wird der alte Token invalidiert und ein neuer ausgegeben. Jede Token-Familie wird in Redis mit `currentTokenId` geführt. Wird ein bereits rotierter Token erneut verwendet (Reuse-Detection), wird die gesamte Familie sofort gelöscht → alle Sessions des Users werden beendet. Logout schreibt Token in Redis-Blocklist (TTL = Restlaufzeit).
- **Scan-Credentials Verschlüsselung (AES-256-GCM):** Credentials (Bearer Token, Basic Auth, Cookie) werden niemals im Klartext in PostgreSQL gespeichert. Verschlüsselung auf Application-Level mit AES-256-GCM, frischer IV pro Verschlüsselung, AuthTag für Integritätsschutz. Format in DB: `iv:authTag:ciphertext`. Encryption Key (32 Bytes) ausschließlich als Docker Secret / Umgebungsvariable — niemals in der DB. Abruf der Credentials nur durch den Python Scanner Worker über internen Endpoint (nicht öffentlich erreichbar).

### Scan-Sicherheit & Legal

| Anforderung | Beschreibung | Priorität |
|-------------|--------------|-----------|
| **Scan-Autorisierung (Proof of Ownership)** | Domain Verification via DNS TXT / HTTP File / Meta Tag — **kein Scan ohne Autorisierung, auch nicht lokal** | 🔴 Kritisch |
| **SSRF-Schutz** | Vor jedem Verification-Request und Scan-Target: aufgelöste IP gegen Blocklist prüfen — RFC1918 (10.x, 172.16.x, 192.168.x), Loopback (127.x), Cloud-Metadata-Ranges (169.254.169.254). IP-Range-Targets (`192.168.1.0/24`) explizit gegen interne Ranges validieren. | 🔴 Kritisch |
| **Legal Framework** | Jeder Scan dokumentiert: wer, wann, was autorisiert hat | 🔴 Kritisch |
| **Scanner Network Isolation** | Python Worker im isolierten Docker-Netzwerk — nur Scan-Ziel erreichbar, kein Zugriff auf interne API | 🟠 Hoch |
| **Scanner Container non-root** | Python Scanner Worker läuft als dedizierter non-root User (`USER scanner` im Dockerfile) — verhindert Privilege Escalation bei kompromittiertem Nuclei-Parser | 🟠 Hoch |
| **Nuclei Template Pinning** | Templates aus gepinntem, verifizierten Nuclei-Release ziehen — kein `latest`. Verhindert Exfiltration durch kompromittierte Community-Templates. | 🟠 Hoch |
| **Evidence Storage (immutable)** | HTTP Requests/Responses, Screenshots, Payloads unveränderbar in MinIO — **SSE (Server-Side Encryption) aktiviert** | 🟠 Hoch |
| **Secrets nie in Git** | `.env` immer in `.gitignore`, nur `.env.example` mit Dummy-Werten committen | 🟠 Hoch |
| **Dependency Scanning** | `npm audit` in GitHub Actions CI bei jedem Push. Dependabot aktiviert für automatische Dependency-Updates (npm + pip). | 🟡 Mittel |
| **Egress IP Management** | Dedizierte Scanner-IPs dokumentiert (ab Online-Deployment) | 🟡 Mittel |
| **Data Classification & Retention** | Findings als hochsensibel klassifiziert. Löschfristen: Findings 24 Monate, Scan-Evidence (MinIO) 12 Monate, Audit Logs 36 Monate. Täglicher Cron-Job via BullMQ Scheduled Job. | 🟡 Mittel |
| **Vulnerability Disclosure Policy** | Interner Prozess für kritische Findings in Kundeninfrastruktur | 🟡 Mittel |

### Online-Security (ab M7)
- Cloudflare WAF Rules für `/api/` (Rate Limiting + Bot-Schutz)
- Cloudflare DDoS-Schutz (Pentest-Plattformen sind attraktive Ziele)
- Rate Limiting doppelt: Cloudflare-Ebene + NestJS ThrottlerGuard
- PostgreSQL Backup-Cronjob (täglich)

---

## Non-Functional Requirements

| NFR | Phase 1 (lokal) | Phase 2 (online) |
|-----|-----------------|------------------|
| Verfügbarkeit | Entwicklungsmodus | 99,5% Ziel |
| Dashboard Response Time | < 500ms | < 500ms |
| Scan-Start-Latenz | < 30s nach Auftrag | < 30s |
| Tenant Isolation | Zero cross-tenant data leakage | Zero cross-tenant data leakage |
| Max. Assets / Projekt | 100 (Phase 1) | 500 (Phase 2) |
| Concurrent Scans | 5 (lokal) | 10 (online) |

---

## MVP Milestones

**Prinzip:** Jeder Milestone liefert etwas Lauffähiges. Kein Milestone endet mit einem halbfertigen Feature.

---

### M1 — Foundation (Woche 1–2)
*Alle Services laufen lokal, CI ist grün, Entwicklung kann starten.*

- Monorepo-Setup (npm workspaces: `apps/web`, `apps/api`, `packages/types`, `packages/db`)
- `docker-compose.yml`: PostgreSQL, Redis, MinIO, API, Frontend, Python-Worker
- NestJS Grundstruktur (Module, globale Guards, Exception Filter, Pino-Logging)
- Next.js Grundstruktur (App Router, Layout, shadcn/ui Design System)
- Prisma Schema (erste Migration: Users, Organizations, AuditLogs)
- GitHub Actions: lint + typecheck + unit tests bei jedem Push + **`npm audit` (Dependency Scanning)**
- **Dependabot** aktivieren (`.github/dependabot.yml`) für automatische npm + pip Dependency-Updates
- **`pip-audit`** für Python Scanner Worker in CI — schlägt bei kritischen Vulnerabilities fehl (ISO-DEV-06)
- **SBOM generieren** (`@cyclonedx/cyclonedx-npm`) als CI-Artifact archivieren (ISO-DEV-06)
- **DoD:** `docker compose up` → alles startet, Frontend erreichbar, `/health` antwortet

---

### M2 — Auth & Multi-Tenancy (Woche 3–4)
*Vollständige Authentifizierung, Mandantentrennung, Audit-Trail.*

- Registrierung / Login (Email + Passwort, Argon2)
- MFA (TOTP, Authenticator App)
- JWT (Access 15min / Refresh 7d / httpOnly Cookie)
- **Refresh Token Rotation + Token Family Detection** (Redis-basiert, Reuse-Detection → sofortige Invalidierung aller Sessions)
- RBAC: Admin / Security Engineer / Developer / Viewer
- Organization/Tenant-Struktur
- Audit Logging (alle Auth-Events)
- **Audit Log Immutability:** DB-Level-Schutz via Trigger oder RLS — kein UPDATE/DELETE auf `audit_logs` möglich (ISO-DEV-01)
- **DoD:** User registriert sich, richtet MFA ein, loggt ein — alles im Audit Log; Audit-Einträge unveränderlich

---

### M3 — Projekt & Domain Verification (Woche 5–6)
*User kann Projekte anlegen und Targets legal verifizieren.*

- Projekt-CRUD
- Asset/Target-Verwaltung (Domain, IP, URL)
- **Domain Verification** (DNS TXT / HTTP File / Meta Tag) — Pflicht vor Scan
- **SSRF-Schutz bei Verification:** aufgelöste IP jedes Verification-Requests gegen Blocklist prüfen (RFC1918, Loopback, Cloud-Metadata-Ranges) bevor HTTP-Request abgesetzt wird
- **Target-Validierung:** IP-Range-Targets gegen interne Ranges validieren — kein Scan auf private IPs ohne explizite Allowlist
- Onboarding-Wizard (Org → Projekt → Target → Verify → bereit)
- Dashboard-Grundgerüst (Projekt-Übersicht, Asset-Status)
- **DoD:** Domain verifiziert, Plattform blockiert jeden Scan ohne Verification

---

### M4 — Scan Engine (Woche 7–9)
*Erster echter Scan läuft durch, Ergebnis landet in der DB.*

- BullMQ Scan-Queue (Job erstellen, Status tracken, Retry-Logik)
- Python Scanner Worker (Docker, isoliertes Netzwerk, ephemeral)
- Scanner: **Nuclei** (7.000+ Templates, YAML-basiert, aktiv maintained)
- **Nuclei Rate Limiting:** konfigurierbares `-rate-limit` und `-timeout` pro Scan-Typ (Quick Scan: 100 req/s, Full Scan: 30 req/s als Default) — verhindert ungewollte Überlastung von Zielsystemen
- **Nuclei Template Pinning:** Templates aus gepinntem Nuclei-Release ziehen (kein `latest`) — kein automatisches Update auf unkontrollierte Community-Templates
- **Scanner Container non-root:** `USER scanner` im Dockerfile — kein root-Prozess im Scanner-Container
- **Scan-Credentials Verschlüsselung:** AES-256-GCM mit frischer IV, Key als Docker Secret, Abruf nur durch Scanner Worker über internen Endpoint
- WebSockets / SSE für Live-Fortschritt
- Evidence Storage (HTTP Requests/Responses, Payloads → MinIO mit SSE)
- Scanner Network Isolation (Docker Network Policy: nur Scan-Ziel)
- **Findings-Pseudonymisierung (vorgezogen aus M5):** RAM-Mapping-Tabelle für Domains/IPs/Pfade — Pseudonymisierung vor jedem Claude-API-Call, Re-Substitution nach Response (ISO-DEV-02)
- **DoD:** User startet Scan, sieht Live-Fortschritt, rohe Findings in DB; Pseudonymisierungs-Layer einsatzbereit

---

### M5 — Findings & KI-Analyse (Woche 10–12)
*Findings sind verständlich, priorisiert, actionable — dank KI.*

- Findings-Datenmodell (Severity, CVSS, CWE, OWASP, Status)
- Finding-Lifecycle: Open → In Progress → Fixed → Verified → Closed
- **Claude API** (Vercel AI SDK): Plain-Language-Erklärung, Remediation, False-Positive-Check
- Pseudonymisierungs-Layer aus M4 wird hier produktiv genutzt — kein zusätzlicher Implementierungsaufwand
- Risk Scoring (KI-basiert, priorisierte Liste pro Projekt)
- pgvector: Embeddings + semantische Suche über Findings
- Re-Scan-Mechanismus (Verification Scan nach gemeldetem Fix)
- **DoD:** Finding hat KI-Erklärung + Remediation — Developer versteht es ohne Security-Wissen

---

### M6 — Reports & Hardening (Woche 13–14)
*Exportierbarer Report, Plattform ist produktionsbereit gehärtet.*

- PDF-Report (Executive Summary + Technical Details, CWE/OWASP-Mapping)
- JSON-Export (maschinenlesbar)
- CVSS Score-Anzeige
- Plattform-Hardening: CSP, Security Headers vollständig (helmet.js inkl. Permissions-Policy, COOP, COEP), Rate Limiting, Zod auf allen Endpoints (ISO-DEV-05)
- **DSGVO Löschfristen-Cron:** täglicher BullMQ Scheduled Job löscht abgelaufene Daten (Findings >24 Monate, Evidence >12 Monate, Audit Logs >36 Monate)
- **DSGVO Betroffenenrechte-Endpoints:** `GET /api/v1/me/export`, `DELETE /api/v1/me`, `PATCH /api/v1/me/consent` (ISO-DEV-03)
- **Secrets Rotation Mechanismus:** interner Admin-Endpoint zur AES-Key-Rotation ohne Datenverlust (ISO-DEV-04)
- **MinIO SSE aktivieren:** Server-Side Encryption für Evidence Storage (Konfiguration in docker-compose.yml)
- Scanner-Secrets via Docker Secrets (keine .env im Container)
- **DoD:** Vollständiger PDF-Report exportierbar, OWASP-Mapping korrekt, alle DSGVO-Endpoints funktional

---

### M7 — Online Deployment (Woche 15)
*Plattform läuft auf IONOS, Cloudflare davor, alles wie lokal.*

- IONOS VPS Setup (Docker installieren, Firewall konfigurieren)
- `.env.production` (keine Architekturänderung, nur Config)
- Cloudflare: DNS, SSL (Let's Encrypt), WAF Rules für `/api/`
- Prometheus + Grafana aktivieren
- PostgreSQL Backup-Cronjob (täglich nach MinIO, verschlüsselt)
- **Automatisierter Restore-Test:** monatlicher BullMQ Job — Restore in Temp-DB, Integritätsprüfung, Ergebnis ins Audit Log (ISO-DEV-07)
- **Vulnerability Disclosure Policy:** öffentliche `/security`-Seite mit Scope, Kontakt, Response-Zeit, Safe Harbor (ISO-DEV-08)
- **DoD:** `https://domain.de` erreichbar, Scan läuft durch, Report exportierbar, Monitoring aktiv, VDP erreichbar

---

## Phase 1 MVP — Scope

**In Scope:**
- Auth (MFA, RBAC) — M2
- Projekt-Management — M3
- Dashboard — M3
- Scan-Autorisierung (Domain Verification) — M3 ← Pflicht
- Scan Queue (BullMQ + Nuclei) — M4
- Basic Web Security Scanner — M4
- AI-Assisted Finding-Analyse (Claude API) — M5 ← KI von Anfang an
- Findings Management + Lifecycle — M5
- Re-Scan-Mechanismus — M5
- Reports (PDF, JSON) — M6
- Audit Logs — M2
- Onboarding-Flow — M3
- Online Deployment (IONOS + Cloudflare) — M7

**Out of Scope (Phase 1):**
- Attack Surface Management (Subdomain Discovery, DNS Recon)
- Headless Browser Crawling
- API Security Scanning
- DevSecOps Integrationen (GitHub, Jira, Slack)
- SSO / SAML
- Autonome Scan-Strategien (LangChain/LangGraph)
- Monetarisierung / Tier-Modell
- Multi-Region / Kubernetes

---

## Sprint-Plan Phase 1

**Rahmenbedingungen:**
- Sprint-Länge: 2 Wochen (Ausnahmen: S5, S7, S9 = 1 Woche, da Milestone-Größe es erlaubt)
- Definition of Done je Sprint = Milestone-DoD erfüllt + CI grün + kein offenes P0-Bug
- Story Points (SP): Fibonacci-Skala, Basis: 1 SP ≈ halber Entwicklertag
- Velocity-Ziel: ~28 SP pro 2-Wochen-Sprint

---

### Sprint 1 — „Lauffähige Basis" (Woche 1–2) · M1

**Sprint Goal:** `docker compose up` → alle Services starten, Frontend erreichbar, `/health` antwortet, CI-Pipeline ist grün.

| Story | SP |
|-------|----|
| Monorepo-Setup (npm workspaces: `apps/web`, `apps/api`, `packages/types`, `packages/db`) | 3 |
| `docker-compose.yml`: PostgreSQL, Redis, MinIO, API, Frontend, Python-Worker | 5 |
| NestJS Grundstruktur (Module, globale Guards, Exception Filter, Pino-Logging) | 5 |
| Next.js Grundstruktur (App Router, Layout, shadcn/ui Design System) | 3 |
| Prisma Schema + erste Migration (Users, Organizations, AuditLogs) | 3 |
| GitHub Actions: lint + typecheck + unit tests + `npm audit` + Dependabot | 2 |
| **Gesamt** | **21** |

**Risiko:** Docker-Netzwerk-Konfiguration zwischen Services kann unerwartet Zeit kosten.

---

### Sprint 2 — „Sicherer Zugang" (Woche 3–4) · M2

**Sprint Goal:** User registriert sich, richtet MFA ein und loggt ein — vollständiger Auth-Flow mit Audit Trail.

| Story | SP |
|-------|----|
| Registrierung / Login (Email + Passwort, Argon2) | 5 |
| MFA (TOTP, Authenticator App, Pflicht-Setup vor Dashboard) | 8 |
| JWT (Access 15min / Refresh 7d / httpOnly Cookie / SameSite=Strict) | 5 |
| Refresh Token Rotation + Token Family Detection (Redis, Reuse → alle Sessions invalide) | 8 |
| RBAC: Admin / Security Engineer / Developer / Viewer | 5 |
| Organization/Tenant-Struktur (alle DB-Queries mit `org_id`) | 5 |
| Audit Logging (alle Auth-Events: Login, Logout, fehlgeschlagene Versuche, MFA-Events) | 5 |
| Login-UI + MFA-Setup-UI (User-Enumeration-sichere Fehlermeldungen) | 3 |
| **Gesamt** | **44** |

> **Hinweis:** 44 SP über Velocity-Ziel — M2 ist sicherheitskritisch, kein Scope-Cut. Falls nötig: Audit-Log-Lese-UI (UC-04) auf Sprint 3 verschieben. Auth-Funktionalität bleibt komplett.

---

### Sprint 3 — „Targets verifiziert" (Woche 5–6) · M3

**Sprint Goal:** Domain ist verifiziert, Plattform blockiert jeden Scan ohne Verification — Onboarding-Flow vollständig.

| Story | SP |
|-------|----|
| Projekt-CRUD (anlegen, bearbeiten, archivieren) | 5 |
| Asset/Target-Verwaltung (Domain, IP, IP-Range, URL) | 5 |
| Domain Verification: DNS TXT Record | 5 |
| Domain Verification: HTTP File | 3 |
| Domain Verification: Meta Tag | 3 |
| SSRF-Schutz bei Verification (RFC1918, Loopback, Cloud-Metadata-Ranges) | 5 |
| Target-Validierung: IP-Range gegen interne Ranges | 3 |
| Onboarding-Wizard (Org → Projekt → Target → Verify → bereit) | 5 |
| Dashboard-Grundgerüst (Projekt-Übersicht, Asset-Status, Verification-Badge) | 5 |
| Audit-Log-Lese-UI (UC-04, aus S2 verschoben falls nötig) | 3 |
| **Gesamt** | **42** |

> **Hinweis:** Verification ist legal-kritisch — kein Scope-Cut. Dashboard kann auf minimale Projekt-Liste reduziert werden falls Zeit knapp.

---

### Sprint 4 — „Scanner-Infrastruktur" (Woche 7–8) · M4 Teil 1

**Sprint Goal:** BullMQ Queue nimmt Jobs an, Python Scanner Worker startet Nuclei im isolierten Container — erster Scan läuft ohne UI durch.

| Story | SP |
|-------|----|
| BullMQ Scan-Queue (Job erstellen, Status tracken, Retry-Logik, Dead Letter) | 8 |
| Python Scanner Worker (Docker, Dockerfile, non-root User `scanner`) | 5 |
| Nuclei Integration (gepinntes Release, JSON-Output, Rate Limiting `-rate-limit`/`-timeout`) | 8 |
| Nuclei Template Pinning (kein `latest`, verifiziertes Release) | 3 |
| Scanner Container Isolation (Docker Network Policy: nur Scan-Ziel erreichbar) | 5 |
| Ephemeral Container pro Scan (frischer Container, kein persistenter State) | 3 |
| Scan-Credentials Verschlüsselung (AES-256-GCM, frische IV, AuthTag, Docker Secret) | 8 |
| **Gesamt** | **40** |

---

### Sprint 5 — „Live-Scanning" (Woche 9) · M4 Teil 2

**Sprint Goal:** User startet Scan, sieht Live-Fortschritt, rohe Findings landen in DB — M4 vollständig abgeschlossen.

| Story | SP |
|-------|----|
| WebSockets / SSE: Live-Fortschritt (Fortschrittsbalken, aktuelle Aktivität, ETA) | 8 |
| WebSocket-Event `finding.critical.discovered` → Frontend Alert (UX-DECISIONS 3.2) | 3 |
| Evidence Storage: HTTP Requests/Responses + Payloads → MinIO mit SSE | 5 |
| Scan UI: Start-Button, Konfiguration (Quick/Full, Template-Kategorien, Ausschlüsse) | 5 |
| **Gesamt** | **21** |

**DoD M4:** User startet Scan, sieht Live-Fortschritt, rohe Findings in DB, Evidence in MinIO.

---

### Sprint 6 — „AI-Insights" (Woche 10–11) · M5 Teil 1

**Sprint Goal:** Jedes Finding hat eine KI-Erklärung + Remediation — Developer versteht das Problem ohne Security-Wissen.

| Story | SP |
|-------|----|
| Findings-Datenmodell (Severity, CVSS, CWE, OWASP, Status, alle Felder aus UC-13) | 5 |
| Finding-Lifecycle: Open → In Progress → Fixed → Verified → Closed / False Positive / Accepted Risk | 5 |
| Finding-Triage (UC-14): Severity anpassen, False Positive, Zuweisung, Kommentar | 5 |
| Findings-Pseudonymisierung vor Claude API Call (RAM-Mapping, Re-Substitution) | 5 |
| Claude API Integration (Vercel AI SDK): Plain-Language-Erklärung | 5 |
| Claude API: Remediation-Vorschlag (strukturierter Output) | 3 |
| Claude API: False-Positive-Wahrscheinlichkeit (0–100%) | 3 |
| Risk Scoring KI-basiert (CVSS-Gewichtung, Trend, Score 0–100 + Ampel) | 5 |
| Findings-Liste UI: Filter (Severity, Status, OWASP, CWE, Zeitraum), Inline-Status (UX-DECISIONS 1.3) | 5 |
| Findings-Detail UI: Developer-Ansicht vs. Engineer-Ansicht (UX-DECISIONS 2.1/2.2), Persona-Toggle | 5 |
| **Gesamt** | **46** |

> **Scope-Cut-Option:** Risk Scoring auf S7 verschieben — Core-Finding-UX und Claude API bleiben in S6.

---

### Sprint 7 — „Suche & Re-Scan" (Woche 12) · M5 Teil 2

**Sprint Goal:** Semantische Suche funktioniert, Re-Scan verifiziert Fixes — M5 vollständig abgeschlossen.

| Story | SP |
|-------|----|
| pgvector: Embeddings für alle Findings generieren (Claude API) | 5 |
| Semantische Suche UI (UC-18): Freitext-Suche, Ähnlichkeits-Findings | 5 |
| Re-Scan-Mechanismus (UC-16): gezielter Verification Scan nach gemeldtem Fix | 8 |
| Verwandte Findings (pgvector Similarity) im Finding-Detail | 3 |
| Risk Scoring (falls aus S6 verschoben) | 5 |
| **Gesamt** | **26** |

**DoD M5:** Finding hat KI-Erklärung + Remediation, semantische Suche funktioniert, Re-Scan-Mechanismus vollständig.

---

### Sprint 8 — „Production-Ready" (Woche 13–14) · M6

**Sprint Goal:** PDF-Report exportierbar, OWASP-Mapping korrekt, Plattform sicherheitstechnisch gehärtet.

| Story | SP |
|-------|----|
| PDF Executive Report (Risk Score, Trend, Top 3 Critical, Business Impact, OWASP-Grafik) | 8 |
| PDF Technical Report (alle Findings, CVSS, HTTP-Requests, CWE/OWASP-Mapping, Timeline) | 8 |
| JSON Export (maschinenlesbar, UC-22) | 3 |
| CVSS Score-Anzeige (Vector + 4-Metriken-Scorecard) | 3 |
| Plattform-Hardening: CSP, Security Headers (helmet.js), Rate Limiting (ThrottlerGuard) | 5 |
| Zod-Validierung auf allen API-Endpoints (vollständiger Audit) | 3 |
| DSGVO Löschfristen-Cron (BullMQ Scheduled Job: Findings >24M, Evidence >12M, Audit >36M) | 3 |
| MinIO SSE aktivieren (docker-compose.yml Konfiguration) | 2 |
| Scanner-Secrets via Docker Secrets (keine .env im Container) | 3 |
| **Gesamt** | **38** |

---

### Sprint 9 — „Online!" (Woche 15) · M7

**Sprint Goal:** `https://domain.de` erreichbar, Scan läuft produktiv durch, Monitoring aktiv — Phase 1 abgeschlossen.

| Story | SP |
|-------|----|
| IONOS VPS Setup (Docker, Firewall, SSH Hardening) | 3 |
| `.env.production` (keine Architekturänderung, nur Config-Switch) | 1 |
| Cloudflare: DNS, SSL (Let's Encrypt), WAF Rules für `/api/` | 3 |
| Prometheus + Grafana aktivieren und konfigurieren | 3 |
| PostgreSQL Backup-Cronjob (täglich) | 2 |
| Smoke Test: Registrierung → Scan → Finding → Report auf Prod | 3 |
| **Gesamt** | **15** |

**DoD M7 / Phase 1 Complete:** `https://domain.de` erreichbar, vollständiger Flow Onboarding → Scan → Finding → Report produktiv, Monitoring aktiv.

---

## Phase 2 Milestones

Phase 2 baut auf der laufenden Phase-1-Plattform auf. Deployment: IONOS VPS (bereits aus M7). Alle Milestones folgen demselben Prinzip: kein Milestone endet mit halbfertigen Features.

---

### M8 — Attack Surface Management (Phase 2, Woche 1–3)
*Automatische Angriffsflächen-Erkennung — kein manuelles Target-Eintippen mehr.*

- Subdomain Discovery (subfinder / amass, Docker-Container isoliert, SSRF-Schutz auch hier)
- DNS Recon (MX, CNAME, SPF, DMARC — fehlkonfigurierte DNS-Records als Findings)
- Asset Discovery: neue Subdomains → automatische Target-Vorschläge im Dashboard
- HTTP-Fingerprinting: Technologie-Stack erkennen (Server, Frameworks, CMS)
- Asset-Graph UI: Visuelle Darstellung Domain → Subdomains → IPs → Ports
- **DoD:** Domain eingeben → Plattform findet Subdomains automatisch, erstellt Target-Vorschläge, zeigt Asset-Graph

---

### M9 — Advanced Scanning (Phase 2, Woche 4–6)
*JavaScript-rendered Pages und APIs werden vollständig gescannt.*

- OWASP ZAP Integration (Java-Container, Headless Chromium, Spider + Active Scan)
- Scan-Typ-Erweiterung: „Web Crawl Scan" nutzt ZAP für JS-rendered Pages
- API Security Scanning: OpenAPI/Swagger-Import → ZAP scannt alle Endpoints automatisch
- Authentifizierter Scan: Login-Flow für ZAP konfigurierbar (Session-basiert)
- Nuclei + ZAP kombiniert: Nuclei für Template-Scans, ZAP für tiefes Crawling
- **DoD:** Single-Page-App vollständig gecrawlt, alle Endpoints aus OpenAPI-Spec auf Schwachstellen geprüft

---

### M10 — DevSecOps Integration (Phase 2, Woche 7–9)
*Findings fließen automatisch in die Toolchain des Dev-Teams.*

- Webhook Engine: konfigurierbarer Webhook pro Event (`finding.created`, `scan.completed`, etc.)
- GitHub Issues Integration: neues Critical/High Finding → GitHub Issue automatisch erstellt
- Jira Integration: neues Finding → Jira Ticket mit Severity, Beschreibung, Remediation
- Slack Notifications: neues Critical Finding → Slack-Nachricht in konfigurierten Channel
- Notification Center vollständig (Flyout + `/notifications`-Page, UX-DECISIONS 1.2)
- **DoD:** Critical Finding entsteht → innerhalb 60s Jira-Ticket + Slack-Nachricht + Webhook ausgelöst

---

### M11 — Continuous Monitoring & Alerting (Phase 2, Woche 10–12)
*Plattform überwacht Assets eigenständig, meldet Veränderungen proaktiv.*

- Scheduled Scans vollständig (UC-11): täglich / wöchentlich / monatlich pro Projekt konfigurierbar
- Diff-Engine: neuer Scan vs. letzter Scan → nur neue Findings alertieren, behobene automatisch markieren
- Trend-Analyse: Risk Score Verlauf über Zeit (7d / 30d / 90d Chart)
- Regression Detection: als „Verified" markiertes Finding taucht wieder auf → sofort Alert
- CISO-Dashboard AI-Briefing Automatisierung (UX-DECISIONS 2.4): tägliches Briefing via SSE-Streaming bei Scan-Abschluss
- gVisor-Evaluation für Scanner-Container (härtere Isolation für produktiven Multi-Tenant-Betrieb)
- **DoD:** Scheduled Scan läuft automatisch, neue Schwachstellen lösen Alert aus, CISO-Briefing täglich neu generiert

---

> **Hinweis:** M12–M29 wurden in Sprints 12–31 implementiert (Multi-Tenancy & RBAC, Compliance Reporting, Custom Scan Policies, API-First & SDK, Audit & Compliance Dashboard, CVE Enrichment, Retest Workflow, Autonomous Scan Strategy, Attack Path Modelling, Production Deployment, Notification Center, Executive Dashboard, Self-Service Onboarding, Vulnerability Intelligence Feed, Portfolio View, Finding-Triage Workbench, Remediation Tracking, Security Score Card PDF). Alle abgeschlossen per 2026-06-24.

---

## Phase 3 Milestones — Advanced Security + AI Operating System

Phase 3 verwandelt die Plattform von einem reaktiven Pentest-Tool in ein proaktives **AI Security Operating System**. Fokus: intelligente Automatisierung, kundenorientierte Features, tiefere AI-Integration, operative Reife.

**Deployment:** Wie Phase 2 — IONOS VPS, Docker Compose. Kein Infrastrukturwechsel.
**Sprint-Länge:** 2 Wochen · **Velocity-Ziel:** ~28 SP · **Start:** Sprint 32 (ab 2026-07-05)

---

### M30 — Webhook Event Wiring ✅ (Sprint 32, abgeschlossen 2026-07-05)
*Alle Plattform-Events lösen Webhook-Deliveries aus.*

- `IntegrationEvent`-Typ auf 9 Events erweitert (`finding.created`, `finding.critical`, `finding.overdue`, `scan.completed`, `scan.failed`, `sla.breach`, `risk.accepted`, `retest.completed`, `engagement.signed`)
- SLA-Service, Risk-Acceptance-Service und Internal-Controller verdrahtet
- Delivery-Log im Frontend (Status, HTTP-Code, Retry-Count)
- Test-Button pro Integration
- **DoD:** Jedes Plattform-Event feuert zuverlässig den konfigurierten Webhook

---

### M31 — CVE/CVSS Intelligence Dashboard ✅ (Sprint 32, abgeschlossen 2026-07-05)
*Org-weites Vulnerability-Intelligence-Panel.*

- `GET /dashboard/cve-intelligence` (5 parallele Queries: Summary, KEV, EPSS, CVSS-Verteilung, Top CVEs)
- 5 KPI-Tiles, CVSS-Verteilungs-Balken, Tab-Strip (Top CVEs / KEV Listed / High EPSS)
- NVD-Links für CVE-IDs, EPSS-Farbcodierung, KEV-Badge
- **DoD:** Security Engineer sieht org-weite CVE-Lage auf einen Blick

---

### M32 — Pentest Report Builder ✅ (Sprint 32, abgeschlossen 2026-07-05)
*Interaktiver 3-Schritt-Wizard für maßgeschneiderte PDF-Reports.*

- `POST /projects/:id/reports/custom.pdf` mit konfigurierbaren Sections
- Sections: Cover, Executive Summary, Methodology, Risk Matrix, Findings, Remediation — frei sortierbar
- Finding-Auswahl mit Severity-Filter + Freitext-Suche + Checkbox
- Klassifizierungsstempel (CONFIDENTIAL / INTERNAL / PUBLIC / RESTRICTED)
- **DoD:** Pentest kann in 3 Schritten einen kundenreifen PDF-Report generieren

---

### M33 — Attack Surface Monitoring ✅ (Sprint 32, abgeschlossen 2026-07-05)
*Automatische tägliche Re-Discovery + neue-Asset-Benachrichtigungen.*

- `@Cron(EVERY_DAY_AT_6AM)` re-queued alle abgeschlossenen ASM-Scans automatisch
- Neue Assets lösen In-App-Notification für Org-Admins aus
- Assets-Seite: Auto-Refresh 60s, „neue Assets diese Woche"-Banner, Monitoring-Status-Chip
- **DoD:** Neue Subdomains werden täglich entdeckt, Admin wird benachrichtigt

---

### M34 — Two-Factor Authentication Management ✅ (Sprint 32, abgeschlossen 2026-07-05)
*Vollständige 2FA-Verwaltung im Settings-Bereich.*

- `GET /auth/mfa/status`, `POST /auth/mfa/disable`, `POST /auth/mfa/backup-codes/regenerate`
- Settings-Seite `/settings/security`: Setup-Wizard (QR → Backup-Codes → Verify), Disable mit TOTP-Bestätigung
- Backup-Code-Login-Seite `/login/backup-code` (standalone, kein Auth nötig)
- **DoD:** User kann 2FA aktivieren, deaktivieren und Backup-Codes regenerieren

---

### M35 — Customer Portal ✅ (Sprint 33, abgeschlossen 2026-07-05)
*Read-only Client-Zugang ohne Plattform-Login.*

- `POST /projects/:id/portal-token` → signierter JWT (30 Tage, stateless)
- Öffentliche Endpoints: `GET /portal/:token/summary`, `/findings`, `/findings/:id`
- Eigenes Next.js Route-Group `(portal)` mit Confidentiality-Footer
- „Client Portal"-Button auf Projektseite → Link in Zwischenablage
- Interne Felder (internalNotes, Raw-Scanner-Output) explizit ausgeschlossen
- **DoD:** Pentest teilt Link → Kunde sieht Findings ohne Account, ohne interne Daten

---

### M36 — AI Finding Narrative Generator ✅ (Sprint 33, abgeschlossen 2026-07-05)
*Professionelle, kundenreife Vulnerability-Beschreibungen per KI.*

- `POST /projects/:projectId/findings/:id/ai-narrative` → Claude Haiku generiert `{ description, impact, recommendation }`
- Non-destructive Preview im Finding-Detail (Security-Engineer-Tab)
- „Apply to Finding" übernimmt Narrative in `description` + `recommendation`
- Prompt schreibt im Dritte-Person-Stil, formales Englisch, report-ready
- **DoD:** Pentest klickt „✨ Generate with AI" → professioneller Report-Text in Sekunden

---

### M37 — SLA Compliance Report PDF (Sprint 34)
*Exportierbarer SLA-Bericht für Kunden und Management.*

- `GET /projects/:id/reports/sla.pdf` — PDFKit: Cover, SLA-Übersicht, Breach-Tabelle, Trend-Chart
- Zeigt: Einhaltungsquote %, durchschnittliche Remediationszeit, offene SLA-Verstöße nach Severity
- „SLA Report"-Button auf der Projekt-SLA-Seite
- **DoD:** CISO kann SLA-Compliance als PDF nachweisen

---

### M38 — AI Finding Deduplication (Sprint 34)
*Verhindert Finding-Flut bei wiederholten Scans.*

- Beim Ingest: pgvector-Similarity gegen offene Findings (Schwelle 0.92)
- Duplikat-Kandidaten werden als `DUPLICATE_OF` verlinkt statt neu angelegt
- Dashboard-Chip: „X Duplikate zusammengeführt"
- Manuelle Override-Option im Finding-Detail
- **DoD:** Wiederholter Scan auf demselben Target erzeugt keine doppelten Findings mehr

---

### M39 — Session Management UI (Sprint 35)
*User kann alle aktiven Sessions einsehen und einzeln beenden.*

- `GET /auth/sessions` → Liste aller aktiven Refresh-Token-Familien (Gerät, IP, letzte Aktivität)
- `DELETE /auth/sessions/:familyId` → einzelne Session widerrufen
- `DELETE /auth/sessions` → alle anderen Sessions beenden (außer aktueller)
- Settings-Seite `/settings/sessions`
- **DoD:** User sieht unbekannte Session → kann sie sofort beenden

---

### M40 — Pentest Methodology Templates (Sprint 35)
*Standardisierte Checklisten für OWASP Testing Guide, PTES und Custom.*

- Methodology-Modell: Template mit Kategorien + Checks (OWASP TG v4.2, PTES vorgegeben)
- `GET /methodologies`, `POST /projects/:id/methodology` — Methodology einem Projekt zuweisen
- Fortschrittsanzeige pro Kategorie auf der Checklist-Seite
- Custom-Template: eigene Checks hinzufügen / entfernen
- **DoD:** Pentest arbeitet strukturiert nach OWASP TG, Fortschritt wird getrackt

---

### M41 — AI Scope Suggester (Sprint 36)
*KI empfiehlt Scan-Scope basierend auf HTTP-Fingerprint und Tech-Stack.*

- Nach ASM-Discovery: Claude Haiku analysiert erkannte Technologien (nginx, WordPress, React, etc.)
- Gibt empfohlene Nuclei-Template-Kategorien + Scan-Konfiguration aus
- „KI-Empfehlung übernehmen"-Button im Scan-Dialog
- **DoD:** User sieht sofort welche Scan-Templates für den erkannten Tech-Stack relevant sind

---

### M42 — Cross-Project Security Posture (Sprint 36)
*Org-weite Sicherheitslage über alle Projekte hinweg.*

- `GET /dashboard/posture` — aggregiert: offene Criticals, SLA-Compliance %, Avg. Risk Score, Trend
- Neue Dashboard-Seite `/dashboard/posture` mit Projektvergleichs-Tabelle
- Highlight: Projekte mit SLA-Verstößen, Projekte ohne Scan >30 Tage
- **DoD:** CISO sieht die gesamte Sicherheitslage der Organisation auf einer Seite

---

### M43 — Jira Two-Way Sync (Sprint 37)
*Status-Änderungen in Jira synchronisieren sich zurück in die Plattform.*

- Jira Webhook empfängt Issue-Status-Updates (Resolved, In Progress)
- `POST /integrations/jira/webhook` → mappt Jira-Status auf Finding-Status
- Sync-Log im Integrations-Dashboard
- **DoD:** Dev schließt Jira-Ticket → Finding wird automatisch auf FIXED gesetzt

---

### M44 — Public Status Page (Sprint 37)
*Öffentliche Verfügbarkeitsseite für den Plattform-Betrieb.*

- `/status` — zeigt API, Scanner, DB, Redis, MinIO als Ampel
- Historische Uptime der letzten 90 Tage (Balken-Diagramm)
- Incident-Banner wenn Service degradiert
- **DoD:** Kunden können Plattform-Verfügbarkeit selbst prüfen

---

### M45 — Phase 3 Complete · Hardening & Performance (Sprint 38)
*Technische Schulden abbauen, Performance optimieren, Phase 4 vorbereiten.*

- API-Response-Zeit-Audit: alle Endpoints > 200ms identifizieren + optimieren (DB-Indizes, N+1-Queries)
- Frontend-Bundle-Analyse: Code-Splitting für Dashboard-Routen
- Accessibility-Audit: WCAG 2.1 AA für kritische Flows (Login, Findings, Dashboard)
- `scope.md` Phase 4 ausarbeiten
- **DoD:** Alle Dashboard-Seiten < 300ms TTFB, Lighthouse Score ≥ 85, Phase-4-Plan fertig

---

## Sprint-Plan Phase 3

| Sprint | Milestone(s) | Fokus | Status |
|--------|-------------|-------|--------|
| S32 | M30–M33 | Webhooks, CVE Dashboard, Report Builder, ASM Monitoring | ✅ Abgeschlossen |
| S33 | M34–M36 | 2FA Management, Customer Portal, AI Narrative | ✅ Abgeschlossen |
| S34 | M37–M38 | SLA PDF, AI Deduplication | ✅ Abgeschlossen |
| S35 | M39–M40 | Session Management, Methodology Templates | ✅ Abgeschlossen |
| S36 | M41–M42 | AI Scope Suggester, Cross-Project Posture | ✅ Abgeschlossen |
| S37 | M43–M44 | Jira Two-Way Sync, Status Page | ✅ Abgeschlossen |
| S38 | M45 | Hardening, Performance, Phase 4 Prep | ✅ Abgeschlossen |

**Phase 3 Abgeschlossen:** 2026-07-05 🎉

---

## Phase 4 — Enterprise & Scale (M46–M60) ✅ Abgeschlossen 2026-07-06

*Ziel: Multi-Tenant-Skalierung, Enterprise-Features, Marktreife*

### Themenblöcke

| Block | Milestones | Inhalt | Status |
|-------|-----------|--------|--------|
| Reporting++ | M46–M48 | White-Label PDF, SARIF-Export, Audit-Trail-Export | ✅ |
| AI++ | M49–M51 | AI Risk Scoring v2, Automatische Priorisierung, Chat-Interface | ✅ |
| Compliance++ | M52–M54 | DSGVO-Datenexport, NIS2-Modul, ISO27001 kontinuierlich | ✅ |
| Platform | M55–M57 | Multi-Region, Rate Limiting per Org, Billing-Integration | ✅ |
| Ecosystem | M58–M60 | VS Code Extension, Slack Bot v2, API-Marketplace | ✅ |

### Milestone-Details

| M | Titel | Lieferung |
|---|-------|-----------|
| M46 | White-Label PDF | `Organization.brandPrimaryColor/Name/FooterText`; `PATCH /organizations/:id/branding`; `/settings/branding/page.tsx` |
| M47 | SARIF 2.1.0 Export | `GET /projects/:id/reports/findings.sarif`; SARIF 2.1.0 mit rules+results |
| M48 | Audit Trail CSV | `GET /audit/export`; bis 10.000 Einträge; server-seitiger ZIP-Download |
| M49 | AI Risk Score v2 | `aiService.computeRiskScoreV2()`; CVSS 40%+EPSS 20%+KEV 20%+SLA 15%+Recurrence 5% |
| M50 | Auto-Priorisierung | Fire-and-forget nach Finding-Ingest; `autoPrioritize()` in `InternalController` |
| M51 | AI Chat Interface | `POST /ai/chat`; `/dashboard/chat/page.tsx`; Findings-Context an Claude Haiku |
| M52 | DSGVO ZIP-Export | `GET /me/export-zip`; archiver ZIP mit profile/orgs/scans/audit/prefs |
| M53 | NIS2-Modul | 12 NIS2-Controls in compliance.constants; `/compliance/nis2/page.tsx` |
| M54 | ISO27001 kontinuierlich | `GET /compliance/iso27001/continuous`; org-weite Aggregation; Trend-Daten |
| M55 | Multi-Region | `Organization.dataRegion/allowedRegions`; `PATCH /organizations/:id/region` |
| M56 | Rate Limiting per Org | `OrgRateLimit` Modell; `GET/PATCH /organizations/:id/rate-limit` |
| M57 | Billing-Integration | `UsageSnapshot` Modell; monatlicher Cron; `/settings/billing/page.tsx` |
| M58 | VS Code Extension API | `GET /api/v1/vscode/findings|summary|projects` |
| M59 | Slack Bot v2 | `POST /integrations/slack/slash`; Block Kit responses; summary/critical/help |
| M60 | API-Marketplace | `GET /marketplace/integrations|webhook-templates|api-docs`; `/marketplace/page.tsx` |

**Phase 4 abgeschlossen:** 2026-07-06
