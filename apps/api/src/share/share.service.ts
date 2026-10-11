import { Injectable, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';

export interface CreateShareTokenDto {
  label?: string;
  password?: string;
  expiresInDays?: number;
}

@Injectable()
export class ShareService {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(projectId: string, orgId: string, userId: string, dto: CreateShareTokenDto) {
    // Verify project belongs to org
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const token = randomBytes(32).toString('hex');
    const passwordHash = dto.password
      ? createHash('sha256').update(dto.password).digest('hex')
      : null;
    const days = Math.min(Math.max(dto.expiresInDays ?? 7, 1), 90);
    const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);

    const share = await this.prisma.shareToken.create({
      data: { token, projectId, createdById: userId, passwordHash, label: dto.label, expiresAt },
      select: { id: true, token: true, label: true, expiresAt: true, createdAt: true },
    });

    return { ...share, projectName: project.name };
  }

  async listTokens(projectId: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.shareToken.findMany({
      where: { projectId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true, token: true, label: true, expiresAt: true, createdAt: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeToken(tokenId: string, projectId: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    await this.prisma.shareToken.updateMany({
      where: { id: tokenId, projectId },
      data: { revokedAt: new Date() },
    });
  }

  async getPublicReport(token: string, password?: string) {
    const share = await this.prisma.shareToken.findUnique({
      where: { token },
      select: {
        id: true,
        passwordHash: true,
        expiresAt: true,
        revokedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            organization: { select: { name: true } },
            findings: {
              where: { status: { notIn: ['FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
              select: {
                id: true,
                title: true,
                severity: true,
                status: true,
                owasp: true,
                cvssScore: true,
                description: true,
                aiRemediation: true,
                createdAt: true,
              },
              orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
              take: 200,
            },
          },
        },
      },
    });

    if (!share) throw new NotFoundException('Report not found');
    if (share.revokedAt) throw new ForbiddenException('This share link has been revoked');
    if (share.expiresAt < new Date()) throw new ForbiddenException('This share link has expired');

    if (share.passwordHash) {
      if (!password) throw new UnauthorizedException('Password required');
      const hash = createHash('sha256').update(password).digest('hex');
      if (hash !== share.passwordHash) throw new UnauthorizedException('Incorrect password');
    }

    const { project } = share;
    const findings = project.findings;

    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of findings) counts[f.severity as keyof typeof counts] = (counts[f.severity as keyof typeof counts] ?? 0) + 1;

    const riskScore = Math.min(
      Math.round(
        (counts.CRITICAL * 10 + counts.HIGH * 5 + counts.MEDIUM * 2 + counts.LOW * 0.5) /
          Math.max(findings.length, 1),
      ) * 10,
      100,
    );

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        organization: project.organization.name,
        generatedAt: new Date().toISOString(),
        expiresAt: share.expiresAt,
      },
      summary: { total: findings.length, riskScore, ...counts },
      findings: findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        owaspCategory: f.owasp,
        cvssScore: f.cvssScore,
        description: f.description,
        remediation: f.aiRemediation ?? null,
      })),
      passwordProtected: !!share.passwordHash,
    };
  }
}
