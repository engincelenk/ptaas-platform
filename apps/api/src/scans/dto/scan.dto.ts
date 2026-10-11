import {
  IsString, IsEnum, IsOptional, IsArray, IsInt, Min, Max, MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ScanTypeValue } from '../scan-queue.constants';

const SCAN_TYPES: ScanTypeValue[] = ['QUICK', 'FULL', 'WEB_CRAWL', 'API_SCAN'];

export class CreateScanDto {
  @ApiProperty({ description: 'Target ID to scan (must be VERIFIED)' })
  @IsString()
  targetId!: string;

  @ApiProperty({ enum: SCAN_TYPES, default: 'QUICK' })
  @IsEnum(SCAN_TYPES)
  @IsOptional()
  type?: ScanTypeValue;

  // ── Nuclei options (QUICK / FULL) ─────────────────────────────────────────

  @ApiPropertyOptional({
    type: [String],
    description: 'Nuclei template categories (QUICK/FULL only)',
    default: ['cves', 'misconfigurations', 'exposures'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  templateCategories?: string[];

  @ApiPropertyOptional({ type: [String], description: 'URL paths to exclude from scanning' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludePaths?: string[];

  // ── ZAP options (WEB_CRAWL / API_SCAN) ────────────────────────────────────

  @ApiPropertyOptional({ description: 'Crawl depth for WEB_CRAWL (default 5)', minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  crawlDepth?: number;

  @ApiPropertyOptional({ description: 'OpenAPI/Swagger URL or inline YAML/JSON for API_SCAN' })
  @IsOptional()
  @IsString()
  openApiSpec?: string;

  // ── Auth credentials (stored AES-256-GCM encrypted) ───────────────────────

  @ApiPropertyOptional({ enum: ['bearer', 'basic', 'cookie'] })
  @IsOptional()
  @IsEnum(['bearer', 'basic', 'cookie'])
  credentialType?: 'bearer' | 'basic' | 'cookie';

  @ApiPropertyOptional({ description: 'Credential value — AES-256-GCM encrypted at rest' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  credentialValue?: string;

  @ApiPropertyOptional({ description: 'Custom scan policy ID to apply' })
  @IsOptional()
  @IsString()
  policyId?: string;
}
