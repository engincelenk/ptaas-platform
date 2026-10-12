import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ArenaEvent } from '../arena-events';
import { ArenaStreamController, MAX_SSE_PER_ORG, SSE_HEARTBEAT_MS } from './arena-stream.controller';
import { ArenaStreamTicketService } from './arena-stream-ticket.service';

class FakeRes extends EventEmitter {
  chunks: string[] = [];
  headers: Record<string, string> = {};
  writableEnded = false;
  statusCode = 0;
  status(c: number) {
    this.statusCode = c;
    return this;
  }
  setHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  flushHeaders() {}
  write(c: string) {
    this.chunks.push(c);
    return true;
  }
  end() {
    this.writableEnded = true;
    this.emit('close');
  }
  frames(): ArenaEvent[] {
    return this.chunks.filter((c) => c.startsWith('data: ')).map((c) => JSON.parse(c.slice(6)) as ArenaEvent);
  }
}

const SCORE = { totals: { attempts: 0, breaches: 0, blocked: 0, unclear: 0, breachRate: 0, blockRate: 0 }, byCategory: {}, budget: { usedRequests: 0, maxRequests: 1, usedTokens: 0, maxTokens: 1 } };

function setup(statuses: string[] = ['RUNNING', 'RUNNING']) {
  const tickets = new ArenaStreamTicketService({ getOrThrow: () => 'secret' } as never);
  const queue = [...statuses];
  const runs = {
    statusOf: vi.fn().mockImplementation((_id: string, org: string) => {
      if (org !== 'org1') return Promise.reject(new NotFoundException());
      return Promise.resolve(queue.length > 1 ? queue.shift() : queue[0]);
    }),
  };
  const scoreboard = { compute: vi.fn().mockResolvedValue(SCORE) };
  let handler: ((e: ArenaEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const events = {
    subscribe: vi.fn().mockImplementation((_o: string, _r: string, h: (e: ArenaEvent) => void) => {
      handler = h;
      return Promise.resolve(unsubscribe);
    }),
  };
  const used = new Set<string>();
  const redis = {
    setIfAbsent: vi.fn().mockImplementation((k: string) => {
      if (used.has(k)) return Promise.resolve(false);
      used.add(k);
      return Promise.resolve(true);
    }),
  };
  const ctrl = new ArenaStreamController(tickets, runs as never, scoreboard as never, events as never, redis as never);
  return { ctrl, redis, tickets, runs, events, unsubscribe, emit: (e: ArenaEvent) => handler?.(e) };
}

afterEach(() => vi.useRealTimers());

describe('ArenaStreamController', () => {
  it('createTicket verifies run ownership first (foreign run → 404)', async () => {
    const { ctrl } = setup();
    await expect(ctrl.createTicket('run1', { sub: 'u1', orgId: 'other' } as never)).rejects.toThrow(NotFoundException);
    const t = await ctrl.createTicket('run1', { sub: 'u1', orgId: 'org1' } as never);
    expect(t.ticket).toContain('.');
  });

  it('rejects an invalid ticket / a ticket for another run before sending anything', async () => {
    const { ctrl, tickets } = setup();
    const res = new FakeRes();
    await expect(ctrl.stream('run1', { ticket: 'garbage' }, res as never)).rejects.toThrow(UnauthorizedException);
    const { ticket } = tickets.create('run2', 'org1', 'u1');
    await expect(ctrl.stream('run1', { ticket }, res as never)).rejects.toThrow(UnauthorizedException);
    expect(res.chunks).toEqual([]);
  });

  it('a ticket of another organization cannot read the run (404)', async () => {
    const { ctrl, tickets } = setup();
    const { ticket } = tickets.create('run1', 'other', 'u1');
    await expect(ctrl.stream('run1', { ticket }, new FakeRes() as never)).rejects.toThrow(NotFoundException);
  });

  it('sends SSE headers, run.status + score first, then live events, closes after done and unsubscribes', async () => {
    vi.useFakeTimers();
    const { ctrl, tickets, events, unsubscribe, emit } = setup();
    const res = new FakeRes();
    const { ticket } = tickets.create('run1', 'org1', 'u1');
    await ctrl.stream('run1', { ticket }, res as never);

    expect(res.headers['Content-Type']).toContain('text/event-stream');
    expect(res.headers['Cache-Control']).toContain('no-cache');
    expect(events.subscribe).toHaveBeenCalledWith('org1', 'run1', expect.any(Function));
    expect(res.frames().map((f) => f.type)).toEqual(['run.status', 'score']);

    emit({ type: 'recommendation', id: 'r', category: 'JAILBREAK', title: 't', text: 'x', priority: 1 });
    expect(res.frames().map((f) => f.type)).toEqual(['run.status', 'score', 'recommendation']);
    expect(res.writableEnded).toBe(false);

    emit({ type: 'done', status: 'COMPLETED' });
    expect(res.frames().at(-1)).toEqual({ type: 'done', status: 'COMPLETED' });
    expect(res.writableEnded).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('sends a heartbeat comment every 20 s and stops after disconnect', async () => {
    vi.useFakeTimers();
    const { ctrl, tickets, unsubscribe } = setup();
    const res = new FakeRes();
    const { ticket } = tickets.create('run1', 'org1', 'u1');
    await ctrl.stream('run1', { ticket }, res as never);
    vi.advanceTimersByTime(SSE_HEARTBEAT_MS);
    expect(res.chunks.filter((c) => c.startsWith(': ping'))).toHaveLength(1);
    vi.advanceTimersByTime(SSE_HEARTBEAT_MS);
    expect(res.chunks.filter((c) => c.startsWith(': ping'))).toHaveLength(2);

    res.emit('close'); // client disconnect
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5 * SSE_HEARTBEAT_MS);
    expect(res.chunks.filter((c) => c.startsWith(': ping'))).toHaveLength(2);
  });

  it('an already finished run gets status, score, done and the stream ends without subscribing', async () => {
    const { ctrl, tickets, events } = setup(['COMPLETED']);
    const res = new FakeRes();
    const { ticket } = tickets.create('run1', 'org1', 'u1');
    await ctrl.stream('run1', { ticket }, res as never);
    expect(res.frames()).toEqual([{ type: 'run.status', status: 'COMPLETED' }, { type: 'score', score: SCORE }, { type: 'done', status: 'COMPLETED' }]);
    expect(res.writableEnded).toBe(true);
    expect(events.subscribe).not.toHaveBeenCalled();
  });

  it('a ticket works only once (replay gives 401)', async () => {
    const { ctrl, tickets, redis } = setup();
    const { ticket } = tickets.create('run1', 'org1', 'u1');
    await ctrl.stream('run1', { ticket }, new FakeRes() as never);
    await expect(ctrl.stream('run1', { ticket }, new FakeRes() as never)).rejects.toThrow(UnauthorizedException);
    expect(redis.setIfAbsent).toHaveBeenCalledWith(expect.stringContaining('arena:ticket-used:'), '1', 120);
  });

  it('limits concurrent streams per organization (429) and frees the slot on disconnect', async () => {
    vi.useFakeTimers();
    const { ctrl, tickets } = setup();
    const open: FakeRes[] = [];
    for (let i = 0; i < MAX_SSE_PER_ORG; i++) {
      const res = new FakeRes();
      await ctrl.stream('run1', { ticket: tickets.create('run1', 'org1', 'u1').ticket }, res as never);
      open.push(res);
    }
    const extra = tickets.create('run1', 'org1', 'u1').ticket;
    await expect(ctrl.stream('run1', { ticket: extra }, new FakeRes() as never)).rejects.toMatchObject({ status: 429 });
    open[0].emit('close');
    await expect(ctrl.stream('run1', { ticket: extra }, new FakeRes() as never)).resolves.toBeUndefined();
  });
});
