import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@ptaas/db';
import { PrismaService } from '../../../prisma/prisma.service';
import { ARENA_GOAL_CATALOG, CatalogGoal } from './goals.data';

@Injectable()
export class ArenaCatalogService implements OnModuleInit {
  private readonly log = new Logger(ArenaCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      // The catalog is reference data; a failed seed must not keep the whole API from booting.
      this.log.error(`Arena catalog seed failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Idempotent: upserts every catalog goal by key. */
  async seed(goals: CatalogGoal[] = ARENA_GOAL_CATALOG): Promise<number> {
    for (const g of goals) {
      const data = {
        version: g.version,
        category: g.category,
        title: g.title,
        description: g.description,
        owaspRef: g.owaspRef,
        atlasRef: g.atlasRef,
        baseSeverity: g.baseSeverity,
        seedAttacks: g.seedAttacks as Prisma.InputJsonValue,
        successCriteria: g.successCriteria as unknown as Prisma.InputJsonValue,
        active: true,
      };
      await this.prisma.arenaGoal.upsert({ where: { key: g.key }, create: { key: g.key, ...data }, update: data });
    }
    return goals.length;
  }
}
