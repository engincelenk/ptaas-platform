import { Module } from '@nestjs/common';
import { TargetsService } from './targets.service';
import { VerificationService } from './verification.service';
import { TargetsController } from './targets.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  providers: [TargetsService, VerificationService],
  controllers: [TargetsController],
  exports: [TargetsService, VerificationService],
})
export class TargetsModule {}
