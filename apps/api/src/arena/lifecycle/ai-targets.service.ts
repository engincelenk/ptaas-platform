import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@ptaas/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CryptoService } from '../../crypto/crypto.service';
import { SsrfGuardService } from '../../ssrf/ssrf-guard.service';
import { VerificationService } from '../../targets/verification.service';
import { isVerificationFresh } from '../../targets/verification-ttl';
import { ARENA_LIMITS, PROVIDER_HOST_DENYLIST } from '../arena.constants';
import type { CreateAiTargetDto, UpdateAiTargetDto, VerificationMethodName } from '../dto/arena.dto';
import type { AiTargetView, ArenaActor, RequestMeta, VerificationView } from './arena-views';

const VERIFICATION_PREFIX = 'ptaas-verify';

type AiTargetWithTarget = Prisma.AiTargetGetPayload<{ include: { target: true } }>;

/** AAD that binds a ciphertext to organization, record and field. */
export function aiTargetAad(organizationId: string, aiTargetId: string, field: 'apiKey' | 'knownPromptFragments'): string {
  return `${organizationId}:${aiTargetId}:${field}`;
}

export function isProviderHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return PROVIDER_HOST_DENYLIST.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Syntactic endpoint validation (no network): https only, port 443, no credentials,
 * host not a model-provider host. Returns the normalized URL (no fragment).
 */
export function parseArenaEndpoint(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Endpoint URL is invalid');
  }
  if (url.protocol !== 'https:') throw new BadRequestException('Only https endpoints are allowed');
  if (url.username || url.password) throw new BadRequestException('Credentials in the endpoint URL are not allowed');
  if (url.port !== '' && url.port !== '443') throw new BadRequestException('Only port 443 is allowed');
  if (!url.hostname) throw new BadRequestException('Endpoint URL has no host');
  if (isProviderHost(url.hostname)) {
    throw new BadRequestException(
      'Model-provider hosts cannot be tested here — enter the endpoint of your own application',
    );
  }
  url.hash = '';
  return url;
}

@Injectable()
export class AiTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly ssrfGuard: SsrfGuardService,
    private readonly verification: VerificationService,
  ) {}

  // ── Secrets (engine) ─────────────────────────────────

  /** Decrypts the stored secrets. Throws NotFoundException for foreign organizations. */
  async getSecrets(
    aiTargetId: string,
    organizationId: string,
  ): Promise<{ apiKey?: string; knownPromptFragments?: string[] }> {
    const row = await this.prisma.aiTarget.findFirst({ where: { id: aiTargetId, organizationId } });
    if (!row) throw new NotFoundException('AI target not found');
    return {
      apiKey: row.apiKeyEncrypted
        ? this.crypto.decryptBound(row.apiKeyEncrypted, aiTargetAad(organizationId, row.id, 'apiKey'))
        : undefined,
      knownPromptFragments: row.knownPromptFragmentsEncrypted
        ? this.decryptFragments(row.knownPromptFragmentsEncrypted, organizationId, row.id)
        : undefined,
    };
  }

  // ── CRUD ─────────────────────────────────────────────

  async create(dto: CreateAiTargetDto, actor: ArenaActor, meta: RequestMeta = {}): Promise<AiTargetView> {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, organizationId: actor.organizationId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const url = await this.assertEndpoint(dto.endpointUrl);
    const value = url.toString();

    const existing = await this.prisma.target.findFirst({
      where: { projectId: dto.projectId, value, organizationId: actor.organizationId },
      include: { aiTarget: true },
    });
    if (existing?.aiTarget) throw new ConflictException('This endpoint is already registered in the project');
    if (existing && existing.type !== 'URL') throw new ConflictException('This value already exists as another target type');

    const id = createId();
    const org = actor.organizationId;
    const data: Prisma.AiTargetCreateInput = {
      id,
      name: dto.name.trim(),
      adapter: dto.adapter,
      requestMapping: (dto.requestMapping as Prisma.InputJsonValue | undefined) ?? undefined,
      responseMapping: (dto.responseMapping as Prisma.InputJsonValue | undefined) ?? undefined,
      authHeaderName: dto.authHeaderName?.trim() || null,
      apiKeyEncrypted: dto.apiKey ? this.crypto.encrypt(dto.apiKey, aiTargetAad(org, id, 'apiKey')) : null,
      knownPromptFragmentsEncrypted: this.encryptFragments(dto.knownPromptFragments, org, id),
      organization: { connect: { id: org } },
      createdBy: { connect: { id: actor.userId } },
      target: existing
        ? { connect: { id: existing.id } }
        : {
            create: {
              type: 'URL',
              value,
              verificationToken: createId(),
              project: { connect: { id: dto.projectId } },
              organization: { connect: { id: org } },
              createdBy: { connect: { id: actor.userId } },
            },
          },
    };

    let row: AiTargetWithTarget;
    try {
      row = await this.prisma.aiTarget.create({ data, include: { target: true } });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('This endpoint is already registered in the project');
      }
      throw err;
    }

    await this.audit.log({
      action: 'arena.target.created',
      userId: actor.userId,
      organizationId: org,
      resource: 'ai_target',
      resourceId: row.id,
      metadata: { host: url.hostname, adapter: dto.adapter, hasApiKey: Boolean(dto.apiKey) },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.toView(row);
  }

  async list(organizationId: string): Promise<AiTargetView[]> {
    const rows = await this.prisma.aiTarget.findMany({
      where: { organizationId },
      include: { target: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  async get(id: string, organizationId: string): Promise<AiTargetView> {
    return this.toView(await this.load(id, organizationId));
  }

  async update(id: string, dto: UpdateAiTargetDto, actor: ArenaActor, meta: RequestMeta = {}): Promise<AiTargetView> {
    const org = actor.organizationId;
    const current = await this.load(id, org);
    const data: Prisma.AiTargetUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.adapter !== undefined) data.adapter = dto.adapter;
    if (dto.requestMapping !== undefined) data.requestMapping = dto.requestMapping as Prisma.InputJsonValue;
    if (dto.responseMapping !== undefined) data.responseMapping = dto.responseMapping as Prisma.InputJsonValue;
    if (dto.authHeaderName !== undefined) data.authHeaderName = dto.authHeaderName.trim() || null;
    if (dto.apiKey !== undefined) {
      data.apiKeyEncrypted = dto.apiKey ? this.crypto.encrypt(dto.apiKey, aiTargetAad(org, id, 'apiKey')) : null;
    }
    if (dto.knownPromptFragments !== undefined) {
      data.knownPromptFragmentsEncrypted = this.encryptFragments(dto.knownPromptFragments, org, id);
    }

    if (dto.endpointUrl !== undefined) {
      const url = await this.assertEndpoint(dto.endpointUrl);
      const value = url.toString();
      if (value !== current.target.value) {
        const sameHost = hostOf(current.target.value) === url.hostname;
        data.target = {
          update: {
            value,
            // A different host is a different owner: ownership must be proven again.
            ...(sameHost
              ? {}
              : { verificationStatus: 'PENDING', verificationMethod: null, verifiedAt: null, lastVerifiedAt: null }),
          },
        };
      }
    }

    let row: AiTargetWithTarget;
    try {
      row = await this.prisma.aiTarget.update({ where: { id }, data, include: { target: true } });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('This endpoint is already registered in the project');
      }
      throw err;
    }

    await this.audit.log({
      action: 'arena.target.updated',
      userId: actor.userId,
      organizationId: org,
      resource: 'ai_target',
      resourceId: id,
      metadata: {
        fields: Object.keys(dto).filter((k) => k !== 'apiKey' && k !== 'knownPromptFragments'),
        secretsChanged: dto.apiKey !== undefined || dto.knownPromptFragments !== undefined,
      },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.toView(row);
  }

  async remove(id: string, actor: ArenaActor, meta: RequestMeta = {}): Promise<void> {
    const org = actor.organizationId;
    await this.load(id, org);
    const running = await this.prisma.arenaRun.count({
      where: { aiTargetId: id, organizationId: org, status: 'RUNNING' },
    });
    if (running > 0) throw new ConflictException('A run is currently running against this target');

    // The underlying Target stays (scans/findings reference it); only the AI configuration + runs go.
    await this.prisma.aiTarget.delete({ where: { id } });
    await this.audit.log({
      action: 'arena.target.deleted',
      userId: actor.userId,
      organizationId: org,
      resource: 'ai_target',
      resourceId: id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // ── Verification ─────────────────────────────────────

  async getVerification(id: string, organizationId: string): Promise<VerificationView> {
    const { target } = await this.load(id, organizationId);
    const host = hostOf(target.value);
    const token = target.verificationToken;
    const tokenValue = `${VERIFICATION_PREFIX}=${token}`;
    return {
      status: target.verificationStatus,
      method: target.verificationMethod,
      verifiedAt: target.verifiedAt?.toISOString() ?? null,
      fresh: isVerificationFresh(target.verifiedAt),
      expiresAt: verificationExpiry(target.verifiedAt),
      token,
      instructions: {
        DNS_TXT: `Create a DNS TXT record on ${host} with the value: ${tokenValue}`,
        HTTP_FILE: `Serve https://${host}/.well-known/ptaas-verify.txt with exactly this content: ${tokenValue}`,
        META_TAG: `Add <meta name="ptaas-verify" content="${token}"> to the <head> of https://${host}/`,
      },
    };
  }

  async verify(
    id: string,
    method: VerificationMethodName,
    actor: ArenaActor,
    meta: RequestMeta = {},
  ): Promise<{ success: boolean; message: string }> {
    const row = await this.load(id, actor.organizationId);
    // The endpoint may have been stored before the denylist changed — re-check on every verification.
    if (isProviderHost(hostOf(row.target.value))) {
      throw new BadRequestException('Model-provider hosts cannot be verified');
    }
    return this.verification.verify(
      row.targetId,
      method,
      actor.organizationId,
      actor.userId,
      meta.ip,
      meta.userAgent,
    );
  }

  // ── Helpers ──────────────────────────────────────────

  /** Full endpoint validation including the SSRF resolution check. */
  async assertEndpoint(raw: string): Promise<URL> {
    const url = parseArenaEndpoint(raw);
    await this.ssrfGuard.resolveSafe(url.hostname);
    return url;
  }

  private async load(id: string, organizationId: string): Promise<AiTargetWithTarget> {
    const row = await this.prisma.aiTarget.findFirst({
      where: { id, organizationId },
      include: { target: true },
    });
    if (!row) throw new NotFoundException('AI target not found');
    return row;
  }

  private encryptFragments(fragments: string[] | undefined, org: string, id: string): string | null {
    const clean = (fragments ?? []).map((f) => f.trim()).filter((f) => f.length > 0);
    if (clean.length === 0) return null;
    return this.crypto.encrypt(JSON.stringify(clean), aiTargetAad(org, id, 'knownPromptFragments'));
  }

  private decryptFragments(enc: string, org: string, id: string): string[] {
    const parsed: unknown = JSON.parse(
      this.crypto.decryptBound(enc, aiTargetAad(org, id, 'knownPromptFragments')),
    );
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  }

  private fragmentCount(row: AiTargetWithTarget): number {
    if (!row.knownPromptFragmentsEncrypted) return 0;
    try {
      return this.decryptFragments(row.knownPromptFragmentsEncrypted, row.organizationId, row.id).length;
    } catch {
      return 0;
    }
  }

  /** Public view. Secrets are never included — only presence flags. */
  toView(row: AiTargetWithTarget): AiTargetView {
    const t = row.target;
    return {
      id: row.id,
      targetId: row.targetId,
      projectId: t.projectId,
      name: row.name,
      endpointUrl: t.value,
      adapter: row.adapter,
      authHeaderName: row.authHeaderName,
      hasApiKey: Boolean(row.apiKeyEncrypted),
      fragmentCount: this.fragmentCount(row),
      canaryPlacedAt: row.canaryPlacedAt?.toISOString() ?? null,
      verification: {
        status: t.verificationStatus,
        fresh: t.verificationStatus === 'VERIFIED' && isVerificationFresh(t.verifiedAt),
        verifiedAt: t.verifiedAt?.toISOString() ?? null,
        expiresAt: verificationExpiry(t.verifiedAt),
      },
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function verificationExpiry(verifiedAt: Date | null): string | null {
  if (!verifiedAt) return null;
  return new Date(verifiedAt.getTime() + ARENA_LIMITS.verificationTtlDays * 86_400_000).toISOString();
}
