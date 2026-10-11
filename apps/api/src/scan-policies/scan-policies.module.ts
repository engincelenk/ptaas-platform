import { Module } from '@nestjs/common';
import { ScanPoliciesService } from './scan-policies.service';
import { ScanPoliciesController } from './scan-policies.controller';

@Module({
  controllers: [ScanPoliciesController],
  providers: [ScanPoliciesService],
  exports: [ScanPoliciesService],
})
export class ScanPoliciesModule {}
