import { describe, it, expect } from 'vitest';
import { withCronLock, utcDayKey, utcMonthKey, CronLockRedis } from './cron-lock';

class FakeRedis implements CronLockRedis {
  store = new Map<string, string>();
  ttl = new Map<string, number>();
  failSet = false;
  failDel = false;
  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.failSet) throw new Error('redis down');
    if (this.store.has(key)) return false;
    this.store.set(key, value);
    this.ttl.set(key, ttlSeconds);
    return true;
  }
  async del(...keys: string[]) {
    if (this.failDel) throw new Error('redis down');
    keys.forEach((k) => this.store.delete(k));
  }
}

describe('withCronLock', () => {
  it('runs fn, passes TTL and releases the lock afterwards', async () => {
    const r = new FakeRedis();
    let ran = false;
    const executed = await withCronLock(r, 'job', 60, async () => {
      ran = true;
      expect(r.store.size).toBe(1);
    });
    expect(executed).toBe(true);
    expect(ran).toBe(true);
    expect(r.store.size).toBe(0);
    expect(r.ttl.get('cron-lock:job')).toBe(60);
  });

  it('skips fn when lock is held by another instance', async () => {
    const r = new FakeRedis();
    r.store.set('cron-lock:job', 'x');
    let ran = false;
    expect(await withCronLock(r, 'job', 60, async () => { ran = true; })).toBe(false);
    expect(ran).toBe(false);
    expect(r.store.has('cron-lock:job')).toBe(true);
  });

  it('only one of two concurrent callers executes', async () => {
    const r = new FakeRedis();
    let runs = 0;
    const fn = async () => {
      runs++;
      await new Promise((res) => setTimeout(res, 5));
    };
    const results = await Promise.all([withCronLock(r, 'j', 60, fn), withCronLock(r, 'j', 60, fn)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(runs).toBe(1);
  });

  it('never throws: fn errors are swallowed, lock released, returns true', async () => {
    const r = new FakeRedis();
    const res = await withCronLock(r, 'job', 60, async () => { throw new Error('boom'); }, { releaseOnFinish: false });
    expect(res).toBe(true);
    expect(r.store.size).toBe(0);
  });

  it('never throws on redis errors', async () => {
    const r = new FakeRedis();
    r.failSet = true;
    expect(await withCronLock(r, 'job', 60, async () => undefined)).toBe(false);
    r.failSet = false;
    r.failDel = true;
    expect(await withCronLock(r, 'job', 60, async () => undefined)).toBe(true);
  });

  it('keeps the lock after success when releaseOnFinish=false', async () => {
    const r = new FakeRedis();
    await withCronLock(r, 'job', 60, async () => undefined, { releaseOnFinish: false });
    expect(r.store.has('cron-lock:job')).toBe(true);
    expect(await withCronLock(r, 'job', 60, async () => undefined)).toBe(false);
  });

  it('builds UTC keys', () => {
    const d = new Date('2026-03-01T00:30:00+02:00'); // 2026-02-28T22:30Z
    expect(utcDayKey(d)).toBe('2026-02-28');
    expect(utcMonthKey(d)).toBe('2026-02');
  });
});
