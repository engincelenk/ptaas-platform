import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ThreatBriefsService } from './threat-briefs.service';

@Controller('threat-briefs')
@UseGuards(JwtAuthGuard)
export class ThreatBriefsController {
  constructor(private readonly threatBriefsService: ThreatBriefsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.threatBriefsService.list(user.orgId);
  }

  @Post('generate')
  generate(@CurrentUser() user: JwtPayload) {
    return this.threatBriefsService.generate(user.orgId);
  }
}
