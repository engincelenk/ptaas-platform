import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AsmService } from './asm.service';
import { AsmController, OrgAssetsController } from './asm.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { SsrfGuardModule } from '../ssrf/ssrf-guard.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ASM_QUEUE } from './asm.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: ASM_QUEUE }),
    AuthModule,
    AuditModule,
    SsrfGuardModule,
    NotificationsModule,
  ],
  providers: [AsmService],
  controllers: [AsmController, OrgAssetsController],
  exports: [AsmService],
})
export class AsmModule {}
