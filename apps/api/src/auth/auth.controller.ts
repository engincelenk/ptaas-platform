import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, LoginMfaDto } from './dto/login.dto';
import { VerifyMfaSetupDto, UseBackupCodeDto } from './dto/setup-mfa.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './strategies/jwt.strategy';

const REFRESH_COOKIE = 'ptaas_refresh';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/v1/auth/refresh',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset — always returns same response (no email enumeration)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If this email is registered, you will receive a password reset link.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set new password using reset token from email' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Password updated successfully. Please log in with your new password.' };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register — creates user + organization, returns tempToken for MFA setup' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip, req.headers['user-agent']);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 1: email + password → tempToken (MFA required)' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @Post('login/mfa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2: TOTP code + tempToken → access + refresh tokens' })
  async loginMfa(
    @Body() dto: LoginMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.loginWithMfa(
      dto.tempToken,
      dto.totpCode,
      req.ip,
      req.headers['user-agent'],
    );
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, COOKIE_OPTS);
    return { accessToken: tokens.accessToken, expiresIn: tokens.accessTokenExpiresIn };
  }

  @Post('login/backup-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2 (alt): backup code → tokens, consumes one code' })
  async loginBackupCode(
    @Body() dto: UseBackupCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.loginWithBackupCode(
      dto.tempToken,
      dto.backupCode,
      req.ip,
      req.headers['user-agent'],
    );
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, COOKIE_OPTS);
    return { accessToken: tokens.accessToken, expiresIn: tokens.accessTokenExpiresIn };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Rotate refresh token → new access + refresh pair' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
    if (!refreshToken) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTS.path });
      return { error: 'No refresh token provided' };
    }
    try {
      const result = await this.tokenService.rotateRefreshToken(refreshToken);
      res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTS);
      return { accessToken: result.accessToken, expiresIn: result.accessTokenExpiresIn };
    } catch {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTS.path });
      return { error: 'Session expired — please log in again' };
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE] ?? '';

    let remainingTtl = 15 * 60;
    try {
      const authHeader = req.headers.authorization ?? '';
      const accessToken = authHeader.replace('Bearer ', '');
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64').toString(),
      ) as { exp: number };
      remainingTtl = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
    } catch { /* use safe default */ }

    await this.authService.logout(
      user.sub,
      user.jti,
      refreshToken,
      remainingTtl,
      req.ip,
      req.headers['user-agent'],
    );

    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTS.path });
    return { message: 'Logged out successfully' };
  }

  // ── MFA Setup Flow ──────────────────────────

  @Get('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start MFA setup — returns QR code + one-time backup codes' })
  async startMfaSetup(@CurrentUser() user: JwtPayload) {
    return this.authService.initMfaSetup(user.sub);
  }

  @Post('mfa/setup/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm MFA setup with TOTP code — activates MFA on the account' })
  async confirmMfaSetup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyMfaSetupDto,
    @Req() req: Request,
  ) {
    return this.authService.confirmMfaSetup(
      user.sub,
      dto.totpCode,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get MFA status — enabled flag + remaining backup codes count' })
  getMfaStatus(@CurrentUser() user: JwtPayload) {
    return this.authService.getMfaStatus(user.sub);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA — requires current TOTP code to confirm' })
  async disableMfa(
    @CurrentUser() user: JwtPayload,
    @Body() body: { totpCode: string },
    @Req() req: Request,
  ) {
    return this.authService.disableMfa(user.sub, body.totpCode, req.ip, req.headers['user-agent']);
  }

  @Post('mfa/backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Regenerate backup codes — invalidates old codes, requires current TOTP' })
  async regenerateBackupCodes(
    @CurrentUser() user: JwtPayload,
    @Body() body: { totpCode: string },
    @Req() req: Request,
  ) {
    return this.authService.regenerateBackupCodes(user.sub, body.totpCode, req.ip, req.headers['user-agent']);
  }

  /** POST /auth/switch-org/:orgId — issue new JWT for a different org the user belongs to */
  @Post('switch-org/:orgId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Switch active organization — returns new access token' })
  async switchOrg(
    @Param('orgId') orgId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const membership = await this.authService['prisma'].organizationMember.findFirst({
      where: { userId: user.sub, organizationId: orgId, acceptedAt: { not: null } },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException('You are not a member of this organization');

    const tokens = await this.tokenService.generateTokenPair(user.sub, orgId, membership.role as any);
    return { accessToken: tokens.accessToken };
  }

  /** GET /auth/me/organizations — list all orgs the current user belongs to */
  @Get('me/organizations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all organizations the current user belongs to' })
  async myOrganizations(@CurrentUser() user: JwtPayload) {
    return this.authService['prisma'].organizationMember.findMany({
      where: { userId: user.sub, acceptedAt: { not: null } },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });
  }

  /** GET /auth/sessions — list all active sessions for the current user */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all active sessions (refresh token families) for the current user' })
  async listSessions(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    const sessions = await this.tokenService.listSessions(user.sub);
    const refreshToken: string | undefined = (req as any).cookies?.[REFRESH_COOKIE];
    const currentFamilyId = refreshToken ? this.tokenService.getCurrentFamilyId(refreshToken) : null;
    return sessions.map((s) => ({ ...s, isCurrent: s.familyId === currentFamilyId }));
  }

  /** DELETE /auth/sessions/:familyId — revoke a single session */
  @Delete('sessions/:familyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session by family ID' })
  async revokeSession(
    @Param('familyId') familyId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const sessions = await this.tokenService.listSessions(user.sub);
    const session = sessions.find((s) => s.familyId === familyId);
    if (!session) throw new NotFoundException('Session not found');
    await this.tokenService.revokeSession(user.sub, familyId);
  }

  /** DELETE /auth/sessions — revoke all sessions except the current one */
  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all other sessions, keeping the current one active' })
  async revokeAllOtherSessions(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    const refreshToken: string | undefined = (req as any).cookies?.[REFRESH_COOKIE];
    const currentFamilyId = refreshToken ? this.tokenService.getCurrentFamilyId(refreshToken) : null;
    await this.tokenService.revokeAllOtherSessions(user.sub, currentFamilyId);
  }
}
