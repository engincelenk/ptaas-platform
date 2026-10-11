import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as net from 'net';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SsrfGuardService } from '../ssrf/ssrf-guard.service';
import type { CreateTargetDto } from './dto/target.dto';

const VERIFICATION_PREFIX = 'ptaas-verify';

@Injectable()
export class TargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ssrfGuard: SsrfGuardService,
  ) {}

  async create(
    projectId: string,
    dto: CreateTargetDto,
    userId: string,
    orgId: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.assertProjectOwnership(projectId, orgId);
    await this.validateTargetValue(dto.type, dto.value);

    const token = createId();

    try {
      const target = await this.prisma.target.create({
        data: {
          type: dto.type,
          value: dto.value.toLowerCase().trim(),
          verificationToken: token,
          projectId,
          organizationId: orgId,
          createdById: userId,
        },
      });

      await this.audit.log({
        action: 'target.created',
        userId,
        organizationId: orgId,
        resource: 'target',
        resourceId: target.id,
        metadata: { type: dto.type, value: dto.value },
        ipAddress: ip,
        userAgent,
      });

      return { ...target, verificationInstructions: this.buildInstructions(target.value, token) };
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'P2002') {
        throw new ConflictException('This target already exists in the project');
      }
      throw err;
    }
  }

  async findAllForProject(projectId: string, orgId: string) {
    await this.assertProjectOwnership(projectId, orgId);
    return this.prisma.target.findMany({
      where: { projectId, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const target = await this.prisma.target.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!target) throw new NotFoundException('Target not found');
    return target;
  }

  async delete(id: string, userId: string, orgId: string, ip?: string, userAgent?: string) {
    const target = await this.findOne(id, orgId);
    await this.prisma.target.delete({ where: { id, organizationId: orgId } });
    await this.audit.log({
      action: 'target.deleted',
      userId,
      organizationId: orgId,
      resource: 'target',
      resourceId: id,
      metadata: { value: target.value },
      ipAddress: ip,
      userAgent,
    });
  }

  getVerificationInstructions(target: { value: string; verificationToken: string }) {
    return this.buildInstructions(target.value, target.verificationToken);
  }

  // ── SSRF + input validation ──────────────────────────

  private async validateTargetValue(
    type: CreateTargetDto['type'],
    value: string,
  ): Promise<void> {
    const trimmed = value.trim().toLowerCase();

    switch (type) {
      case 'DOMAIN':
      case 'SUBDOMAIN': {
        if (!isValidDomain(trimmed)) {
          throw new BadRequestException(`Invalid domain: ${value}`);
        }
        await this.ssrfGuard.assertSafeHost(trimmed);
        break;
      }

      case 'IP': {
        if (!net.isIP(trimmed)) {
          throw new BadRequestException(`Invalid IP address: ${value}`);
        }
        await this.ssrfGuard.assertSafeHost(trimmed);
        break;
      }

      case 'IP_RANGE': {
        if (!isValidCidr(trimmed)) {
          throw new BadRequestException(`Invalid CIDR: ${value}`);
        }
        this.ssrfGuard.assertSafeCidr(trimmed);
        break;
      }

      case 'URL': {
        await this.ssrfGuard.assertSafeUrl(trimmed);
        break;
      }
    }
  }

  private buildInstructions(domain: string, token: string) {
    const tokenValue = `${VERIFICATION_PREFIX}=${token}`;
    return {
      DNS_TXT: {
        description: `Add a DNS TXT record to ${domain}`,
        record: { type: 'TXT', name: domain, value: tokenValue },
      },
      HTTP_FILE: {
        description: `Host a file at https://${domain}/.well-known/ptaas-verify.txt`,
        url: `https://${domain}/.well-known/ptaas-verify.txt`,
        content: tokenValue,
      },
      META_TAG: {
        description: `Add this meta tag to the <head> of https://${domain}/`,
        tag: `<meta name="ptaas-verify" content="${token}">`,
      },
    };
  }

  private async assertProjectOwnership(projectId: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}

// ── Input validation helpers ────────────────────────────────────────

function isValidDomain(domain: string): boolean {
  const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  const parts = domain.split('.');
  if (parts.length < 2) return false;
  return parts.every((p) => label.test(p));
}

function isValidCidr(cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;
  const [ip, bits] = parts;
  const prefix = parseInt(bits, 10);
  if (isNaN(prefix)) return false;
  if (net.isIPv4(ip)) return prefix >= 0 && prefix <= 32;
  if (net.isIPv6(ip)) return prefix >= 0 && prefix <= 128;
  return false;
}
