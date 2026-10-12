import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { ARENA_RUN_QUEUE } from './arena.constants';
import { ArenaEventsService } from './arena-events.service';
import { KillSwitchService } from './kill-switch.service';
import { LIFECYCLE_CONTROLLERS, LIFECYCLE_IMPORTS, LIFECYCLE_PROVIDERS } from './lifecycle';
import { ENGINE_PROVIDERS } from './engine';

@Module({
  imports: [
    BullModule.registerQueue({ name: ARENA_RUN_QUEUE, defaultJobOptions: { removeOnComplete: 100, attempts: 1 } }),
    PrismaModule,
    ...LIFECYCLE_IMPORTS,
  ],
  controllers: [...LIFECYCLE_CONTROLLERS],
  providers: [ArenaEventsService, KillSwitchService, ...LIFECYCLE_PROVIDERS, ...ENGINE_PROVIDERS],
  exports: [ArenaEventsService, KillSwitchService],
})
export class ArenaModule {}
