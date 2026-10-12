import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@ptaas/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CryptoService } from '../../crypto/crypto.service';
import { SsrfGuardService } from '../../ssrf/ssrf-guard.service';
import { VerificationService } from '../../targets/verification.service';
import { isVerificationFresh } from '../../targets/verification-ttl';
import { ARENA_LIMITS, isProviderHost } from '../arena.constants';
import type {
  ArenaEnvironmentName,
  ArenaTargetKindName,
  AttestTargetDto,
  CreateAiTargetDto,
  UpdateAiTargetDto,
  VerificationMethodName,
} from '../dto/arena.dto';
import { assertHeaderName, assertMapping } from './ai-target-validation';
import { hostOfUrl, validateKindConfig } from './ai-target-config';
import type { AiTargetView, ArenaActor, RequestMeta, VerificationView } from './arena-views';

const VERIFICATION_PREFIX = 'ptaas-verify';

type AiTargetWithTarget = Prisma.AiTargetGetPayload<{ include: { target: true } }>;

/** AAD that binds a ciphertext to organization, record and field. */
export function aiTargetAad(organizationId: string, aiTargetId: string, field: 'apiKey' | 'knownPromptFragments'): string {
  return `${organizationId}:${aiTargetId}:${field}`;
}

export { assertHeaderName, assertMapping, MAPPING_MAX_BYTES, MAPPING_MAX_DEPTH } from './ai-target-validation';

const CONFIG_FIELDS = [
  'kind',
  'environment',
  'ragConfig',
  'agentConfig',
  'widgetConfig',
  'endpointUrl',
  'adapter',
  'requestMapping',
  'responseMapping',
  'authHeaderName',
  'apiKey',
  'knownPromptFragments',
] as const;
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

    this.assertConfig(dto);
    const url = await this.assertEndpoint(dto.endpointUrl);
    const value = url.toString();
    const kind: ArenaTargetKindName = dto.kind ?? 'CHAT';
    const environment: ArenaEnvironmentName = dto.environment ?? (kind === 'AGENT' ? 'STAGING' : 'PRODUCTION');
    const kindCfg = await validateKindConfig(
      { kind, adapter: dto.adapter, environment, authHeaderName: dto.authHeaderName, ragConfig: dto.ragConfig, agentConfig: dto.agentConfig, widgetConfig: dto.widgetConfig },
      url.hostname,
      (h) => this.ssrfGuard.resolveSafe(h),
    );

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
      kind,
      environment,
      ragConfig: (kindCfg.ragConfig as Prisma.InputJsonValue | null) ?? undefined,
      agentConfig: (kindCfg.agentConfig as Prisma.InputJsonValue | null) ?? undefined,
      widgetConfig: (kindCfg.widgetConfig as Prisma.InputJsonValue | null) ?? undefined,
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
      metadata: { host: url.hostname, adapter: dto.adapter, kind, environment, hasApiKey: Boolean(dto.apiKey) },
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
    this.assertConfig(dto);
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

    let endpointHost = hostOfUrl(current.target.value);
    if (dto.endpointUrl !== undefined) {
      const url = await this.assertEndpoint(dto.endpointUrl);
      endpointHost = url.hostname;
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

    const provided = (...fields: (keyof UpdateAiTargetDto)[]): boolean => fields.some((f) => dto[f] !== undefined);
    if (provided('kind', 'environment', 'adapter', 'ragConfig', 'agentConfig', 'widgetConfig', 'endpointUrl', 'authHeaderName')) {
      const kind = (dto.kind ?? current.kind) as ArenaTargetKindName;
      const kindCfg = await validateKindConfig(
        {
          kind,
          adapter: (dto.adapter ?? current.adapter) as CreateAiTargetDto['adapter'],
          environment: (dto.environment ?? current.environment) as ArenaEnvironmentName,
          authHeaderName: dto.authHeaderName ?? current.authHeaderName,
          ragConfig: dto.ragConfig ?? (kind === 'RAG' ? current.ragConfig : null),
          agentConfig: dto.agentConfig ?? (kind === 'AGENT' ? current.agentConfig : null),
          widgetConfig: dto.widgetConfig ?? (kind === 'WIDGET' ? current.widgetConfig : null),
        },
        endpointHost,
        (h) => this.ssrfGuard.resolveSafe(h),
      );
      if (dto.kind !== undefined) data.kind = dto.kind;
      if (dto.environment !== undefined) data.environment = dto.environment;
      data.ragConfig = (kindCfg.ragConfig as Prisma.InputJsonValue | null) ?? Prisma.DbNull;
      data.agentConfig = (kindCfg.agentConfig as Prisma.InputJsonValue | null) ?? Prisma.DbNull;
      data.widgetConfig = (kindCfg.widgetConfig as Prisma.InputJsonValue | null) ?? Prisma.DbNull;
    }

    // Attestations only hold for the configuration they were given for.
    if (provided('kind', 'ragConfig', 'endpointUrl')) data.ragDocsPlacedAt = null;
    if (provided('kind', 'environment', 'agentConfig', 'endpointUrl', 'adapter', 'apiKey')) {
      data.stagingConfirmedAt = null;
      data.sandboxAttestedAt = null;
    }

    // Any change of the tested configuration voids approvals given for the old one.
    const configChanged = CONFIG_FIELDS.some((f) => dto[f] !== undefined);

    let row: AiTargetWithTarget;
    let resetRuns = 0;
    try {
      ({ row, resetRuns } = await this.prisma.$transaction(async (tx) => {
        if (configChanged) {
          const running = await tx.arenaRun.count({ where: { aiTargetId: id, organizationId: org, status: 'RUNNING' } });
          if (running > 0) {
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              code: 'TARGET_BUSY',
              message: 'A run is currently running against this target — configuration cannot be changed',
            });
          }
        }
        const updated = await tx.aiTarget.update({ where: { id }, data, include: { target: true } });
        let count = 0;
        if (configChanged) {
          const res = await tx.arenaRun.updateMany({
            where: { aiTargetId: id, organizationId: org, status: { in: ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED'] } },
            data: {
              status: 'DRAFT',
              approvedById: null,
              approvedByName: null,
              approvedAt: null,
              roeId: null,
              emergencyContact: null,
            },
          });
          count = res.count;
        }
        return { row: updated, resetRuns: count };
      }));
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
        approvalsReset: resetRuns,
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

  /**
   * Customer attestations (documents placed / staging / sandboxed tools). The timestamp is set first,
   * then the audit record is written; a failing audit write rolls the attestation back.
   *
   * Compare-and-set: the write only succeeds if the row is still the one that was validated
   * (same updatedAt, same kind, AGENT still STAGING); a concurrent PATCH makes it fail with
   * 409 CONFIG_CHANGED and nothing is set. The rollback is conditional in the same way.
   *
   * Role note (deliberate): SECURITY_ENGINEER may attest (operator action), but the run approval
   * stays ADMIN-only, so an attestation alone never starts a test.
   */
  async attest(id: string, dto: AttestTargetDto, actor: ArenaActor, meta: RequestMeta = {}): Promise<AiTargetView> {
    const org = actor.organizationId;
    const row = await this.load(id, org);
    const names: string[] = [];
    if (dto.ragDocsPlaced) names.push('ragDocsPlaced');
    if (dto.stagingConfirmed) names.push('stagingConfirmed');
    if (dto.sandboxAttested) names.push('sandboxAttested');
    if (names.length === 0) throw new BadRequestException('No attestation given');
    if (dto.ragDocsPlaced && row.kind !== 'RAG') throw new BadRequestException('ragDocsPlaced applies to RAG targets only');
    if ((dto.stagingConfirmed || dto.sandboxAttested) && row.kind !== 'AGENT') {
      throw new BadRequestException('stagingConfirmed/sandboxAttested apply to AGENT targets only');
    }
    if (dto.stagingConfirmed && row.environment !== 'STAGING') {
      throw new BadRequestException('Set the environment to STAGING before confirming staging');
    }

    const now = new Date();
    const data: Prisma.AiTargetUpdateInput = {};
    const previous: Prisma.AiTargetUpdateInput = {};
    if (dto.ragDocsPlaced) {
      data.ragDocsPlacedAt = now;
      previous.ragDocsPlacedAt = row.ragDocsPlacedAt;
    }
    if (dto.stagingConfirmed) {
      data.stagingConfirmedAt = now;
      previous.stagingConfirmedAt = row.stagingConfirmedAt;
    }
    if (dto.sandboxAttested) {
      data.sandboxAttestedAt = now;
      previous.sandboxAttestedAt = row.sandboxAttestedAt;
    }
    const stamp = new Date(); // explicit updatedAt: identifies our own write for the conditional rollback
    const cas = await this.prisma.aiTarget.updateMany({
      where: {
        id,
        organizationId: org,
        updatedAt: row.updatedAt,
        kind: row.kind,
        ...(row.kind === 'AGENT' ? { environment: 'STAGING' as const } : {}),
      },
      data: { ...data, updatedAt: stamp },
    });
    if (cas.count === 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'CONFIG_CHANGED',
        message: 'The target configuration changed meanwhile — reload and try again',
      });
    }
    try {
      await this.audit.logStrict({
        action: 'arena.target.attested',
        userId: actor.userId,
        organizationId: org,
        resource: 'ai_target',
        resourceId: id,
        metadata: { attestations: names, kind: row.kind, environment: row.environment },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    } catch {
      await this.prisma.aiTarget.updateMany({
        where: { id, organizationId: org, updatedAt: stamp },
        data: previous as Prisma.AiTargetUncheckedUpdateManyInput,
      });
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'AUDIT_FAILED',
        message: 'The audit record could not be written — the attestation was not saved',
      });
    }
    return this.toView(await this.load(id, org));
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

  private assertConfig(dto: {
    authHeaderName?: string;
    requestMapping?: Record<string, unknown>;
    responseMapping?: Record<string, unknown>;
  }): void {
    if (dto.authHeaderName) assertHeaderName(dto.authHeaderName.trim());
    if (dto.requestMapping !== undefined) assertMapping(dto.requestMapping, 'requestMapping');
    if (dto.responseMapping !== undefined) assertMapping(dto.responseMapping, 'responseMapping');
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
      kind: row.kind,
      environment: row.environment,
      ragConfig: asRecord(row.ragConfig),
      agentConfig: asRecord(row.agentConfig),
      widgetConfig: asRecord(row.widgetConfig),
      attestations: {
        ragDocsPlacedAt: row.ragDocsPlacedAt?.toISOString() ?? null,
        stagingConfirmedAt: row.stagingConfirmedAt?.toISOString() ?? null,
        sandboxAttestedAt: row.sandboxAttestedAt?.toISOString() ?? null,
      },
      configWarnings: configWarnings(row),
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function configWarnings(row: { kind: string; ragConfig: unknown; agentConfig: unknown }): string[] {
  const out: string[] = [];
  const rag = asRecord(row.ragConfig);
  if (row.kind === 'RAG' && rag?.mode === 'AUTO' && !rag.delete) {
    out.push('No delete configuration: planted test documents will have to be removed manually.');
  }
  if (row.kind === 'AGENT' && !asRecord(row.agentConfig)?.dryRunHeaderName) {
    out.push('No dry-run header configured: rely on a sandboxed staging environment.');
  }
  return out;
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
