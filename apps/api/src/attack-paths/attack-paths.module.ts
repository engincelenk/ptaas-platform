import { Module } from '@nestjs/common';
import { AttackPathsController } from './attack-paths.controller';
import { AttackPathsService } from './attack-paths.service';

@Module({
  controllers: [AttackPathsController],
  providers: [AttackPathsService],
})
export class AttackPathsModule {}
