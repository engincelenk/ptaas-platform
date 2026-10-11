import {
  Controller, Get, Param, Query, Res, UseGuards, NotFoundException,
} from '@nestjs/common';
import type { Framework } from './compliance.constants';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ComplianceService } from './compliance.service';
import { CompliancePdfService } from './compliance-pdf.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/compliance')
export class ComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly pdf: CompliancePdfService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get OWASP Top 10 compliance status for a project' })
  async getCompliance(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this._assertAccess(projectId, user.orgId);
    return this.compliance.getProjectCompliance(projectId, user.orgId);
  }

  @Get('pdf')
  @ApiOperation({ summary: 'Download OWASP Top 10 compliance report as PDF' })
  async downloadPdf(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this._assertAccess(projectId, user.orgId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, organization: { select: { name: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');

    const report = await this.compliance.getProjectCompliance(projectId, user.orgId);
    const pdfBuffer = await this.pdf.generateReport(report, project.name, project.organization.name);

    const filename = `compliance-${projectId}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  }

  @Get('frameworks/summary')
  @ApiOperation({ summary: 'Multi-framework compliance summary (PCI-DSS, ISO 27001, SOC2, GDPR)' })
  async getFrameworkSummary(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this._assertAccess(projectId, user.orgId);
    return this.compliance.getFrameworkSummary(projectId, user.orgId);
  }

  @Get('frameworks/:framework')
  @ApiOperation({ summary: 'Get findings mapped to a specific compliance framework' })
  async getFrameworkDetail(
    @Param('projectId') projectId: string,
    @Param('framework') framework: Framework,
    @CurrentUser() user: JwtPayload,
  ) {
    await this._assertAccess(projectId, user.orgId);
    return this.compliance.getFrameworkDetail(projectId, user.orgId, framework);
  }

  @Get('frameworks/:framework/export.pdf')
  @ApiOperation({ summary: 'Export framework compliance report as PDF' })
  async exportFrameworkPdf(
    @Param('projectId') projectId: string,
    @Param('framework') framework: Framework,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this._assertAccess(projectId, user.orgId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, organization: { select: { name: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');

    const fwLabel: Record<string, string> = {
      'pci-dss': 'PCI-DSS v4.0', 'iso27001': 'ISO/IEC 27001:2022',
      'soc2': 'SOC 2 TSC', 'gdpr': 'GDPR', 'nis2': 'NIS2 Directive (EU 2022/2555)',
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-${framework}-${projectId}.pdf"`);

    // Use streaming PDF generation from compliance service
    const { ComplianceFrameworkPdfService } = await import('./compliance-framework-pdf.service');
    const pdfSvc = new ComplianceFrameworkPdfService();
    await pdfSvc.generate(projectId, user.orgId, framework, project.name, this.compliance, res);
  }

  private async _assertAccess(projectId: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }
}

/** M54 — Org-level ISO 27001 continuous tracking */
@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('compliance')
export class OrgComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('iso27001/continuous')
  @ApiOperation({ summary: 'M54 — ISO 27001 continuous tracking across all org projects' })
  getIso27001Continuous(@CurrentUser() user: JwtPayload) {
    return this.compliance.getIso27001Continuous(user.orgId);
  }
}
