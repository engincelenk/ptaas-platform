import {
  IsString, IsEnum, IsBoolean, IsOptional, IsArray, MinLength, MaxLength, Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIntegrationDto {
  @ApiProperty({ enum: ['WEBHOOK', 'GITHUB', 'JIRA', 'SLACK'] })
  @IsEnum(['WEBHOOK', 'GITHUB', 'JIRA', 'SLACK'])
  type!: 'WEBHOOK' | 'GITHUB' | 'JIRA' | 'SLACK';

  @ApiProperty({ example: 'My Slack Alert' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ type: [String], example: ['finding.created', 'scan.completed'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  // Config fields — stored encrypted, all optional here, validated by type in service
  @ApiPropertyOptional() @IsOptional() @IsString() webhookUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() webhookSecret?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() githubToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() repoOwner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() repoName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jiraBaseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jiraEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jiraToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jiraProjectKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slackToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slackChannel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^T[A-Z0-9]{2,}$/) slackTeamId?: string;
}

export class UpdateIntegrationDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) events?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() webhookUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() webhookSecret?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() githubToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() repoOwner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() repoName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jiraBaseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jiraEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jiraToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jiraProjectKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slackToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slackChannel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^T[A-Z0-9]{2,}$/) slackTeamId?: string;
}
