import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/scan.dto';
import { RescanDto } from './dto/rescan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('scans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects/:projectId/scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Start a new scan on a verified target' })
  create(
    @Param('projectId') _projectId: string,
    @Body() dto: CreateScanDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.scansService.create(dto, user.sub, user.orgId, req.ip, req.headers['user-agent']);
  }

  @Get()
  @ApiOperation({ summary: 'List scans for a project' })
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.scansService.findAll(projectId, user.orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get scan details with findings' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.scansService.findOne(id, user.orgId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Cancel a queued or running scan' })
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.scansService.cancel(id, user.sub, user.orgId, req.ip, req.headers['user-agent']);
  }

  @Post('rescan')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Re-scan after a finding is marked FIXED — targeted verification scan' })
  rescan(
    @Param('projectId') _projectId: string,
    @Body() dto: RescanDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.scansService.rescan(
      dto.findingId,
      user.sub,
      user.orgId,
      dto.type,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('diff')
  @ApiOperation({ summary: 'Compare findings between two scan runs' })
  diff(
    @Param('projectId') projectId: string,
    @Query('scanA') scanA: string,
    @Query('scanB') scanB: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scansService.diff(projectId, user.orgId, scanA, scanB);
  }

  @Post('ai-scope-suggest')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI suggests Nuclei template categories based on discovered tech stack and prior findings' })
  suggestScope(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scansService.suggestScope(projectId, user.orgId);
  }
}
