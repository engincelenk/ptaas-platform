import { Controller, Get, Query, Res, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SECURITY_ENGINEER')
@Controller('organizations/:orgId/audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('logs')
  @ApiOperation({ summary: 'List audit log entries for the organization' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'resource', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  async getLogs(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('resource') resource?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const take = Math.min(limit, 200);
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = { organizationId: user.orgId };
    if (action) where['action'] = { contains: action, mode: 'insensitive' };
    if (userId) where['userId'] = userId;
    if (resource) where['resource'] = resource;
    if (from || to) {
      where['createdAt'] = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return { data, total, page, limit: take, pages: Math.ceil(total / take) };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Audit log statistics — action counts for the last 30 days' })
  async getStats(@CurrentUser() user: JwtPayload) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId: user.orgId, createdAt: { gte: since } },
      select: { action: true, createdAt: true },
    });

    // Action frequency
    const actionCounts: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};

    for (const log of logs) {
      actionCounts[log.action] = (actionCounts[log.action] ?? 0) + 1;
      const day = log.createdAt.toISOString().slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
    }

    // Fill missing days
    const days: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: dailyCounts[key] ?? 0 });
    }

    const topActions = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    return { total: logs.length, topActions, dailyActivity: days };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export full audit trail as CSV (M48) — max 10,000 entries, date-range filter' })
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
  ) {
    const where: Record<string, unknown> = { organizationId: user.orgId };
    if (action) where['action'] = { contains: action, mode: 'insensitive' };
    if (from || to) {
      where['createdAt'] = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const headers = ['id', 'timestamp', 'action', 'resource', 'resource_id', 'user_id', 'user_name', 'user_email', 'ip_address', 'user_agent'];
    const rows = logs.map((l) => [
      l.id,
      l.createdAt.toISOString(),
      l.action,
      l.resource ?? '',
      l.resourceId ?? '',
      l.user?.id ?? '',
      l.user?.name ?? '',
      l.user?.email ?? '',
      l.ipAddress ?? '',
      (l.userAgent ?? '').replace(/,/g, ';'),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = '﻿' + [headers.join(','), ...rows].join('\r\n');

    const from_ = from ? from.slice(0, 10) : 'all';
    const to_   = to   ? to.slice(0, 10)   : 'now';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${from_}-${to_}.csv"`);
    res.send(csv);
  }
}
