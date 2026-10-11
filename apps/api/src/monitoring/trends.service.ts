import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface WeekBucket {
  week: string;       // ISO week start date "YYYY-MM-DD"
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  INFO: number;
  total: number;
}

export interface TrendData {
  weeks: WeekBucket[];
  totalNew: number;
  totalResolved: number;
  openByseverity: Record<string, number>;
}

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
const WEEKS = 12;

@Injectable()
export class TrendsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectTrends(projectId: string, orgId: string): Promise<TrendData> {
    const since = new Date();
    since.setDate(since.getDate() - WEEKS * 7);

    // Raw findings in range — select only needed fields
    const findings = await this.prisma.finding.findMany({
      where: {
        projectId,
        organizationId: orgId,
        createdAt: { gte: since },
        diffStatus: { not: 'RESOLVED' },
      },
      select: { severity: true, createdAt: true, diffStatus: true },
    });

    // Build week buckets
    const bucketMap = new Map<string, WeekBucket>();

    for (const f of findings) {
      const weekStart = this._isoWeekStart(f.createdAt);
      if (!bucketMap.has(weekStart)) {
        bucketMap.set(weekStart, {
          week: weekStart,
          CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, total: 0,
        });
      }
      const bucket = bucketMap.get(weekStart)!;
      (bucket as any)[f.severity] = ((bucket as any)[f.severity] ?? 0) + 1;
      bucket.total += 1;
    }

    // Fill empty weeks so chart is continuous
    const weeks: WeekBucket[] = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const key = this._isoWeekStart(d);
      weeks.push(bucketMap.get(key) ?? { week: key, CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, total: 0 });
    }

    // Aggregates
    const [newCount, resolvedCount] = await Promise.all([
      this.prisma.finding.count({ where: { projectId, organizationId: orgId, diffStatus: 'NEW', createdAt: { gte: since } } }),
      this.prisma.finding.count({ where: { projectId, organizationId: orgId, diffStatus: 'RESOLVED', createdAt: { gte: since } } }),
    ]);

    const openRaw = await this.prisma.finding.groupBy({
      by: ['severity'],
      where: { projectId, organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      _count: { id: true },
    });

    const openByseverity: Record<string, number> = {};
    for (const s of SEVERITIES) openByseverity[s] = 0;
    for (const row of openRaw) openByseverity[row.severity] = row._count.id;

    return { weeks, totalNew: newCount, totalResolved: resolvedCount, openByseverity };
  }

  private _isoWeekStart(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  }
}
