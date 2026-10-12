import { describe, it, expect, vi } from 'vitest';
import { AuditService } from './audit.service';
import { redactMetadata } from './redact';

describe('redactMetadata', () => {
  it('masks sensitive keys recursively and truncates long strings', () => {
    const out = redactMetadata({
      action: 'run.start',
      apiKey: 'sk-123',
      nested: { password: 'p', transcript: 'long...', ok: 1 },
      list: [{ token: 't' }],
      big: 'x'.repeat(5000),
    }) as {
      action: string; apiKey: string; big: string;
      nested: { password: string; transcript: string; ok: number };
      list: Array<{ token: string }>;
    };
    expect(out.action).toBe('run.start');
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.nested.password).toBe('[REDACTED]');
    expect(out.nested.transcript).toBe('[REDACTED]');
    expect(out.nested.ok).toBe(1);
    expect(out.list[0].token).toBe('[REDACTED]');
    expect(out.big.length).toBeLessThan(2100);
  });
  it('returns undefined for undefined', () => expect(redactMetadata(undefined)).toBeUndefined());
});

describe('AuditService.logStrict', () => {
  const event = { action: 'arena.run.approved', userId: 'u1', organizationId: 'o1', metadata: { roeHash: 'abc', apiKey: 'sk' } };

  it('awaits the insert and redacts metadata', async () => {
    const create = vi.fn().mockResolvedValue({});
    const svc = new AuditService({ auditLog: { create } } as never);
    await svc.logStrict(event);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.metadata).toEqual({ roeHash: 'abc', apiKey: '[REDACTED]' });
  });

  it('propagates failures (unlike log())', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const svc = new AuditService({ auditLog: { create } } as never);
    await expect(svc.logStrict(event)).rejects.toThrow('db down');
  });
});
