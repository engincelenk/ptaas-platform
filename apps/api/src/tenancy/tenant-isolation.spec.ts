/**
 * M50 — Multi-Tenancy Hardening: Cross-tenant isolation unit tests.
 *
 * These tests verify that service methods correctly scope queries to
 * the caller's organizationId and throw NotFoundException when accessing
 * another org's resources.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';

// ─── FindingsService ─────────────────────────────────────────────────────────

import { FindingsService } from '../findings/findings.service';

describe('FindingsService — cross-tenant isolation', () => {
  const ORG_A = 'org-aaaa';
  const ORG_B = 'org-bbbb';
  const FINDING_ID = 'finding-1';

  const makePrisma = (findingOrgId: string) => ({
    finding: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.organizationId && where.organizationId !== findingOrgId) return null;
        return { id: FINDING_ID, organizationId: findingOrgId, status: 'OPEN', assignedToId: null };
      }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    findingActivity: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() },
    findingComment: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
  });

  it('findOne returns finding for correct org', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new FindingsService(prisma as never, null as never, null as never);
    const result = await svc.findOne(FINDING_ID, ORG_A);
    expect(result).toBeTruthy();
    expect(prisma.finding.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }),
    );
  });

  it('findOne throws NotFoundException for wrong org', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new FindingsService(prisma as never, null as never, null as never);
    await expect(svc.findOne(FINDING_ID, ORG_B)).rejects.toThrow(NotFoundException);
  });

  it('getActivity throws NotFoundException for wrong org', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new FindingsService(prisma as never, null as never, null as never);
    await expect(svc.getActivity(FINDING_ID, ORG_B)).rejects.toThrow(NotFoundException);
  });

  it('updateRemediation includes organizationId in update where clause', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new FindingsService(prisma as never, null as never, null as never);
    await svc.updateRemediation(FINDING_ID, ORG_A, 'user-1', { assignedToId: 'user-2' });
    expect(prisma.finding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      }),
    );
  });
});

// ─── ScanPoliciesService ──────────────────────────────────────────────────────

import { ScanPoliciesService } from '../scan-policies/scan-policies.service';

describe('ScanPoliciesService — cross-tenant isolation', () => {
  const ORG_A = 'org-aaaa';
  const ORG_B = 'org-bbbb';
  const POLICY_ID = 'policy-1';

  const makePrisma = (policyOrgId: string) => ({
    scanPolicy: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.organizationId !== policyOrgId) return null;
        return { id: POLICY_ID, organizationId: policyOrgId, name: 'Test Policy' };
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: POLICY_ID, organizationId: policyOrgId }),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  });

  it('get returns policy for correct org', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new ScanPoliciesService(prisma as never);
    const result = await svc.get(POLICY_ID, ORG_A);
    expect(result).toBeTruthy();
  });

  it('get throws NotFoundException for wrong org', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new ScanPoliciesService(prisma as never);
    await expect(svc.get(POLICY_ID, ORG_B)).rejects.toThrow(NotFoundException);
  });

  it('remove includes organizationId in delete where clause', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new ScanPoliciesService(prisma as never);
    await svc.remove(POLICY_ID, ORG_A);
    expect(prisma.scanPolicy.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }),
    );
  });

  it('remove does not delete policy owned by different org', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new ScanPoliciesService(prisma as never);
    await expect(svc.remove(POLICY_ID, ORG_B)).rejects.toThrow(NotFoundException);
    expect(prisma.scanPolicy.delete).not.toHaveBeenCalled();
  });
});

// ─── ApiKeysService ───────────────────────────────────────────────────────────

import { ApiKeysService } from '../api-keys/api-keys.service';

describe('ApiKeysService — cross-tenant isolation', () => {
  const ORG_A = 'org-aaaa';
  const ORG_B = 'org-bbbb';
  const KEY_ID = 'key-1';

  const makePrisma = (keyOrgId: string) => ({
    apiKey: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.organizationId !== keyOrgId) return null;
        return { id: KEY_ID, organizationId: keyOrgId, revokedAt: null };
      }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  });

  it('revoke succeeds for correct org', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new ApiKeysService(prisma as never);
    await svc.revoke(KEY_ID, ORG_A);
    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      }),
    );
  });

  it('revoke throws NotFoundException for wrong org', async () => {
    const prisma = makePrisma(ORG_A);
    const svc = new ApiKeysService(prisma as never);
    await expect(svc.revoke(KEY_ID, ORG_B)).rejects.toThrow(NotFoundException);
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });
});

// ─── Tenant Guard (Prisma query extension) ───────────────────────────────────

import { PrismaService, warnOnUnscopedTenantWrite } from '../prisma/prisma.service';

describe('warnOnUnscopedTenantWrite', () => {
  const makeLog = () => ({ warn: vi.fn() });

  it('warns when a tenant model is written without organizationId', () => {
    const log = makeLog();
    warnOnUnscopedTenantWrite(log, 'Finding', 'update', { where: { id: '1' }, data: {} });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('TenantGuard'));
  });

  it('warns for camelCase tenant models (ApiKey)', () => {
    const log = makeLog();
    warnOnUnscopedTenantWrite(log, 'ApiKey', 'delete', { where: { id: '1' } });
    expect(log.warn).toHaveBeenCalled();
  });

  it('does not warn when organizationId is in where or data', () => {
    const log = makeLog();
    warnOnUnscopedTenantWrite(log, 'Finding', 'update', { where: { id: '1', organizationId: 'o' } });
    warnOnUnscopedTenantWrite(log, 'Scan', 'create', { data: { organizationId: 'o' } });
    warnOnUnscopedTenantWrite(log, 'Scan', 'create', { data: { organization: { connect: { id: 'o' } } } });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('ignores reads and non-tenant models', () => {
    const log = makeLog();
    warnOnUnscopedTenantWrite(log, 'Finding', 'findMany', { where: {} });
    warnOnUnscopedTenantWrite(log, 'User', 'update', { where: { id: '1' } });
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('PrismaService TenantGuard integration', () => {
  it('hooks queries via $extends, warns, and never blocks', async () => {
    process.env.DATABASE_URL ??= 'postgresql://x:x@127.0.0.1:1/x';
    const svc = new PrismaService();
    const warn = vi.spyOn((svc as unknown as { log: { warn: () => void } }).log, 'warn');

    expect(typeof svc.onModuleInit).toBe('function');
    expect(typeof svc.onModuleDestroy).toBe('function');

    // No DB available: the query itself rejects, but the guard runs first.
    await svc.finding.update({ where: { id: '1' }, data: {} }).catch(() => undefined);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TenantGuard'));
  });
});
