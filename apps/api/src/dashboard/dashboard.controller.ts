import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('executive')
  getExecutive(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getExecutiveDashboard(user.orgId);
  }

  @Get('analytics')
  getAnalytics(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getAnalytics(user.orgId);
  }

  @Get('retests')
  getRetests(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getPendingRetests(user.orgId);
  }

  @Get('cve-intelligence')
  getCveIntelligence(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getCveIntelligence(user.orgId);
  }

  @Get('posture')
  getPosture(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getSecurityPosture(user.orgId);
  }
}
