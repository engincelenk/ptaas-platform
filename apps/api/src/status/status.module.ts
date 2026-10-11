import { Module } from '@nestjs/common';
import { StatusController } from './status.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [StatusController],
})
export class StatusModule {}
