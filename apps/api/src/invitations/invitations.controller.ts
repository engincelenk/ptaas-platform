import {
  Controller, Get, Post, Delete, Body, Param, HttpCode, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/invitation.dto';

@ApiTags('invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations/:orgId/invitations')
export class InvitationsController {
  constructor(private readonly svc: InvitationsService) {}

  /** List pending invitations — ADMIN only */
  @Get()
  @Roles('ADMIN')
  list(@Param('orgId') orgId: string, @Request() req: any) {
    this._assertOrgAccess(orgId, req.user.organizationId);
    return this.svc.list(orgId);
  }

  /** Send invitation — ADMIN only */
  @Post()
  @Roles('ADMIN')
  create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateInvitationDto,
    @Request() req: any,
  ) {
    this._assertOrgAccess(orgId, req.user.organizationId);
    return this.svc.create(dto, orgId, req.user.sub);
  }

  /** Revoke a pending invitation — ADMIN only */
  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  revoke(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    this._assertOrgAccess(orgId, req.user.organizationId);
    return this.svc.revoke(id, orgId, req.user.sub);
  }

  private _assertOrgAccess(paramOrgId: string, jwtOrgId: string) {
    if (paramOrgId !== jwtOrgId) throw new Error('Access denied');
  }
}

/** Public endpoint — no JWT needed to accept (user may not be logged in yet) */
@ApiTags('invitations')
@Controller('invitations')
export class InvitationAcceptController {
  constructor(private readonly svc: InvitationsService) {}

  /** GET /invitations/:token — preview invitation details (no auth) */
  @Get(':token')
  async preview(@Param('token') token: string) {
    // Return only safe fields — not role or org internals
    const inv = await this.svc['prisma'].invitation.findUnique({
      where: { token },
      select: {
        email: true, role: true, expiresAt: true, usedAt: true,
        organization: { select: { name: true, slug: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!inv) return { valid: false };
    if (inv.usedAt || inv.expiresAt < new Date()) return { valid: false, expired: true };
    return {
      valid: true,
      email: inv.email,
      role: inv.role,
      orgName: inv.organization.name,
      inviterName: inv.invitedBy.name,
    };
  }

  /** POST /invitations/:token/accept — requires JWT (user must be logged in) */
  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  accept(@Param('token') token: string, @Request() req: any) {
    return this.svc.accept(token, req.user.sub);
  }
}
