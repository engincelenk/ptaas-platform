import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.onboardingService.getStatus(user.orgId);
  }

  @Post('seed-demo')
  seedDemo(@CurrentUser() user: JwtPayload) {
    return this.onboardingService.seedDemo(user.orgId, user.sub);
  }
}
