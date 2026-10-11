import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs: number | null;
}

@ApiTags('status')
@Controller('status')
export class StatusController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Public status endpoint — checks API, DB, Redis health' })
  async getStatus() {
    const checks = await Promise.allSettled([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const [dbResult, redisResult] = checks;

    const services: ServiceStatus[] = [
      {
        name: 'API',
        status: 'operational',
        latencyMs: 0,
      },
      {
        name: 'Database',
        status: dbResult.status === 'fulfilled' ? dbResult.value.status : 'down',
        latencyMs: dbResult.status === 'fulfilled' ? dbResult.value.latencyMs : null,
      },
      {
        name: 'Redis / Queue',
        status: redisResult.status === 'fulfilled' ? redisResult.value.status : 'down',
        latencyMs: redisResult.status === 'fulfilled' ? redisResult.value.latencyMs : null,
      },
    ];

    const overall = services.every((s) => s.status === 'operational')
      ? 'operational'
      : services.some((s) => s.status === 'down')
      ? 'degraded'
      : 'degraded';

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      services,
    };
  }

  private async checkDb(): Promise<{ status: 'operational' | 'degraded' | 'down'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'operational', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<{ status: 'operational' | 'degraded' | 'down'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.redis.set('__health_check__', '1', 5);
      return { status: 'operational', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
