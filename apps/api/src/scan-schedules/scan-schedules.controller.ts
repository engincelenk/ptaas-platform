import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ScanSchedulesService, CreateScheduleDto } from './scan-schedules.service';

@Controller('projects/:projectId/scan-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScanSchedulesController {
  constructor(private readonly service: ScanSchedulesService) {}

  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.service.list(projectId, user.orgId);
  }

  @Post()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  create(
    @Param('projectId') projectId: string,
    @Body() body: CreateScheduleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(projectId, user.orgId, user.sub, body);
  }

  @Patch(':scheduleId')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  update(
    @Param('scheduleId') scheduleId: string,
    @Body() body: { isActive?: boolean; cronExpr?: string; scanType?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(scheduleId, user.orgId, body);
  }

  @Delete(':scheduleId')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @HttpCode(204)
  remove(@Param('scheduleId') scheduleId: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(scheduleId, user.orgId);
  }
}
