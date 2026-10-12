import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { arenaRedisKeys } from './arena.constants';

/**
 * Emergency stop. Checked by the engine before EVERY round and before every request.
 * Three scopes: one run, one organization (any org admin may use this for their own org),
 * and the whole platform (operators only — see ARENA_PLATFORM_ADMINS).
 */
@Injectable()
export class KillSwitchService {
  constructor(private readonly redis: RedisService) {}

  async killRun(runId: string): Promise<void> {
    await this.redis.set(arenaRedisKeys.killRun(runId), '1', 24 * 3600);
  }

  async setOrg(organizationId: string, on: boolean): Promise<void> {
    if (on) await this.redis.set(arenaRedisKeys.killOrg(organizationId), '1');
    else await this.redis.del(arenaRedisKeys.killOrg(organizationId));
  }

  async setGlobal(on: boolean): Promise<void> {
    if (on) await this.redis.set(arenaRedisKeys.killGlobal(), '1');
    else await this.redis.del(arenaRedisKeys.killGlobal());
  }

  /** True if this run, its organization, or the whole arena must stop right now. */
  async isKilled(runId: string, organizationId?: string): Promise<boolean> {
    const checks = [
      this.redis.exists(arenaRedisKeys.killGlobal()),
      this.redis.exists(arenaRedisKeys.killRun(runId)),
    ];
    if (organizationId) checks.push(this.redis.exists(arenaRedisKeys.killOrg(organizationId)));
    return (await Promise.all(checks)).some(Boolean);
  }
}
