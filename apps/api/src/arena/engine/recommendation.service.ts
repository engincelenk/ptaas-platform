import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ArenaGoalCategory } from '@ptaas/db';
import { PrismaService } from '../../prisma/prisma.service';
import { ArenaEventsService } from '../arena-events.service';
import { LLM_CLIENT, LlmClient } from './red/llm-client';
import { CATEGORY_ADVICE, renderRecommendationText } from './recommendation.templates';

export interface CategoryStats {
  category: ArenaGoalCategory;
  goalTitles: string[];
  attempts: number;
  breaches: number;
  successfulTechniques: string[];
}

export interface CreatedRecommendation {
  id: string;
  category: string;
  title: string;
  text: string;
  priority: number;
}

@Injectable()
export class RecommendationService {
  private readonly log = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ArenaEventsService,
    @Optional() @Inject(LLM_CLIENT) private readonly llm?: LlmClient,
  ) {}

  /** Always one recommendation per tested category — also when the defence held. Idempotent per run. */
  async createForRun(
    runId: string,
    organizationId: string,
    stats: CategoryStats[],
  ): Promise<{ created: CreatedRecommendation[]; llmTokens: number }> {
    const existing = await this.prisma.arenaRecommendation.count({ where: { runId, organizationId } });
    if (existing > 0) return { created: [], llmTokens: 0 };

    const created: CreatedRecommendation[] = [];
    let llmTokens = 0;
    for (const s of stats) {
      if (s.attempts === 0) continue;
      const held = s.breaches === 0;
      let text = renderRecommendationText(s.category, { attempts: s.attempts, breaches: s.breaches }, held);
      if (this.llm?.enrichRecommendation) {
        try {
          // Only trusted summary facts are sent — never target responses.
          const extra = await this.llm.enrichRecommendation({
            category: s.category,
            goalTitles: s.goalTitles,
            attempts: s.attempts,
            breaches: s.breaches,
            successfulTechniques: s.successfulTechniques,
            baseText: text,
          });
          if (extra) {
            llmTokens += extra.tokens;
            text += `\n\nErgaenzende Hinweise zu diesem Lauf:\n${extra.text}`;
          }
        } catch (err) {
          this.log.warn(`recommendation enrichment failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const priority = held ? 3 : s.breaches / s.attempts >= 0.25 ? 1 : 2;
      const title = held
        ? `${CATEGORY_ADVICE[s.category].label}: Abwehr hielt - so bleibt es robust`
        : `${CATEGORY_ADVICE[s.category].label}: Abwehr verbessern`;
      const row = await this.prisma.arenaRecommendation.create({
        data: { runId, organizationId, category: s.category, title, text, priority },
      });
      const out = { id: row.id, category: s.category, title, text, priority };
      created.push(out);
      await this.events.publish(organizationId, runId, { type: 'recommendation', ...out });
    }
    return { created, llmTokens };
  }
}
