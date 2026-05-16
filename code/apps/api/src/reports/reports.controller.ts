import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { TenantId } from '../common/decorators/tenant.decorator';
import { ReportFormat } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

class CreateReportDto {
  @IsEnum(ReportFormat)
  format!: ReportFormat;

  @IsOptional()
  @IsUUID()
  scanId?: string;
}

@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ── Archiv ───────────────────────────────────────────────────────────────
  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
  ) {
    return this.reportsService.findAll(projectId, tenantId);
  }

  // ── JSON-Download ────────────────────────────────────────────────────────
  @Get('download/json')
  async downloadJson(
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
    @Query('scanId') scanId: string | undefined,
    @Res() res: Response,
  ) {
    const { report, buffer } = await this.reportsService.generateJson(
      projectId,
      tenantId,
      scanId,
    );

    const safeName = report.project.name.replace(/\s+/g, '-').toLowerCase();
    const filename = `ptaas-report-${safeName}-${Date.now()}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // ── PDF-Download ─────────────────────────────────────────────────────────
  @Get('download/pdf')
  async downloadPdf(
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
    @Query('scanId') scanId: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, projectName } = await this.reportsService.generatePdf(
      projectId,
      tenantId,
      scanId,
    );

    const safeName = projectName.replace(/\s+/g, '-').toLowerCase();
    const filename = `ptaas-report-${safeName}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // ── Report erstellen (Datensatz) ─────────────────────────────────────────
  @Post()
  generate(
    @Param('projectId') projectId: string,
    @Body() dto: CreateReportDto,
    @TenantId() tenantId: string,
  ) {
    return this.reportsService.generate(
      projectId,
      dto.format,
      tenantId,
      dto.scanId,
    );
  }
}
