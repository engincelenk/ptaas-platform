import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.projectsService.create(dto, user.sub, user.orgId, req.ip, req.headers['user-agent']);
  }

  @Get()
  @ApiOperation({ summary: 'List all active projects for the organization' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.projectsService.findAll(user.orgId);
  }

  @Get('portfolio')
  @ApiOperation({ summary: 'Portfolio view with risk scores, finding counts and recent activity' })
  portfolio(@CurrentUser() user: JwtPayload) {
    return this.projectsService.portfolio(user.orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details with targets' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.findOne(id, user.orgId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project name or description' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.projectsService.update(id, dto, user.sub, user.orgId, req.ip, req.headers['user-agent']);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a project (soft delete)' })
  archive(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.projectsService.archive(id, user.sub, user.orgId, req.ip, req.headers['user-agent']);
  }
}
