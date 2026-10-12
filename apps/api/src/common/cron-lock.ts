import { Logger } from '@nestjs/common';

/** Minimaler Redis-Ausschnitt (erfüllt von RedisService). */
export interface CronLockRedis {
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
}

export interface CronLockOptions {
  /**
   * true (Default): Lock nach Abschluss freigeben.
   * false: Lock nach erfolgreichem Lauf bis zum TTL-Ablauf behalten (Schutz vor
   * Doppelläufen durch eine zweite Instanz, die kurz nach der ersten tickt).
   * Bei einem Fehler in fn wird der Lock in jedem Fall freigegeben.
   */
  releaseOnFinish?: boolean;
}

const logger = new Logger('CronLock');

const LOCK_PREFIX = 'cron-lock:';

/** UTC-Datum (YYYY-MM-DD) für Tageslauf-Lock-Keys. */
export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** UTC-Monat (YYYY-MM) für Monatslauf-Lock-Keys. */
export function utcMonthKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7);
}

/**
 * Führt fn nur aus, wenn der Redis-Lock (SET NX EX) erworben wurde.
 * Wirft nie. Rückgabe: true, wenn fn ausgeführt wurde (auch bei Fehler in fn), sonst false.
 */
export async function withCronLock(
  redis: CronLockRedis,
  name: string,
  ttlSeconds: number,
  fn: () => Promise<void>,
  options: CronLockOptions = {},
): Promise<boolean> {
  const key = `${LOCK_PREFIX}${name}`;
  const releaseOnFinish = options.releaseOnFinish ?? true;

  let acquired = false;
  try {
    acquired = await redis.setIfAbsent(key, String(Date.now()), ttlSeconds);
  } catch (err) {
    logger.warn(`Lock acquisition failed for ${name}: ${errName(err)}`);
    return false;
  }
  if (!acquired) {
    logger.debug(`Lock ${name} held by another instance, skipping`);
    return false;
  }

  let failed = false;
  try {
    await fn();
  } catch (err) {
    failed = true;
    logger.warn(`Cron job ${name} failed: ${errName(err)}`);
  }

  if (releaseOnFinish || failed) {
    try {
      await redis.del(key);
    } catch (err) {
      logger.warn(`Lock release failed for ${name}: ${errName(err)}`);
    }
  }
  return true;
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'UnknownError';
}
