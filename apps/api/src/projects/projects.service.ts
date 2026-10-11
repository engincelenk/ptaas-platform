import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateProjectDto,
    userId: string,
    orgId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        organizationId: orgId,
        createdById: userId,
      },
    });

    await this.audit.log({
      action: 'project.created',
      userId,
      organizationId: orgId,
      resource: 'project',
      resourceId: project.id,
      metadata: { name: project.name },
      ipAddress: ip,
      userAgent,
    });

    return project;
  }

  async findAll(orgId: string) {
    return this.prisma.project.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      include: {
        _count: { select: { targets: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: orgId },
      include: {
        targets: { orderBy: { createdAt: 'desc' } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { targets: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    userId: string,
    orgId: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.assertExists(id, orgId);

    const updated = await this.prisma.project.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
    });

    await this.audit.log({
      action: 'project.updated',
      userId,
      organizationId: orgId,
      resource: 'project',
      resourceId: id,
      metadata: dto as Record<string, unknown>,
      ipAddress: ip,
      userAgent,
    });

    return updated;
  }

  async archive(id: string, userId: string, orgId: string, ip?: string, userAgent?: string) {
    await this.assertExists(id, orgId);

    const updated = await this.prisma.project.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await this.audit.log({
      action: 'project.archived',
      userId,
      organizationId: orgId,
      resource: 'project',
      resourceId: id,
      ipAddress: ip,
      userAgent,
    });

    return updated;
  }

  async portfolio(orgId: string) {
    const SEVERITY_WEIGHT: Record<string, number> = {
      CRITICAL: 10, HIGH: 7, MEDIUM: 4, LOW: 1.5, INFO: 0.5,
    };

    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, description: true, status: true, createdAt: true,
        _count: { select: { targets: true } },
        findings: {
          where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
          select: { severity: true, createdAt: true },
        },
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, type: true, createdAt: true, completedAt: true },
        },
      },
    });

    // Fetch recent scan events org-wide (last 10)
    const recentScans = await this.prisma.scan.findMany({
      where: { organizationId: orgId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        id: true, type: true, completedAt: true,
        project: { select: { id: true, name: true } },
        _count: { select: { findings: true } },
      },
    });

    const enriched = projects.map((p) => {
      const open = p.findings;
      const criticalCount = open.filter((f) => f.severity === 'CRITICAL').length;
      const highCount = open.filter((f) => f.severity === 'HIGH').length;
      const mediumCount = open.filter((f) => f.severity === 'MEDIUM').length;
      const lowCount = open.filter((f) => f.severity === 'LOW').length;

      const riskScore = open.length === 0
        ? 0
        : Math.min(
            Math.round(
              open.reduce((s, f) => s + (SEVERITY_WEIGHT[f.severity] ?? 0), 0) /
                Math.max(open.length, 1) * 10,
            ),
            100,
          );

      // SLA breach: critical >7d, high >30d
      const now = Date.now();
      const slaBreached = open.filter((f) => {
        const days = (now - f.createdAt.getTime()) / 86400000;
        return (f.severity === 'CRITICAL' && days > 7) || (f.severity === 'HIGH' && days > 30);
      }).length;

      const riskLevel: 'critical' | 'high' | 'stable' =
        criticalCount > 0 || slaBreached > 0 ? 'critical' : highCount >= 3 ? 'high' : 'stable';

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        createdAt: p.createdAt,
        targetCount: p._count.targets,
        openCount: open.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        riskScore,
        riskLevel,
        slaBreached,
        lastScan: p.scans[0] ?? null,
      };
    });

    return {
      projects: enriched,
      recentActivity: recentScans.map((s) => ({
        scanId: s.id,
        type: s.type,
        completedAt: s.completedAt,
        projectId: s.project.id,
        projectName: s.project.name,
        findingCount: s._count.findings,
      })),
    };
  }

  private async assertExists(id: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
