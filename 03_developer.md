# Senior Developer – Implementierungsplan PTaaS Platform

**Datum:** 2026-05-15  
**Rolle:** Senior Developer  
**Phase:** Phase 1 MVP

---

## 1. Tech-Stack (Final)

### Backend
| Layer | Tech | Version |
|-------|------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | NestJS | 10.x |
| Sprache | TypeScript | 5.x |
| ORM | Prisma | 5.x |
| Queue | BullMQ | 5.x |
| WebSocket | Socket.io (NestJS Adapter) | 4.x |
| Validation | class-validator + class-transformer | latest |
| Auth | Clerk SDK | latest |
| PDF | Puppeteer | latest |
| Testing | Jest + Supertest | latest |

### Frontend
| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Sprache | TypeScript |
| UI | shadcn/ui + TailwindCSS |
| State (global) | Zustand |
| State (server) | TanStack Query (React Query) |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| WebSocket Client | Socket.io-client |
| Animation | Framer Motion |
| Auth | Clerk Next.js SDK |

### Scanner Engine
| Layer | Tech |
|-------|------|
| Runtime | Python 3.12 |
| HTTP Client | httpx (async) |
| HTML Parsing | beautifulsoup4 |
| SSL/TLS | ssl + cryptography |
| Port Scanning | python-nmap |
| Validation | pydantic v2 |
| Logging | structlog |

---

## 2. Monorepo-Struktur

```
ptaas/
├── apps/
│   ├── api/                    → NestJS Backend
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── tenants/
│   │   │   ├── users/
│   │   │   ├── projects/
│   │   │   ├── scans/
│   │   │   ├── findings/
│   │   │   ├── reports/
│   │   │   ├── audit/
│   │   │   ├── common/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   ├── filters/
│   │   │   │   └── decorators/
│   │   │   ├── prisma/
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── Dockerfile
│   │
│   ├── web/                    → Next.js Frontend
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── projects/
│   │   │   │   │   └── settings/
│   │   │   │   └── layout.tsx
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   ├── hooks/
│   │   │   └── stores/
│   │   └── Dockerfile
│   │
│   └── scanner/                → Python Scanner Services
│       ├── workers/
│       │   ├── web_security/
│       │   ├── ssl_tls/
│       │   └── port_scanner/
│       ├── shared/
│       │   ├── models.py
│       │   ├── api_client.py
│       │   └── config.py
│       └── Dockerfile
│
├── packages/
│   └── shared-types/           → Geteilte TypeScript Types
│
├── infra/
│   ├── docker-compose.yml
│   ├── kubernetes/
│   └── terraform/
│
└── .github/
    └── workflows/
```

---

## 3. Prisma Schema (vollständig Phase 1)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(uuid())
  name      String
  plan      Plan     @default(FREE)
  createdAt DateTime @default(now())
  
  users     User[]
  projects  Project[]
  auditLogs AuditLog[]
  
  @@map("tenants")
}

model User {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  email     String   @unique
  clerkId   String   @unique
  role      UserRole @default(MEMBER)
  createdAt DateTime @default(now())
  
  auditLogs AuditLog[]
  
  @@map("users")
}

model Project {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  name        String
  description String?
  targets     String[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  scans    Scan[]
  findings Finding[]
  reports  Report[]
  
  @@map("projects")
}

model Scan {
  id          String     @id @default(uuid())
  projectId   String
  project     Project    @relation(fields: [projectId], references: [id])
  tenantId    String
  type        ScanType   @default(FULL)
  status      ScanStatus @default(QUEUED)
  config      Json?
  startedAt   DateTime?
  completedAt DateTime?
  error       String?
  createdAt   DateTime   @default(now())
  
  findings Finding[]
  reports  Report[]
  
  @@map("scans")
}

model Finding {
  id                String          @id @default(uuid())
  scanId            String
  scan              Scan            @relation(fields: [scanId], references: [id])
  projectId         String
  project           Project         @relation(fields: [projectId], references: [id])
  tenantId          String
  title             String
  description       String
  severity          Severity
  cvssScore         Float?
  cvssVector        String?
  cveId             String?
  cweId             String?
  owaspCategory     String?
  affectedUrl       String?
  affectedComponent String?
  proofOfConcept    String?
  remediation       String?
  status            FindingStatus   @default(OPEN)
  falsePositive     Boolean         @default(false)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  
  @@map("findings")
}

model Report {
  id        String       @id @default(uuid())
  projectId String
  project   Project      @relation(fields: [projectId], references: [id])
  scanId    String?
  scan      Scan?        @relation(fields: [scanId], references: [id])
  tenantId  String
  format    ReportFormat
  fileUrl   String?
  createdAt DateTime     @default(now())
  
  @@map("reports")
}

model AuditLog {
  id         String   @id @default(uuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id])
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String
  resource   String
  resourceId String?
  metadata   Json?
  ipAddress  String?
  createdAt  DateTime @default(now())
  
  @@map("audit_logs")
}

enum Plan          { FREE PRO ENTERPRISE }
enum UserRole      { OWNER ADMIN MEMBER VIEWER }
enum ScanType      { FULL WEB_ONLY SSL_ONLY PORTS_ONLY }
enum ScanStatus    { QUEUED RUNNING COMPLETED FAILED CANCELLED }
enum Severity      { CRITICAL HIGH MEDIUM LOW INFO }
enum FindingStatus { OPEN CONFIRMED FIXED WONT_FIX FALSE_POSITIVE }
enum ReportFormat  { PDF JSON }
```

---

## 4. NestJS Module – Kernimplementierungen

### 4.1 Tenant Middleware

```typescript
// tenants/tenant.middleware.ts
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly clerkClient: ClerkClient) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const token = extractBearerToken(req);
    if (!token) throw new UnauthorizedException();
    
    const payload = await this.clerkClient.verifyToken(token);
    const tenantId = payload.org_id;
    if (!tenantId) throw new ForbiddenException('No tenant context');
    
    req['tenantId'] = tenantId;
    req['userId'] = payload.sub;
    req['userRole'] = payload.org_role;
    
    // PostgreSQL RLS context setzen
    await this.prisma.$executeRaw`
      SELECT set_config('app.tenant_id', ${tenantId}, true)
    `;
    
    next();
  }
}
```

### 4.2 Scan Service mit BullMQ

```typescript
// scans/scans.service.ts
@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('scans') private readonly scanQueue: Queue,
    private readonly scanGateway: ScansGateway,
  ) {}

  async createScan(projectId: string, dto: CreateScanDto, tenantId: string) {
    const scan = await this.prisma.scan.create({
      data: {
        projectId,
        tenantId,
        type: dto.type,
        status: 'QUEUED',
        config: dto.config,
      },
    });

    await this.scanQueue.add('execute-scan', {
      scanId: scan.id,
      projectId,
      tenantId,
      targets: dto.targets,
      type: dto.type,
    }, {
      attempts: 2,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.scanGateway.emitToTenant(tenantId, 'scan:queued', { scanId: scan.id });
    return scan;
  }
}
```

### 4.3 WebSocket Gateway

```typescript
// scans/scans.gateway.ts
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL } })
export class ScansGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    const tenantId = client.handshake.auth.tenantId;
    client.join(`tenant:${tenantId}`);
  }

  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }
}
```

---

## 5. Python Scanner Worker – Basisstruktur

```python
# workers/web_security/worker.py
import asyncio
import httpx
from shared.api_client import PTaaSApiClient
from shared.models import ScanJob, Finding, Severity

CHECKS = [
    check_security_headers,
    check_csp,
    check_cors,
    check_cookie_flags,
    check_https_redirect,
    check_clickjacking,
]

async def run_scan(job: ScanJob) -> None:
    client = PTaaSApiClient(job.api_key)
    await client.update_scan_status(job.scan_id, "RUNNING")
    
    findings = []
    async with httpx.AsyncClient(timeout=30.0) as http:
        for target in job.targets:
            for check in CHECKS:
                try:
                    result = await check(http, target)
                    if result:
                        findings.extend(result)
                except Exception as e:
                    # Log aber nicht abbrechen
                    pass
    
    for finding in findings:
        await client.create_finding(job.scan_id, finding)
    
    await client.update_scan_status(job.scan_id, "COMPLETED")

# Beispiel-Check
async def check_security_headers(http: httpx.AsyncClient, url: str):
    resp = await http.get(url)
    findings = []
    required = {
        "X-Frame-Options": Severity.MEDIUM,
        "X-Content-Type-Options": Severity.LOW,
        "Strict-Transport-Security": Severity.HIGH,
        "Content-Security-Policy": Severity.MEDIUM,
    }
    for header, severity in required.items():
        if header not in resp.headers:
            findings.append(Finding(
                title=f"Missing Security Header: {header}",
                severity=severity,
                affected_url=url,
                remediation=f"Add '{header}' response header",
            ))
    return findings
```

---

## 6. Komplexitätsschätzung

| Modul | Aufwand | Komplexität |
|-------|---------|-------------|
| Auth (Clerk Integration) | 1 Woche | M |
| Multi-Tenant RLS Setup | 1 Woche | L |
| Scan Queue + Worker Lifecycle | 2 Wochen | XL |
| Web Security Scanner (5 Checks) | 1,5 Wochen | L |
| SSL/TLS Scanner | 1 Woche | M |
| Port Scanner | 0,5 Wochen | S |
| Findings CRUD + Filter | 1 Woche | M |
| PDF Report (Puppeteer) | 1 Woche | M |
| Dashboard Frontend | 2 Wochen | L |
| WebSocket Real-time | 0,5 Wochen | M |
| Audit Logging | 0,5 Wochen | S |
| CI/CD Setup | 1 Woche | M |
| **Gesamt** | **~14 Wochen** | — |

---

## 7. Entwicklungs-Konventionen

### Code Quality
- ESLint + Prettier (erzwungen im CI)
- Husky + lint-staged (pre-commit)
- Strict TypeScript: `strict: true`, kein `any`
- Pydantic v2 für alle Python-Inputs

### Git Workflow
- `main` — Production (geschützt, nur via PR)
- `develop` — Integration Branch
- Feature-Branches: `feat/scan-queue`, `fix/tenant-isolation`
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`

### Testing-Strategie (Detail in QA-Rolle)
- Backend: Unit Tests für Services, Integration Tests für Controller
- Frontend: Vitest Unit, Playwright E2E (kritische Flows)
- Scanner: pytest, Test gegen Mock-Server

### Umgebungsvariablen
```env
# API
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
CLERK_SECRET_KEY=...
CLERK_WEBHOOK_SECRET=...
AWS_S3_BUCKET=...
AWS_REGION=...
INTERNAL_API_KEY=...  # Scanner → API Auth

# Frontend
NEXT_PUBLIC_API_URL=https://api.ptaas.io
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
NEXT_PUBLIC_WS_URL=wss://api.ptaas.io
```

---

## 8. Sprint-Breakdown (Grob)

| Sprint | Fokus | Deliverable |
|--------|-------|------------|
| Sprint 1 (Woche 1-2) | Setup: Monorepo, CI/CD, Clerk Auth, DB-Schema | Login/Register funktioniert |
| Sprint 2 (Woche 3-5) | Backend Core: Projects API, Scan Queue, BullMQ | API vollständig, Queue läuft |
| Sprint 3 (Woche 6-8) | Scanner: Web Security, SSL, Ports | Scans laufen durch |
| Sprint 4 (Woche 9-11) | Frontend: Dashboard, Findings, Reports | UI vollständig |
| Sprint 5 (Woche 12-13) | Integration, Testing, Hardening, Kubernetes | Beta-ready |
| Sprint 6 (Woche 14) | Beta Launch, Monitoring, Bugfixes | Beta Live |
