import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

export interface AttackNode {
  id: string;          // finding id
  label: string;       // finding title (truncated)
  severity: string;
  owasp: string | null;
  cvssScore: number | null;
  priorityScore: number | null;
  position: { x: number; y: number };
}

export interface AttackEdge {
  id: string;
  source: string;
  target: string;
  label: string;       // e.g. "enables" | "escalates to" | "pivots via"
}

export interface AttackPathResult {
  id: string;
  title: string;
  description: string | null;
  nodes: AttackNode[];
  edges: AttackEdge[];
  impactScore: number | null;
  likelihood: string | null;
  createdAt: Date;
}

const ANALYSE_PROMPT = `You are an expert penetration tester performing attack path analysis.

You will receive a list of security findings. Identify logical attack chains where one vulnerability enables or escalates to another.

Return a JSON object with this exact schema:
{
  "paths": [
    {
      "title": "short attack path name",
      "description": "1-2 sentence narrative of how an attacker would chain these findings",
      "likelihood": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "impactScore": <0-100 float>,
      "chain": [
        {
          "findingId": "<id from input>",
          "edgeLabel": "<what this step enables — empty string for first node>"
        }
      ]
    }
  ]
}

Rules:
- Only create paths with 2+ findings that are logically connected
- impactScore = average CVSS of chain × chaining bonus (1.2 for 2 links, 1.5 for 3+), capped at 100
- likelihood: CRITICAL if chain starts from unauthenticated vector, HIGH if authenticated, MEDIUM if requires physical/social, LOW otherwise
- Maximum 5 paths total
- Do NOT invent finding IDs — only use IDs from the input
- Output ONLY the JSON object, no markdown`;

@Injectable()
export class AttackPathsService {
  private readonly logger = new Logger(AttackPathsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async analyse(projectId: string, orgId: string): Promise<AttackPathResult[]> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Fetch relevant findings
    const findings = await this.prisma.finding.findMany({
      where: {
        projectId,
        organizationId: orgId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'FIXED'] },
        severity: { in: ['CRITICAL', 'HIGH', 'MEDIUM'] },
      },
      select: {
        id: true,
        title: true,
        severity: true,
        owasp: true,
        cvssScore: true,
        priorityScore: true,
        matchedAt: true,
        cweIds: true,
        templateId: true,
      },
      orderBy: [{ severity: 'asc' }, { priorityScore: 'desc' }],
      take: 30,
    });

    if (findings.length < 2) {
      return [];
    }

    // Delete existing paths for this project before re-analysis
    await this.prisma.attackPath.deleteMany({ where: { projectId, organizationId: orgId } });

    const findingsInput = findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      owasp: f.owasp,
      cvssScore: f.cvssScore,
      cweIds: f.cweIds,
      matchedAt: f.matchedAt,
    }));

    let raw: string;
    try {
      raw = await this.ai.complete(
        ANALYSE_PROMPT,
        `Findings to analyse:\n${JSON.stringify(findingsInput, null, 2)}`,
        { maxTokens: 3000, temperature: 0 },
      );
    } catch (err) {
      this.logger.error('Attack path AI analysis failed', err);
      throw err;
    }

    // Parse AI response
    let parsed: { paths: Array<{ title: string; description: string; likelihood: string; impactScore: number; chain: Array<{ findingId: string; edgeLabel: string }> }> };
    try {
      const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.warn('Attack path parse error', { raw: raw.slice(0, 200) });
      return [];
    }

    // Build finding lookup
    const findingMap = new Map(findings.map((f) => [f.id, f]));

    // Persist paths and build result
    const results: AttackPathResult[] = [];

    for (const path of parsed.paths ?? []) {
      const validChain = path.chain.filter((c) => findingMap.has(c.findingId));
      if (validChain.length < 2) continue;

      // Build nodes with staggered horizontal layout
      const nodes: AttackNode[] = validChain.map((c, i) => {
        const f = findingMap.get(c.findingId)!;
        return {
          id: f.id,
          label: f.title.length > 40 ? f.title.slice(0, 37) + '…' : f.title,
          severity: f.severity,
          owasp: f.owasp,
          cvssScore: f.cvssScore,
          priorityScore: f.priorityScore,
          position: { x: i * 260, y: 0 },
        };
      });

      const edges: AttackEdge[] = validChain.slice(1).map((c, i) => ({
        id: `e-${i}`,
        source: validChain[i].findingId,
        target: c.findingId,
        label: c.edgeLabel || 'enables',
      }));

      const record = await this.prisma.attackPath.create({
        data: {
          title: path.title,
          description: path.description,
          nodes: nodes as any,
          edges: edges as any,
          impactScore: Math.min(path.impactScore ?? 0, 100),
          likelihood: path.likelihood,
          projectId,
          organizationId: orgId,
        },
      });

      results.push({
        id: record.id,
        title: record.title,
        description: record.description,
        nodes,
        edges,
        impactScore: record.impactScore,
        likelihood: record.likelihood,
        createdAt: record.createdAt,
      });
    }

    this.logger.log(`Attack path analysis: ${results.length} paths for project ${projectId}`);
    return results;
  }

  async list(projectId: string, orgId: string): Promise<AttackPathResult[]> {
    const paths = await this.prisma.attackPath.findMany({
      where: { projectId, organizationId: orgId },
      orderBy: { impactScore: 'desc' },
    });

    return paths.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      nodes: p.nodes as unknown as AttackNode[],
      edges: p.edges as unknown as AttackEdge[],
      impactScore: p.impactScore,
      likelihood: p.likelihood,
      createdAt: p.createdAt,
    }));
  }
}
