import {
  Controller, Post, Get, Patch, Delete, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { AsmService } from './asm.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class StartDiscoveryDto {
  @IsString() @IsNotEmpty()
  rootDomain!: string;
}

@ApiTags('asm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assets')
export class OrgAssetsController {
  constructor(private readonly asmService: AsmService) {}

  @Get()
  @Roles('ADMIN', 'SECURITY_ENGINEER', 'DEVELOPER', 'VIEWER')
  @ApiOperation({ summary: 'Org-wide asset inventory' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'search', required: false })
  listAll(
    @Query('status') status: string | undefined,
    @Query('type') type: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.asmService.listOrgAssets(user.orgId, status, type, search);
  }
}

@ApiTags('asm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects/:projectId/asm')
export class AsmController {
  constructor(private readonly asmService: AsmService) {}

  @Post('discover')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Start attack surface discovery for a root domain' })
  startDiscovery(
    @Param('projectId') projectId: string,
    @Body() dto: StartDiscoveryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.asmService.startDiscovery(projectId, dto.rootDomain, user.orgId, user.sub);
  }

  @Get('scans')
  @Roles('ADMIN', 'SECURITY_ENGINEER', 'DEVELOPER')
  @ApiOperation({ summary: 'List ASM discovery scans for this project' })
  listScans(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.asmService.listScans(projectId, user.orgId);
  }

  @Get('assets')
  @Roles('ADMIN', 'SECURITY_ENGINEER', 'DEVELOPER', 'VIEWER')
  @ApiOperation({ summary: 'List discovered assets (subdomains, IPs)' })
  @ApiQuery({ name: 'status', required: false, enum: ['SUGGESTED', 'ACTIVE', 'OFFLINE', 'IGNORED'] })
  listAssets(
    @Param('projectId') projectId: string,
    @Query('status') status: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.asmService.listAssets(projectId, user.orgId, status);
  }

  @Post('assets/:assetId/accept')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Accept a discovered asset — creates a new Target (PENDING verification)' })
  acceptAsset(
    @Param('assetId') assetId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.asmService.acceptAsset(assetId, user.orgId, user.sub);
  }

  @Patch('assets/:assetId/dismiss')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Dismiss a discovered asset suggestion' })
  dismissAsset(
    @Param('assetId') assetId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.asmService.dismissAsset(assetId, user.orgId);
  }
}
