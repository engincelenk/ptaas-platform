import {
  Controller, Get, Post, Delete,
  Body, Param, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TargetsService } from './targets.service';
import { VerificationService } from './verification.service';
import { CreateTargetDto, StartVerificationDto } from './dto/target.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('targets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects/:projectId/targets')
export class TargetsController {
  constructor(
    private readonly targetsService: TargetsService,
    private readonly verificationService: VerificationService,
  ) {}

  @Post()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Add a target to a project' })
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTargetDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.targetsService.create(
      projectId, dto, user.sub, user.orgId, req.ip, req.headers['user-agent'],
    );
  }

  @Get()
  @ApiOperation({ summary: 'List targets for a project' })
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.targetsService.findAllForProject(projectId, user.orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get target with verification instructions' })
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const target = await this.targetsService.findOne(id, user.orgId);
    return {
      ...target,
      verificationInstructions: this.targetsService.getVerificationInstructions(target),
    };
  }

  @Delete(':id')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Remove a target' })
  delete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.targetsService.delete(id, user.sub, user.orgId, req.ip, req.headers['user-agent']);
  }

  @Post(':id/verify')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Trigger domain verification — DNS TXT, HTTP File, or Meta Tag' })
  verify(
    @Param('id') id: string,
    @Body() dto: StartVerificationDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.verificationService.verify(
      id, dto.method, user.orgId, user.sub, req.ip, req.headers['user-agent'],
    );
  }
}
