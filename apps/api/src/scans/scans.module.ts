import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ScansService } from './scans.service';
import { ScansController } from './scans.controller';
import { ScansSseController } from './scans-sse.controller';
import { ScansQueueController } from './scans-queue.controller';
import { ScanProcessor } from './scan.processor';
import { SCAN_QUEUE } from './scan-queue.constants';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379')).hostname,
          port: parseInt(
            new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379')).port || '6379',
            10,
          ),
        },
      }),
    }),
    BullModule.registerQueue({ name: SCAN_QUEUE }),
    AuthModule,
    AuditModule,
    AiModule,
  ],
  providers: [ScansService, ScanProcessor],
  controllers: [ScansController, ScansSseController, ScansQueueController],
  exports: [ScansService],
})
export class ScansModule {}
