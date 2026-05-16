# Security Engineer – Sicherheit & Compliance PTaaS Platform

**Datum:** 2026-05-15  
**Rolle:** Security Engineer  
**Phase:** Phase 1 MVP

---

## 1. Besonderheit: Security Platform muss selbst sicher sein

Eine PTaaS-Plattform ist ein primäres Angriffsziel:
- Sie enthält sensible Vulnerability-Daten von Kundensystemen
- Sie hat aktive Scanner, die in Kundennetzwerke zielen
- Kompromittierung der Plattform = Zugang zu allen Kundendaten
- Gekaperte Scanner können gegen Dritte eingesetzt werden

**Dieser Kontext erfordert höheres Sicherheitsniveau als typische SaaS-Plattformen.**

---

## 2. Threat Modeling (STRIDE)

### Assets (schützenswert)
| Asset | Kritikalität |
|-------|-------------|
| Findings / Vulnerability Reports | KRITISCH |
| Kunden-Target-URLs und Credentials | KRITISCH |
| Scanner-Infrastruktur | KRITISCH |
| Auth-Tokens / API Keys | KRITISCH |
| Audit Logs | HOCH |
| User-Daten | HOCH |

### STRIDE-Analyse

| Bedrohung | Angriff | Gegenmaßnahme |
|-----------|---------|---------------|
| **Spoofing** | JWT-Fälschung, Session Hijacking | RS256 JWT, kurze Token-TTL, Clerk MFA |
| **Tampering** | DB-Manipulation, Finding-Manipulation | RLS, Audit Logs, Integritätsprüfung |
| **Repudiation** | Abstreiten von Aktionen | Unveränderliche Audit Logs mit User + IP |
| **Info Disclosure** | Tenant-Data-Leak, IDOR, Mass Assignment | RLS, RBAC, explizite DTO-Validation |
| **Denial of Service** | Scan-Queue Flooding, API DDoS | Rate Limiting, Queue-Limits pro Tenant, WAF |
| **Elevation of Privilege** | RBAC-Bypass, JWT Manipulation | Strikte Guard-Implementierung, PoLP |

### Kritischste Angriffsvektoren

1. **Scanner-Escape** — Scanner-Worker bricht aus Container aus und greift intern an
2. **Tenant-Isolation-Bypass** — Tenant A sieht Daten von Tenant B (IDOR, RLS-Bug)
3. **Unauthorized Scanning** — Angreifer missbraucht Plattform um Dritte zu scannen
4. **API Key Leak** — Kunden-API Keys werden durch Speicherleck oder Logs exponiert

---

## 3. Authentifizierung & Autorisierung

### Auth-Stack
- **Provider:** Clerk (MFA, JWT, Organization-basiertes Tenanting)
- **JWT:** RS256, TTL 15 Minuten (Access Token), 7 Tage (Refresh Token)
- **MFA:** TOTP (Google Authenticator) — Pflicht für OWNER und ADMIN Rollen
- **Session-Management:** Clerk übernimmt — kein Custom Session-Code

### RBAC Matrix

| Aktion | OWNER | ADMIN | MEMBER | VIEWER |
|--------|-------|-------|--------|--------|
| Projekt erstellen | ✅ | ✅ | ✅ | ❌ |
| Scan starten | ✅ | ✅ | ✅ | ❌ |
| Findings einsehen | ✅ | ✅ | ✅ | ✅ |
| Finding-Status ändern | ✅ | ✅ | ✅ | ❌ |
| Report herunterladen | ✅ | ✅ | ✅ | ✅ |
| Team-Mitglieder verwalten | ✅ | ✅ | ❌ | ❌ |
| API Keys erstellen | ✅ | ✅ | ❌ | ❌ |
| Tenant-Settings ändern | ✅ | ❌ | ❌ | ❌ |
| Audit Logs einsehen | ✅ | ✅ | ❌ | ❌ |

### Guard-Implementierung

```typescript
// common/guards/rbac.guard.ts
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<UserRole[]>('roles', context.getHandler());
    if (!requiredRoles) return true;
    
    const request = context.switchToHttp().getRequest();
    const userRole = request.userRole;
    
    return requiredRoles.includes(userRole);
  }
}

// Verwendung
@Roles(UserRole.ADMIN, UserRole.OWNER)
@Delete(':id')
async deleteProject() { ... }
```

---

## 4. Multi-Tenant Isolation

### PostgreSQL Row Level Security (Vollständige Implementierung)

```sql
-- Für jede tenant-gebundene Tabelle
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_findings ON findings
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Tenant-Context im Application Code

```typescript
// prisma/prisma.service.ts
async withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn();
  });
}
```

### Anti-IDOR-Patterns

```typescript
// Immer tenantId aus JWT — niemals aus Request Body
async getProject(id: string, tenantId: string) {
  const project = await this.prisma.project.findFirst({
    where: { id, tenantId },  // tenantId ist Pflichtfilter
  });
  if (!project) throw new NotFoundException();
  return project;
}
```

---

## 5. Scanner Security (Kritischster Bereich)

### Container Isolation

```yaml
# Kubernetes Pod Security — Scanner Worker
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534       # nobody
    runAsGroup: 65534
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: scanner
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: [ALL]
```

### Network Policies

```yaml
# Scanner dürfen nur externe IPs und die API erreichen
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: scanner-egress-policy
  namespace: scanners
spec:
  podSelector:
    matchLabels:
      role: scanner
  policyTypes:
    - Egress
  egress:
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8      # Kein Zugriff auf internes Netz
              - 172.16.0.0/12
              - 192.168.0.0/16
    - to:
        - podSelector:
            matchLabels:
              app: nest-api
      ports:
        - port: 3001
```

### Scope Validation (Pflicht vor jedem Scan)

```typescript
// scans/scan-authorization.service.ts
async validateScanScope(targets: string[], project: Project): Promise<void> {
  for (const target of targets) {
    const allowed = project.targets;  // Vom Kunden definierte erlaubte Ziele
    if (!isTargetAllowed(target, allowed)) {
      throw new ForbiddenException(`Scan target not in authorized scope: ${target}`);
    }
    // Blockiere interne IPs
    if (isPrivateIP(target)) {
      throw new ForbiddenException('Scanning internal IPs is not permitted');
    }
  }
}
```

---

## 6. API Security

### Rate Limiting

```typescript
// main.ts
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 Minuten
    max: 100,                    // 100 Requests pro Fenster
    keyGenerator: (req) => req.tenantId || req.ip,
    skip: (req) => req.path === '/health',
  })
);

// Scan-spezifisches Rate Limiting (restriktiver)
// FREE: 5 Scans/Tag, PRO: 50 Scans/Tag, ENTERPRISE: unlimitiert
```

### Input Validation

```typescript
// Alle DTOs mit class-validator
export class CreateScanDto {
  @IsEnum(ScanType)
  type: ScanType;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  @Matches(/^https?:\/\//, { each: true, message: 'Only HTTP/HTTPS targets allowed' })
  targets: string[];
}
```

### Secure Headers

```typescript
// NestJS Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
}));
```

---

## 7. Secrets Management

- **Niemals** Secrets in `.env` Dateien im Repository
- **Niemals** Secrets in Container Image
- **Niemals** Secrets in Logs
- **Immer:** AWS Secrets Manager für Production
- **Immer:** Doppler oder Vault für lokale Dev-Secrets (nie `git commit` von `.env`)

```typescript
// Secrets zur Laufzeit laden
const secretString = await secretsManager.getSecretValue({
  SecretId: 'ptaas/prod/database'
}).promise();
const secrets = JSON.parse(secretString.SecretString);
```

---

## 8. Datenschutz & DSGVO

| Anforderung | Umsetzung |
|-------------|-----------|
| Zweckbindung | Scan-Daten nur für Kunden-eigene Systeme |
| Datensparsamkeit | Nur notwendige Daten speichern |
| Speicherbegrenzung | Findings nach X Tagen automatisch löschen (konfigurierbar) |
| Auskunftsrecht | User-Daten-Export API (Phase 2) |
| Löschrecht | Tenant-Deletion-Workflow inkl. Kaskaden |
| Datensicherheit | Encryption at rest (RDS, S3), Encryption in transit (TLS 1.3) |
| Auftragsverarbeitung | AV-Vertrag mit AWS |
| Verarbeitungsverzeichnis | Pflicht vor Launch |

**Encryption:**
- At rest: RDS AES-256, S3 SSE-KMS
- In transit: TLS 1.3 minimum, HSTS
- Secrets: AWS KMS

---

## 9. Security-Checkliste Phase 1

### Pflicht vor Beta Launch

- [ ] MFA für alle OWNER/ADMIN Accounts aktiviert
- [ ] PostgreSQL RLS auf allen tenant-gebundenen Tabellen
- [ ] IDOR-Test: Tenant A kann keine Daten von Tenant B abrufen
- [ ] Scanner-Container mit `runAsNonRoot: true`, `readOnlyRootFilesystem: true`
- [ ] Kubernetes NetworkPolicies für Scanner aktiv
- [ ] Scope Validation vor jedem Scan (keine Private IPs)
- [ ] Rate Limiting aktiv (API + Scan Queue)
- [ ] Secure Headers (Helmet): CSP, HSTS, X-Frame-Options
- [ ] CORS: nur erlaubte Origins
- [ ] Kein Secret in Git / Container Image / Logs
- [ ] Trivy Container Scan im CI (block bei CRITICAL)
- [ ] Dependency Vulnerability Scan (npm audit, pip-audit)
- [ ] Audit Logging für alle schreibenden Aktionen
- [ ] TLS 1.3 auf allen Endpunkten
- [ ] Penetration Test der eigenen Platform (intern) vor Launch
- [ ] Terms of Service mit expliziter Scan-Autorisierungspflicht

### Compliance-Relevanz

| Standard | Relevanz | Aktion |
|----------|---------|--------|
| DSGVO | HOCH | AV-Vertrag, Privacy Policy, Datenlöschung |
| ISO 27001 | MITTEL | Basis-Controls in Phase 1, Zertifizierung Phase 3 |
| SOC 2 Type II | MITTEL | Erst Phase 2/3 relevant |
| NIS2 | NIEDRIG | Relevant wenn Kunden NIS2-pflichtig sind |
