import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as client from 'prom-client';
import { SCAN_QUEUE } from '../scans/scan-queue.constants';
import { RETENTION_QUEUE } from '../retention/retention.constants';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new client.Registry();

  // HTTP request duration
  readonly httpRequestDuration = new client.Histogram({
    name: 'ptaas_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  // BullMQ scan queue depth
  private readonly scanQueueDepth = new client.Gauge({
    name: 'ptaas_scan_queue_depth',
    help: 'Number of jobs waiting in scan queue',
    registers: [this.registry],
  });

  private readonly scanQueueActive = new client.Gauge({
    name: 'ptaas_scan_queue_active',
    help: 'Number of scan jobs currently active',
    registers: [this.registry],
  });

  private readonly scanQueueFailed = new client.Gauge({
    name: 'ptaas_scan_queue_failed',
    help: 'Number of failed scan jobs (last 24h)',
    registers: [this.registry],
  });

  // Findings ingested counter
  readonly findingsIngested = new client.Counter({
    name: 'ptaas_findings_ingested_total',
    help: 'Total number of findings ingested from scanner',
    labelNames: ['severity'],
    registers: [this.registry],
  });

  constructor(
    @InjectQueue(SCAN_QUEUE) private readonly scanQueue: Queue,
  ) {}

  onModuleInit() {
    // Collect default Node.js metrics (heap, GC, event loop lag)
    client.collectDefaultMetrics({ register: this.registry, prefix: 'ptaas_node_' });

    // Poll BullMQ queue depths every 15s
    setInterval(() => this.collectQueueMetrics(), 15_000);
  }

  private async collectQueueMetrics() {
    try {
      const [waiting, active, failed] = await Promise.all([
        this.scanQueue.getWaitingCount(),
        this.scanQueue.getActiveCount(),
        this.scanQueue.getFailedCount(),
      ]);
      this.scanQueueDepth.set(waiting);
      this.scanQueueActive.set(active);
      this.scanQueueFailed.set(failed);
    } catch {
      // Non-fatal — metrics collection failure should not crash the API
    }
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
