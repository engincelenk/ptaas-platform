import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { Pseudonymizer } from './pseudonymizer';

const FindingAnalysisSchema = z.object({
  explanation: z
    .string()
    .describe('Plain-language explanation of the vulnerability for a developer (2-4 sentences, no jargon)'),
  remediation: z
    .string()
    .describe('Concrete step-by-step remediation instructions (numbered list, actionable)'),
  fpProbability: z
    .number()
    .min(0)
    .max(100)
    .describe('False positive probability 0-100. 0 = definitely real, 100 = definitely false positive'),
  riskScore: z
    .number()
    .min(0)
    .max(100)
    .describe('Risk score 0-100 considering CVSS, exploitability, business impact, and context'),
  businessImpact: z
    .string()
    .describe('One-sentence business impact statement for a non-technical executive'),
  owaspCategory: z
    .string()
    .optional()
    .describe('OWASP Top 10 category code, e.g. "A01:2021 – Broken Access Control"'),
});

type FindingAnalysis = z.infer<typeof FindingAnalysisSchema>;

const SYSTEM_PROMPT = `You are a senior application security engineer analyzing vulnerability scan findings.
Your job is to explain findings clearly to developers, provide actionable remediation, and assess risk.
The finding context has been pseudonymized (e.g. [DOMAIN-1], [IP-1], [PATH-1]) — this is intentional.
Be specific and technical but explain in plain language where possible.
For false positive probability: template-based scanners like Nuclei have low false positive rates for CVEs (~5-10%)
but higher for generic checks (~20-40%). Use CVSS score and CVE IDs as anchoring signals.`;

export interface FindingContext {
  id: string;
  title: string;
  templateId?: string | null;
  templateName?: string | null;
  severity: string;
  matchedAt?: string | null;
  cveIds: string[];
  cweIds: string[];
  cvssScore?: number | null;
  cvssVector?: string | null;
  httpRequest?: string | null;
  httpResponse?: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly anthropic;

  constructor(private readonly config: ConfigService) {
    this.anthropic = createAnthropic({
      apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
  }

  async analyzeFinding(finding: FindingContext): Promise<FindingAnalysis> {
    const pseudo = new Pseudonymizer();

    // Build context string — pseudonymize before sending
    const raw = JSON.stringify({
      title: finding.title,
      templateId: finding.templateId,
      severity: finding.severity,
      matchedAt: finding.matchedAt,
      cveIds: finding.cveIds,
      cweIds: finding.cweIds,
      cvssScore: finding.cvssScore,
      cvssVector: finding.cvssVector,
      // Limit HTTP evidence to 500 chars to control token usage
      httpRequestSnippet: finding.httpRequest?.substring(0, 500),
      httpResponseSnippet: finding.httpResponse?.substring(0, 500),
    }, null, 2);

    const pseudoContext = pseudo.pseudonymize(raw);

    const { object } = await generateObject({
      model: this.anthropic('claude-haiku-4-5-20251001'),
      schema: FindingAnalysisSchema,
      system: SYSTEM_PROMPT,
      prompt: `Analyze this security finding:\n\n${pseudoContext}`,
    });

    // Restore pseudonyms in text fields before storing
    return {
      explanation: pseudo.restore(object.explanation),
      remediation: pseudo.restore(object.remediation),
      fpProbability: object.fpProbability,
      riskScore: object.riskScore,
      businessImpact: pseudo.restore(object.businessImpact),
      owaspCategory: object.owaspCategory,
    };
  }

  async complete(
    systemPrompt: string,
    userMessage: string,
    options: { maxTokens?: number; temperature?: number } = {},
  ): Promise<string> {
    const { text } = await generateText({
      model: this.anthropic('claude-haiku-4-5-20251001'),
      system: systemPrompt,
      prompt: userMessage,
      maxTokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0,
    });
    return text;
  }

  /**
   * M49 — Risk Scoring v2: composite score combining CVSS, EPSS, KEV, SLA breach days, and recurrence.
   * Score 0–100 weighted: CVSS 40%, EPSS 20%, KEV 20%, SLA urgency 15%, recurrence 5%.
   */
  computeRiskScoreV2(finding: {
    cvssScore?: number | null;
    epssScore?: number | null;
    kevListed?: boolean | null;
    slaDaysRemaining?: number | null;
    isDuplicate?: boolean;
  }): { score: number; breakdown: Record<string, number> } {
    const cvssNorm  = ((finding.cvssScore ?? 0) / 10) * 100;
    const epssNorm  = (finding.epssScore ?? 0) * 100;
    const kevScore  = (finding.kevListed ?? false) ? 100 : 0;
    const slaUrgency = finding.slaDaysRemaining != null
      ? finding.slaDaysRemaining < 0
        ? 100
        : finding.slaDaysRemaining < 7
        ? 75
        : finding.slaDaysRemaining < 30
        ? 40
        : 10
      : 20;
    const recurrenceScore = (finding.isDuplicate ?? false) ? 80 : 0;

    const score = Math.round(
      cvssNorm * 0.40 +
      epssNorm * 0.20 +
      kevScore * 0.20 +
      slaUrgency * 0.15 +
      recurrenceScore * 0.05,
    );

    return {
      score: Math.min(score, 100),
      breakdown: {
        cvss: Math.round(cvssNorm),
        epss: Math.round(epssNorm),
        kev: kevScore,
        slaUrgency,
        recurrence: recurrenceScore,
      },
    };
  }

  async analyzeFindings(findings: FindingContext[]): Promise<void> {
    // Sequential to stay within rate limits — haiku is fast enough
    for (const finding of findings) {
      try {
        const analysis = await this.analyzeFinding(finding);
        this.logger.log(
          `AI analysis complete for finding ${finding.id}: risk=${analysis.riskScore}, fp=${analysis.fpProbability}%`,
        );
        // Caller stores the result — AiService doesn't touch the DB
        (finding as FindingContext & { _analysis?: FindingAnalysis })._analysis = analysis;
      } catch (err) {
        this.logger.error(`AI analysis failed for finding ${finding.id}`, err);
      }
    }
  }
}
