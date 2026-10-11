import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SlaService } from './sla.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get('org/sla-policy')
  getPolicy(@CurrentUser() user: JwtPayload) {
    return this.sla.getPolicy(user.orgId);
  }

  @Put('org/sla-policy')
  @Roles('ADMIN')
  updatePolicy(@Body() body: Partial<{
    criticalDays: number; highDays: number; mediumDays: number; lowDays: number; infoDays: number;
  }>, @CurrentUser() user: JwtPayload) {
    return this.sla.updatePolicy(user.orgId, body);
  }

  @Get('projects/:projectId/findings/sla')
  getFindingsWithSla(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.sla.getFindingsWithSla(projectId, user.orgId);
  }

  @Get('dashboard/sla-summary')
  getDashboardSummary(@CurrentUser() user: JwtPayload) {
    return this.sla.getDashboardSummary(user.orgId);
  }
}
