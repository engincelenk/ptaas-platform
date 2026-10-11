import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RescanDto {
  @ApiProperty({ description: 'Finding ID that was fixed — used to scope the re-scan template' })
  @IsString()
  findingId!: string;

  @ApiPropertyOptional({ enum: ['QUICK', 'FULL'], default: 'QUICK' })
  @IsOptional()
  @IsEnum(['QUICK', 'FULL'])
  type?: 'QUICK' | 'FULL';
}
