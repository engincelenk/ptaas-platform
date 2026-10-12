type Loose = { [key: string]: Loose } & string;
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CryptoService } from '../../crypto/crypto.service';
import { isProviderHost } from '../arena.constants';
import { AiTargetsService, aiTargetAad, assertHeaderName, assertMapping, parseArenaEndpoint } from './ai-targets.service';
import type { ArenaActor } from './arena-views';

const KEY = 'a'.repeat(64);
const actor: ArenaActor = { userId: 'u1', organizationId: 'org1', role: 'ADMIN' };

function makeCrypto() {
  return new CryptoService({ getOrThrow: () => KEY } as never);
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'ai1',
    organizationId: 'org1',
    targetId: 't1',
    name: 'Bot',
    adapter: 'OPENAI_COMPAT',
    requestMapping: null,
    responseMapping: null,
    authHeaderName: 'Authorization',
    apiKeyEncrypted: null,
    knownPromptFragmentsEncrypted: null,
    canaryPlacedAt: null,
    createdById: 'u1',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    target: {
      id: 't1',
      type: 'URL',
      value: 'https://chat.example.com/api/chat',
      projectId: 'p1',
      organizationId: 'org1',
      verificationStatus: 'PENDING' as string,
      verificationMethod: null,
      verificationToken: 'tok-1',
      verifiedAt: null as Date | null,
    },
    ...over,
  };
}

function setup(opts: { resolveSafe?: ReturnType<typeof vi.fn> } = {}) {
  const crypto = makeCrypto();
  const prisma = {
    project: { findFirst: vi.fn().mockResolvedValue({ id: 'p1' }) },
    target: { findFirst: vi.fn().mockResolvedValue(null) },
    aiTarget: {
      findFirst: vi.fn().mockResolvedValue(row()),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ id: data.id, apiKeyEncrypted: data.apiKeyEncrypted, knownPromptFragmentsEncrypted: data.knownPromptFragmentsEncrypted })),
      ),
      update: vi.fn().mockResolvedValue(row()),
      delete: vi.fn().mockResolvedValue({}),
    },
    arenaRun: { count: vi.fn().mockResolvedValue(0), updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => Promise.resolve(cb(prisma)));
  const audit = { log: vi.fn() };
  const ssrf = { resolveSafe: opts.resolveSafe ?? vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) };
  const verification = { verify: vi.fn().mockResolvedValue({ success: true, message: 'ok' }) };
  const svc = new AiTargetsService(prisma as never, audit as never, crypto, ssrf as never, verification as never);
  return { svc, prisma, audit, ssrf, verification, crypto };
}

const baseDto = {
  projectId: 'p1',
  name: 'Bot',
  endpointUrl: 'https://chat.example.com/api/chat',
  adapter: 'OPENAI_COMPAT' as const,
};

describe('parseArenaEndpoint', () => {
  it('rejects http', () => {
    expect(() => parseArenaEndpoint('http://chat.example.com/x')).toThrow(BadRequestException);
  });
  it('rejects ports other than 443 but accepts explicit 443', () => {
    expect(() => parseArenaEndpoint('https://chat.example.com:8443/x')).toThrow(/port 443/);
    expect(parseArenaEndpoint('https://chat.example.com:443/x').hostname).toBe('chat.example.com');
  });
  it('rejects credentials in the URL', () => {
    expect(() => parseArenaEndpoint('https://user:pw@chat.example.com/x')).toThrow(/Credentials/);
    expect(() => parseArenaEndpoint('https://token@chat.example.com/x')).toThrow(/Credentials/);
  });
  it('rejects provider hosts incl. subdomains and trailing dot', () => {
    expect(() => parseArenaEndpoint('https://api.openai.com/v1/chat/completions')).toThrow(/Model-provider/);
    expect(() => parseArenaEndpoint('https://API.ANTHROPIC.com/v1/messages')).toThrow(/Model-provider/);
    expect(() => parseArenaEndpoint('https://eu.api.openai.com/v1')).toThrow(/Model-provider/);
    expect(isProviderHost('api.openai.com.')).toBe(true);
    expect(isProviderHost('openai.example.com')).toBe(false);
  });
  it('rejects garbage and strips the fragment', () => {
    expect(() => parseArenaEndpoint('not a url')).toThrow(BadRequestException);
    expect(parseArenaEndpoint('https://chat.example.com/x#frag').hash).toBe('');
  });
});

describe('AiTargetsService.create', () => {
  it('rejects an SSRF-unsafe host (resolveSafe fails) and creates nothing', async () => {
    const { svc, prisma } = setup({
      resolveSafe: vi.fn().mockRejectedValue(new BadRequestException('disallowed address')),
    });
    await expect(svc.create(baseDto, actor)).rejects.toThrow(BadRequestException);
    expect(prisma.aiTarget.create).not.toHaveBeenCalled();
  });

  it('does not even resolve DNS for syntactically invalid endpoints', async () => {
    const { svc, ssrf } = setup();
    await expect(svc.create({ ...baseDto, endpointUrl: 'http://chat.example.com' }, actor)).rejects.toThrow();
    expect(ssrf.resolveSafe).not.toHaveBeenCalled();
  });

  it('rejects a project of another organization (404)', async () => {
    const { svc, prisma } = setup();
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(svc.create(baseDto, actor)).rejects.toThrow(NotFoundException);
    expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: 'p1', organizationId: 'org1' } });
  });

  it('creates Target(URL) + AiTarget atomically, encrypts secrets with AAD, and never returns them', async () => {
    const { svc, prisma, crypto } = setup();
    const view = await svc.create(
      { ...baseDto, apiKey: 'sk-secret-key', knownPromptFragments: ['You are the ACME bot', 'internal rule 7'] },
      actor,
    );
    const { data } = prisma.aiTarget.create.mock.calls[0][0] as { data: Loose };
    expect(data.target.create).toMatchObject({ type: 'URL', value: 'https://chat.example.com/api/chat' });
    expect(data.target.create.verificationToken).toBeTruthy();
    expect(data.apiKeyEncrypted).not.toContain('sk-secret-key');
    expect(crypto.decryptBound(data.apiKeyEncrypted, aiTargetAad('org1', data.id, 'apiKey'))).toBe('sk-secret-key');
    expect(() => crypto.decryptBound(data.apiKeyEncrypted, aiTargetAad('org2', data.id, 'apiKey'))).toThrow();
    expect(JSON.parse(crypto.decryptBound(data.knownPromptFragmentsEncrypted, aiTargetAad('org1', data.id, 'knownPromptFragments')))).toHaveLength(2);

    expect(view.hasApiKey).toBe(true);
    expect(view.fragmentCount).toBe(2);
    const json = JSON.stringify(view);
    expect(json).not.toContain('sk-secret-key');
    expect(json).not.toContain('ACME bot');
    expect(json).not.toContain('apiKeyEncrypted');
    expect(json).not.toContain('Encrypted');
  });

  it('answers 409 for an endpoint already registered in the project', async () => {
    const { svc, prisma } = setup();
    prisma.target.findFirst.mockResolvedValue({ id: 't1', type: 'URL', aiTarget: { id: 'x' } });
    await expect(svc.create(baseDto, actor)).rejects.toThrow(ConflictException);
  });

  it('audit metadata never contains secrets', async () => {
    const { svc, audit } = setup();
    await svc.create({ ...baseDto, apiKey: 'sk-secret-key', knownPromptFragments: ['frag-secret'] }, actor);
    expect(JSON.stringify(audit.log.mock.calls)).not.toMatch(/sk-secret-key|frag-secret/);
  });
});

describe('AiTargetsService tenant isolation + secrets', () => {
  it('get / getSecrets / verify / update / remove / getVerification → 404 for a foreign organization', async () => {
    const { svc, prisma } = setup();
    prisma.aiTarget.findFirst.mockResolvedValue(null);
    await expect(svc.get('ai1', 'other')).rejects.toThrow(NotFoundException);
    await expect(svc.getSecrets('ai1', 'other')).rejects.toThrow(NotFoundException);
    await expect(svc.getVerification('ai1', 'other')).rejects.toThrow(NotFoundException);
    await expect(svc.verify('ai1', 'DNS_TXT', { ...actor, organizationId: 'other' })).rejects.toThrow(NotFoundException);
    await expect(svc.update('ai1', { name: 'x' }, { ...actor, organizationId: 'other' })).rejects.toThrow(NotFoundException);
    await expect(svc.remove('ai1', { ...actor, organizationId: 'other' })).rejects.toThrow(NotFoundException);
    for (const call of prisma.aiTarget.findFirst.mock.calls) {
      expect((call[0] as { where: { organizationId: string } }).where.organizationId).toBe('other');
    }
  });

  it('getSecrets decrypts via decryptBound with the bound AAD', async () => {
    const { svc, prisma, crypto } = setup();
    prisma.aiTarget.findFirst.mockResolvedValue(
      row({
        apiKeyEncrypted: crypto.encrypt('sk-abc', aiTargetAad('org1', 'ai1', 'apiKey')),
        knownPromptFragmentsEncrypted: crypto.encrypt(JSON.stringify(['f1', 'f2']), aiTargetAad('org1', 'ai1', 'knownPromptFragments')),
      }),
    );
    expect(await svc.getSecrets('ai1', 'org1')).toEqual({ apiKey: 'sk-abc', knownPromptFragments: ['f1', 'f2'] });
  });

  it('getSecrets refuses a ciphertext moved to another record (AAD mismatch)', async () => {
    const { svc, prisma, crypto } = setup();
    prisma.aiTarget.findFirst.mockResolvedValue(
      row({ apiKeyEncrypted: crypto.encrypt('sk-abc', aiTargetAad('org1', 'OTHER', 'apiKey')) }),
    );
    await expect(svc.getSecrets('ai1', 'org1')).rejects.toThrow();
  });

  it('view of a stored target exposes only flags', async () => {
    const { svc, prisma, crypto } = setup();
    prisma.aiTarget.findFirst.mockResolvedValue(
      row({ apiKeyEncrypted: crypto.encrypt('sk-abc', aiTargetAad('org1', 'ai1', 'apiKey')) }),
    );
    const v = await svc.get('ai1', 'org1');
    expect(v.hasApiKey).toBe(true);
    expect(v.fragmentCount).toBe(0);
    expect(JSON.stringify(v)).not.toContain('sk-abc');
  });
});

describe('AiTargetsService verification', () => {
  it('reports token, instructions, fresh flag and expiry', async () => {
    const { svc, prisma } = setup();
    const verifiedAt = new Date(Date.now() - 2 * 86_400_000);
    const r = row();
    r.target.verificationStatus = 'VERIFIED';
    r.target.verifiedAt = verifiedAt;
    prisma.aiTarget.findFirst.mockResolvedValue(r);
    const v = await svc.getVerification('ai1', 'org1');
    expect(v.fresh).toBe(true);
    expect(v.token).toBe('tok-1');
    expect(v.instructions.DNS_TXT).toContain('ptaas-verify=tok-1');
    expect(v.instructions.HTTP_FILE).toContain('https://chat.example.com/.well-known/ptaas-verify.txt');
    expect(v.instructions.META_TAG).toContain('name="ptaas-verify"');
    expect(new Date(v.expiresAt as string).getTime()).toBe(verifiedAt.getTime() + 30 * 86_400_000);
  });

  it('an old verification is not fresh', async () => {
    const { svc, prisma } = setup();
    const r = row();
    r.target.verificationStatus = 'VERIFIED';
    r.target.verifiedAt = new Date(Date.now() - 40 * 86_400_000);
    prisma.aiTarget.findFirst.mockResolvedValue(r);
    expect((await svc.getVerification('ai1', 'org1')).fresh).toBe(false);
    expect((await svc.get('ai1', 'org1')).verification.fresh).toBe(false);
  });

  it('delegates verify to VerificationService with the underlying target id', async () => {
    const { svc, verification } = setup();
    const res = await svc.verify('ai1', 'HTTP_FILE', actor, { ip: '1.2.3.4', userAgent: 'ua' });
    expect(res.success).toBe(true);
    expect(verification.verify).toHaveBeenCalledWith('t1', 'HTTP_FILE', 'org1', 'u1', '1.2.3.4', 'ua');
  });

  it('refuses to verify a stored provider host', async () => {
    const { svc, prisma, verification } = setup();
    const r = row();
    r.target.value = 'https://api.openai.com/v1';
    prisma.aiTarget.findFirst.mockResolvedValue(r);
    await expect(svc.verify('ai1', 'DNS_TXT', actor)).rejects.toThrow(BadRequestException);
    expect(verification.verify).not.toHaveBeenCalled();
  });
});

describe('AiTargetsService update/remove', () => {
  it('changing to a different host resets the verification; same host keeps it', async () => {
    const { svc, prisma } = setup();
    await svc.update('ai1', { endpointUrl: 'https://other.example.org/chat' }, actor);
    const data1 = (prisma.aiTarget.update.mock.calls[0][0] as { data: Loose }).data;
    expect(data1.target.update).toMatchObject({ value: 'https://other.example.org/chat', verificationStatus: 'PENDING', verifiedAt: null });

    await svc.update('ai1', { endpointUrl: 'https://chat.example.com/v2/chat' }, actor);
    const data2 = (prisma.aiTarget.update.mock.calls[1][0] as { data: Loose }).data;
    expect(data2.target.update).toEqual({ value: 'https://chat.example.com/v2/chat' });
  });

  it('validates the new endpoint on update', async () => {
    const { svc } = setup();
    await expect(svc.update('ai1', { endpointUrl: 'http://x.example.org' }, actor)).rejects.toThrow(BadRequestException);
    await expect(svc.update('ai1', { endpointUrl: 'https://api.mistral.ai/v1' }, actor)).rejects.toThrow(BadRequestException);
  });

  it('empty apiKey removes the stored key; secrets are encrypted with AAD', async () => {
    const { svc, prisma, crypto } = setup();
    await svc.update('ai1', { apiKey: '' }, actor);
    expect((prisma.aiTarget.update.mock.calls[0][0] as { data: Loose }).data.apiKeyEncrypted).toBeNull();
    await svc.update('ai1', { apiKey: 'sk-new' }, actor);
    const enc = (prisma.aiTarget.update.mock.calls[1][0] as { data: Loose }).data.apiKeyEncrypted as string;
    expect(crypto.decryptBound(enc, aiTargetAad('org1', 'ai1', 'apiKey'))).toBe('sk-new');
  });

  it('cannot delete while a run is RUNNING', async () => {
    const { svc, prisma } = setup();
    prisma.arenaRun.count.mockResolvedValue(1);
    await expect(svc.remove('ai1', actor)).rejects.toThrow(ConflictException);
    expect(prisma.aiTarget.delete).not.toHaveBeenCalled();
  });

  it('deletes an idle target', async () => {
    const { svc, prisma } = setup();
    await svc.remove('ai1', actor);
    expect(prisma.aiTarget.delete).toHaveBeenCalledWith({ where: { id: 'ai1' } });
  });
});

describe('header and mapping hardening', () => {
  it('rejects forbidden and malformed auth header names', () => {
    const bad = ['Host', 'content-length', 'Transfer-Encoding', 'Proxy-Authorization', 'Sec-Fetch-Mode', 'X-Forwarded-For', 'Cookie', '1abc', 'a b', 'x:y', 'a'.repeat(65), 'Auth\r\nX: y'];
    for (const name of bad) expect(() => assertHeaderName(name), name).toThrow(BadRequestException);
    for (const ok of ['Authorization', 'X-Api-Key', 'api-key']) expect(() => assertHeaderName(ok)).not.toThrow();
  });

  it('create/update reject a forbidden header name', async () => {
    const { svc, prisma } = setup();
    await expect(svc.create({ ...baseDto, authHeaderName: 'Host' }, actor)).rejects.toThrow(BadRequestException);
    await expect(svc.update('ai1', { authHeaderName: 'Cookie' }, actor)).rejects.toThrow(BadRequestException);
    expect(prisma.aiTarget.create).not.toHaveBeenCalled();
    expect(prisma.aiTarget.update).not.toHaveBeenCalled();
  });

  it('mapping: rejects tool/prototype keys on any level, too deep, and too large', () => {
    for (const key of ['tools', 'tool_choice', 'functions', 'function_call', 'constructor', 'prototype']) {
      expect(() => assertMapping({ a: { b: [{ [key]: 1 }] } }, 'requestMapping'), key).toThrow(/forbidden key/);
      expect(() => assertMapping({ [key.toUpperCase()]: 1 }, 'requestMapping')).toThrow(/forbidden key/);
    }
    expect(() => assertMapping(JSON.parse('{"__proto__": {"x": 1}}'), 'requestMapping')).toThrow(/forbidden key/);
    expect(() => assertMapping({ a: { b: { c: { d: { e: { f: 1 } } } } } }, 'requestMapping')).toThrow(/deeply/);
    expect(() => assertMapping({ a: { b: { c: { d: { e: 1 } } } } }, 'requestMapping')).not.toThrow();
    expect(() => assertMapping({ a: 'x'.repeat(4100) }, 'responseMapping')).toThrow(/exceeds/);
    expect(() => assertMapping({ messages: [{ role: 'user', content: '{{prompt}}' }] }, 'requestMapping')).not.toThrow();
  });

  it('create/update reject a bad mapping', async () => {
    const { svc } = setup();
    await expect(svc.create({ ...baseDto, requestMapping: { tools: [] } }, actor)).rejects.toThrow(BadRequestException);
    await expect(svc.update('ai1', { responseMapping: { function_call: 1 } }, actor)).rejects.toThrow(BadRequestException);
  });
});

describe('approval is bound to the configuration', () => {
  it.each([
    ['endpointUrl', { endpointUrl: 'https://chat.example.com/v2' }],
    ['adapter', { adapter: 'ANTHROPIC' as const }],
    ['requestMapping', { requestMapping: { a: 1 } }],
    ['responseMapping', { responseMapping: { a: 1 } }],
    ['authHeaderName', { authHeaderName: 'X-Key' }],
    ['apiKey', { apiKey: 'sk-new' }],
    ['knownPromptFragments', { knownPromptFragments: ['x'] }],
  ])('changing %s resets DRAFT/AWAITING/APPROVED runs to DRAFT and clears approval, in one transaction', async (_n, dto) => {
    const { svc, prisma } = setup();
    await svc.update('ai1', dto, actor);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.arenaRun.updateMany).toHaveBeenCalledWith({
      where: { aiTargetId: 'ai1', organizationId: 'org1', status: { in: ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED'] } },
      data: { status: 'DRAFT', approvedById: null, approvedByName: null, approvedAt: null, roeId: null, emergencyContact: null },
    });
  });

  it('a pure rename does not touch runs', async () => {
    const { svc, prisma } = setup();
    await svc.update('ai1', { name: 'New name' }, actor);
    expect(prisma.arenaRun.updateMany).not.toHaveBeenCalled();
  });

  it('a RUNNING run blocks configuration changes with 409 TARGET_BUSY and nothing is written', async () => {
    const { svc, prisma } = setup();
    prisma.arenaRun.count.mockResolvedValue(1);
    const err = await svc.update('ai1', { adapter: 'ANTHROPIC' }, actor).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: 'TARGET_BUSY' });
    expect(prisma.aiTarget.update).not.toHaveBeenCalled();
    expect(prisma.arenaRun.updateMany).not.toHaveBeenCalled();
  });
});
