import { Controller, Get, Logger, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import type { ArenaEvent } from '../arena-events';
import { ArenaEventsService } from '../arena-events.service';
import { StreamQueryDto } from '../dto/arena.dto';
import { ArenaRunsService } from './arena-runs.service';
import { ArenaScoreboardService } from './arena-scoreboard.service';
import { ArenaStreamTicketService } from './arena-stream-ticket.service';

export const SSE_HEARTBEAT_MS = 20_000;
const TERMINAL = new Set(['COMPLETED', 'ABORTED', 'FAILED']);

@ApiTags('arena')
@Controller('arena/runs')
export class ArenaStreamController {
  private readonly log = new Logger(ArenaStreamController.name);

  constructor(
    private readonly tickets: ArenaStreamTicketService,
    private readonly runs: ArenaRunsService,
    private readonly scoreboard: ArenaScoreboardService,
    private readonly events: ArenaEventsService,
  ) {}

  @Post(':id/stream-ticket')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Short-lived ticket (60 s) for the live event stream' })
  async createTicket(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.runs.statusOf(id, user.orgId); // 404 for foreign runs
    return this.tickets.create(id, user.orgId, user.sub);
  }

  /** No JWT guard on purpose: EventSource cannot send headers; the signed ticket authenticates. */
  @Get(':id/stream')
  @ApiOperation({ summary: 'Live run events (text/event-stream); authenticated by stream ticket' })
  async stream(
    @Param('id') id: string,
    @Query() query: StreamQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const payload = this.tickets.verify(query.ticket, id); // throws 401
    const orgId = payload.organizationId;
    const status = await this.runs.statusOf(id, orgId); // throws 404 for foreign runs

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (event: ArenaEvent): void => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    let closed = false;
    let ready = false;
    const buffer: ArenaEvent[] = [];
    let unsubscribe: (() => void) | undefined;
    let heartbeat: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
      if (!res.writableEnded) res.end();
    };
    const emit = (event: ArenaEvent): void => {
      write(event);
      if (event.type === 'done') cleanup();
    };
    // 'close' on the response fires when the client disconnects (req 'close' can fire early on Node >= 16).
    res.on('close', cleanup);

    try {
      // Subscribe before reading the snapshot so no event can fall into the gap.
      if (!TERMINAL.has(status)) {
        unsubscribe = await this.events.subscribe(orgId, id, (e) => (ready ? emit(e) : buffer.push(e)));
        if (closed) {
          unsubscribe();
          return;
        }
      }
      const current = await this.runs.statusOf(id, orgId);
      write({ type: 'run.status', status: current });
      write({ type: 'score', score: await this.scoreboard.compute(id, orgId) });

      if (TERMINAL.has(current)) {
        write({ type: 'done', status: current });
        cleanup();
        return;
      }
      ready = true;
      for (const e of buffer.splice(0)) {
        emit(e);
        if (closed) return;
      }
      heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': ping\n\n');
      }, SSE_HEARTBEAT_MS);
    } catch (err) {
      this.log.warn(`stream setup failed: ${err instanceof Error ? err.message : String(err)}`);
      cleanup();
    }
  }
}
