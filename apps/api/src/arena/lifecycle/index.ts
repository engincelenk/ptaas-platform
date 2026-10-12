import type { Provider, Type } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { TargetsModule } from '../../targets/targets.module';
import { AiTargetsService } from './ai-targets.service';
import { ArenaController } from './arena.controller';
import { ArenaRoeService } from './arena-roe.service';
import { ArenaRunsService } from './arena-runs.service';
import { ArenaScoreboardService } from './arena-scoreboard.service';
import { ArenaStreamController } from './arena-stream.controller';
import { ArenaStreamTicketService } from './arena-stream-ticket.service';

export { AiTargetsService } from './ai-targets.service';
export { ArenaRunsService } from './arena-runs.service';
export { ArenaScoreboardService } from './arena-scoreboard.service';
export { arenaUtcDayKey } from './arena-views';

/** Owned by the lifecycle agent: controllers + providers for targets, runs, RoE, approval, SSE. */
export const LIFECYCLE_CONTROLLERS: Type<unknown>[] = [ArenaController, ArenaStreamController];

export const LIFECYCLE_PROVIDERS: Provider[] = [
  AiTargetsService,
  ArenaRoeService,
  ArenaRunsService,
  ArenaScoreboardService,
  ArenaStreamTicketService,
];

/**
 * Modules ArenaModule must import for the lifecycle providers:
 * TargetsModule exports VerificationService, AuditModule exports AuditService.
 * (Prisma, Redis, Crypto, SsrfGuard and Config are global.)
 */
export const LIFECYCLE_IMPORTS: Type<unknown>[] = [TargetsModule, AuditModule];
