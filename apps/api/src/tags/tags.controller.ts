import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TagsService } from './tags.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
  constructor(private readonly service: TagsService) {}

  // ── Org-level tag library ──────────────────────────────────────

  @Get('org/tags')
  listOrgTags(@CurrentUser() user: JwtPayload) {
    return this.service.listOrgTags(user.orgId);
  }

  @Post('org/tags')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  createTag(
    @Body() body: { name: string; color?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createTag(user.orgId, body.name, body.color ?? '#6366f1');
  }

  @Patch('org/tags/:tagId')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  updateTag(
    @Param('tagId') tagId: string,
    @Body() body: { name?: string; color?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateTag(tagId, user.orgId, body.name, body.color);
  }

  @Delete('org/tags/:tagId')
  @Roles('ADMIN')
  @HttpCode(204)
  deleteTag(@Param('tagId') tagId: string, @CurrentUser() user: JwtPayload) {
    return this.service.deleteTag(tagId, user.orgId);
  }

  // ── Finding tag assignments ────────────────────────────────────

  @Get('findings/:findingId/tags')
  getTagsForFinding(@Param('findingId') findingId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getTagsForFinding(findingId, user.orgId);
  }

  @Post('findings/:findingId/tags/:tagId')
  @HttpCode(200)
  assignTag(
    @Param('findingId') findingId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.assignTag(findingId, tagId, user.orgId);
  }

  @Delete('findings/:findingId/tags/:tagId')
  @HttpCode(204)
  removeTag(
    @Param('findingId') findingId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeTag(findingId, tagId, user.orgId);
  }
}
