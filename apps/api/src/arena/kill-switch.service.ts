import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { arenaRedisKeys } from './arena.constants';

/** Emergency stop. Checked by the engine before EVERY round and before every request. */
@Injectable()
export class KillSwitchService {
  constructor(private readonly redis: RedisService) {}

  async killRun(runId: string): Promise<void> {
    await this.redis.set(arenaRedisKeys.killRun(runId), '1', 24 * 3600);
  }

  async setGlobal(on: boolean): Promise<void> {
    if (on) await this.redis.set(arenaRedisKeys.killGlobal(), '1');
    else await this.redis.del(arenaRedisKeys.killGlobal());
  }

  /** True if this run (or the whole arena) must stop right now. */
  async isKilled(runId: string): Promise<boolean> {
    const [g, r] = await Promise.all([
      this.redis.exists(arenaRedisKeys.killGlobal()),
      this.redis.exists(arenaRedisKeys.killRun(runId)),
    ]);
    return g || r;
  }
}
