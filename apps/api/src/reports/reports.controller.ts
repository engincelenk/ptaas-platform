import { Controller, Get, Post, Param, Query, Body, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProduces } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('executive.pdf')
  @ApiOperation({ summary: 'Executive PDF report — risk summary, top findings, business impact' })
  @ApiProduces('application/pdf')
  async executivePdf(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this.reportsService.streamExecutivePdf(projectId, user.orgId, res);
  }

  @Get('technical.pdf')
  @ApiOperation({ summary: 'Technical PDF report — all findings with CVSS, CWE, HTTP evidence' })
  @ApiProduces('application/pdf')
  async technicalPdf(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this.reportsService.streamTechnicalPdf(projectId, user.orgId, res);
  }

  @Get('scorecard.pdf')
  @ApiOperation({ summary: 'Security Score Card PDF — cover, KPIs, OWASP, top findings, status donut, trend' })
  async scorecard(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this.reportsService.generateScorecard(projectId, user.orgId, res);
  }

  @Get('compliance.pdf')
  @ApiOperation({ summary: 'Compliance Report PDF — ISO27001 / OWASP / SOC2 control mapping' })
  @ApiProduces('application/pdf')
  async compliancePdf(
    @Param('projectId') projectId: string,
    @Query('framework') framework: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const fw = ['ISO27001', 'OWASP', 'SOC2'].includes(framework) ? framework as 'ISO27001' | 'OWASP' | 'SOC2' : 'ISO27001';
    await this.reportsService.generateCompliancePdf(projectId, user.orgId, fw, res);
  }

  @Get('findings.json')
  @ApiOperation({ summary: 'JSON export of all findings (machine-readable, UC-22)' })
  async jsonExport(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.exportJson(projectId, user.orgId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ptaas-findings-${projectId}.json"`,
    );
    res.json(data);
  }

  @Get('findings.csv')
  @ApiOperation({ summary: 'CSV export of all findings — Excel-compatible UTF-8 with BOM' })
  @ApiProduces('text/csv')
  async csvExport(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this.reportsService.exportCsv(projectId, user.orgId, res);
  }

  @Post('custom.pdf')
  @ApiOperation({ summary: 'Custom pentest report PDF — user-selected findings & section order' })
  @ApiProduces('application/pdf')
  async customPdf(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      title?: string;
      classification?: string;
      executiveSummary?: string;
      findingIds?: string[];
      sections: string[];
    },
    @Res() res: Response,
  ) {
    await this.reportsService.streamCustomPdf(projectId, user.orgId, body, res);
  }

  @Get('sla.pdf')
  @ApiOperation({ summary: 'SLA Compliance Report PDF — breach table, at-risk findings, policy summary' })
  @ApiProduces('application/pdf')
  async slaPdf(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this.reportsService.streamSlaPdf(projectId, user.orgId, res);
  }

  @Get('findings.sarif')
  @ApiOperation({ summary: 'SARIF 2.1.0 export — Static Analysis Results Interchange Format for IDE/CI integration' })
  @ApiProduces('application/json')
  async sarifExport(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.exportSarif(projectId, user.orgId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ptaas-${projectId}.sarif"`);
    res.json(data);
  }

  @Get('findings.xlsx')
  @ApiOperation({ summary: 'Excel export — 4 sheets: Executive Summary, Findings, CVSS Breakdown, OWASP Mapping' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async excelExport(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this.reportsService.exportExcel(projectId, user.orgId, res);
  }
}
