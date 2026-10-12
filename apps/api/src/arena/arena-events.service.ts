import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { Redis } from 'ioredis';
import { arenaRedisKeys } from './arena.constants';
import type { ArenaEvent } from './arena-events';

/**
 * Fan-out of run events to SSE subscribers. Publishing goes through Redis pub/sub so the
 * BullMQ worker and the API instance serving the SSE connection need not be the same process.
 * Subscribers receive events per (organizationId, runId) only — never across tenants.
 */
@Injectable()
export class ArenaEventsService implements OnModuleDestroy {
  private readonly log = new Logger(ArenaEventsService.name);
  private readonly local = new EventEmitter();
  private sub?: Redis;
  private readonly channels = new Map<string, number>();

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
    this.local.setMaxListeners(0);
  }

  async publish(organizationId: string, runId: string, event: ArenaEvent): Promise<void> {
    try {
      await this.redis.publish(arenaRedisKeys.eventsChannel(organizationId, runId), JSON.stringify(event));
    } catch (err) {
      this.log.warn(`event publish failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Returns an unsubscribe function. */
  async subscribe(organizationId: string, runId: string, handler: (e: ArenaEvent) => void): Promise<() => void> {
    const channel = arenaRedisKeys.eventsChannel(organizationId, runId);
    if (!this.sub) {
      this.sub = this.redis.duplicate();
      this.sub.on('message', (ch: string, msg: string) => {
        try {
          this.local.emit(ch, JSON.parse(msg) as ArenaEvent);
        } catch {
          /* ignore malformed */
        }
      });
    }
    const count = this.channels.get(channel) ?? 0;
    if (count === 0) await this.sub.subscribe(channel);
    this.channels.set(channel, count + 1);
    this.local.on(channel, handler);

    return () => {
      this.local.off(channel, handler);
      const left = (this.channels.get(channel) ?? 1) - 1;
      if (left <= 0) {
        this.channels.delete(channel);
        void this.sub?.unsubscribe(channel);
      } else {
        this.channels.set(channel, left);
      }
    };
  }

  async onModuleDestroy() {
    await this.sub?.quit().catch(() => undefined);
  }
}
