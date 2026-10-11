import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ScansService } from '../scans/scans.service';

const SCAN_TYPES = ['QUICK', 'FULL', 'AUTHENTICATED'] as const;

// Minimal cron-expression validator (5-field standard cron)
const CRON_RE = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

function computeNextRun(cronExpr: string): Date {
  // Parse the next occurrence using a simple approach:
  // split into [min, hour, dom, mon, dow]
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return new Date(Date.now() + 3600000);

  const now = new Date();
  // Try up to 8 days ahead in 1-minute steps to find matching time
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1); // start from next minute

  for (let i = 0; i < 11520; i++) { // max 8 days * 24h * 60m
    if (_cronMatches(parts, candidate)) return candidate;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return new Date(Date.now() + 86400000);
}

function _cronMatches(parts: string[], d: Date): boolean {
  const [min, hour, dom, mon, dow] = parts;
  return (
    _fieldMatches(min,  d.getMinutes()) &&
    _fieldMatches(hour, d.getHours()) &&
    _fieldMatches(dom,  d.getDate()) &&
    _fieldMatches(mon,  d.getMonth() + 1) &&
    _fieldMatches(dow,  d.getDay())
  );
}

function _fieldMatches(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field.includes('/')) {
    const [, step] = field.split('/');
    return value % parseInt(step) === 0;
  }
  if (field.includes(',')) return field.split(',').map(Number).includes(value);
  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number);
    return value >= lo && value <= hi;
  }
  return parseInt(field) === value;
}

export interface CreateScheduleDto {
  targetId: string;
  scanType?: string;
  cronExpr: string;
  policyId?: string;
}

@Injectable()
export class ScanSchedulesService {
  private readonly logger = new Logger(ScanSchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scans: ScansService,
  ) {}

  async list(projectId: string, orgId: string) {
    await this._assertProject(projectId, orgId);
    return this.prisma.scanSchedule.findMany({
      where: { projectId, organizationId: orgId },
      include: {
        target:    { select: { id: true, value: true, type: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(projectId: string, orgId: string, userId: string, dto: CreateScheduleDto) {
    await this._assertProject(projectId, orgId);

    if (!CRON_RE.test(dto.cronExpr.trim())) {
      throw new BadRequestException('Invalid cron expression. Use 5-field standard format: min hour dom mon dow');
    }
    if (dto.scanType && !SCAN_TYPES.includes(dto.scanType as any)) {
      throw new BadRequestException(`scanType must be one of: ${SCAN_TYPES.join(', ')}`);
    }

    const target = await this.prisma.target.findFirst({ where: { id: dto.targetId, organizationId: orgId } });
    if (!target) throw new NotFoundException('Target not found');
    if (target.verificationStatus !== 'VERIFIED') {
      throw new BadRequestException('Target must be verified before scheduling scans');
    }

    const nextRunAt = computeNextRun(dto.cronExpr);

    return this.prisma.scanSchedule.create({
      data: {
        organizationId: orgId,
        projectId,
        targetId: dto.targetId,
        scanType:  dto.scanType ?? 'QUICK',
        cronExpr:  dto.cronExpr.trim(),
        isActive:  true,
        policyId:  dto.policyId ?? null,
        nextRunAt,
        createdById: userId,
      },
      include: {
        target:    { select: { id: true, value: true, type: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async update(scheduleId: string, orgId: string, dto: { isActive?: boolean; cronExpr?: string; scanType?: string }) {
    const schedule = await this.prisma.scanSchedule.findFirst({ where: { id: scheduleId, organizationId: orgId } });
    if (!schedule) throw new NotFoundException('Schedule not found');

    if (dto.cronExpr && !CRON_RE.test(dto.cronExpr.trim())) {
      throw new BadRequestException('Invalid cron expression');
    }
    const nextRunAt = dto.cronExpr ? computeNextRun(dto.cronExpr) : undefined;

    return this.prisma.scanSchedule.update({
      where: { id: scheduleId },
      data: {
        ...(dto.isActive  !== undefined && { isActive: dto.isActive }),
        ...(dto.cronExpr  !== undefined && { cronExpr: dto.cronExpr.trim(), nextRunAt }),
        ...(dto.scanType  !== undefined && { scanType: dto.scanType }),
      },
      include: {
        target:    { select: { id: true, value: true, type: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(scheduleId: string, orgId: string) {
    const schedule = await this.prisma.scanSchedule.findFirst({ where: { id: scheduleId, organizationId: orgId } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    await this.prisma.scanSchedule.delete({ where: { id: scheduleId } });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runDueSchedules() {
    const now = new Date();
    const due = await this.prisma.scanSchedule.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
    });

    for (const sched of due) {
      try {
        await this.scans.create(
          { targetId: sched.targetId, type: sched.scanType as any, policyId: sched.policyId ?? undefined },
          sched.createdById,
          sched.organizationId,
        );
        const nextRunAt = computeNextRun(sched.cronExpr);
        await this.prisma.scanSchedule.update({
          where: { id: sched.id },
          data:  { lastRunAt: now, nextRunAt },
        });
        this.logger.log(`Scheduled scan triggered: schedule=${sched.id} target=${sched.targetId}`);
      } catch (err: any) {
        this.logger.warn(`Scheduled scan failed: schedule=${sched.id} error=${err?.message}`);
        // Bump nextRunAt by 1h to avoid tight retry storm
        const nextRunAt = new Date(Date.now() + 3600000);
        await this.prisma.scanSchedule.update({ where: { id: sched.id }, data: { nextRunAt } });
      }
    }
  }

  private async _assertProject(projectId: string, orgId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }
}
