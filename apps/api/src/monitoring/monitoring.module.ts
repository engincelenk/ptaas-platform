import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { TrendsService } from './trends.service';
import { DiffService } from './diff.service';
import { ScanScheduleProcessor } from './scan-schedule.processor';
import { MonitoringController } from './monitoring.controller';
import { SCAN_QUEUE } from '../scans/scan-queue.constants';
import { ScansModule } from '../scans/scans.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: SCAN_QUEUE }),
    forwardRef(() => ScansModule),
  ],
  controllers: [MonitoringController],
  providers: [SchedulerService, TrendsService, DiffService, ScanScheduleProcessor],
  exports: [DiffService, SchedulerService, TrendsService],
})
export class MonitoringModule {}
