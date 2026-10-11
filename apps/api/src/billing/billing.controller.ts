import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('usage')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'M57 — Current month usage stats' })
  getCurrentUsage(@CurrentUser() user: JwtPayload) {
    return this.billing.getCurrentUsage(user.orgId);
  }

  @Get('usage/history')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'M57 — Usage history (monthly snapshots)' })
  getHistory(@CurrentUser() user: JwtPayload, @Query('months') months?: string) {
    return this.billing.getUsageHistory(user.orgId, months ? parseInt(months, 10) : 6);
  }
}
