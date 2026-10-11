import { Module } from '@nestjs/common';
import { MethodologyService } from './methodology.service';
import { MethodologyController } from './methodology.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MethodologyController],
  providers: [MethodologyService],
})
export class MethodologyModule {}
