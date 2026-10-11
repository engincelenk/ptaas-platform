import { Module } from '@nestjs/common';
import { RiskAcceptanceController } from './risk-acceptance.controller';
import { RiskAcceptanceService } from './risk-acceptance.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [NotificationsModule, IntegrationsModule],
  controllers: [RiskAcceptanceController],
  providers: [RiskAcceptanceService],
  exports: [RiskAcceptanceService],
})
export class RiskAcceptanceModule {}
