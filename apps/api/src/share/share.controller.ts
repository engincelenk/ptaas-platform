import {
  Controller, Post, Get, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ShareService, CreateShareTokenDto } from './share.service';

/** Authenticated routes — manage share tokens for a project */
@Controller('projects/:projectId/share')
@UseGuards(JwtAuthGuard)
export class ShareController {
  constructor(private readonly share: ShareService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateShareTokenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.share.createToken(projectId, user.orgId, user.sub, dto);
  }

  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.share.listTokens(projectId, user.orgId);
  }

  @Delete(':tokenId')
  revoke(
    @Param('projectId') projectId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.share.revokeToken(tokenId, projectId, user.orgId);
  }
}

/** Public route — no auth required */
@Controller('public/share')
export class PublicShareController {
  constructor(private readonly share: ShareService) {}

  @Get(':token')
  getReport(@Param('token') token: string, @Query('password') password?: string) {
    return this.share.getPublicReport(token, password);
  }
}
