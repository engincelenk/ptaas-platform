import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SsrfGuardModule } from './ssrf/ssrf-guard.module';
import { ProjectsModule } from './projects/projects.module';
import { TargetsModule } from './targets/targets.module';
import { ScansModule } from './scans/scans.module';
import { InternalModule } from './internal/internal.module';
import { CryptoModule } from './crypto/crypto.module';
import { MinioModule } from './minio/minio.module';
import { AiModule } from './ai/ai.module';
import { FindingsModule } from './findings/findings.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';
import { RetentionModule } from './retention/retention.module';
import { MetricsModule } from './metrics/metrics.module';
import { AsmModule } from './asm/asm.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ArenaModule } from './arena/arena.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MailModule } from './mail/mail.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ComplianceModule } from './compliance/compliance.module';
import { ScanPoliciesModule } from './scan-policies/scan-policies.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { EnrichmentModule } from './enrichment/enrichment.module';
import { RetestModule } from './retest/retest.module';
import { ScanStrategyModule } from './scan-strategy/scan-strategy.module';
import { AttackPathsModule } from './attack-paths/attack-paths.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ThreatBriefsModule } from './threat-briefs/threat-briefs.module';
import { HealthChecksModule } from './health-checks/health-checks.module';
import { ShareModule } from './share/share.module';
import { SamlModule } from './saml/saml.module';
import { ChecklistModule } from './checklist/checklist.module';
import { EvidenceModule } from './evidence/evidence.module';
import { ScopeModule } from './scope/scope.module';
import { RiskAcceptanceModule } from './risk-acceptance/risk-acceptance.module';
import { EngagementModule } from './engagement/engagement.module';
import { TagsModule } from './tags/tags.module';
import { SlaModule } from './sla/sla.module';
import { ScanSchedulesModule } from './scan-schedules/scan-schedules.module';
import { ActivityModule } from './activity/activity.module';
import { SearchModule } from './search/search.module';
import { PortalModule } from './portal/portal.module';
import { MethodologyModule } from './methodology/methodology.module';
import { StatusModule } from './status/status.module';
import { BillingModule } from './billing/billing.module';
import { VscodeModule } from './vscode/vscode.module';
import { MarketplaceModule } from './marketplace/marketplace.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ScheduleModule.forRoot(),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Infrastructure (global)
    PrismaModule,
    RedisModule,
    AuditModule,
    SsrfGuardModule,
    CryptoModule,
    MinioModule,
    AiModule,
    MailModule,

    // Domain modules
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    TargetsModule,
    ScansModule,
    FindingsModule,
    ReportsModule,
    UsersModule,
    RetentionModule,
    MetricsModule,
    AsmModule,
    IntegrationsModule,
    MonitoringModule,
    ArenaModule,
    InvitationsModule,
    ComplianceModule,
    ScanPoliciesModule,
    ApiKeysModule,
    EnrichmentModule,
    RetestModule,
    ScanStrategyModule,
    AttackPathsModule,
    NotificationsModule,
    DashboardModule,
    OnboardingModule,
    ThreatBriefsModule,
    HealthChecksModule,
    ShareModule,
    SamlModule,
    ChecklistModule,
    EvidenceModule,
    ScopeModule,
    RiskAcceptanceModule,
    EngagementModule,
    TagsModule,
    SlaModule,
    ScanSchedulesModule,
    ActivityModule,
    SearchModule,
    PortalModule,
    MethodologyModule,
    StatusModule,
    BillingModule,
    VscodeModule,
    MarketplaceModule,
    InternalModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
