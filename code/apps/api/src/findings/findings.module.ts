import { Module } from '@nestjs/common';
import { FindingsController, ProjectFindingsController } from './findings.controller';
import { FindingsService } from './findings.service';

@Module({
  controllers: [FindingsController, ProjectFindingsController],
  providers: [FindingsService],
})
export class FindingsModule {}
