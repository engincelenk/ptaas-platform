import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { RetestService } from './retest.service';

@Controller('findings/:findingId/retest')
@UseGuards(JwtAuthGuard)
export class RetestController {
  constructor(private readonly retestService: RetestService) {}

  @Post()
  requestRetest(
    @Param('findingId') findingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retestService.requestRetest(findingId, user.orgId, user.sub);
  }

  @Get('history')
  getHistory(
    @Param('findingId') findingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retestService.getRetestHistory(findingId, user.orgId);
  }
}
