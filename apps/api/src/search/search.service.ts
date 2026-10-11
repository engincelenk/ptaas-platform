import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(orgId: string, q: string, limit = 5) {
    if (!q || q.trim().length < 2) return { projects: [], findings: [], targets: [], scans: [] };

    const query = q.trim();
    const contains = query;
    const mode = 'insensitive' as const;

    const [projects, findings, targets, scans] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          organizationId: orgId,
          status: 'ACTIVE',
          OR: [
            { name: { contains, mode } },
            { description: { contains, mode } },
          ],
        },
        select: { id: true, name: true, description: true, createdAt: true },
        take: limit,
      }),

      this.prisma.finding.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { title: { contains, mode } },
            { cveIds: { has: query.toUpperCase() } },
            { owasp: { contains, mode } },
          ],
        },
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          cveIds: true,
          projectId: true,
          project: { select: { name: true } },
        },
        take: limit,
      }),

      this.prisma.target.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { value: { contains, mode } },
          ],
        },
        select: {
          id: true,
          value: true,
          type: true,
          verificationStatus: true,
          projectId: true,
          project: { select: { name: true } },
        },
        take: limit,
      }),

      this.prisma.scan.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { id: { contains, mode } },
            { target: { value: { contains, mode } } },
          ],
        },
        select: {
          id: true,
          type: true,
          status: true,
          startedAt: true,
          projectId: true,
          target: { select: { value: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
      }),
    ]);

    return { projects, findings, targets, scans };
  }
}
