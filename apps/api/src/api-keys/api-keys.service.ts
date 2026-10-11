import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const KEY_PREFIX_PUBLIC = 'ptaas_';
const KEY_BYTES = 32;

export interface CreateApiKeyDto {
  name: string;
  scopes?: string[];
  expiresAt?: string;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateApiKeyDto) {
    const rawKey = KEY_PREFIX_PUBLIC + crypto.randomBytes(KEY_BYTES).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        organizationId: orgId,
        createdById: userId,
        name: dto.name,
        keyHash,
        keyPrefix,
        scopes: dto.scopes ?? [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return { ...this.sanitize(apiKey), key: rawKey };
  }

  async list(orgId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId: orgId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true } } },
    });
    return keys.map((k) => ({ ...this.sanitize(k), createdByName: k.createdBy.name }));
  }

  async revoke(id: string, orgId: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, organizationId: orgId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.update({ where: { id, organizationId: orgId }, data: { revokedAt: new Date() } });
  }

  /** Validates a raw API key and returns the resolved orgId + userId for auth. */
  async validate(rawKey: string): Promise<{ orgId: string; userId: string; scopes: string[] }> {
    if (!rawKey.startsWith(KEY_PREFIX_PUBLIC)) throw new UnauthorizedException('Invalid API key');

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findFirst({ where: { keyHash, revokedAt: null } });

    if (!apiKey) throw new UnauthorizedException('Invalid or revoked API key');
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }

    // Fire-and-forget update of lastUsedAt
    this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    return { orgId: apiKey.organizationId, userId: apiKey.createdById, scopes: apiKey.scopes };
  }

  private sanitize(k: { id: string; name: string; keyPrefix: string; scopes: string[]; expiresAt: Date | null; lastUsedAt: Date | null; createdAt: Date }) {
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    };
  }
}
