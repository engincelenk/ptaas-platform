import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScanStrategyController } from './scan-strategy.controller';
import { ScanStrategyService, STRATEGY_QUEUE } from './scan-strategy.service';
import { ScanStrategyProcessor } from './scan-strategy.processor';
import { SCAN_QUEUE } from '../scans/scan-queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: STRATEGY_QUEUE }),
    BullModule.registerQueue({ name: SCAN_QUEUE }),
  ],
  controllers: [ScanStrategyController],
  providers: [ScanStrategyService, ScanStrategyProcessor],
  exports: [ScanStrategyService],
})
export class ScanStrategyModule {}
