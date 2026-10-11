import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { AuditService } from '../audit/audit.service';
import type { UpsertSamlConfigDto } from './dto/saml.dto';

export interface SamlProfile {
  nameID: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: unknown;
}

@Injectable()
export class SamlService {
  private readonly log = new Logger(SamlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly token: TokenService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ── Config CRUD ────────────────────────────────────────────────────────────

  async getConfig(orgId: string) {
    const cfg = await this.prisma.samlConfig.findUnique({ where: { organizationId: orgId } });
    if (!cfg) throw new NotFoundException('SAML config not found');
    return this._sanitize(cfg);
  }

  async upsertConfig(orgId: string, dto: UpsertSamlConfigDto, userId: string) {
    const spEntityId = this._buildSpEntityId(orgId);

    const cfg = await this.prisma.samlConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        idpEntryPoint: dto.idpEntryPoint,
        idpCert: this._normalizeCert(dto.idpCert),
        spEntityId,
        attrEmail: dto.attrEmail ?? 'email',
        attrFirstName: dto.attrFirstName ?? 'firstName',
        attrLastName: dto.attrLastName ?? 'lastName',
        enabled: dto.enabled ?? false,
      },
      update: {
        idpEntryPoint: dto.idpEntryPoint,
        idpCert: this._normalizeCert(dto.idpCert),
        attrEmail: dto.attrEmail ?? 'email',
        attrFirstName: dto.attrFirstName ?? 'firstName',
        attrLastName: dto.attrLastName ?? 'lastName',
        enabled: dto.enabled ?? false,
      },
    });

    await this.audit.log({
      action: 'saml.config.upserted',
      userId,
      organizationId: orgId,
      metadata: { enabled: cfg.enabled, idpEntryPoint: cfg.idpEntryPoint },
    });

    return this._sanitize(cfg);
  }

  async deleteConfig(orgId: string, userId: string) {
    const cfg = await this.prisma.samlConfig.findUnique({ where: { organizationId: orgId } });
    if (!cfg) throw new NotFoundException('SAML config not found');
    await this.prisma.samlConfig.delete({ where: { organizationId: orgId } });
    await this.audit.log({ action: 'saml.config.deleted', userId, organizationId: orgId });
  }

  // ── SP Metadata XML ────────────────────────────────────────────────────────

  async getMetadataXml(orgSlug: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException('Organization not found');

    const cfg = await this.prisma.samlConfig.findUnique({ where: { organizationId: org.id } });
    if (!cfg || !cfg.enabled) throw new NotFoundException('SAML not configured for this organization');

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    const acsUrl = `${appUrl}/api/auth/saml/${orgSlug}/callback`;

    return `<?xml version="1.0"?>
<EntityDescriptor
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${cfg.spEntityId}">
  <SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService
      index="1"
      isDefault="true"
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
  }

  // ── Login URL ──────────────────────────────────────────────────────────────

  async getLoginUrl(orgSlug: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException('Organization not found');

    const cfg = await this.prisma.samlConfig.findUnique({ where: { organizationId: org.id } });
    if (!cfg || !cfg.enabled) throw new BadRequestException('SAML not enabled for this organization');

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    const acsUrl = encodeURIComponent(`${appUrl}/api/auth/saml/${orgSlug}/callback`);
    const entityId = encodeURIComponent(cfg.spEntityId);
    const relay = encodeURIComponent(`${appUrl}/dashboard`);

    // Build minimal HTTP-Redirect AuthnRequest URL
    // For production, use passport-saml's generateServiceProviderMetadata / getAuthorizeUrl
    const idpUrl = cfg.idpEntryPoint;
    return `${idpUrl}?SAMLRequest=&RelayState=${relay}&entityID=${entityId}&acsUrl=${acsUrl}`;
  }

  // ── JIT Provisioning + Token Issue ────────────────────────────────────────

  async handleCallback(
    orgSlug: string,
    profile: SamlProfile,
    ip?: string,
    userAgent?: string,
  ) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException('Organization not found');

    const cfg = await this.prisma.samlConfig.findUnique({ where: { organizationId: org.id } });
    if (!cfg || !cfg.enabled) throw new BadRequestException('SAML not enabled');

    // Extract email from configured attribute
    const email = (
      (profile[cfg.attrEmail] as string) ??
      profile.email ??
      profile.nameID
    )?.toLowerCase().trim();

    if (!email) throw new BadRequestException('SAML assertion did not contain an email address');

    const firstName = (profile[cfg.attrFirstName] as string) ?? profile.firstName ?? '';
    const lastName  = (profile[cfg.attrLastName]  as string) ?? profile.lastName  ?? '';

    const displayName = `${firstName} ${lastName}`.trim();

    // JIT: find-or-create user
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: displayName || email,
          passwordHash: '', // no password for SSO-only users
          emailVerified: true,
        },
      });
      this.log.log(`JIT provisioned user ${email} via SAML for org ${orgSlug}`);
    } else if (displayName) {
      // Sync display name on every login
      await this.prisma.user.update({
        where: { id: user.id },
        data: { name: displayName },
      });
    }

    // Ensure org membership (JIT)
    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    });

    if (!existing) {
      await this.prisma.organizationMember.create({
        data: { userId: user.id, organizationId: org.id, role: 'VIEWER' },
      });
      this.log.log(`JIT added user ${email} to org ${org.slug} as VIEWER`);
    }

    const membership = existing ?? await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    });

    await this.audit.log({
      action: 'auth.saml.login',
      userId: user.id,
      organizationId: org.id,
      metadata: { email, orgSlug },
      ipAddress: ip,
      userAgent,
    });

    return this.token.generateTokenPair(user.id, org.id, membership!.role as never);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _buildSpEntityId(orgId: string): string {
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    return `${appUrl}/saml/${orgId}`;
  }

  private _normalizeCert(cert: string): string {
    // Strip PEM headers if present — store raw base64
    return cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
  }

  private _sanitize(cfg: {
    id: string; organizationId: string; enabled: boolean;
    idpEntryPoint: string; spEntityId: string;
    attrEmail: string; attrFirstName: string; attrLastName: string;
    createdAt: Date; updatedAt: Date;
    idpCert?: string;
  }) {
    // Never return the raw cert to the client
    const { idpCert: _, ...rest } = cfg as typeof cfg & { idpCert?: string };
    void _;
    return { ...rest, certConfigured: true };
  }
}
