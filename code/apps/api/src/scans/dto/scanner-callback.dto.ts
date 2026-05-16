import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ScanStatus, Severity } from '@prisma/client';

export class UpdateScanStatusDto {
  @IsEnum(ScanStatus)
  status!: ScanStatus;

  @IsOptional()
  @IsString()
  error?: string;
}

export class CreateFindingFromScannerDto {
  @IsString()
  projectId!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsEnum(Severity)
  severity!: Severity;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  cvss_score?: number;

  @IsOptional()
  @IsString()
  cvss_vector?: string;

  @IsOptional()
  @IsString()
  cwe_id?: string;

  @IsOptional()
  @IsString()
  owasp_category?: string;

  @IsOptional()
  @IsString()
  affected_url?: string;

  @IsOptional()
  @IsString()
  affected_component?: string;

  @IsOptional()
  @IsString()
  proof_of_concept?: string;

  @IsOptional()
  @IsString()
  remediation?: string;

  @IsOptional()
  raw_output?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  check_version?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  target_tech_stack?: string[];
}
