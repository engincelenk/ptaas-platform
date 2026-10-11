import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { MailService } from '../mail/mail.service';

export const NOTIFICATION_QUEUE = 'notification-queue';

export interface DigestJobData {
  orgId: string;
}

@Processor(NOTIFICATION_QUEUE)
export class DigestProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<DigestJobData>): Promise<void> {
    const { orgId } = job.data;
    this.logger.log(`Processing digest for org ${orgId}`);

    const usersWithUnread = await this.notifications.getUsersWithUnread(orgId);

    for (const { userId, email, name, count } of usersWithUnread) {
      const items = await this.notifications.getUnreadForUser(userId, orgId, 10);
      if (items.length === 0) continue;

      try {
        await this.mail.sendDigest({ email, name, count, items });
        this.logger.log(`Digest sent to ${email} (${count} unread)`);
      } catch (err) {
        this.logger.warn(`Digest send failed for ${email}`, err);
      }
    }
  }
}
