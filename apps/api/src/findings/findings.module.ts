import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MulterModule } from '@nestjs/platform-express';
import { FindingsService } from './findings.service';
import { FindingsController, OrgFindingsController } from './findings.controller';
import { FindingsImportController } from './findings-import.controller';
import { FindingsImportService } from './findings-import.service';
import { OverdueScheduler, OVERDUE_QUEUE } from './overdue.scheduler';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    NotificationsModule,
    IntegrationsModule,
    AiModule,
    MulterModule.register({ storage: undefined }),
    BullModule.registerQueue({ name: OVERDUE_QUEUE }),
  ],
  providers: [FindingsService, FindingsImportService, OverdueScheduler],
  controllers: [FindingsController, OrgFindingsController, FindingsImportController],
  exports: [FindingsService],
})
export class FindingsModule {}
