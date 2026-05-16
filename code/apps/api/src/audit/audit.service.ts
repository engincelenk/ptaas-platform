import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface AuditLogParams {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    await this.prisma.auditLog.create({ data: params });
  }

  async findAll(
    tenantId: string,
    opts: { limit?: number; offset?: number; resource?: string } = {},
  ) {
    const { limit = 50, offset = 0, resource } = opts;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          tenantId,
          ...(resource ? { resource } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { email: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({
        where: { tenantId, ...(resource ? { resource } : {}) },
      }),
    ]);

    return { logs, total, limit, offset };
  }
}
