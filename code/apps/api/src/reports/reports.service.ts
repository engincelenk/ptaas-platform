import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFormat } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(
    projectId: string,
    format: ReportFormat,
    tenantId: string,
    scanId?: string,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      include: {
        findings: {
          where: scanId ? { scanId } : undefined,
          orderBy: { severity: 'asc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.report.create({
      data: {
        projectId,
        tenantId,
        scanId,
        format,
        fileUrl: null,
      },
    });
  }

  async findAll(projectId: string, tenantId: string) {
    return this.prisma.report.findMany({
      where: { projectId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
