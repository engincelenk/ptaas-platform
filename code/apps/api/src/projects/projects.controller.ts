import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { TenantId } from '../common/decorators/tenant.decorator';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.projectsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.projectsService.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @TenantId() tenantId: string) {
    return this.projectsService.create(dto, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateProjectDto>,
    @TenantId() tenantId: string,
  ) {
    return this.projectsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.projectsService.remove(id, tenantId);
  }
}
