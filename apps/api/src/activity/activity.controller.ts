import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ActivityService } from './activity.service';

@Controller('projects/:projectId/activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Get()
  getFeed(
    @Param('projectId') projectId: string,
    @Query('limit') limit = '60',
    @Query('before') before?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.getFeed(projectId, user!.orgId, Math.min(Number(limit), 200), before);
  }
}
