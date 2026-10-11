import {
  Controller, Get, Post, Patch, Param, Body, Res,
  UseGuards, HttpCode,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { EngagementService, UpsertEngagementDto } from './engagement.service';

@Controller('projects/:projectId/engagement')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EngagementController {
  constructor(private readonly service: EngagementService) {}

  @Get()
  get(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.service.get(projectId, user.orgId);
  }

  @Post()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  create(
    @Param('projectId') projectId: string,
    @Body() body: UpsertEngagementDto & { title: string; type: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(projectId, user.orgId, body);
  }

  @Patch()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  update(
    @Param('projectId') projectId: string,
    @Body() body: UpsertEngagementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(projectId, user.orgId, body);
  }

  @Post('sign-off')
  @Roles('ADMIN')
  @HttpCode(200)
  signOff(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.service.signOff(projectId, user.orgId, user.sub, user.role === 'ADMIN');
  }

  @Get('letter')
  async letter(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="engagement-letter-${projectId}.pdf"`);
    await this.service.generateLetter(projectId, user.orgId, res);
  }
}
