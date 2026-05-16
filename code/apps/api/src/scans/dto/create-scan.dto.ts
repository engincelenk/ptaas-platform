import { IsEnum, IsOptional, IsObject } from 'class-validator';
import { ScanType } from '@prisma/client';

export class CreateScanDto {
  @IsEnum(ScanType)
  type!: ScanType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
