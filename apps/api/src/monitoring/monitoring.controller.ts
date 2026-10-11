import {
  Controller, Get, Post, Delete, Body, Param, UseGuards, Request,
  BadRequestException, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SchedulerService } from './scheduler.service';
import { TrendsService } from './trends.service';

class SetScheduleDto {
  @IsString()
  @Matches(/^(@(annually|yearly|monthly|weekly|daily|hourly)|((\*|[0-9,\-\/]+)\s+){4}(\*|[0-9,\-\/]+))$/, {
    message: 'Invalid cron expression',
  })
  cron!: string;
}

@ApiTags('monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class MonitoringController {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly trends: TrendsService,
  ) {}

  /** GET /projects/:projectId/trends */
  @Get('projects/:projectId/trends')
  getTrends(@Param('projectId') projectId: string, @Request() req: any) {
    return this.trends.getProjectTrends(projectId, req.user.organizationId);
  }

  /** POST /targets/:targetId/schedule */
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @Post('targets/:targetId/schedule')
  async setSchedule(
    @Param('targetId') targetId: string,
    @Body() dto: SetScheduleDto,
    @Request() req: any,
  ) {
    await this.scheduler.setSchedule(targetId, dto.cron, req.user.organizationId);
    return { ok: true, cron: dto.cron };
  }

  /** DELETE /targets/:targetId/schedule */
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @Delete('targets/:targetId/schedule')
  @HttpCode(204)
  async clearSchedule(@Param('targetId') targetId: string, @Request() req: any) {
    await this.scheduler.clearSchedule(targetId, req.user.organizationId);
  }
}
