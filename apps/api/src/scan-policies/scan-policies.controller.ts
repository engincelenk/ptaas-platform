import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ScanPoliciesService } from './scan-policies.service';
import { CreateScanPolicyDto, UpdateScanPolicyDto } from './scan-policies.dto';

@ApiTags('scan-policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations/:orgId/scan-policies')
export class ScanPoliciesController {
  constructor(private readonly service: ScanPoliciesService) {}

  @Get()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'List scan policies for the organization' })
  list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.orgId);
  }

  @Get(':id')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Get a scan policy' })
  get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.get(id, user.orgId);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a scan policy' })
  create(@Body() dto: CreateScanPolicyDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.orgId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update a scan policy' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScanPolicyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, user.orgId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a scan policy' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.remove(id, user.orgId);
  }
}
