import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsArray, IsInt, Min, Max, ArrayMaxSize,
} from 'class-validator';

export class CreateScanPolicyDto {
  @ApiProperty({ example: 'CVE-Only Quick Scan' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: ['cves', 'misconfigurations'], description: 'Nuclei -tags filter' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  nucleiTags?: string[];

  @ApiPropertyOptional({
    example: ['critical', 'high'],
    description: 'Nuclei -severity filter',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  nucleiSeverities?: string[];

  @ApiPropertyOptional({ description: 'Nuclei template IDs to exclude' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  excludedTemplates?: string[];

  @ApiPropertyOptional({ example: 3600 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  maxDurationSeconds?: number;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  rateLimit?: number;
}

export class UpdateScanPolicyDto extends PartialType(CreateScanPolicyDto) {}
