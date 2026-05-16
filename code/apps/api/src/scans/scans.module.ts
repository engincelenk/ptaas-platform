import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScansController } from './scans.controller';
import { ScansInternalController } from './scans.internal.controller';
import { ScansService } from './scans.service';
import { ScansGateway } from './scans.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'scans' }), PrismaModule],
  controllers: [ScansController, ScansInternalController],
  providers: [ScansService, ScansGateway],
  exports: [ScansService, ScansGateway],
})
export class ScansModule {}
