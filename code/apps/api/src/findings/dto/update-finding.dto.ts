import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { FindingStatus } from '@prisma/client';

export class UpdateFindingDto {
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @IsOptional()
  @IsBoolean()
  falsePositive?: boolean;
}
