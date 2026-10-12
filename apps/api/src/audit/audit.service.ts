import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { redactMetadata } from './redact';

export interface AuditEvent {
  action: string;
  userId?: string;
  organizationId?: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: AuditEvent): Promise<void> {
    // Fire-and-forget — audit log failures must not break user flows
    this.prisma.auditLog
      .create({
        data: {
          action: event.action,
          userId: event.userId,
          organizationId: event.organizationId,
          resource: event.resource,
          resourceId: event.resourceId,
          metadata: event.metadata as object,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
        },
      })
      .catch((err: unknown) => {
        // Log to stdout only — never re-throw
        console.error('[AuditService] Failed to write audit log', {
          action: event.action,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  /**
   * For security-critical events (run start, consent, kill-switch): awaited and
   * NOT swallowed — if the audit record cannot be written the caller must abort.
   * Metadata is redacted so secrets/transcripts never reach the audit table.
   */
  async logStrict(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.action,
        userId: event.userId,
        organizationId: event.organizationId,
        resource: event.resource,
        resourceId: event.resourceId,
        metadata: redactMetadata(event.metadata) as object,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      },
    });
  }
}
