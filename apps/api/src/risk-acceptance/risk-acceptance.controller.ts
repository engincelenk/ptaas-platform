import {
  Controller, Get, Post, Delete, Param, Body,
  UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { RiskAcceptanceService } from './risk-acceptance.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiskAcceptanceController {
  constructor(private readonly service: RiskAcceptanceService) {}

  @Get('findings/:findingId/risk-acceptance')
  get(@Param('findingId') findingId: string, @CurrentUser() user: JwtPayload) {
    return this.service.get(findingId, user.orgId);
  }

  @Post('findings/:findingId/risk-acceptance')
  @Roles('ADMIN')
  create(
    @Param('findingId') findingId: string,
    @Body() body: { decision: string; justification: string; expiresAt?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(findingId, user.orgId, user.sub, body);
  }

  @Delete('findings/:findingId/risk-acceptance')
  @HttpCode(204)
  @Roles('ADMIN')
  revoke(@Param('findingId') findingId: string, @CurrentUser() user: JwtPayload) {
    return this.service.revoke(findingId, user.orgId);
  }

  @Get('projects/:projectId/risk-acceptances')
  listForProject(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.service.listForProject(projectId, user.orgId);
  }

  @Get('dashboard/risk-acceptances/expiring')
  getExpiring(@CurrentUser() user: JwtPayload) {
    return this.service.getExpiring(user.orgId);
  }
}
