import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { InvitationsController, InvitationAcceptController } from './invitations.controller';

@Module({
  controllers: [InvitationsController, InvitationAcceptController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
