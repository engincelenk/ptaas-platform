import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { TenantId } from '../common/decorators/tenant.decorator';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('resource') resource?: string,
  ) {
    return this.auditService.findAll(tenantId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      resource,
    });
  }
}
