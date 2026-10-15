import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

// Global like the other infrastructure modules (see AppModule): InvitationsModule and IntegrationsModule inject
// AuditService without importing this module, which made the whole application fail to boot.
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
