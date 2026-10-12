import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const ARENA_ADAPTERS = ['OPENAI_COMPAT', 'ANTHROPIC', 'GENERIC_JSON', 'WIDGET'] as const;
export type ArenaAdapterName = (typeof ARENA_ADAPTERS)[number];

export const ARENA_TARGET_KINDS = ['CHAT', 'RAG', 'AGENT', 'WIDGET'] as const;
export type ArenaTargetKindName = (typeof ARENA_TARGET_KINDS)[number];
export const ARENA_ENVIRONMENTS = ['STAGING', 'PRODUCTION'] as const;
export type ArenaEnvironmentName = (typeof ARENA_ENVIRONMENTS)[number];

export const VERIFICATION_METHODS = ['DNS_TXT', 'HTTP_FILE', 'META_TAG'] as const;
export type VerificationMethodName = (typeof VERIFICATION_METHODS)[number];

/** Max length of a single known prompt fragment / number of fragments (bounded input). */
export const MAX_FRAGMENTS = 50;
export const MAX_FRAGMENT_CHARS = 500;

export class CreateAiTargetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'https://chat.example.com/api/chat' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpointUrl!: string;

  @ApiProperty({ enum: ARENA_ADAPTERS })
  @IsEnum(ARENA_ADAPTERS)
  adapter!: ArenaAdapterName;

  @ApiPropertyOptional({ enum: ARENA_TARGET_KINDS, default: 'CHAT' })
  @IsOptional()
  @IsEnum(ARENA_TARGET_KINDS)
  kind?: ArenaTargetKindName;

  @ApiPropertyOptional({ enum: ARENA_ENVIRONMENTS, description: 'AGENT targets must be STAGING' })
  @IsOptional()
  @IsEnum(ARENA_ENVIRONMENTS)
  environment?: ArenaEnvironmentName;

  @ApiPropertyOptional({ description: 'RAG: mode AUTO|MANUAL, ingest, delete, indexingDelayMs (no secrets)' })
  @IsOptional()
  @IsObject()
  ragConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'AGENT: dryRunHeaderName/Value, toolCallsPath (no secrets)' })
  @IsOptional()
  @IsObject()
  agentConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'WIDGET: pageUrl and selectors (no secrets)' })
  @IsOptional()
  @IsObject()
  widgetConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'JSON path mapping for GENERIC_JSON (no secrets)' })
  @IsOptional()
  @IsObject()
  requestMapping?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'JSON path mapping for GENERIC_JSON (no secrets)' })
  @IsOptional()
  @IsObject()
  responseMapping?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Authorization' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^([A-Za-z][A-Za-z0-9-]{0,63})?$/, { message: 'authHeaderName must be a plain header name' })
  authHeaderName?: string;

  @ApiPropertyOptional({ description: 'Write-only. Never returned.' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string;

  @ApiPropertyOptional({ type: [String], description: 'Write-only. Never returned.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FRAGMENTS)
  @IsString({ each: true })
  @MaxLength(MAX_FRAGMENT_CHARS, { each: true })
  knownPromptFragments?: string[];
}

export class UpdateAiTargetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpointUrl?: string;

  @ApiPropertyOptional({ enum: ARENA_ADAPTERS })
  @IsOptional()
  @IsEnum(ARENA_ADAPTERS)
  adapter?: ArenaAdapterName;

  @ApiPropertyOptional({ enum: ARENA_TARGET_KINDS, default: 'CHAT' })
  @IsOptional()
  @IsEnum(ARENA_TARGET_KINDS)
  kind?: ArenaTargetKindName;

  @ApiPropertyOptional({ enum: ARENA_ENVIRONMENTS, description: 'AGENT targets must be STAGING' })
  @IsOptional()
  @IsEnum(ARENA_ENVIRONMENTS)
  environment?: ArenaEnvironmentName;

  @ApiPropertyOptional({ description: 'RAG: mode AUTO|MANUAL, ingest, delete, indexingDelayMs (no secrets)' })
  @IsOptional()
  @IsObject()
  ragConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'AGENT: dryRunHeaderName/Value, toolCallsPath (no secrets)' })
  @IsOptional()
  @IsObject()
  agentConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'WIDGET: pageUrl and selectors (no secrets)' })
  @IsOptional()
  @IsObject()
  widgetConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  requestMapping?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  responseMapping?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^([A-Za-z][A-Za-z0-9-]{0,63})?$/, { message: 'authHeaderName must be a plain header name' })
  authHeaderName?: string;

  @ApiPropertyOptional({ description: 'Write-only. Empty string removes the key.' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string;

  @ApiPropertyOptional({ type: [String], description: 'Write-only. Empty array removes the fragments.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FRAGMENTS)
  @IsString({ each: true })
  @MaxLength(MAX_FRAGMENT_CHARS, { each: true })
  knownPromptFragments?: string[];
}

export class VerifyAiTargetDto {
  @ApiProperty({ enum: VERIFICATION_METHODS })
  @IsEnum(VERIFICATION_METHODS)
  method!: VerificationMethodName;
}

export class CreateRunDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  aiTargetId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  goalIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxRounds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxRequests?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  maxTokens?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1000)
  requestsPerSecond?: number;

  @ApiPropertyOptional({ description: 'ISO timestamp' })
  @IsOptional()
  @IsDateString()
  windowStart?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp' })
  @IsOptional()
  @IsDateString()
  windowEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  retestOfRunId?: string;
}

export class ApproveConfirmationsDto {
  @ApiPropertyOptional({ description: 'Required for every kind; must be true' })
  @IsOptional()
  @IsBoolean()
  noProduction?: boolean;

  @ApiPropertyOptional({ description: 'Required for every kind; must be true' })
  @IsOptional()
  @IsBoolean()
  noSideEffects?: boolean;

  @ApiPropertyOptional({ description: 'Required CHAT/RAG/WIDGET; must be true' })
  @IsOptional()
  @IsBoolean()
  noTools?: boolean;

  @ApiPropertyOptional({ description: 'Required for every kind; must be true' })
  @IsOptional()
  @IsBoolean()
  providerTosAccepted?: boolean;

  @ApiPropertyOptional({ description: 'Required AGENT; must be true' })
  @IsOptional()
  @IsBoolean()
  stagingOnly?: boolean;

  @ApiPropertyOptional({ description: 'Required AGENT; must be true' })
  @IsOptional()
  @IsBoolean()
  toolsSandboxed?: boolean;

  @ApiPropertyOptional({ description: 'Required RAG; must be true' })
  @IsOptional()
  @IsBoolean()
  testDocumentsMayBeIndexedAndRemoved?: boolean;
}

export class ApproveRunDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  roeVersion!: number;

  @ApiProperty({ description: '24/7 emergency contact of the customer (name + phone/e-mail)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  emergencyContact!: string;

  @ApiProperty({ type: ApproveConfirmationsDto })
  @ValidateNested()
  @Type(() => ApproveConfirmationsDto)
  confirmations!: ApproveConfirmationsDto;
}

export class AbortRunDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class KillSwitchDto {
  @ApiProperty()
  @IsBoolean()
  on!: boolean;
}

export class AttestTargetDto {
  @ApiPropertyOptional({ enum: [true], description: 'RAG (manual mode): test documents are in place' })
  @IsOptional()
  @IsBoolean()
  @Equals(true)
  ragDocsPlaced?: true;

  @ApiPropertyOptional({ enum: [true], description: 'AGENT: the endpoint is a staging environment' })
  @IsOptional()
  @IsBoolean()
  @Equals(true)
  stagingConfirmed?: true;

  @ApiPropertyOptional({ enum: [true], description: 'AGENT: tools are sandboxed / dry-run' })
  @IsOptional()
  @IsBoolean()
  @Equals(true)
  sandboxAttested?: true;
}

export class CatalogQueryDto {
  @ApiPropertyOptional({ enum: ARENA_TARGET_KINDS })
  @IsOptional()
  @IsEnum(ARENA_TARGET_KINDS)
  kind?: ArenaTargetKindName;
}

export class ListRunsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  aiTargetId?: string;
}

export class AttemptsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  goalId?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp; only attempts created after it' })
  @IsOptional()
  @IsDateString()
  after?: string;
}

export class StreamQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  ticket!: string;
}

