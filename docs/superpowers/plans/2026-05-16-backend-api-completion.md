# PTaaS Backend API Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the NestJS backend API for PTaaS Phase 1 MVP — PrismaService, TenantMiddleware (Clerk JWT), AuditService, ScansService with BullMQ + Kubernetes Job dispatch, WebSocket gateway, scanner callback endpoints, FindingsService/Controller, ReportsService/Controller, and the root AppModule.

**Architecture:** NestJS monolith with multi-tenant isolation via `tenantId` on every query. Auth flow: `TenantMiddleware` verifies Clerk JWT and sets `req.tenantId/userId/userRole` for all public routes. Scanner callbacks use a separate `InternalKeyGuard` (X-Internal-Key header). Scan lifecycle: REST → DB record + BullMQ job → `ScansProcessor` dispatches Kubernetes Job → Python scanner calls back via `/internal/*`.

**Tech Stack:** NestJS 11, TypeScript 5, Prisma 5 (`@prisma/client`), BullMQ 5 (`@nestjs/bullmq`), `@clerk/backend` 1.x, `@kubernetes/client-node`, Socket.io (`@nestjs/websockets`, `@nestjs/platform-socket.io`), Jest 29 + `@nestjs/testing`

---

## File Map

### Create (new files)
- `apps/api/src/prisma/prisma.service.ts` — PrismaClient singleton with `onModuleInit`/`onModuleDestroy`
- `apps/api/src/tenants/tenant.middleware.ts` — Verifies Clerk JWT, sets `req.tenantId/userId/userRole`
- `apps/api/src/auth/guards/internal-key.guard.ts` — Validates `X-Internal-Key` header
- `apps/api/src/projects/dto/create-project.dto.ts` — `name`, `description?`, `targets[]`
- `apps/api/src/scans/dto/create-scan.dto.ts` — `type`, `config?`
- `apps/api/src/findings/dto/update-finding.dto.ts` — `status?`, `falsePositive?`
- `apps/api/src/audit/audit.service.ts` — Fire-and-forget `log()` method
- `apps/api/src/scans/scans.service.ts` — CRUD + status update + cancel
- `apps/api/src/scans/scans.gateway.ts` — Socket.io gateway: tenant rooms, `emitToTenant()`
- `apps/api/src/scans/scans.processor.ts` — BullMQ `@Processor`: dispatches K8s Job
- `apps/api/src/scans/scans-internal.controller.ts` — `PATCH /internal/scans/:id/status`, `POST /internal/scans/:id/findings`
- `apps/api/src/scans/scans.module.ts` — Wires ScansController, ScansService, ScansGateway, ScansProcessor, BullMQ queue
- `apps/api/src/findings/findings.service.ts` — CRUD with tenant isolation
- `apps/api/src/findings/findings.controller.ts` — `GET /projects/:projectId/findings`, `PATCH /projects/:projectId/findings/:id`
- `apps/api/src/reports/reports.service.ts` — Generates JSON report, stores in S3
- `apps/api/src/reports/reports.controller.ts` — `POST /projects/:projectId/reports`, `GET /projects/:projectId/reports`
- `apps/api/src/app.module.ts` — Root module: ConfigModule, PrismaModule, BullMQ, ThrottlerModule, all feature modules, TenantMiddleware globally
- `apps/api/src/health/health.controller.ts` — `GET /health` via `@nestjs/terminus`

### Modify (existing files)
- `apps/api/src/auth/auth.module.ts` — Export `InternalKeyGuard`
- `apps/api/src/findings/findings.module.ts` — Export `FindingsService`
- `apps/api/src/scans/scans.controller.ts` — No changes needed (already correct shape)

### Test files (create)
- `apps/api/src/tenants/tenant.middleware.spec.ts`
- `apps/api/src/auth/guards/internal-key.guard.spec.ts`
- `apps/api/src/audit/audit.service.spec.ts`
- `apps/api/src/scans/scans.service.spec.ts`
- `apps/api/src/findings/findings.service.spec.ts`
- `apps/api/src/reports/reports.service.spec.ts`

---

## Task 1: PrismaService

**Files:**
- Create: `apps/api/src/prisma/prisma.service.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/prisma/prisma.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    service = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect on module init', async () => {
    const spy = jest.spyOn(service, '$connect').mockResolvedValue();
    await service.onModuleInit();
    expect(spy).toHaveBeenCalled();
  });

  it('should disconnect on module destroy', async () => {
    const spy = jest.spyOn(service, '$disconnect').mockResolvedValue();
    await service.onModuleDestroy();
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest src/prisma/prisma.service.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './prisma.service'`

- [ ] **Step 3: Implement PrismaService**

Create `apps/api/src/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest src/prisma/prisma.service.spec.ts --no-coverage
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prisma/prisma.service.ts apps/api/src/prisma/prisma.service.spec.ts
git commit -m "feat(api): add PrismaService with lifecycle hooks"
```

---

## Task 2: InternalKeyGuard

The scanner authenticates against `/api/v1/internal/*` using the `X-Internal-Key` header instead of Clerk JWT.

**Files:**
- Create: `apps/api/src/auth/guards/internal-key.guard.ts`
- Create: `apps/api/src/auth/guards/internal-key.guard.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/guards/internal-key.guard.spec.ts`:

```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalKeyGuard } from './internal-key.guard';

const makeCtx = (key: string | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-internal-key': key } }),
    }),
  }) as unknown as ExecutionContext;

describe('InternalKeyGuard', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, INTERNAL_API_KEY: 'secret123' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('passes when key matches', () => {
    const guard = new InternalKeyGuard();
    expect(guard.canActivate(makeCtx('secret123'))).toBe(true);
  });

  it('throws when key is wrong', () => {
    const guard = new InternalKeyGuard();
    expect(() => guard.canActivate(makeCtx('wrong'))).toThrow(UnauthorizedException);
  });

  it('throws when key is missing', () => {
    const guard = new InternalKeyGuard();
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest src/auth/guards/internal-key.guard.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './internal-key.guard'`

- [ ] **Step 3: Implement InternalKeyGuard**

Create `apps/api/src/auth/guards/internal-key.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const key = req.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException('Invalid internal key');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest src/auth/guards/internal-key.guard.spec.ts --no-coverage
```
Expected: PASS (3 tests)

- [ ] **Step 5: Update AuthModule to export the guard**

Modify `apps/api/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { InternalKeyGuard } from './guards/internal-key.guard';

@Module({
  providers: [InternalKeyGuard],
  exports: [InternalKeyGuard],
})
export class AuthModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/guards/internal-key.guard.ts apps/api/src/auth/guards/internal-key.guard.spec.ts apps/api/src/auth/auth.module.ts
git commit -m "feat(api): add InternalKeyGuard for scanner callback authentication"
```

---

## Task 3: TenantMiddleware

Verifies the Clerk JWT on every request, extracts tenant/user context, and sets it on `req` for downstream decorators (`@TenantId()`, `@UserId()`).

**Files:**
- Create: `apps/api/src/tenants/tenant.middleware.ts`
- Create: `apps/api/src/tenants/tenant.middleware.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tenants/tenant.middleware.spec.ts`:

```typescript
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';

const makeReq = (auth?: string) => ({
  headers: { authorization: auth },
  tenantId: undefined as string | undefined,
  userId: undefined as string | undefined,
  userRole: undefined as string | undefined,
});

const makeRes = () => ({});
const makeNext = () => jest.fn();

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let mockVerify: jest.Mock;

  beforeEach(() => {
    mockVerify = jest.fn();
    middleware = new TenantMiddleware(mockVerify as any);
  });

  it('throws UnauthorizedException when no auth header', async () => {
    const req = makeReq();
    await expect(middleware.use(req as any, makeRes() as any, makeNext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when token is invalid', async () => {
    mockVerify.mockRejectedValue(new Error('bad token'));
    const req = makeReq('Bearer badtoken');
    await expect(middleware.use(req as any, makeRes() as any, makeNext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws ForbiddenException when org_id is missing', async () => {
    mockVerify.mockResolvedValue({ sub: 'user_1', org_id: undefined, org_role: 'org:member' });
    const req = makeReq('Bearer validtoken');
    await expect(middleware.use(req as any, makeRes() as any, makeNext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('sets tenantId, userId, userRole and calls next on success', async () => {
    mockVerify.mockResolvedValue({ sub: 'user_1', org_id: 'org_abc', org_role: 'org:admin' });
    const req = makeReq('Bearer validtoken');
    const next = makeNext();
    await middleware.use(req as any, makeRes() as any, next);
    expect(req.tenantId).toBe('org_abc');
    expect(req.userId).toBe('user_1');
    expect(req.userRole).toBe('org:admin');
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest src/tenants/tenant.middleware.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './tenant.middleware'`

- [ ] **Step 3: Implement TenantMiddleware**

Create `apps/api/src/tenants/tenant.middleware.ts`:

```typescript
import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createClerkClient } from '@clerk/backend';

type VerifyFn = (token: string) => Promise<{ sub: string; org_id?: string; org_role?: string }>;

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly verify: VerifyFn;

  constructor(verify?: VerifyFn) {
    if (verify) {
      this.verify = verify;
    } else {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      this.verify = (token) => clerk.verifyToken(token) as Promise<{ sub: string; org_id?: string; org_role?: string }>;
    }
  }

  async use(req: Request & { tenantId?: string; userId?: string; userRole?: string }, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.slice(7);
    let payload: { sub: string; org_id?: string; org_role?: string };

    try {
      payload = await this.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!payload.org_id) {
      throw new ForbiddenException('No tenant context — join an organization first');
    }

    req.tenantId = payload.org_id;
    req.userId = payload.sub;
    req.userRole = payload.org_role;

    next();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest src/tenants/tenant.middleware.spec.ts --no-coverage
```
Expected: PASS (4 tests)

- [ ] **Step 5: Update TenantsModule**

Modify `apps/api/src/tenants/tenants.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  providers: [TenantMiddleware],
  exports: [TenantMiddleware],
})
export class TenantsModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tenants/tenant.middleware.ts apps/api/src/tenants/tenant.middleware.spec.ts apps/api/src/tenants/tenants.module.ts
git commit -m "feat(api): implement TenantMiddleware with Clerk JWT verification"
```

---

## Task 4: DTOs

DTOs are plain classes with `class-validator` decorators. They are used by controllers for request body validation.

**Files:**
- Create: `apps/api/src/projects/dto/create-project.dto.ts`
- Create: `apps/api/src/scans/dto/create-scan.dto.ts`
- Create: `apps/api/src/findings/dto/update-finding.dto.ts`

No tests needed — DTOs are pure data definitions validated by NestJS's `ValidationPipe`.

- [ ] **Step 1: Create CreateProjectDto**

Create `apps/api/src/projects/dto/create-project.dto.ts`:

```typescript
import { IsString, IsOptional, IsArray, IsUrl, MinLength, MaxLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUrl({}, { each: true })
  targets: string[];
}
```

- [ ] **Step 2: Create CreateScanDto**

Create `apps/api/src/scans/dto/create-scan.dto.ts`:

```typescript
import { IsEnum, IsOptional, IsObject } from 'class-validator';
import { ScanType } from '@prisma/client';

export class CreateScanDto {
  @IsEnum(ScanType)
  type: ScanType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
```

- [ ] **Step 3: Create UpdateFindingDto**

Create `apps/api/src/findings/dto/update-finding.dto.ts`:

```typescript
import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { FindingStatus } from '@prisma/client';

export class UpdateFindingDto {
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @IsOptional()
  @IsBoolean()
  falsePositive?: boolean;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/projects/dto apps/api/src/scans/dto apps/api/src/findings/dto
git commit -m "feat(api): add DTOs for projects, scans and findings"
```

---

## Task 5: AuditService

**Files:**
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/audit/audit.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
};

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(AuditService);
    jest.clearAllMocks();
  });

  it('creates an audit log entry', async () => {
    await service.log({
      tenantId: 'org_1',
      userId: 'user_1',
      action: 'CREATE',
      resource: 'project',
      resourceId: 'proj_1',
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'org_1',
        userId: 'user_1',
        action: 'CREATE',
        resource: 'project',
        resourceId: 'proj_1',
      }),
    });
  });

  it('does not throw when prisma fails (fire-and-forget)', async () => {
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('DB down'));
    await expect(
      service.log({ tenantId: 'org_1', action: 'DELETE', resource: 'scan' }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest src/audit/audit.service.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './audit.service'`

- [ ] **Step 3: Implement AuditService**

Create `apps/api/src/audit/audit.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AuditLogParams {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: params });
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest src/audit/audit.service.spec.ts --no-coverage
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/audit/audit.service.ts apps/api/src/audit/audit.service.spec.ts
git commit -m "feat(api): add fire-and-forget AuditService"
```

---

## Task 6: ScansGateway (WebSocket)

The gateway creates Socket.io rooms per tenant so the frontend receives real-time scan events.

**Files:**
- Create: `apps/api/src/scans/scans.gateway.ts`

- [ ] **Step 1: Implement ScansGateway**

No separate test file — the gateway is a thin wrapper over Socket.io. Testing requires a full Socket.io test setup, which is covered by integration tests.

Create `apps/api/src/scans/scans.gateway.ts`:

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true },
  namespace: '/',
})
export class ScansGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const tenantId = client.handshake.auth['tenantId'] as string | undefined;
    if (tenantId) {
      client.join(`tenant:${tenantId}`);
    } else {
      client.disconnect(true);
    }
  }

  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/scans/scans.gateway.ts
git commit -m "feat(api): add ScansGateway for real-time scan events via Socket.io"
```

---

## Task 7: Install @kubernetes/client-node

The ScansProcessor needs this to dispatch Kubernetes Jobs.

- [ ] **Step 1: Install the package**

```bash
cd apps/api && npm install @kubernetes/client-node
```

- [ ] **Step 2: Verify install**

```bash
cd apps/api && node -e "require('@kubernetes/client-node'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json
git commit -m "chore(api): add @kubernetes/client-node for scan job dispatch"
```

---

## Task 8: ScansService

**Files:**
- Create: `apps/api/src/scans/scans.service.ts`
- Create: `apps/api/src/scans/scans.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/scans/scans.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ScansService } from './scans.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScansGateway } from './scans.gateway';
import { AuditService } from '../audit/audit.service';
import { ScanType } from '@prisma/client';

const fakeScan = { id: 'scan_1', projectId: 'proj_1', tenantId: 'org_1', status: 'QUEUED' };

const mockPrisma = {
  scan: {
    findMany: jest.fn().mockResolvedValue([fakeScan]),
    findFirst: jest.fn().mockResolvedValue(fakeScan),
    create: jest.fn().mockResolvedValue(fakeScan),
    update: jest.fn().mockResolvedValue(fakeScan),
  },
};
const mockQueue = { add: jest.fn().mockResolvedValue({}) };
const mockGateway = { emitToTenant: jest.fn() };
const mockAudit = { log: jest.fn() };

describe('ScansService', () => {
  let service: ScansService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ScansService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('scans'), useValue: mockQueue },
        { provide: ScansGateway, useValue: mockGateway },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ScansService);
    jest.clearAllMocks();
  });

  it('findAll returns scans for tenant', async () => {
    const result = await service.findAll('proj_1', 'org_1');
    expect(mockPrisma.scan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'proj_1', tenantId: 'org_1' } }),
    );
    expect(result).toEqual([fakeScan]);
  });

  it('findOne throws NotFoundException when scan not found', async () => {
    mockPrisma.scan.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne('scan_999', 'proj_1', 'org_1')).rejects.toThrow(NotFoundException);
  });

  it('create inserts scan record and adds BullMQ job', async () => {
    const dto = { type: ScanType.WEB_ONLY };
    const scan = await service.create('proj_1', dto, 'org_1');
    expect(mockPrisma.scan.create).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalledWith('dispatch-k8s-job', expect.objectContaining({ scanId: 'scan_1' }), expect.any(Object));
    expect(mockGateway.emitToTenant).toHaveBeenCalledWith('org_1', 'scan:queued', { scanId: 'scan_1' });
    expect(scan).toEqual(fakeScan);
  });

  it('cancel updates scan status to CANCELLED', async () => {
    await service.cancel('scan_1', 'proj_1', 'org_1');
    expect(mockPrisma.scan.update).toHaveBeenCalledWith({
      where: { id: 'scan_1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('updateStatus updates scan status and emits WebSocket event', async () => {
    await service.updateStatus('scan_1', 'org_1', 'RUNNING');
    expect(mockPrisma.scan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'scan_1' } }),
    );
    expect(mockGateway.emitToTenant).toHaveBeenCalledWith('org_1', 'scan:running', { scanId: 'scan_1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest src/scans/scans.service.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './scans.service'`

- [ ] **Step 3: Implement ScansService**

Create `apps/api/src/scans/scans.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ScansGateway } from './scans.gateway';
import { AuditService } from '../audit/audit.service';
import { CreateScanDto } from './dto/create-scan.dto';
import { ScanStatus } from '@prisma/client';

const STATUS_EVENT: Partial<Record<string, string>> = {
  QUEUED: 'scan:queued',
  RUNNING: 'scan:running',
  COMPLETED: 'scan:completed',
  FAILED: 'scan:failed',
  CANCELLED: 'scan:cancelled',
};

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('scans') private readonly scanQueue: Queue,
    private readonly gateway: ScansGateway,
    private readonly audit: AuditService,
  ) {}

  async findAll(projectId: string, tenantId: string) {
    return this.prisma.scan.findMany({
      where: { projectId, tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { findings: true } } },
    });
  }

  async findOne(id: string, projectId: string, tenantId: string) {
    const scan = await this.prisma.scan.findFirst({
      where: { id, projectId, tenantId },
      include: { _count: { select: { findings: true } } },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    return scan;
  }

  async create(projectId: string, dto: CreateScanDto, tenantId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) throw new NotFoundException('Project not found');

    const scan = await this.prisma.scan.create({
      data: { projectId, tenantId, type: dto.type, status: 'QUEUED', config: dto.config },
    });

    await this.scanQueue.add(
      'dispatch-k8s-job',
      { scanId: scan.id, projectId, tenantId, targets: project.targets, type: dto.type },
      { attempts: 2, removeOnComplete: 100, removeOnFail: 50 },
    );

    this.gateway.emitToTenant(tenantId, 'scan:queued', { scanId: scan.id });
    void this.audit.log({ tenantId, action: 'CREATE', resource: 'scan', resourceId: scan.id });

    return scan;
  }

  async cancel(id: string, projectId: string, tenantId: string) {
    await this.findOne(id, projectId, tenantId);
    const scan = await this.prisma.scan.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    this.gateway.emitToTenant(tenantId, 'scan:cancelled', { scanId: id });
    return scan;
  }

  async updateStatus(id: string, tenantId: string, status: ScanStatus, error?: string) {
    const data: { status: ScanStatus; error?: string; startedAt?: Date; completedAt?: Date } = { status };
    if (status === 'RUNNING') data.startedAt = new Date();
    if (status === 'COMPLETED' || status === 'FAILED') data.completedAt = new Date();
    if (error) data.error = error;

    const scan = await this.prisma.scan.update({ where: { id }, data });
    const event = STATUS_EVENT[status];
    if (event) this.gateway.emitToTenant(tenantId, event, { scanId: id });
    return scan;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest src/scans/scans.service.spec.ts --no-coverage
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scans/scans.service.ts apps/api/src/scans/scans.service.spec.ts
git commit -m "feat(api): implement ScansService with BullMQ queuing and real-time events"
```

---

## Task 9: ScansProcessor (Kubernetes Job Dispatch)

**Files:**
- Create: `apps/api/src/scans/scans.processor.ts`

- [ ] **Step 1: Implement ScansProcessor**

Create `apps/api/src/scans/scans.processor.ts`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { KubeConfig, BatchV1Api } from '@kubernetes/client-node';

interface ScanJobData {
  scanId: string;
  projectId: string;
  tenantId: string;
  targets: string[];
  type: string;
}

@Processor('scans')
export class ScansProcessor extends WorkerHost {
  private readonly logger = new Logger(ScansProcessor.name);
  private readonly batchApi: BatchV1Api | null;

  constructor() {
    super();
    if (process.env.SKIP_K8S_DISPATCH === 'true') {
      this.batchApi = null;
      this.logger.warn('K8s dispatch disabled via SKIP_K8S_DISPATCH=true');
    } else {
      const kc = new KubeConfig();
      kc.loadFromDefault();
      this.batchApi = kc.makeApiClient(BatchV1Api);
    }
  }

  async process(job: Job<ScanJobData>): Promise<void> {
    const { scanId, projectId, tenantId, targets, type } = job.data;
    this.logger.log(`Dispatching scan job: ${scanId}`);

    if (!this.batchApi) {
      this.logger.warn(`SKIP_K8S_DISPATCH: scan ${scanId} will not run automatically`);
      return;
    }

    const jobName = `scanner-${scanId.slice(0, 8)}`;
    const namespace = process.env.SCANNER_NAMESPACE ?? 'scanners';
    const image = `${process.env.ECR_REGISTRY}/ptaas-scanner:latest`;

    await this.batchApi.createNamespacedJob(namespace, {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        namespace,
        labels: { role: 'scanner', 'scan-id': scanId },
      },
      spec: {
        ttlSecondsAfterFinished: 300,
        backoffLimit: 1,
        template: {
          metadata: { labels: { role: 'scanner' } },
          spec: {
            restartPolicy: 'Never',
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 65534,
              runAsGroup: 65534,
            },
            containers: [
              {
                name: 'scanner',
                image,
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
                env: [
                  { name: 'SCAN_ID', value: scanId },
                  { name: 'PROJECT_ID', value: projectId },
                  { name: 'TENANT_ID', value: tenantId },
                  { name: 'TARGETS', value: JSON.stringify(targets) },
                  { name: 'SCAN_TYPE', value: type },
                  {
                    name: 'API_URL',
                    value: process.env.API_INTERNAL_URL ?? 'http://nest-api-svc.ptaas-prod.svc.cluster.local',
                  },
                  {
                    name: 'INTERNAL_API_KEY',
                    valueFrom: {
                      secretKeyRef: { name: 'scanner-secrets', key: 'internal-api-key' },
                    },
                  },
                ],
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: true,
                  capabilities: { drop: ['ALL'] },
                },
              },
            ],
          },
        },
      },
    });

    this.logger.log(`K8s Job created: ${jobName} in namespace ${namespace}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/scans/scans.processor.ts
git commit -m "feat(api): add ScansProcessor to dispatch Kubernetes Jobs for scanner workers"
```

---

## Task 10: ScansInternalController

The Python scanner calls these endpoints when a scan status changes or a finding is discovered.

**Files:**
- Create: `apps/api/src/scans/scans-internal.controller.ts`

- [ ] **Step 1: Implement ScansInternalController**

Create `apps/api/src/scans/scans-internal.controller.ts`:

```typescript
import { Controller, Patch, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ScanStatus, Severity } from '@prisma/client';
import { InternalKeyGuard } from '../auth/guards/internal-key.guard';
import { ScansService } from './scans.service';
import { FindingsService } from '../findings/findings.service';

class UpdateScanStatusDto {
  @IsEnum(ScanStatus)
  status: ScanStatus;

  @IsOptional()
  @IsString()
  error?: string;

  @IsString()
  tenantId: string;
}

class CreateFindingInternalDto {
  @IsString()
  projectId: string;

  @IsString()
  tenantId: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsEnum(Severity)
  severity: Severity;

  @IsOptional()
  @IsString()
  cvss_score?: number;

  @IsOptional()
  @IsString()
  cwe_id?: string;

  @IsOptional()
  @IsString()
  owasp_category?: string;

  @IsOptional()
  @IsString()
  affected_url?: string;

  @IsOptional()
  @IsString()
  affected_component?: string;

  @IsOptional()
  @IsString()
  proof_of_concept?: string;

  @IsOptional()
  @IsString()
  remediation?: string;
}

@Controller('internal')
@UseGuards(InternalKeyGuard)
export class ScansInternalController {
  constructor(
    private readonly scansService: ScansService,
    private readonly findingsService: FindingsService,
  ) {}

  @Patch('scans/:id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateScanStatusDto) {
    return this.scansService.updateStatus(id, dto.tenantId, dto.status, dto.error);
  }

  @Post('scans/:id/findings')
  @HttpCode(HttpStatus.CREATED)
  createFinding(@Param('id') scanId: string, @Body() dto: CreateFindingInternalDto) {
    return this.findingsService.createFromScanner(scanId, dto);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/scans/scans-internal.controller.ts
git commit -m "feat(api): add internal scanner callback endpoints for scan status and findings"
```

---

## Task 11: ScansModule

**Files:**
- Create: `apps/api/src/scans/scans.module.ts`

- [ ] **Step 1: Implement ScansModule**

Create `apps/api/src/scans/scans.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { ScansGateway } from './scans.gateway';
import { ScansProcessor } from './scans.processor';
import { ScansInternalController } from './scans-internal.controller';
import { AuditModule } from '../audit/audit.module';
import { FindingsModule } from '../findings/findings.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'scans' }),
    AuditModule,
    FindingsModule,
    AuthModule,
  ],
  controllers: [ScansController, ScansInternalController],
  providers: [ScansService, ScansGateway, ScansProcessor],
  exports: [ScansService],
})
export class ScansModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/scans/scans.module.ts
git commit -m "feat(api): add ScansModule wiring BullMQ, gateway, processor and internal controller"
```

---

## Task 12: FindingsService + FindingsController

**Files:**
- Create: `apps/api/src/findings/findings.service.ts`
- Create: `apps/api/src/findings/findings.controller.ts`
- Create: `apps/api/src/findings/findings.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/findings/findings.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FindingsService } from './findings.service';
import { PrismaService } from '../prisma/prisma.service';
import { Severity } from '@prisma/client';

const fakeFinding = {
  id: 'finding_1',
  scanId: 'scan_1',
  projectId: 'proj_1',
  tenantId: 'org_1',
  title: 'Missing HSTS',
  severity: Severity.HIGH,
};

const mockPrisma = {
  finding: {
    findMany: jest.fn().mockResolvedValue([fakeFinding]),
    findFirst: jest.fn().mockResolvedValue(fakeFinding),
    create: jest.fn().mockResolvedValue(fakeFinding),
    update: jest.fn().mockResolvedValue(fakeFinding),
  },
};

describe('FindingsService', () => {
  let service: FindingsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FindingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(FindingsService);
    jest.clearAllMocks();
  });

  it('findAll returns findings filtered by project and tenant', async () => {
    await service.findAll('proj_1', 'org_1');
    expect(mockPrisma.finding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'proj_1', tenantId: 'org_1' } }),
    );
  });

  it('findOne throws NotFoundException when not found', async () => {
    mockPrisma.finding.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne('f_999', 'proj_1', 'org_1')).rejects.toThrow(NotFoundException);
  });

  it('update changes status and falsePositive', async () => {
    await service.update('finding_1', 'proj_1', 'org_1', { status: 'CONFIRMED', falsePositive: false });
    expect(mockPrisma.finding.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'finding_1' }, data: { status: 'CONFIRMED', falsePositive: false } }),
    );
  });

  it('createFromScanner maps snake_case fields to camelCase', async () => {
    await service.createFromScanner('scan_1', {
      projectId: 'proj_1',
      tenantId: 'org_1',
      title: 'Test',
      description: 'Desc',
      severity: Severity.LOW,
      cwe_id: 'CWE-16',
      affected_url: 'https://example.com',
    } as any);
    expect(mockPrisma.finding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cweId: 'CWE-16',
        affectedUrl: 'https://example.com',
        scanId: 'scan_1',
      }),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest src/findings/findings.service.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './findings.service'`

- [ ] **Step 3: Implement FindingsService**

Create `apps/api/src/findings/findings.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateFindingDto } from './dto/update-finding.dto';
import { Severity } from '@prisma/client';

interface ScannerFindingDto {
  projectId: string;
  tenantId: string;
  title: string;
  description: string;
  severity: Severity;
  cvss_score?: number;
  cvss_vector?: string;
  cwe_id?: string;
  owasp_category?: string;
  affected_url?: string;
  affected_component?: string;
  proof_of_concept?: string;
  remediation?: string;
  raw_output?: Record<string, unknown>;
  check_version?: string;
}

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string, tenantId: string, filters?: { severity?: string; status?: string }) {
    return this.prisma.finding.findMany({
      where: {
        projectId,
        tenantId,
        ...(filters?.severity ? { severity: filters.severity as any } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, projectId: string, tenantId: string) {
    const finding = await this.prisma.finding.findFirst({ where: { id, projectId, tenantId } });
    if (!finding) throw new NotFoundException('Finding not found');
    return finding;
  }

  async update(id: string, projectId: string, tenantId: string, dto: UpdateFindingDto) {
    await this.findOne(id, projectId, tenantId);
    return this.prisma.finding.update({ where: { id }, data: dto });
  }

  async createFromScanner(scanId: string, dto: ScannerFindingDto) {
    return this.prisma.finding.create({
      data: {
        scanId,
        projectId: dto.projectId,
        tenantId: dto.tenantId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        cvssScore: dto.cvss_score,
        cvssVector: dto.cvss_vector,
        cweId: dto.cwe_id,
        owaspCategory: dto.owasp_category,
        affectedUrl: dto.affected_url,
        affectedComponent: dto.affected_component,
        proofOfConcept: dto.proof_of_concept,
        remediation: dto.remediation,
        rawOutput: dto.raw_output,
        checkVersion: dto.check_version,
      },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest src/findings/findings.service.spec.ts --no-coverage
```
Expected: PASS (4 tests)

- [ ] **Step 5: Implement FindingsController**

Create `apps/api/src/findings/findings.controller.ts`:

```typescript
import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { FindingsService } from './findings.service';
import { UpdateFindingDto } from './dto/update-finding.dto';
import { TenantId } from '../common/decorators/tenant.decorator';

@Controller('projects/:projectId/findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
  ) {
    return this.findingsService.findAll(projectId, tenantId, { severity, status });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
  ) {
    return this.findingsService.findOne(id, projectId, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateFindingDto,
  ) {
    return this.findingsService.update(id, projectId, tenantId, dto);
  }
}
```

- [ ] **Step 6: Update FindingsModule to export FindingsService**

Modify `apps/api/src/findings/findings.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { FindingsController } from './findings.controller';
import { FindingsService } from './findings.service';

@Module({
  controllers: [FindingsController],
  providers: [FindingsService],
  exports: [FindingsService],
})
export class FindingsModule {}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/findings/findings.service.ts apps/api/src/findings/findings.service.spec.ts apps/api/src/findings/findings.controller.ts apps/api/src/findings/findings.module.ts
git commit -m "feat(api): implement FindingsService and FindingsController"
```

---

## Task 13: ReportsService + ReportsController

Phase 1 supports JSON reports only. PDF via Puppeteer is Phase 2.

**Files:**
- Create: `apps/api/src/reports/reports.service.ts`
- Create: `apps/api/src/reports/reports.service.spec.ts`
- Create: `apps/api/src/reports/reports.controller.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/reports/reports.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

const fakeProject = { id: 'proj_1', tenantId: 'org_1', name: 'TestProject', targets: ['https://example.com'] };
const fakeFindings = [{ id: 'f1', title: 'Missing HSTS', severity: 'HIGH', status: 'OPEN' }];
const fakeReport = { id: 'rep_1', projectId: 'proj_1', tenantId: 'org_1', format: 'JSON', fileUrl: null };

const mockPrisma = {
  project: { findFirst: jest.fn().mockResolvedValue(fakeProject) },
  finding: { findMany: jest.fn().mockResolvedValue(fakeFindings) },
  report: {
    create: jest.fn().mockResolvedValue(fakeReport),
    findMany: jest.fn().mockResolvedValue([fakeReport]),
  },
};

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ReportsService);
    jest.clearAllMocks();
  });

  it('throws NotFoundException when project not found', async () => {
    mockPrisma.project.findFirst.mockResolvedValueOnce(null);
    await expect(service.generateJson('proj_x', 'org_1')).rejects.toThrow(NotFoundException);
  });

  it('generateJson returns report with findings summary', async () => {
    const result = await service.generateJson('proj_1', 'org_1');
    expect(result.report).toBeDefined();
    expect(result.report.project).toBe('TestProject');
    expect(result.report.findings).toHaveLength(1);
    expect(mockPrisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ format: 'JSON', projectId: 'proj_1' }) }),
    );
  });

  it('findAll returns reports for project', async () => {
    await service.findAll('proj_1', 'org_1');
    expect(mockPrisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'proj_1', tenantId: 'org_1' } }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest src/reports/reports.service.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module './reports.service'`

- [ ] **Step 3: Implement ReportsService**

Create `apps/api/src/reports/reports.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateJson(projectId: string, tenantId: string, scanId?: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) throw new NotFoundException('Project not found');

    const findings = await this.prisma.finding.findMany({
      where: { projectId, tenantId, ...(scanId ? { scanId } : {}) },
      orderBy: [{ severity: 'asc' }],
    });

    const summary = {
      CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0,
    };
    for (const f of findings) {
      summary[f.severity] = (summary[f.severity] ?? 0) + 1;
    }

    const reportData = {
      generatedAt: new Date().toISOString(),
      project: project.name,
      targets: project.targets,
      summary,
      findings: findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        cvssScore: f.cvssScore,
        cweId: f.cweId,
        owaspCategory: f.owaspCategory,
        affectedUrl: f.affectedUrl,
        remediation: f.remediation,
      })),
    };

    const record = await this.prisma.report.create({
      data: { projectId, tenantId, format: 'JSON', ...(scanId ? { scanId } : {}) },
    });

    return { report: reportData, recordId: record.id };
  }

  async findAll(projectId: string, tenantId: string) {
    return this.prisma.report.findMany({
      where: { projectId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest src/reports/reports.service.spec.ts --no-coverage
```
Expected: PASS (3 tests)

- [ ] **Step 5: Implement ReportsController**

Create `apps/api/src/reports/reports.controller.ts`:

```typescript
import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { TenantId } from '../common/decorators/tenant.decorator';

@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @TenantId() tenantId: string) {
    return this.reportsService.findAll(projectId, tenantId);
  }

  @Post('json')
  generateJson(
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
    @Query('scanId') scanId?: string,
  ) {
    return this.reportsService.generateJson(projectId, tenantId, scanId);
  }
}
```

- [ ] **Step 6: Update ReportsModule**

Modify `apps/api/src/reports/reports.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/reports.service.ts apps/api/src/reports/reports.service.spec.ts apps/api/src/reports/reports.controller.ts apps/api/src/reports/reports.module.ts
git commit -m "feat(api): implement JSON report generation"
```

---

## Task 14: HealthController

**Files:**
- Create: `apps/api/src/health/health.controller.ts`

- [ ] **Step 1: Create health directory and controller**

```bash
mkdir -p apps/api/src/health
```

Create `apps/api/src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/health/health.controller.ts
git commit -m "feat(api): add health check endpoint via @nestjs/terminus"
```

---

## Task 15: AppModule (Root Module)

This ties everything together. `TenantMiddleware` is applied globally to all routes EXCEPT `/api/v1/internal/*` and `/api/v1/health`.

**Files:**
- Create: `apps/api/src/app.module.ts`

- [ ] **Step 1: Implement AppModule**

Create `apps/api/src/app.module.ts`:

```typescript
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { ProjectsModule } from './projects/projects.module';
import { ScansModule } from './scans/scans.module';
import { FindingsModule } from './findings/findings.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { TenantMiddleware } from './tenants/tenant.middleware';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TerminusModule,
    PrismaModule,
    AuthModule,
    TenantsModule,
    ProjectsModule,
    ScansModule,
    FindingsModule,
    ReportsModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/v1/health', method: RequestMethod.GET },
        { path: 'api/v1/internal/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: No errors. Fix any import errors before continuing.

- [ ] **Step 3: Run all tests**

```bash
cd apps/api && npx jest --no-coverage
```
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(api): wire AppModule — all modules connected, TenantMiddleware applied globally"
```

---

## Task 16: Smoke Test (local run)

Verify the API starts successfully with a local Postgres + Redis.

- [ ] **Step 1: Start dependencies**

```bash
docker run -d --name ptaas-pg -e POSTGRES_USER=ptaas -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=ptaas_dev -p 5432:5432 postgres:16-alpine
docker run -d --name ptaas-redis -p 6379:6379 redis:7-alpine
```

- [ ] **Step 2: Set environment and run migrations**

```bash
cd apps/api
cp ../../.env.example .env
# Edit .env: set DATABASE_URL=postgresql://ptaas:dev@localhost:5432/ptaas_dev
# Set REDIS_HOST=localhost, INTERNAL_API_KEY=devsecret, CLERK_SECRET_KEY=<your_dev_key>
# Set SKIP_K8S_DISPATCH=true (no K8s in local dev)
npx prisma migrate dev --name init
npx prisma generate
```

- [ ] **Step 3: Start the API**

```bash
cd apps/api && npm run dev
```
Expected output: `API running on port 3001`

- [ ] **Step 4: Verify health endpoint**

```bash
curl http://localhost:3001/api/v1/health
```
Expected:
```json
{"status":"ok","info":{"database":{"status":"up"}}}
```

- [ ] **Step 5: Stop containers when done**

```bash
docker stop ptaas-pg ptaas-redis && docker rm ptaas-pg ptaas-redis
```

---

## Self-Review

### Spec Coverage Check

| Requirement (from 00_briefing.md Phase 1) | Task |
|---|---|
| Auth (Clerk JWT) | Task 3 (TenantMiddleware) |
| Multi-Tenant isolation | Tasks 3, 8, 12 (tenantId on all queries) |
| Projekt-Management API | Existing (projects/) + Task 4 (DTOs) |
| Scan Queue | Tasks 8, 9, 11 (ScansService, BullMQ, Processor) |
| Scanner callback API | Task 10 (ScansInternalController) |
| Findings Management | Task 12 |
| Reports (JSON) | Task 13 |
| Audit Logs | Task 5 |
| WebSocket real-time | Task 6 (ScansGateway) |
| Health check | Task 14 |

### Type Consistency Check
- `ScansService.updateStatus(id, tenantId, status, error?)` → used in `ScansInternalController` ✅
- `FindingsService.createFromScanner(scanId, dto)` → used in `ScansInternalController` ✅
- `ScansGateway.emitToTenant(tenantId, event, data)` → used in `ScansService` ✅
- `AuditService.log(params)` → used in `ScansService` ✅
- `InternalKeyGuard` → exported from `AuthModule`, imported in `ScansModule` ✅
- `FindingsService` → exported from `FindingsModule`, imported in `ScansModule` ✅
