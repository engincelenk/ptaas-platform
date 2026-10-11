import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;    // 96-bit IV (GCM standard)
const AUTH_TAG_BYTES = 16;

/**
 * AES-256-GCM symmetric encryption for scan credentials.
 *
 * Storage format: "iv_hex:authtag_hex:ciphertext_hex"
 *
 * Key is sourced exclusively from ENCRYPTION_KEY env var (32 bytes = 64 hex chars).
 * Never log, never store the key — only in Docker Secret / env.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const hexKey = config.getOrThrow<string>('ENCRYPTION_KEY');
    if (hexKey.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
          'Generate with: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      iv.toString('hex'),
      authTag.toString('hex'),
      ciphertext.toString('hex'),
    ].join(':');
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException('Invalid encrypted credential format');
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
      return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
    } catch {
      // Auth tag mismatch = tampering or wrong key
      throw new InternalServerErrorException('Credential decryption failed — integrity check error');
    }
  }
}
