import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SdkController } from './sdk.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  providers: [ProjectsService],
  controllers: [ProjectsController, SdkController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
