import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MethodologyService } from './methodology.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('methodology')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('methodology')
export class MethodologyController {
  constructor(private readonly service: MethodologyService) {}

  @Get()
  @ApiOperation({ summary: 'List methodology templates for the organization' })
  list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a methodology template (preset: OWASP_TG_V42 | PTES | CUSTOM)' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; description?: string; preset?: string },
  ) {
    return this.service.create(user.orgId, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a methodology with its checks' })
  getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getOne(id, user.orgId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a methodology template' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.delete(id, user.orgId);
  }

  @Post(':id/checks')
  @ApiOperation({ summary: 'Add a custom check to a methodology' })
  addCheck(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { title: string; description?: string; category?: string },
  ) {
    return this.service.addCheck(id, user.orgId, body);
  }

  @Post(':id/assign/:projectId')
  @ApiOperation({ summary: 'Assign a methodology to a project' })
  assign(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.assign(id, projectId, user.orgId);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get methodology progress for a project' })
  projectProgress(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getProjectProgress(projectId, user.orgId);
  }

  @Patch('assignments/:assignmentId/checks/:checkId')
  @ApiOperation({ summary: 'Toggle a methodology check as completed/incomplete' })
  toggleCheck(
    @Param('assignmentId') assignmentId: string,
    @Param('checkId') checkId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { completed: boolean; notes?: string },
  ) {
    return this.service.toggleCheck(assignmentId, checkId, user.orgId, body.completed, body.notes, user.sub);
  }
}
