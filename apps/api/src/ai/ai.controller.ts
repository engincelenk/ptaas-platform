import { Controller, Post, Body, UseGuards, Res, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({ summary: 'AI Q&A over findings data (M51)' })
  async chat(
    @Body() body: { message: string; projectId?: string },
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { message, projectId } = body;

    // Build context from recent findings
    const where: any = { organizationId: user.orgId };
    if (projectId) where.projectId = projectId;

    const findings = await this.prisma.finding.findMany({
      where,
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        cvssScore: true,
        riskScoreV2: true,
        owasp: true,
        cweIds: true,
      },
      orderBy: [{ riskScoreV2: 'desc' }, { cvssScore: 'desc' }],
      take: 50,
    });

    const summary = {
      total: findings.length,
      bySeverity: findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.severity] = (acc[f.severity] ?? 0) + 1;
        return acc;
      }, {}),
      byStatus: findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.status] = (acc[f.status] ?? 0) + 1;
        return acc;
      }, {}),
      topFindings: findings.slice(0, 10).map((f) => ({
        title: f.title,
        severity: f.severity,
        status: f.status,
        cvssScore: f.cvssScore,
        riskScoreV2: f.riskScoreV2,
      })),
    };

    const systemPrompt = `You are a PTaaS security assistant. You have access to the organization's vulnerability data.
Current findings summary:
${JSON.stringify(summary, null, 2)}

Answer questions about the security posture, findings, risk, and remediation priorities.
Be concise, specific, and actionable. Reference actual finding data where relevant.`;

    const answer = await this.aiService.complete(systemPrompt, message, { maxTokens: 1024 });

    res.json({ answer, context: { findingsAnalyzed: findings.length } });
  }
}
