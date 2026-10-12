import { Global, Module } from '@nestjs/common';
import { SsrfGuardService } from './ssrf-guard.service';
import { SafeHttpService } from './safe-http.service';

@Global()
@Module({
  providers: [SsrfGuardService, SafeHttpService],
  exports: [SsrfGuardService, SafeHttpService],
})
export class SsrfGuardModule {}
