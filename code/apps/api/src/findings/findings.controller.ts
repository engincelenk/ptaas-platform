import { Controller, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { FindingsService, UpdateFindingDto } from './findings.service';
import { TenantId } from '../common/decorators/tenant.decorator';
import { Severity, FindingStatus } from '@prisma/client';

@Controller('findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get('stats')
  getStats(@TenantId() tenantId: string) {
    return this.findingsService.getStats(tenantId);
  }

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query('projectId') projectId?: string,
    @Query('scanId') scanId?: string,
    @Query('severity') severity?: Severity,
    @Query('status') status?: FindingStatus,
  ) {
    return this.findingsService.findAll(tenantId, { projectId, scanId, severity, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.findingsService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFindingDto,
    @TenantId() tenantId: string,
  ) {
    return this.findingsService.update(id, dto, tenantId);
  }
}

@Controller('projects/:projectId/findings')
export class ProjectFindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
    @Query('severity') severity?: Severity,
    @Query('status') status?: FindingStatus,
  ) {
    return this.findingsService.findAllForProject(projectId, tenantId, { severity, status });
  }
}
