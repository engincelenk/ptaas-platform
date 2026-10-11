import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as argon2 from 'argon2';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';

// Standard TOTP settings (RFC 6238)
authenticator.options = {
  window: 1,     // accept ±1 step to account for clock skew
  step: 30,      // 30-second window
  digits: 6,
};

export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];         // plaintext — shown to user once
  backupCodeHashes: string[];    // Argon2id hashes — stored in DB
}

@Injectable()
export class MfaService {
  async generateSetup(email: string): Promise<MfaSetupResult> {
    const secret = authenticator.generateSecret(32);
    const otpauthUrl = authenticator.keyuri(email, 'PTaaS', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    const { plainCodes, hashedCodes } = await this.generateBackupCodes();

    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl,
      backupCodes: plainCodes,
      backupCodeHashes: hashedCodes,
    };
  }

  verifyTotp(secret: string, token: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }

  async verifyBackupCode(
    plainCode: string,
    hashedCodes: string[],
  ): Promise<{ valid: boolean; remainingHashes: string[] }> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const match = await argon2.verify(hashedCodes[i], plainCode);
      if (match) {
        const remainingHashes = [...hashedCodes];
        remainingHashes.splice(i, 1);
        return { valid: true, remainingHashes };
      }
    }
    return { valid: false, remainingHashes: hashedCodes };
  }

  async generateBackupCodes(): Promise<{
    plainCodes: string[];
    hashedCodes: string[];
  }> {
    const plainCodes = Array.from({ length: 8 }, () =>
      randomBytes(4).toString('hex').toUpperCase(),
    );

    const hashedCodes = await Promise.all(
      plainCodes.map((code) =>
        argon2.hash(code, {
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4,
        }),
      ),
    );

    return { plainCodes, hashedCodes };
  }
}
