import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';

import { FindingsService } from './findings.service';
import { UpdateFindingDto } from './dto/update-finding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/** Org-level finding endpoints (no projectId in path) */
@ApiTags('findings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('findings')
export class OrgFindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get('sla-breaches')
  @ApiOperation({ summary: 'All SLA-breaching findings across the org' })
  getSlaBreaches(@CurrentUser() user: JwtPayload) {
    return this.findingsService.getSlaBreaches(user.orgId);
  }

  @Post('bulk-assign')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Bulk assign findings to a user' })
  bulkAssign(
    @Body() body: { ids: string[]; assignedToId: string | null },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.findingsService.bulkAssign(body.ids, body.assignedToId, user.orgId, user.sub);
  }

  @Post('bulk-status')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Bulk update status (org-level)' })
  bulkStatus(
    @Body() body: { ids: string[]; status: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.findingsService.bulkUpdateStatus(body.ids, body.status, user.orgId, user.sub);
  }
}

@ApiTags('findings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects/:projectId/findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  @ApiOperation({ summary: 'List findings — use ?q= for full-text search' })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'scanId', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Full-text search query' })
  findAll(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('scanId') scanId?: string,
    @Query('q') q?: string,
  ) {
    return this.findingsService.findAll(projectId, user.orgId, { severity, status, scanId, q });
  }

  @Get('risk-score')
  @ApiOperation({ summary: 'AI-assisted risk score for the project' })
  riskScore(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.findingsService.projectRiskScore(projectId, user.orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get finding detail with AI analysis' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.findingsService.findOne(id, user.orgId);
  }

  @Get(':id/related')
  @ApiOperation({ summary: 'Related findings by template / CWE / OWASP similarity' })
  relatedFindings(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.findingsService.relatedFindings(id, user.orgId);
  }

  @Get(':id/comments')
  getComments(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.findingsService.getComments(id, user.orgId);
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() body: { body: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.findingsService.addComment(id, body.body, user.sub, user.orgId);
  }

  @Get(':id/activity')
  getActivity(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.findingsService.getActivity(id, user.orgId);
  }

  @Patch(':id/remediation')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  updateRemediation(
    @Param('id') id: string,
    @Body() body: { assignedToId?: string | null; dueDate?: string | null },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.findingsService.updateRemediation(id, user.orgId, user.sub, body);
  }

  @Post('bulk-status')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Bulk update status for multiple findings' })
  bulkUpdateStatus(
    @Param('projectId') projectId: string,
    @Body() body: { ids: string[]; status: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.findingsService.bulkUpdateStatus(body.ids, body.status, user.orgId, user.sub);
  }

  @Post('ai-triage')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'AI auto-triage suggestions for open findings' })
  aiTriage(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.findingsService.aiTriage(projectId, user.orgId);
  }

  @Post()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Create a manual finding (no scanner required)' })
  createManual(
    @Param('projectId') projectId: string,
    @Body() body: {
      title: string;
      description?: string;
      severity: string;
      cvssScore?: number;
      cvssVector?: string;
      owasp?: string;
      cweIds?: string[];
      recommendation?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.findingsService.createManual(projectId, user.orgId, user.sub, body);
  }

  @Post(':id/ai-narrative')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate professional pentest narrative for a finding using Claude Haiku' })
  generateNarrative(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.findingsService.generateNarrative(id, user.orgId);
  }

  @Post(':id/risk-score-v2')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compute Risk Score v2 for a finding (CVSS+EPSS+KEV+SLA composite) (M49)' })
  computeRiskScoreV2(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.findingsService.computeAndStoreRiskScoreV2(id, user.orgId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Triage finding — update status, severity, assignment' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFindingDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.findingsService.update(id, dto, user.sub, user.orgId, req.ip, req.headers['user-agent']);
  }
}
