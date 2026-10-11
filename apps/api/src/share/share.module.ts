import { Module } from '@nestjs/common';
import { ShareController, PublicShareController } from './share.controller';
import { ShareService } from './share.service';

@Module({
  controllers: [ShareController, PublicShareController],
  providers: [ShareService],
})
export class ShareModule {}
