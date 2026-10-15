import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { ScansModule } from '../scans/scans.module';
import { AuditModule } from '../audit/audit.module';
import { FindingsModule } from '../findings/findings.module';
import { AsmModule } from '../asm/asm.module';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { RetestModule } from '../retest/retest.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [ScansModule, AuditModule, FindingsModule, AsmModule, EnrichmentModule, RetestModule, NotificationsModule, AiModule, IntegrationsModule, MonitoringModule],
  controllers: [InternalController],
})
export class InternalModule {}
