import { Controller, Get, Patch, Delete, Param, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Request } from 'express';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import type { Role } from '@ptaas/types';

class UpdateRoleDto {
  @ApiProperty({ enum: ['ADMIN', 'SECURITY_ENGINEER', 'DEVELOPER', 'VIEWER'] })
  @IsEnum(['ADMIN', 'SECURITY_ENGINEER', 'DEVELOPER', 'VIEWER'])
  role!: Role;
}

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get(':orgId')
  @ApiOperation({ summary: 'Get organization details' })
  getOrg(@Param('orgId') orgId: string, @CurrentUser() user: JwtPayload) {
    return this.orgsService.findById(orgId, user.sub);
  }

  @Get('members')
  @ApiOperation({ summary: 'List members of the current org (from JWT)' })
  getMembersMe(@CurrentUser() user: JwtPayload) {
    return this.orgsService.getMembers(user.orgId, user.sub);
  }

  @Get(':orgId/members')
  @ApiOperation({ summary: 'List organization members' })
  getMembers(@Param('orgId') orgId: string, @CurrentUser() user: JwtPayload) {
    return this.orgsService.getMembers(orgId, user.sub);
  }

  @Patch(':orgId/members/:userId/role')
  @ApiOperation({ summary: 'Change member role (Admin only)' })
  updateRole(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() requester: JwtPayload,
    @Req() req: Request,
  ) {
    return this.orgsService.updateMemberRole(
      orgId,
      userId,
      dto.role,
      requester.sub,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Patch(':orgId/branding')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update white-label branding settings for the organization (M46)' })
  updateBranding(
    @Param('orgId') orgId: string,
    @Body() dto: { brandPrimaryColor?: string; brandCompanyName?: string; brandFooterText?: string; logoUrl?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService['prisma'].organization.update({
      where: { id: orgId },
      data: {
        ...(dto.brandPrimaryColor !== undefined && { brandPrimaryColor: dto.brandPrimaryColor }),
        ...(dto.brandCompanyName !== undefined && { brandCompanyName: dto.brandCompanyName }),
        ...(dto.brandFooterText !== undefined && { brandFooterText: dto.brandFooterText }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      },
      select: { id: true, name: true, logoUrl: true, brandPrimaryColor: true, brandCompanyName: true, brandFooterText: true },
    });
  }

  @Patch(':orgId/region')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'M55 — Update data region for the organization' })
  updateRegion(
    @Param('orgId') orgId: string,
    @Body() dto: { dataRegion: string },
    @CurrentUser() user: JwtPayload,
  ) {
    const VALID_REGIONS = ['eu-west-1', 'eu-central-1', 'us-east-1', 'us-west-2', 'ap-southeast-1'];
    if (!VALID_REGIONS.includes(dto.dataRegion)) {
      throw new BadRequestException(`Invalid region. Allowed: ${VALID_REGIONS.join(', ')}`);
    }
    return this.orgsService['prisma'].organization.update({
      where: { id: orgId },
      data: { dataRegion: dto.dataRegion },
      select: { id: true, dataRegion: true, allowedRegions: true },
    });
  }

  @Get(':orgId/rate-limit')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'M56 — Get per-org rate limits' })
  getRateLimit(@Param('orgId') orgId: string, @CurrentUser() user: JwtPayload) {
    return this.orgsService['prisma'].orgRateLimit.findUnique({ where: { orgId } });
  }

  @Patch(':orgId/rate-limit')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'M56 — Set per-org rate limits (upsert)' })
  setRateLimit(
    @Param('orgId') orgId: string,
    @Body() dto: { requestsPerMinute?: number; requestsPerHour?: number; burstSize?: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService['prisma'].orgRateLimit.upsert({
      where: { orgId },
      create: { orgId, ...dto },
      update: dto,
    });
  }

  @Delete(':orgId/members/:userId')
  @ApiOperation({ summary: 'Remove a member (Admin only)' })
  removeMember(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser() requester: JwtPayload,
    @Req() req: Request,
  ) {
    return this.orgsService.removeMember(orgId, userId, requester.sub, req.ip, req.headers['user-agent']);
  }
}
