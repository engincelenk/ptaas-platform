import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import type { CreateInvitationDto } from './dto/invitation.dto';

const EXPIRY_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async create(
    dto: CreateInvitationDto,
    orgId: string,
    inviterId: string,
  ) {
    // Check if user already a member
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
      select: {
        id: true,
        memberships: { where: { organizationId: orgId }, select: { id: true } },
      },
    });
    if (existing?.memberships.length) {
      throw new ConflictException('User is already a member of this organization');
    }

    // Invalidate any pending invitation for same email+org
    await this.prisma.invitation.updateMany({
      where: { organizationId: orgId, email: dto.email, usedAt: null },
      data: { usedAt: new Date() },   // mark as used/expired
    });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000);

    await this.prisma.invitation.create({
      data: {
        organizationId: orgId,
        invitedById: inviterId,
        email: dto.email,
        role: dto.role as any,
        token,
        expiresAt,
      },
    });

    // Fetch org + inviter for email
    const [org, inviter] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      this.prisma.user.findUnique({ where: { id: inviterId }, select: { name: true } }),
    ]);

    const appUrl = this.config.get('APP_URL', 'http://localhost:3000');
    await this.mail.sendInvitation({
      to: dto.email,
      orgName: org?.name ?? 'PTaaS Organization',
      inviterName: inviter?.name ?? 'A teammate',
      role: dto.role,
      inviteUrl: `${appUrl}/invite/${token}`,
    });

    await this.audit.log({
      action: 'invitation.created',
      userId: inviterId,
      organizationId: orgId,
      metadata: { email: dto.email, role: dto.role },
    });

    return { token };
  }

  async accept(token: string, userId: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.usedAt) throw new BadRequestException('Invitation has already been used');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Invitation has expired');

    // Verify accepting user's email matches invitation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user?.email !== invitation.email) {
      throw new BadRequestException('This invitation was sent to a different email address');
    }

    // Add to org as member
    await this.prisma.$transaction([
      this.prisma.organizationMember.create({
        data: {
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role,
          acceptedAt: new Date(),
        },
      }),
      this.prisma.invitation.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      action: 'invitation.accepted',
      userId,
      organizationId: invitation.organizationId,
      metadata: { invitationToken: token, role: invitation.role },
    });

    return { organizationId: invitation.organizationId, role: invitation.role };
  }

  async list(orgId: string) {
    return this.prisma.invitation.findMany({
      where: { organizationId: orgId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, role: true, expiresAt: true, createdAt: true,
        invitedBy: { select: { name: true } },
      },
    });
  }

  async revoke(id: string, orgId: string, userId: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    await this.prisma.invitation.update({
      where: { id },
      data: { usedAt: new Date() },
    });

    await this.audit.log({
      action: 'invitation.revoked',
      userId,
      organizationId: orgId,
      metadata: { invitationId: id, email: invitation.email },
    });
  }
}
