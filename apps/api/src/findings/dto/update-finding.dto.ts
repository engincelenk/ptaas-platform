import { IsEnum, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const FINDING_STATUSES = [
  'OPEN', 'IN_PROGRESS', 'FIXED', 'VERIFIED', 'CLOSED', 'FALSE_POSITIVE', 'ACCEPTED_RISK',
] as const;

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

export class UpdateFindingDto {
  @ApiPropertyOptional({ enum: FINDING_STATUSES })
  @IsOptional()
  @IsEnum(FINDING_STATUSES)
  status?: typeof FINDING_STATUSES[number];

  @ApiPropertyOptional({ enum: SEVERITIES, description: 'Override scanner severity' })
  @IsOptional()
  @IsEnum(SEVERITIES)
  severity?: typeof SEVERITIES[number];

  @ApiPropertyOptional({ description: 'Assign to user ID' })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Analyst comment / triage note' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Finding description (supports AI narrative apply)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Remediation recommendation' })
  @IsOptional()
  @IsString()
  recommendation?: string;

  @ApiPropertyOptional({ description: 'Jira issue key for two-way sync (e.g. PROJ-123)' })
  @IsOptional()
  @IsString()
  jiraIssueKey?: string;
}
