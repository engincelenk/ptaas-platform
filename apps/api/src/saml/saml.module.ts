import { Module } from '@nestjs/common';
import { SamlService } from './saml.service';
import { SamlPublicController, SamlAdminController } from './saml.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [SamlPublicController, SamlAdminController],
  providers: [SamlService],
  exports: [SamlService],
})
export class SamlModule {}
