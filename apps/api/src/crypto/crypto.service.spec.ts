import { describe, it, expect } from 'vitest';
import { CryptoService } from './crypto.service';

// Valid 32-byte test key (64 hex chars)
const TEST_KEY = 'a'.repeat(64);

function makeService() {
  return new CryptoService({
    getOrThrow: () => TEST_KEY,
  } as never);
}

describe('CryptoService', () => {
  it('encrypts and decrypts round-trip', () => {
    const svc = makeService();
    const plaintext = 'Bearer supersecret_token_12345';
    const encrypted = svc.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(':').length).toBe(3);
    expect(svc.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext (fresh IV)', () => {
    const svc = makeService();
    const a = svc.encrypt('same');
    const b = svc.encrypt('same');
    expect(a).not.toBe(b); // different IV each time
  });

  it('throws on tampered ciphertext', () => {
    const svc = makeService();
    const parts = svc.encrypt('secret').split(':');
    parts[2] = 'ff'.repeat(parts[2].length / 2); // corrupt ciphertext
    expect(() => svc.decrypt(parts.join(':'))).toThrow();
  });

  it('throws if key length is wrong', () => {
    expect(() => new CryptoService({ getOrThrow: () => 'tooshort' } as never)).toThrow(
      'ENCRYPTION_KEY must be exactly 64 hex characters',
    );
  });
});

describe('CryptoService — AAD binding (v2)', () => {
  it('round-trips with the same AAD and uses the v2 prefix', () => {
    const svc = makeService();
    const enc = svc.encrypt('sk-secret', 'org1:target1:apiKey');
    expect(enc.split(':')[0]).toBe('v2');
    expect(enc.split(':').length).toBe(4);
    expect(svc.decrypt(enc, 'org1:target1:apiKey')).toBe('sk-secret');
    expect(svc.decryptBound(enc, 'org1:target1:apiKey')).toBe('sk-secret');
  });

  it('fails when the ciphertext is moved to another org/record (wrong AAD)', () => {
    const svc = makeService();
    const enc = svc.encrypt('sk-secret', 'org1:target1:apiKey');
    expect(() => svc.decrypt(enc, 'org2:target1:apiKey')).toThrow();
  });

  it('requires an AAD to decrypt a v2 value', () => {
    const svc = makeService();
    const enc = svc.encrypt('x', 'a');
    expect(() => svc.decrypt(enc)).toThrow('AAD required');
  });

  it('keeps legacy 3-part values readable', () => {
    const svc = makeService();
    const legacy = svc.encrypt('legacy');
    expect(svc.decrypt(legacy)).toBe('legacy');
  });

  it('decryptBound rejects unbound legacy values', () => {
    const svc = makeService();
    expect(() => svc.decryptBound(svc.encrypt('legacy'), 'any')).toThrow('not bound');
  });
});

describe('CryptoService — key validation', () => {
  it('rejects a 64-char key that is not hex', () => {
    expect(() => new CryptoService({ getOrThrow: () => 'z'.repeat(64) } as never)).toThrow(
      'ENCRYPTION_KEY must be exactly 64 hex characters',
    );
  });
});
