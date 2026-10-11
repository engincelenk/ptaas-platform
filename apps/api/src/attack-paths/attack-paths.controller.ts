import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AttackPathsService } from './attack-paths.service';

@Controller('projects/:projectId/attack-paths')
@UseGuards(JwtAuthGuard)
export class AttackPathsController {
  constructor(private readonly attackPathsService: AttackPathsService) {}

  /** POST — triggers AI analysis and (re)generates attack paths */
  @Post('analyse')
  analyse(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attackPathsService.analyse(projectId, user.orgId);
  }

  /** GET — returns previously generated attack paths */
  @Get()
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attackPathsService.list(projectId, user.orgId);
  }
}
