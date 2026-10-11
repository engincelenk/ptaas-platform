import {
  Controller, Get, Post, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsDateString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ApiKeysService } from './api-keys.service';

class CreateApiKeyDto {
  @ApiProperty({ example: 'CI/CD Pipeline Key' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: ['scans:read', 'findings:read'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations/:orgId/api-keys')
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'List API keys for the organization' })
  list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.orgId);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a new API key — the raw key is shown only once' })
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.orgId, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.revoke(id, user.orgId);
  }
}
