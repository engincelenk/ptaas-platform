import type { Provider } from '@nestjs/common';
import { AdapterFactory } from './adapters/adapter.factory';
import { ArenaOrchestratorService } from './arena-orchestrator.service';
import { ArenaRetentionService } from './arena-retention.service';
import { ArenaRunProcessor } from './arena-run.processor';
import { ArenaCatalogService } from './catalog/arena-catalog.service';
import { FindingsBridgeService } from './findings-bridge.service';
import { JudgeService } from './judge/judge.service';
import { RagCleanupService } from './rag/rag-cleanup.service';
import { RagPlanter } from './rag/rag-planter';
import { RecommendationService } from './recommendation.service';
import { AnthropicLlmClient } from './red/anthropic-llm.client';
import { LLM_CLIENT } from './red/llm-client';
import { RedAgent } from './red/red-agent';
import { PlaywrightBrowserDriver } from './widget/playwright-browser.driver';
import { WidgetAdapterFactory } from './widget/widget-adapter.factory';
import { BROWSER_DRIVER } from './widget/widget.types';

/**
 * Owned by the engine agent: processor, adapters, judge, red agent, catalog, findings bridge, RAG planter, widget wiring.
 * Extra modules the ArenaModule must provide for these: AuditModule (AuditService), SsrfGuardModule (SafeHttpService,
 * SsrfGuardService), ConfigModule (ConfigService), global RedisModule ('REDIS_CLIENT'), PrismaModule.
 */
export const ENGINE_PROVIDERS: Provider[] = [
  AnthropicLlmClient,
  { provide: LLM_CLIENT, useExisting: AnthropicLlmClient },
  { provide: BROWSER_DRIVER, useClass: PlaywrightBrowserDriver },
  WidgetAdapterFactory,
  AdapterFactory,
  RagPlanter,
  RagCleanupService,
  ArenaCatalogService,
  JudgeService,
  RedAgent,
  FindingsBridgeService,
  RecommendationService,
  ArenaOrchestratorService,
  ArenaRetentionService,
  ArenaRunProcessor,
];
