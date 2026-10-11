import { Module } from '@nestjs/common';
import { ScanSchedulesController } from './scan-schedules.controller';
import { ScanSchedulesService } from './scan-schedules.service';
import { ScansModule } from '../scans/scans.module';

@Module({
  imports: [ScansModule],
  controllers: [ScanSchedulesController],
  providers: [ScanSchedulesService],
})
export class ScanSchedulesModule {}
