import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const end = this.metrics.httpRequestDuration.startTimer();

    res.on('finish', () => {
      // Normalize dynamic route segments so cardinality stays bounded
      const route = (req.route?.path as string | undefined) ?? req.path ?? 'unknown';
      end({
        method: req.method,
        route,
        status_code: String(res.statusCode),
      });
    });

    next();
  }
}
