import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const PORTAL_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface PortalTokenPayload {
  type: 'portal';
  projectId: string;
  orgId: string;
}

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async generatePortalToken(projectId: string, orgId: string): Promise<{ token: string; expiresAt: string }> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const payload: PortalTokenPayload = { type: 'portal', projectId, orgId };
    const token = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: PORTAL_TOKEN_TTL_SECONDS,
    });

    const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_SECONDS * 1000).toISOString();
    return { token, expiresAt };
  }

  private verifyToken(token: string): PortalTokenPayload {
    try {
      const payload = this.jwt.verify<PortalTokenPayload>(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== 'portal') throw new Error('Wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired portal link');
    }
  }

  async getSummary(token: string) {
    const { projectId, orgId } = this.verifyToken(token);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId, status: 'ACTIVE' },
      select: {
        id: true, name: true, description: true, createdAt: true,
        organization: { select: { name: true, logoUrl: true } },
        targets: { select: { value: true, type: true }, where: { verificationStatus: 'VERIFIED' } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const findings = await this.prisma.finding.groupBy({
      by: ['severity', 'status'],
      where: { projectId, organizationId: orgId },
      _count: true,
    });

    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const row of findings) {
      bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + row._count;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + row._count;
    }

    const totalFindings = Object.values(bySeverity).reduce((a, b) => a + b, 0);
    const openFindings = (byStatus['OPEN'] ?? 0) + (byStatus['IN_PROGRESS'] ?? 0);
    const resolvedFindings = byStatus['RESOLVED'] ?? 0;

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        organization: project.organization,
        targets: project.targets,
      },
      stats: {
        totalFindings,
        openFindings,
        resolvedFindings,
        bySeverity: severityOrder.reduce<Record<string, number>>((acc, s) => {
          acc[s] = bySeverity[s] ?? 0;
          return acc;
        }, {}),
      },
    };
  }

  async getFindings(token: string, severity?: string, status?: string) {
    const { projectId, orgId } = this.verifyToken(token);

    const where: Record<string, unknown> = { projectId, organizationId: orgId };
    if (severity) where['severity'] = severity;
    if (status) where['status'] = status;
    else where['status'] = { notIn: ['FALSE_POSITIVE'] };

    const findings = await this.prisma.finding.findMany({
      where,
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        cvssScore: true,
        cveIds: true,
        aiRemediation: true,
        retestStatus: true,
        createdAt: true,
        updatedAt: true,
        // Exclude internal fields: internalNotes, raw scanner output, orgId
        target: { select: { value: true, type: true } },
      },
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Public response schema exposes the AI remediation text as "recommendation"
    return findings.map(({ aiRemediation, ...rest }) => ({ ...rest, recommendation: aiRemediation }));
  }

  async getFinding(token: string, findingId: string) {
    const { projectId, orgId } = this.verifyToken(token);

    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, projectId, organizationId: orgId },
      select: {
        id: true,
        title: true,
        description: true,
        severity: true,
        status: true,
        cvssScore: true,
        cveIds: true,
        epssScore: true,
        kevListed: true,
        aiRemediation: true,
        retestStatus: true,
        createdAt: true,
        updatedAt: true,
        target: { select: { value: true, type: true } },
        // Explicitly exclude internalNotes — not selected
      },
    });

    if (!finding) throw new NotFoundException('Finding not found');
    const { aiRemediation, ...rest } = finding;
    return { ...rest, recommendation: aiRemediation };
  }
}
