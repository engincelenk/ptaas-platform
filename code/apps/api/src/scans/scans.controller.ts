import { Controller, Get, Post, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/create-scan.dto';
import { TenantId } from '../common/decorators/tenant.decorator';

@Controller('projects/:projectId/scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @TenantId() tenantId: string) {
    return this.scansService.findAll(projectId, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
  ) {
    return this.scansService.findOne(id, projectId, tenantId);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateScanDto,
    @TenantId() tenantId: string,
  ) {
    return this.scansService.create(projectId, dto, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @TenantId() tenantId: string,
  ) {
    return this.scansService.cancel(id, projectId, tenantId);
  }
}
