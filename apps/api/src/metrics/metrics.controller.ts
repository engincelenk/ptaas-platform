import { Controller, Get, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { Req } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint — protected by bearer token (METRICS_TOKEN env).
 * Not behind JwtAuthGuard to avoid circular deps and to allow unauthenticated
 * Prometheus scrapers that use the token header directly.
 */
@Controller('metrics')
export class MetricsController {
  private readonly token: string | undefined;

  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {
    this.token = config.get<string>('METRICS_TOKEN');
  }

  @Get()
  async scrape(@Req() req: Request, @Res() res: Response) {
    if (this.token) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${this.token}`) {
        throw new UnauthorizedException('Invalid metrics token');
      }
    }
    const data = await this.metrics.getMetrics();
    res.setHeader('Content-Type', this.metrics.contentType());
    res.send(data);
  }
}
