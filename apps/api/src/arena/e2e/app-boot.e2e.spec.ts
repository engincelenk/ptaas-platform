import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { AddressInfo } from 'node:net';
import { PrismaService } from '../../prisma/prisma.service';
import { ARENA_RUN_QUEUE } from '../arena.constants';

/** Boots the COMPLETE production AppModule against real PostgreSQL + Redis (DI graph, workers, cron registration). */
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ptaas:ptaas_pw@127.0.0.1:55432/ptaas_e2e';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_ACCESS_SECRET = 'e2e-jwt-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'e2e-jwt-refresh-secret-0123456789abcdef';
process.env.NODE_ENV = 'test';
process.env.MINIO_ACCESS_KEY = 'e2e-minio-access';
process.env.MINIO_SECRET_KEY = 'e2e-minio-secret-key';
process.env.MINIO_PORT = '59000'; // nothing listens here: bucket setup must degrade gracefully
process.env.SCANNER_API_KEY = 'e2e-scanner-key';
process.env.ANTHROPIC_API_KEY = 'e2e-dummy-key-no-calls-on-boot'; // AiService requires it at construction; boot makes no API call

describe('AppModule boot (real infrastructure)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('starts, serves HTTP and rejects unauthenticated Arena calls', async () => {
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/arena/runs`);
    expect(res.status).toBe(401);
  });

  it('registers the arena-run queue on the shared BullMQ connection with a live worker', async () => {
    const queue = app.get<Queue>(getQueueToken(ARENA_RUN_QUEUE));
    const workers = await queue.getWorkers();
    expect(workers.length).toBeGreaterThanOrEqual(1);
    expect(await queue.getJobCounts('waiting', 'active')).toBeDefined();
  });

  it('seeds the catalog and RoE on boot and exposes the cron jobs', async () => {
    const prisma = app.get(PrismaService);
    expect(await prisma.arenaGoal.count()).toBeGreaterThanOrEqual(26);
    expect(await prisma.arenaRoe.count()).toBeGreaterThanOrEqual(1);
    const jobs = app.get(SchedulerRegistry).getCronJobs();
    expect(jobs.size).toBeGreaterThan(0);
  });
});
