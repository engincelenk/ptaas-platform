import { Controller, Get, Post, Body, Param } from '@nestjs/common';
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

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
  ) {
    return this.reportsService.findAll(projectId, tenantId);
  }

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
