import { Module } from '@nestjs/common';
import { InternalKeyGuard } from './guards/internal-key.guard';

@Module({
  providers: [InternalKeyGuard],
  exports: [InternalKeyGuard],
})
export class AuthModule {}
