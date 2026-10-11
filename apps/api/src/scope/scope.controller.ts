import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Res, HttpCode, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ScopeService } from './scope.service';

@Controller('projects/:projectId/scope')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScopeController {
  constructor(private readonly scopeService: ScopeService) {}

  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.scopeService.list(projectId, user.orgId);
  }

  @Post()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  add(
    @Param('projectId') projectId: string,
    @Body() body: { type: string; value: string; inScope?: boolean; note?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scopeService.add(projectId, user.orgId, user.sub, body);
  }

  @Patch(':entryId')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  update(
    @Param('entryId') entryId: string,
    @Body() body: { type?: string; value?: string; inScope?: boolean; note?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scopeService.update(entryId, user.orgId, body);
  }

  @Delete(':entryId')
  @HttpCode(204)
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  remove(@Param('entryId') entryId: string, @CurrentUser() user: JwtPayload) {
    return this.scopeService.remove(entryId, user.orgId);
  }

  @Get('export')
  async exportMarkdown(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const md = await this.scopeService.exportMarkdown(projectId, user.orgId);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scope-${projectId}.md"`);
    res.send(md);
  }
}
