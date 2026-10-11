import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { CompliancePdfService } from './compliance-pdf.service';
import { ComplianceController, OrgComplianceController } from './compliance.controller';

@Module({
  controllers: [ComplianceController, OrgComplianceController],
  providers: [ComplianceService, CompliancePdfService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
