import { Injectable } from '@nestjs/common';
import type { ArenaGoalCategory, Severity } from '@ptaas/db';
import { PrismaService } from '../../prisma/prisma.service';
import { ArenaEventsService } from '../arena-events.service';
import { CATEGORY_ADVICE } from './recommendation.templates';
import type { JudgeEvidence } from './engine.types';

const CWE_BY_CATEGORY: Record<ArenaGoalCategory, string[]> = {
  PROMPT_INJECTION: ['CWE-1427'],
  SYSTEM_PROMPT_LEAK: ['CWE-200'],
  SENSITIVE_DISCLOSURE: ['CWE-200'],
  JAILBREAK: ['CWE-1427'],
  OUTPUT_HANDLING: ['CWE-116', 'CWE-79'],
};

export interface BreachCandidate {
  attemptId: string;
  round: number;
  technique: string;
  /** Already redacted. */
  attackText: string;
  responseText: string | null;
  confidence: number;
  deterministic: boolean;
  repro: { k: number; n: number };
  evidence: JudgeEvidence;
  severity: Severity;
}

export interface BridgeContext {
  runId: string;
  organizationId: string;
  scanId: string;
  createdById: string;
  targetId: string;
  projectId: string;
  endpointUrl: string;
}

export interface BridgeGoal {
  id: string;
  key: string;
  category: ArenaGoalCategory;
  title: string;
  description: string;
  owaspRef: string | null;
  atlasRef: string | null;
}

const RANK: Record<Severity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/** Picks the best proof: deterministic first, then severity, confidence, earliest round. */
export function pickBestBreach(cands: BreachCandidate[]): BreachCandidate | null {
  if (cands.length === 0) return null;
  return [...cands].sort(
    (a, b) =>
      Number(b.deterministic) - Number(a.deterministic) ||
      RANK[b.severity] - RANK[a.severity] ||
      b.confidence - a.confidence ||
      a.round - b.round,
  )[0];
}

@Injectable()
export class FindingsBridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ArenaEventsService,
  ) {}

  /**
   * Exactly one Finding per (run, goal), based on the best confirmed breach. Idempotent: if an attempt of
   * this (run, goal) already carries a finding, that one is returned.
   */
  async createForBreach(ctx: BridgeContext, goal: BridgeGoal, best: BreachCandidate): Promise<string> {
    const existing = await this.prisma.arenaAttempt.findFirst({
      where: { runId: ctx.runId, organizationId: ctx.organizationId, goalId: goal.id, findingId: { not: null } },
      select: { findingId: true },
    });
    if (existing?.findingId) return existing.findingId;

    const advice = CATEGORY_ADVICE[goal.category];
    const proof = best.deterministic ? 'deterministischer Beweis' : `LLM-Judge, reproduziert ${best.repro.k}/${best.repro.n}`;
    const description = [
      `AI Arena: Die KI des Kunden wurde im Ziel "${goal.title}" (${goal.key}) ueberwunden.`,
      goal.description,
      `Technik: ${best.technique}, Runde ${best.round}, Beweis: ${proof}, Konfidenz ${Math.round(best.confidence * 100)} %, Reproduktion ${best.repro.k}/${best.repro.n}.`,
      `Referenzen: ${[goal.owaspRef ? 'OWASP ' + goal.owaspRef : '', goal.atlasRef ? 'MITRE ATLAS ' + goal.atlasRef : ''].filter(Boolean).join(', ')}.`,
      'Hinweis: Das Ziel ist ein harmloser Stellvertreter (Marker/Canary); es wurden keine Schadinhalte erzeugt.',
    ].join('\n\n');
    const remediation = [
      `Prompt-Patch: ${advice.promptPatch}`,
      `Guardrail: ${advice.guardrail}`,
      `Output-Filter: ${advice.outputFilter}`,
      `Tests: ${advice.tests}`,
    ].join('\n');

    const finding = await this.prisma.finding.create({
      data: {
        title: `[AI Arena] ${goal.title}`,
        description,
        severity: best.severity,
        templateId: goal.key,
        templateName: goal.title,
        matchedAt: ctx.endpointUrl,
        httpRequest: best.attackText,
        httpResponse: best.responseText,
        cweIds: CWE_BY_CATEGORY[goal.category],
        cveIds: [],
        owasp: goal.owaspRef,
        aiRemediation: remediation,
        scanId: ctx.scanId,
        targetId: ctx.targetId,
        projectId: ctx.projectId,
        organizationId: ctx.organizationId,
        createdById: ctx.createdById,
      },
    });

    await this.prisma.arenaAttempt.updateMany({
      where: { id: best.attemptId, organizationId: ctx.organizationId },
      data: { findingId: finding.id },
    });
    await this.events.publish(ctx.organizationId, ctx.runId, {
      type: 'finding',
      findingId: finding.id,
      attemptId: best.attemptId,
    });
    return finding.id;
  }
}
