import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { ARENA_LIMITS } from '../../arena.constants';
import { ATTACK_TECHNIQUES, ENGINE_PROMPT_VERSIONS } from '../engine.types';
import type {
  EnrichRecommendationInput,
  EnrichRecommendationResult,
  GenerateAttackInput,
  GeneratedAttack,
  JudgeUnclearInput,
  JudgeUnclearResult,
  LlmClient,
  LlmModelInfo,
} from './llm-client';
import {
  JUDGE_SYSTEM_PROMPT_A,
  JUDGE_SYSTEM_PROMPT_B,
  RECOMMENDATION_SYSTEM_PROMPT,
  RED_SYSTEM_PROMPT,
  buildAttackUserPrompt,
  buildJudgeUserPrompt,
  buildRecommendationUserPrompt,
} from './prompts';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const RED_TEMPERATURE = 0.8;
const JUDGE_TEMPERATURE = 0;

const AttackSchema = z.object({
  technique: z.enum(ATTACK_TECHNIQUES as unknown as [string, ...string[]]),
  prompt: z.string().min(10).max(ARENA_LIMITS.maxAttackChars),
});

const JudgeSchema = z.object({
  verdict: z.enum(['BREACH', 'NOT_BREACH', 'UNSURE']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(400),
});

const EnrichSchema = z.object({ text: z.string().max(2500) });

/** ai-SDK based implementation. No tools are ever passed to the model. */
@Injectable()
export class AnthropicLlmClient implements LlmClient {
  readonly modelInfo: LlmModelInfo;
  private readonly anthropic: ReturnType<typeof createAnthropic>;
  private readonly redModel: string;
  private readonly judgeModel: string;

  constructor(config: ConfigService) {
    this.anthropic = createAnthropic({ apiKey: config.get<string>('ANTHROPIC_API_KEY') ?? '' });
    this.redModel = config.get<string>('ARENA_RED_MODEL') ?? DEFAULT_MODEL;
    this.judgeModel = config.get<string>('ARENA_JUDGE_MODEL') ?? DEFAULT_MODEL;
    this.modelInfo = {
      red: this.redModel,
      judge: this.judgeModel,
      temperature: { red: RED_TEMPERATURE, judge: JUDGE_TEMPERATURE },
      promptVersions: { ...ENGINE_PROMPT_VERSIONS },
    };
  }

  async generateAttack(input: GenerateAttackInput): Promise<GeneratedAttack> {
    const { object, usage } = await generateObject({
      model: this.anthropic(this.redModel),
      schema: AttackSchema,
      system: RED_SYSTEM_PROMPT,
      prompt: buildAttackUserPrompt(input),
      temperature: RED_TEMPERATURE,
      maxTokens: 1200,
    });
    return {
      technique: object.technique as GeneratedAttack['technique'],
      prompt: object.prompt,
      tokens: usage?.totalTokens ?? 0,
    };
  }

  async judgeUnclear(input: JudgeUnclearInput): Promise<JudgeUnclearResult> {
    const { object, usage } = await generateObject({
      model: this.anthropic(this.judgeModel),
      schema: JudgeSchema,
      system: input.variant === 'A' ? JUDGE_SYSTEM_PROMPT_A : JUDGE_SYSTEM_PROMPT_B,
      prompt: buildJudgeUserPrompt(input),
      temperature: JUDGE_TEMPERATURE,
      maxTokens: 400,
    });
    return { ...object, tokens: usage?.totalTokens ?? 0 };
  }

  async enrichRecommendation(input: EnrichRecommendationInput): Promise<EnrichRecommendationResult | null> {
    const { object, usage } = await generateObject({
      model: this.anthropic(this.redModel),
      schema: EnrichSchema,
      system: RECOMMENDATION_SYSTEM_PROMPT,
      prompt: buildRecommendationUserPrompt(input),
      temperature: JUDGE_TEMPERATURE,
      maxTokens: 700,
    });
    return object.text.trim() ? { text: object.text.trim(), tokens: usage?.totalTokens ?? 0 } : null;
  }
}
