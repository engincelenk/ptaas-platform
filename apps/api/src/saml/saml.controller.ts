import {
  Controller, Get, Post, Put, Delete, Body, Param, Req, Res,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SamlService } from './saml.service';
import { UpsertSamlConfigDto } from './dto/saml.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

// ── Public endpoints (no JWT) — used during SAML flow ────────────────────────

@ApiTags('saml')
@Controller('auth/saml')
export class SamlPublicController {
  constructor(private readonly saml: SamlService) {}

  @Get(':orgSlug/metadata')
  @ApiOperation({ summary: 'SP Metadata XML — share with your IdP' })
  async metadata(@Param('orgSlug') orgSlug: string, @Res() res: Response) {
    const xml = await this.saml.getMetadataXml(orgSlug);
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  }

  @Get(':orgSlug/login')
  @ApiOperation({ summary: 'Initiate SAML login — redirects to IdP' })
  async login(@Param('orgSlug') orgSlug: string, @Res() res: Response) {
    const url = await this.saml.getLoginUrl(orgSlug);
    res.redirect(302, url);
  }

  @Post(':orgSlug/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SAML ACS callback — validates assertion, issues JWT' })
  async callback(
    @Param('orgSlug') orgSlug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // In a real deployment passport-saml middleware would parse + verify the
    // SAMLResponse before reaching this handler. For now we accept a JSON body
    // with the pre-validated profile (e.g. from a SAML proxy/test tool) and
    // the passport-saml integration is wired in saml.module.ts.
    const profile = (req as Request & { samlProfile?: unknown }).samlProfile ?? req.body;

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

    try {
      const tokens = await this.saml.handleCallback(
        orgSlug,
        profile as never,
        req.ip,
        req.headers['user-agent'],
      );
      // Redirect to frontend with tokens in query (SPA picks them up)
      const redirect = `${appUrl}/auth/saml-callback?accessToken=${encodeURIComponent(tokens.accessToken)}&refreshToken=${encodeURIComponent(tokens.refreshToken)}`;
      res.redirect(302, redirect);
    } catch (err) {
      const msg = encodeURIComponent((err as Error).message);
      res.redirect(302, `${appUrl}/login?samlError=${msg}`);
    }
  }
}

// ── Admin endpoints (JWT required, ADMIN role) ────────────────────────────────

@ApiTags('saml')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('org/saml')
export class SamlAdminController {
  constructor(private readonly saml: SamlService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get current SAML config for the org' })
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.saml.getConfig(user.orgId);
  }

  @Put('config')
  @ApiOperation({ summary: 'Create or update SAML config for the org' })
  upsertConfig(@CurrentUser() user: JwtPayload, @Body() dto: UpsertSamlConfigDto) {
    return this.saml.upsertConfig(user.orgId, dto, user.sub);
  }

  @Delete('config')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete SAML config — disables SSO for the org' })
  deleteConfig(@CurrentUser() user: JwtPayload) {
    return this.saml.deleteConfig(user.orgId, user.sub);
  }
}
