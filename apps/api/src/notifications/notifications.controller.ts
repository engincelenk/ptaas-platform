import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Param,
  Query,
  Body,
  Sse,
  UseGuards,
  MessageEvent,
  OnModuleDestroy,
} from '@nestjs/common';
import { Observable, fromEvent, EMPTY } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController implements OnModuleDestroy {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** SSE stream — one connection per user */
  @Sse('stream')
  stream(@CurrentUser() user: JwtPayload): Observable<MessageEvent> {
    const subject = this.notificationsService.getOrCreateSubject(user.sub);
    return subject.asObservable().pipe(
      map((event) => ({ data: event } as MessageEvent)),
      catchError(() => EMPTY),
    );
  }

  /** GET /notifications?page=1&limit=20&unread=true */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('unread') unread?: string,
  ) {
    return this.notificationsService.list(
      user.sub,
      user.orgId,
      Number(page),
      Math.min(Number(limit), 50),
      unread === 'true',
    );
  }

  /** GET /notifications/preferences */
  @Get('preferences')
  getPreferences(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getPreferences(user.sub);
  }

  /** PUT /notifications/preferences */
  @Put('preferences')
  updatePreferences(
    @CurrentUser() user: JwtPayload,
    @Body() body: { prefs: Array<{ type: string; enabled: boolean }> },
  ) {
    return this.notificationsService.updatePreferences(user.sub, body.prefs);
  }

  /** GET /notifications/unread-count */
  @Get('unread-count')
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.unreadCount(user.sub, user.orgId)
      .then((count) => ({ count }));
  }

  /** PATCH /notifications/:id/read */
  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.markRead(id, user.sub);
  }

  /** POST /notifications/read-all */
  @Post('read-all')
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.sub, user.orgId);
  }

  onModuleDestroy() {
    // SSE subjects are cleaned up when the module is destroyed
  }
}
