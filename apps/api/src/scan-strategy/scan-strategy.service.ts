import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SCAN_QUEUE, ScanJobData } from '../scans/scan-queue.constants';

export const STRATEGY_QUEUE = 'strategy-queue';

export interface StrategyJobData {
  strategyId: string;
  projectId: string;
  organizationId: string;
  targetUrl: string;
  targetId: string;
  userId: string;
  previousFindingsSummary: string;
}

export interface ScanPlanStep {
  type: 'QUICK' | 'FULL' | 'WEB_CRAWL' | 'API_SCAN';
  tags?: string[];
  severities?: string[];
  priority: number;
  rationale: string;
}

@Injectable()
export class ScanStrategyService {
  private readonly logger = new Logger(ScanStrategyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(STRATEGY_QUEUE) private readonly strategyQueue: Queue,
    @InjectQueue(SCAN_QUEUE) private readonly scanQueue: Queue<ScanJobData>,
  ) {}

  async createStrategy(projectId: string, orgId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      include: {
        targets: { take: 1, select: { id: true, value: true } },
        findings: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: { title: true, severity: true, templateId: true, owasp: true },
        },
      },
    });

    if (!project) throw new NotFoundException('Project not found');
    const target = project.targets[0];
    if (!target) throw new NotFoundException('Project has no target configured');

    const findingsSummary = project.findings
      .map((f) => `${f.severity}: ${f.title}${f.owasp ? ` [${f.owasp}]` : ''}`)
      .join('\n');

    const strategy = await this.prisma.scanStrategy.create({
      data: {
        status: 'PENDING',
        projectId,
        organizationId: orgId,
      },
    });

    const jobData: StrategyJobData = {
      strategyId: strategy.id,
      projectId,
      organizationId: orgId,
      targetUrl: target.value,
      targetId: target.id,
      userId,
      previousFindingsSummary: findingsSummary,
    };

    await this.strategyQueue.add('strategy', jobData, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`Strategy ${strategy.id} queued for project ${projectId}`);
    return { strategyId: strategy.id, status: 'PENDING' };
  }

  async getStrategy(strategyId: string, orgId: string) {
    const strategy = await this.prisma.scanStrategy.findFirst({
      where: { id: strategyId, organizationId: orgId },
    });
    if (!strategy) throw new NotFoundException('Strategy not found');
    return strategy;
  }

  async listStrategies(projectId: string, orgId: string) {
    return this.prisma.scanStrategy.findMany({
      where: { projectId, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async executeStrategy(strategyId: string, orgId: string, userId: string) {
    const strategy = await this.prisma.scanStrategy.findFirst({
      where: { id: strategyId, organizationId: orgId },
    });
    if (!strategy) throw new NotFoundException('Strategy not found');
    if (strategy.status !== 'COMPLETED') {
      throw new Error('Strategy must be COMPLETED before execution');
    }

    const plan = strategy.plan as unknown as ScanPlanStep[];
    const project = await this.prisma.project.findUnique({
      where: { id: strategy.projectId },
      include: { targets: { take: 1, select: { id: true, value: true, type: true } } },
    });
    if (!project?.targets[0]) throw new NotFoundException('Project target not found');

    const target = project.targets[0];
    const createdScans: string[] = [];

    const sortedSteps = [...plan].sort((a, b) => a.priority - b.priority);

    for (const step of sortedSteps) {
      const scan = await this.prisma.scan.create({
        data: {
          type: step.type as any,
          status: 'QUEUED',
          projectId: strategy.projectId,
          organizationId: orgId,
          targetId: target.id,
          createdById: userId,
          templateCategories: step.tags ?? ['cves', 'misconfigurations', 'exposures'],
          rateLimit: step.type === 'FULL' ? 30 : 100,
        },
      });

      const jobData: ScanJobData = {
        scanId: scan.id,
        targetId: target.id,
        targetValue: target.value,
        targetType: target.type,
        projectId: strategy.projectId,
        organizationId: orgId,
        scanType: step.type,
        templateCategories: step.tags ?? ['cves', 'misconfigurations', 'exposures'],
        excludePaths: [],
        rateLimit: step.type === 'FULL' ? 30 : 100,
        hasCredentials: false,
        policyNucleiSeverities: step.severities,
      };

      await this.scanQueue.add('scan', jobData, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      });

      createdScans.push(scan.id);
    }

    this.logger.log(`Executed strategy ${strategyId}: ${createdScans.length} scans queued`);
    return { createdScans, stepsCount: sortedSteps.length };
  }
}
