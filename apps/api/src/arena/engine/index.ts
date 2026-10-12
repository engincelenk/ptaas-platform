import type { Provider } from '@nestjs/common';
import { AdapterFactory } from './adapters/adapter.factory';
import { ArenaRetentionService } from './arena-retention.service';
import { ArenaOrchestratorService } from './arena-orchestrator.service';
import { ArenaRunProcessor } from './arena-run.processor';
import { ArenaCatalogService } from './catalog/arena-catalog.service';
import { FindingsBridgeService } from './findings-bridge.service';
import { JudgeService } from './judge/judge.service';
import { RecommendationService } from './recommendation.service';
import { AnthropicLlmClient } from './red/anthropic-llm.client';
import { LLM_CLIENT } from './red/llm-client';
import { RedAgent } from './red/red-agent';

/**
 * Owned by the engine agent: processor, adapters, judge, red agent, catalog, findings bridge.
 * Extra modules the ArenaModule must provide for these: AuditModule (AuditService), SsrfGuardModule (SafeHttpService),
 * ConfigModule (ConfigService), global RedisModule ('REDIS_CLIENT'), PrismaModule.
 */
export const ENGINE_PROVIDERS: Provider[] = [
  AnthropicLlmClient,
  { provide: LLM_CLIENT, useExisting: AnthropicLlmClient },
  AdapterFactory,
  ArenaCatalogService,
  JudgeService,
  RedAgent,
  FindingsBridgeService,
  RecommendationService,
  ArenaOrchestratorService,
  ArenaRetentionService,
  ArenaRunProcessor,
];
