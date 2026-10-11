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
