import { Injectable, ForbiddenException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@ptaas/db';
import { PrismaService } from '../prisma/prisma.service';

export interface OnboardingStatus {
  hasOrg: boolean;
  hasProject: boolean;
  hasTarget: boolean;
  hasScan: boolean;
  hasFinding: boolean;
  completedSteps: number;
  totalSteps: number;
  isComplete: boolean;
}

type DemoFinding = Pick<
  Prisma.FindingCreateManyInput,
  'title' | 'severity' | 'status' | 'description' | 'aiRemediation' | 'owasp' | 'cveIds' | 'aiRiskScore' | 'templateId' | 'matchedAt'
>;

const DEMO_FINDINGS: DemoFinding[] = [
  {
    title: 'SQL Injection in Login Endpoint',
    severity: 'CRITICAL',
    status: 'OPEN',
    description: 'The login endpoint /api/auth/login is vulnerable to SQL injection via the username parameter. An attacker can bypass authentication or extract database contents.',
    aiRemediation: 'Use parameterized queries or an ORM. Validate and sanitize all user input.',
    owasp: 'A03:2021',
    cveIds: [],
    aiRiskScore: 95,
    templateId: 'demo-sqli-001',
    matchedAt: new Date().toISOString(),
  },
  {
    title: 'Cross-Site Scripting (XSS) in Search Field',
    severity: 'HIGH',
    status: 'OPEN',
    description: 'The search parameter is reflected in the response without proper encoding, allowing stored or reflected XSS attacks.',
    aiRemediation: 'Encode all output. Implement Content-Security-Policy headers.',
    owasp: 'A03:2021',
    cveIds: [],
    aiRiskScore: 72,
    templateId: 'demo-xss-001',
    matchedAt: new Date().toISOString(),
  },
  {
    title: 'Missing HTTPS Strict-Transport-Security Header',
    severity: 'MEDIUM',
    status: 'OPEN',
    description: 'The application does not send the Strict-Transport-Security (HSTS) header, leaving it vulnerable to protocol downgrade attacks.',
    aiRemediation: 'Add: Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
    owasp: 'A05:2021',
    cveIds: [],
    aiRiskScore: 45,
    templateId: 'demo-hsts-001',
    matchedAt: new Date().toISOString(),
  },
  {
    title: 'Outdated jQuery 1.8.3 with Known CVEs',
    severity: 'MEDIUM',
    status: 'OPEN',
    description: 'The application loads jQuery 1.8.3 which has multiple known vulnerabilities including XSS and prototype pollution.',
    aiRemediation: 'Upgrade to jQuery 3.7+ or migrate to a modern framework.',
    owasp: 'A06:2021',
    cveIds: ['CVE-2019-11358'],
    aiRiskScore: 52,
    templateId: 'demo-jquery-001',
    matchedAt: new Date().toISOString(),
  },
  {
    title: 'Directory Listing Enabled on /static/',
    severity: 'LOW',
    status: 'OPEN',
    description: 'The web server exposes directory listings on /static/, revealing file structure and potentially sensitive files.',
    aiRemediation: 'Disable directory listing in server configuration (Options -Indexes for Apache, autoindex off for Nginx).',
    owasp: 'A01:2021',
    cveIds: [],
    aiRiskScore: 22,
    templateId: 'demo-dirlist-001',
    matchedAt: new Date().toISOString(),
  },
];

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(orgId: string): Promise<OnboardingStatus> {
    const [projectCount, targetCount, scanCount, findingCount] = await Promise.all([
      this.prisma.project.count({ where: { organizationId: orgId } }),
      this.prisma.target.count({ where: { organizationId: orgId } }),
      this.prisma.scan.count({ where: { organizationId: orgId } }),
      this.prisma.finding.count({ where: { organizationId: orgId } }),
    ]);

    const hasProject = projectCount > 0;
    const hasTarget = targetCount > 0;
    const hasScan = scanCount > 0;
    const hasFinding = findingCount > 0;

    const steps = [true, hasProject, hasTarget, hasScan, hasFinding];
    const completedSteps = steps.filter(Boolean).length;

    return {
      hasOrg: true,
      hasProject,
      hasTarget,
      hasScan,
      hasFinding,
      completedSteps,
      totalSteps: steps.length,
      isComplete: completedSteps === steps.length,
    };
  }

  async seedDemo(orgId: string, userId: string): Promise<{ projectId: string }> {
    const existing = await this.prisma.project.count({ where: { organizationId: orgId } });
    if (existing > 0) {
      throw new ForbiddenException('Demo data can only be seeded for empty organizations');
    }

    const project = await this.prisma.project.create({
      data: {
        name: 'Demo Application',
        description: 'A sample project with pre-populated findings to help you explore the platform.',
        status: 'ACTIVE',
        organizationId: orgId,
        createdById: userId,
      },
    });

    const target = await this.prisma.target.create({
      data: {
        value: 'https://demo.example.com',
        type: 'URL',
        verificationStatus: 'VERIFIED',
        verificationToken: createId(),
        projectId: project.id,
        organizationId: orgId,
        createdById: userId,
      },
    });

    const scan = await this.prisma.scan.create({
      data: {
        type: 'FULL',
        status: 'COMPLETED',
        targetId: target.id,
        organizationId: orgId,
        projectId: project.id,
        createdById: userId,
        startedAt: new Date(Date.now() - 30 * 60 * 1000),
        completedAt: new Date(),
      },
    });

    await this.prisma.finding.createMany({
      data: DEMO_FINDINGS.map((f) => ({
        ...f,
        scanId: scan.id,
        targetId: target.id,
        organizationId: orgId,
        projectId: project.id,
        createdById: userId,
      })),
    });

    return { projectId: project.id };
  }
}
