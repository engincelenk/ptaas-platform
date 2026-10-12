import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;    // 96-bit IV (GCM standard)
const AUTH_TAG_BYTES = 16;
const BOUND_VERSION = 'v2';

/**
 * AES-256-GCM symmetric encryption for scan credentials and integration/AI secrets.
 *
 * Formats:
 *   legacy: "iv_hex:authtag_hex:ciphertext_hex"          (no AAD, still readable)
 *   bound:  "v2:iv_hex:authtag_hex:ciphertext_hex"       (AAD-bound, e.g. "orgId:recordId:field")
 *
 * AAD ties a ciphertext to its owner: copying it to another org/record fails the
 * GCM integrity check. New code storing tenant secrets should always pass an AAD
 * and read with decryptBound().
 *
 * Key is sourced exclusively from ENCRYPTION_KEY env var (32 bytes = 64 hex chars).
 * Never log, never store the key — only in Docker Secret / env.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const hexKey = config.getOrThrow<string>('ENCRYPTION_KEY');
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error(
        'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
          'Generate with: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plaintext: string, aad?: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const parts = [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')];
    return (aad !== undefined ? [BOUND_VERSION, ...parts] : parts).join(':');
  }

  decrypt(encrypted: string, aad?: string): string {
    const parts = encrypted.split(':');
    const bound = parts.length === 4 && parts[0] === BOUND_VERSION;
    if (bound) parts.shift();
    else if (parts.length !== 3) {
      throw new InternalServerErrorException('Invalid encrypted credential format');
    }
    if (bound && aad === undefined) {
      throw new InternalServerErrorException('AAD required to decrypt this credential');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new InternalServerErrorException('Malformed encrypted credential');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      if (bound) decipher.setAAD(Buffer.from(aad as string, 'utf8'));
      return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
    } catch {
      // Auth tag mismatch = tampering, wrong key or wrong AAD (moved ciphertext)
      throw new InternalServerErrorException('Credential decryption failed — integrity check error');
    }
  }

  /** Like decrypt(), but refuses legacy (unbound) values. Use for AAD-protected secrets. */
  decryptBound(encrypted: string, aad: string): string {
    const parts = encrypted.split(':');
    if (!(parts.length === 4 && parts[0] === BOUND_VERSION)) {
      throw new InternalServerErrorException('Credential is not bound to an owner (AAD)');
    }
    return this.decrypt(encrypted, aad);
  }
}
