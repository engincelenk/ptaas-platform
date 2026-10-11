import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ScanStrategyService } from './scan-strategy.service';

@Controller('projects/:projectId/strategy')
@UseGuards(JwtAuthGuard)
export class ScanStrategyController {
  constructor(private readonly strategyService: ScanStrategyService) {}

  /** POST /projects/:projectId/strategy — create + queue AI strategy analysis */
  @Post()
  createStrategy(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.strategyService.createStrategy(projectId, user.orgId, user.sub);
  }

  /** GET /projects/:projectId/strategy — list recent strategies */
  @Get()
  listStrategies(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.strategyService.listStrategies(projectId, user.orgId);
  }

  /** GET /projects/:projectId/strategy/:strategyId — get strategy + plan */
  @Get(':strategyId')
  getStrategy(
    @Param('strategyId') strategyId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.strategyService.getStrategy(strategyId, user.orgId);
  }

  /** POST /projects/:projectId/strategy/:strategyId/execute — launch scans from plan */
  @Post(':strategyId/execute')
  executeStrategy(
    @Param('strategyId') strategyId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.strategyService.executeStrategy(strategyId, user.orgId, user.sub);
  }
}
