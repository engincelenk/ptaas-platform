import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { Role } from '@ptaas/types';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(orgId: string, requestingUserId: string) {
    await this.assertMember(orgId, requestingUserId);
    return this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  }

  async getMembers(orgId: string, requestingUserId: string) {
    await this.assertMember(orgId, requestingUserId);
    return this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true, email: true, mfaEnabled: true } } },
    });
  }

  async updateMemberRole(
    orgId: string,
    targetUserId: string,
    newRole: Role,
    requestingUserId: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.assertRole(orgId, requestingUserId, 'ADMIN');

    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    });
    if (!member) throw new NotFoundException('Member not found');

    const updated = await this.prisma.organizationMember.update({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
      data: { role: newRole },
    });

    await this.audit.log({
      action: 'org.member.role_changed',
      userId: requestingUserId,
      organizationId: orgId,
      resource: 'organization_member',
      resourceId: member.id,
      metadata: { targetUserId, newRole },
      ipAddress: ip,
      userAgent,
    });

    return updated;
  }

  async removeMember(
    orgId: string,
    targetUserId: string,
    requestingUserId: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.assertRole(orgId, requestingUserId, 'ADMIN');
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('Cannot remove yourself from the organization');
    }

    await this.prisma.organizationMember.delete({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    });

    await this.audit.log({
      action: 'org.member.removed',
      userId: requestingUserId,
      organizationId: orgId,
      resource: 'organization_member',
      metadata: { targetUserId },
      ipAddress: ip,
      userAgent,
    });
  }

  // ── Helpers ────────────────────────────────

  private async assertMember(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!membership || !membership.acceptedAt) {
      throw new ForbiddenException('Access denied');
    }
    return membership;
  }

  private async assertRole(orgId: string, userId: string, required: Role) {
    const membership = await this.assertMember(orgId, userId);
    const roleOrder: Role[] = ['VIEWER', 'DEVELOPER', 'SECURITY_ENGINEER', 'ADMIN'];
    if (roleOrder.indexOf(membership.role as Role) < roleOrder.indexOf(required)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return membership;
  }
}
