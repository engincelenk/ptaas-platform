import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ScansService } from './scans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('scans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scans')
export class ScansQueueController {
  constructor(private readonly scansService: ScansService) {}

  @Get('queue')
  @ApiOperation({ summary: 'List all queued and running scans for the current organization' })
  getQueue(@CurrentUser() user: JwtPayload) {
    return this.scansService.getQueue(user.orgId);
  }
}
