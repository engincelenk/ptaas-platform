import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DiffStatus = 'NEW' | 'PERSISTING' | 'RESOLVED';

@Injectable()
export class DiffService {
  private readonly log = new Logger(DiffService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compare findings from newScanId against previousScanId.
   * Deduplication key: templateId + matchedAt (same vuln on same URL).
   * Sets diffStatus on all findings and returns counts.
   */
  async computeDiff(
    newScanId: string,
    previousScanId: string | null,
  ): Promise<{ newCount: number; persistingCount: number; resolvedCount: number }> {
    const newFindings = await this.prisma.finding.findMany({
      where: { scanId: newScanId },
      select: { id: true, templateId: true, matchedAt: true },
    });

    if (!previousScanId) {
      // First scan — everything is NEW
      await this.prisma.finding.updateMany({
        where: { scanId: newScanId },
        data: { diffStatus: 'NEW' },
      });
      this.log.log(`Diff ${newScanId}: ${newFindings.length} NEW (first scan)`);
      return { newCount: newFindings.length, persistingCount: 0, resolvedCount: 0 };
    }

    const prevFindings = await this.prisma.finding.findMany({
      where: { scanId: previousScanId },
      select: { id: true, templateId: true, matchedAt: true },
    });

    const prevKeys = new Set(prevFindings.map((f) => `${f.templateId}|${f.matchedAt}`));
    const newKeys = new Set(newFindings.map((f) => `${f.templateId}|${f.matchedAt}`));

    const newIds: string[] = [];
    const persistingIds: string[] = [];

    for (const f of newFindings) {
      const key = `${f.templateId}|${f.matchedAt}`;
      if (prevKeys.has(key)) {
        persistingIds.push(f.id);
      } else {
        newIds.push(f.id);
      }
    }

    // Resolved = in prev but not in new
    const resolvedIds = prevFindings
      .filter((f) => !newKeys.has(`${f.templateId}|${f.matchedAt}`))
      .map((f) => f.id);

    await this.prisma.$transaction([
      this.prisma.finding.updateMany({
        where: { id: { in: newIds } },
        data: { diffStatus: 'NEW' },
      }),
      this.prisma.finding.updateMany({
        where: { id: { in: persistingIds } },
        data: { diffStatus: 'PERSISTING' },
      }),
      this.prisma.finding.updateMany({
        where: { id: { in: resolvedIds } },
        data: { diffStatus: 'RESOLVED' },
      }),
    ]);

    this.log.log(
      `Diff ${newScanId} vs ${previousScanId}: NEW=${newIds.length} PERSISTING=${persistingIds.length} RESOLVED=${resolvedIds.length}`,
    );

    return {
      newCount: newIds.length,
      persistingCount: persistingIds.length,
      resolvedCount: resolvedIds.length,
    };
  }

  /** Return new finding objects (post-diff) for alert processing. */
  async getNewFindings(scanId: string) {
    return this.prisma.finding.findMany({
      where: { scanId, diffStatus: 'NEW' },
      select: {
        id: true, title: true, severity: true, matchedAt: true,
        cvssScore: true, cveIds: true, projectId: true, organizationId: true,
      },
    });
  }
}
