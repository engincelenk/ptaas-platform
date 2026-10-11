import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { HealthChecksService } from './health-checks.service';

@Controller('projects/:projectId/targets/:targetId/health')
@UseGuards(JwtAuthGuard)
export class HealthChecksController {
  constructor(private readonly healthChecks: HealthChecksService) {}

  @Get()
  getHistory(
    @Param('targetId') targetId: string,
    @Query('hours') hours: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.healthChecks.getHistory(targetId, user.orgId, hours ? parseInt(hours, 10) : 24);
  }

  @Get('latest')
  getLatest(@Param('targetId') targetId: string, @CurrentUser() user: JwtPayload) {
    return this.healthChecks.getLatest(targetId, user.orgId);
  }
}
