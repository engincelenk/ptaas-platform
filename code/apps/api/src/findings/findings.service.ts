import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Severity, FindingStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsBoolean } from 'class-validator';

export class UpdateFindingDto {
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @IsOptional()
  @IsBoolean()
  falsePositive?: boolean;
}

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    filters: { projectId?: string; scanId?: string; severity?: Severity; status?: FindingStatus },
  ) {
    return this.prisma.finding.findMany({
      where: {
        tenantId,
        ...(filters.projectId && { projectId: filters.projectId }),
        ...(filters.scanId && { scanId: filters.scanId }),
        ...(filters.severity !== undefined && { severity: filters.severity }),
        ...(filters.status !== undefined && { status: filters.status }),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      include: {
        scan: { select: { id: true, type: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async findAllForProject(
    projectId: string,
    tenantId: string,
    filters: { severity?: Severity; status?: FindingStatus },
  ) {
    return this.findAll(tenantId, { projectId, ...filters });
  }

  async findOne(id: string, tenantId: string) {
    const finding = await this.prisma.finding.findFirst({
      where: { id, tenantId },
      include: {
        scan: { select: { id: true, type: true } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!finding) throw new NotFoundException('Finding not found');
    return finding;
  }

  async update(id: string, dto: UpdateFindingDto, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.finding.update({
      where: { id },
      data: dto,
    });
  }

  async getStats(tenantId: string) {
    const [bySeverity, byStatus, activeScans, totalProjects] = await Promise.all([
      this.prisma.finding.groupBy({
        by: ['severity'],
        where: { tenantId, status: { notIn: ['FIXED', 'WONT_FIX', 'FALSE_POSITIVE'] } },
        _count: true,
      }),
      this.prisma.finding.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.scan.count({
        where: { tenantId, status: { in: ['QUEUED', 'RUNNING'] } },
      }),
      this.prisma.project.count({ where: { tenantId } }),
    ]);

    const severityMap = Object.fromEntries(
      bySeverity.map((r) => [r.severity, r._count]),
    );
    const openFindings = byStatus
      .filter((r) => r.status === 'OPEN' || r.status === 'CONFIRMED')
      .reduce((sum, r) => sum + r._count, 0);
    const resolvedFindings =
      byStatus.find((r) => r.status === 'FIXED')?._count ?? 0;

    return {
      critical: severityMap['CRITICAL'] ?? 0,
      high: severityMap['HIGH'] ?? 0,
      medium: severityMap['MEDIUM'] ?? 0,
      low: severityMap['LOW'] ?? 0,
      openFindings,
      resolvedFindings,
      activeScans,
      totalProjects,
    };
  }
}
