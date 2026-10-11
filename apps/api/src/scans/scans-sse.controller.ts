import { Controller, Get, Param, Sse, UseGuards, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Observable, interval } from 'rxjs';
import { switchMap, map, takeWhile, distinctUntilChanged } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const POLL_INTERVAL_MS = 2000;

/**
 * SSE endpoint for live scan progress.
 * Client connects via EventSource, receives JSON events every ~2s.
 * Stream terminates automatically when scan reaches a terminal state.
 */
@ApiTags('scans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/scans')
export class ScansSseController {
  constructor(private readonly prisma: PrismaService) {}

  @Sse(':id/events')
  @ApiOperation({ summary: 'SSE: live scan progress stream' })
  scanEvents(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Observable<MessageEvent> {
    return interval(POLL_INTERVAL_MS).pipe(
      switchMap(() =>
        this.prisma.scan.findFirst({
          where: { id, organizationId: user.orgId },
          select: {
            status: true,
            progress: true,
            currentActivity: true,
            errorMessage: true,
            startedAt: true,
            completedAt: true,
            _count: { select: { findings: true } },
          },
        }),
      ),
      map((scan) => {
        if (!scan) {
          return {
            data: JSON.stringify({ type: 'error', message: 'Scan not found' }),
          } as MessageEvent;
        }
        return {
          data: JSON.stringify({
            type: scan.status === 'RUNNING' ? 'progress' :
                  TERMINAL_STATUSES.has(scan.status) ? 'terminal' : 'status',
            status: scan.status,
            progress: scan.progress,
            currentActivity: scan.currentActivity,
            findingsCount: scan._count.findings,
            errorMessage: scan.errorMessage,
            startedAt: scan.startedAt,
            completedAt: scan.completedAt,
          }),
        } as MessageEvent;
      }),
      distinctUntilChanged((a, b) => a.data === b.data),
      takeWhile((event) => {
        const parsed = JSON.parse(event.data as string);
        return !TERMINAL_STATUSES.has(parsed.status);
      }, true /* inclusive: emit the terminal event before completing */),
    );
  }
}
