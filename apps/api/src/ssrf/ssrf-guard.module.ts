import { Global, Module } from '@nestjs/common';
import { SsrfGuardService } from './ssrf-guard.service';

@Global()
@Module({
  providers: [SsrfGuardService],
  exports: [SsrfGuardService],
})
export class SsrfGuardModule {}
