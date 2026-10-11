import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import type { Prisma } from '@ptaas/db';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M58 — VS Code Extension API
 * Lightweight endpoints consumed by the PTaaS VS Code extension.
 * Versioned under /api/v1/vscode/ for extension compatibility.
 */
@ApiTags('vscode')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/vscode')
export class VscodeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('findings')
  @ApiOperation({ summary: 'List open findings — consumed by VS Code extension' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'file', required: false, description: 'Filter by file path substring' })
  async getFindings(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
    @Query('severity') severity?: string,
    @Query('file') file?: string,
  ) {
    const findings = await this.prisma.finding.findMany({
      where: {
        organizationId: user.orgId,
        ...(projectId && { projectId }),
        ...(severity && { severity: severity as Prisma.FindingWhereInput['severity'] }),
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        ...(file && { matchedAt: { contains: file } }),
      },
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        cvssScore: true,
        riskScoreV2: true,
        matchedAt: true,
        cveIds: true,
        cweIds: true,
        owasp: true,
        aiRemediation: true,
        dueDate: true,
        projectId: true,
        project: { select: { name: true } },
      },
      orderBy: [{ riskScoreV2: 'desc' }, { cvssScore: 'desc' }],
      take: 200,
    });

    return {
      // Extension contract exposes the AI remediation text as "recommendation"
      findings: findings.map(({ aiRemediation, ...rest }) => ({ ...rest, recommendation: aiRemediation })),
      meta: { total: findings.length, generatedAt: new Date() },
    };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Security summary for status bar — consumed by VS Code extension' })
  async getSummary(@CurrentUser() user: JwtPayload) {
    const [total, critical, high, overdue] = await Promise.all([
      this.prisma.finding.count({ where: { organizationId: user.orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.finding.count({ where: { organizationId: user.orgId, severity: 'CRITICAL', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.finding.count({ where: { organizationId: user.orgId, severity: 'HIGH', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.finding.count({ where: { organizationId: user.orgId, dueDate: { lt: new Date() }, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);

    return { total, critical, high, overdue, generatedAt: new Date() };
  }

  @Get('projects')
  @ApiOperation({ summary: 'List projects — consumed by VS Code extension' })
  async getProjects(@CurrentUser() user: JwtPayload) {
    return this.prisma.project.findMany({
      where: { organizationId: user.orgId },
      select: { id: true, name: true, status: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
