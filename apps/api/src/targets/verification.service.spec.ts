import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { VerificationService } from './verification.service';

const TOKEN = 'tok123';
const target = { id: 't1', value: 'https://example.com', verificationToken: TOKEN, organizationId: 'org1' };

function setup(requestFollowing: ReturnType<typeof vi.fn>) {
  const prisma = {
    target: { findFirst: vi.fn().mockResolvedValue(target), update: vi.fn().mockResolvedValue({}) },
  };
  const audit = { log: vi.fn() };
  const safeHttp = { requestFollowing };
  const svc = new VerificationService(prisma as never, audit as never, safeHttp as never);
  return { svc, prisma, audit, safeHttp };
}

describe('VerificationService — HTTP_FILE', () => {
  it('verifies when the file contains the expected token', async () => {
    const rf = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: `ptaas-verify=${TOKEN}\n`, truncated: false });
    const { svc, prisma } = setup(rf);
    const res = await svc.verify('t1', 'HTTP_FILE', 'org1', 'u1');
    expect(res.success).toBe(true);
    expect(rf).toHaveBeenCalledWith(
      'https://example.com/.well-known/ptaas-verify.txt',
      expect.objectContaining({ maxBytes: 512 }),
    );
    expect(prisma.target.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'VERIFIED' }) }),
    );
  });

  it('fails when the safe client rejects a redirect to another host', async () => {
    const rf = vi.fn().mockRejectedValue(new BadRequestException('Redirect to a different host is not allowed: evil.example'));
    const { svc, prisma } = setup(rf);
    const res = await svc.verify('t1', 'HTTP_FILE', 'org1', 'u1');
    expect(res.success).toBe(false);
    expect(res.message).toContain('different host');
    expect(prisma.target.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'FAILED' }) }),
    );
  });

  it('fails on a content mismatch and on non-2xx', async () => {
    const mismatch = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: 'nope', truncated: false });
    expect((await setup(mismatch).svc.verify('t1', 'HTTP_FILE', 'org1', 'u1')).success).toBe(false);
    const notFound = vi.fn().mockResolvedValue({ status: 404, headers: {}, body: '', truncated: false });
    expect((await setup(notFound).svc.verify('t1', 'HTTP_FILE', 'org1', 'u1')).message).toContain('HTTP 404');
  });
});

describe('VerificationService — META_TAG', () => {
  it('verifies the ptaas-verify meta tag', async () => {
    const html = `<html><head><meta name="ptaas-verify" content="${TOKEN}"></head>`;
    const rf = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: html, truncated: false });
    const { svc } = setup(rf);
    expect((await svc.verify('t1', 'META_TAG', 'org1', 'u1')).success).toBe(true);
    expect(rf).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ maxBytes: 65_536 }));
  });
});
