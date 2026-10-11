import {
  Controller, Get, Post, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('portal')
@Controller()
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  /** POST /projects/:id/portal-token — generate a 30-day read-only portal link (requires auth) */
  @Post('projects/:id/portal-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a 30-day read-only client portal link for a project' })
  generateToken(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.portal.generatePortalToken(id, user.orgId);
  }

  /** GET /portal/:token/summary — public, token-authenticated */
  @Get('portal/:token/summary')
  @ApiOperation({ summary: 'Get portal project summary (public, token-authenticated)' })
  getSummary(@Param('token') token: string) {
    return this.portal.getSummary(token);
  }

  /** GET /portal/:token/findings — public, token-authenticated */
  @Get('portal/:token/findings')
  @ApiOperation({ summary: 'List findings for portal view (public, token-authenticated)' })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'status', required: false })
  getFindings(
    @Param('token') token: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
  ) {
    return this.portal.getFindings(token, severity, status);
  }

  /** GET /portal/:token/findings/:findingId — public, token-authenticated */
  @Get('portal/:token/findings/:findingId')
  @ApiOperation({ summary: 'Get single finding detail for portal view' })
  getFinding(@Param('token') token: string, @Param('findingId') findingId: string) {
    return this.portal.getFinding(token, findingId);
  }
}
