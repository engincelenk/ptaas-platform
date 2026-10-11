import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

const PRESETS: Record<string, Array<{ title: string; description: string; category: string }>> = {
  OWASP_TG_V42: [
    { category: 'Information Gathering', title: 'Fingerprint Web Server', description: 'Identify web server software and version (OTG-INFO-002)' },
    { category: 'Information Gathering', title: 'Enumerate Application Entry Points', description: 'Map all inputs, parameters, and entry points (OTG-INFO-006)' },
    { category: 'Information Gathering', title: 'Map Application Architecture', description: 'Document backend, middleware, and third-party services (OTG-INFO-010)' },
    { category: 'Configuration Management', title: 'Network/Infrastructure Configuration', description: 'Test network config for security weaknesses (OTG-CONFIG-001)' },
    { category: 'Configuration Management', title: 'HTTP Methods', description: 'Verify only required HTTP methods are allowed (OTG-CONFIG-006)' },
    { category: 'Authentication Testing', title: 'Test Credentials Transported over Encrypted Channel', description: 'Ensure login uses HTTPS (OTG-AUTHN-001)' },
    { category: 'Authentication Testing', title: 'Test Default Credentials', description: 'Check for default/weak credentials on all components (OTG-AUTHN-002)' },
    { category: 'Authentication Testing', title: 'Test Brute Force Protection', description: 'Verify account lockout and rate limiting on auth endpoints (OTG-AUTHN-003)' },
    { category: 'Authentication Testing', title: 'Test for Bypassing Authentication Schema', description: 'Attempt to bypass login mechanisms (OTG-AUTHN-004)' },
    { category: 'Session Management', title: 'Test Session Management Schema', description: 'Review session token entropy and transmission (OTG-SESS-001)' },
    { category: 'Session Management', title: 'Test Cookie Attributes', description: 'Verify HttpOnly, Secure, SameSite flags (OTG-SESS-002)' },
    { category: 'Session Management', title: 'Test CSRF', description: 'Test for cross-site request forgery vulnerabilities (OTG-SESS-005)' },
    { category: 'Authorization Testing', title: 'Test for Privilege Escalation', description: 'Attempt to access resources above current privilege level (OTG-AUTHZ-003)' },
    { category: 'Authorization Testing', title: 'Test for IDOR', description: 'Test insecure direct object references (OTG-AUTHZ-004)' },
    { category: 'Input Validation', title: 'Test for Reflected XSS', description: 'Identify reflected cross-site scripting vulnerabilities (OTG-INPVAL-001)' },
    { category: 'Input Validation', title: 'Test for Stored XSS', description: 'Identify stored/persistent XSS vulnerabilities (OTG-INPVAL-002)' },
    { category: 'Input Validation', title: 'Test for SQL Injection', description: 'Attempt SQL injection in all input fields (OTG-INPVAL-005)' },
    { category: 'Input Validation', title: 'Test for Command Injection', description: 'Attempt OS command injection (OTG-INPVAL-013)' },
    { category: 'Error Handling', title: 'Test Error Codes', description: 'Verify error responses do not leak sensitive information (OTG-ERR-001)' },
    { category: 'Cryptography', title: 'Test for Weak Cryptography', description: 'Verify TLS configuration, cipher suites, and certificate validity (OTG-CRYPST-001)' },
  ],
  PTES: [
    { category: 'Pre-engagement', title: 'Rules of Engagement', description: 'Define scope, timeline, and permitted test techniques' },
    { category: 'Pre-engagement', title: 'Legal Authorization', description: 'Obtain written authorization before testing' },
    { category: 'Intelligence Gathering', title: 'OSINT — Target', description: 'Open-source intelligence gathering on target organization' },
    { category: 'Intelligence Gathering', title: 'Network Reconnaissance', description: 'Map IP ranges, ASNs, and publicly exposed services' },
    { category: 'Threat Modeling', title: 'Asset Identification', description: 'Identify critical assets and prioritize attack surfaces' },
    { category: 'Threat Modeling', title: 'Threat Actor Analysis', description: 'Define relevant threat actors and their capabilities' },
    { category: 'Vulnerability Research', title: 'Automated Scanning', description: 'Run automated vulnerability scanners against in-scope targets' },
    { category: 'Vulnerability Research', title: 'Manual Testing', description: 'Perform manual validation of findings and test for logic flaws' },
    { category: 'Exploitation', title: 'Exploitation of Findings', description: 'Attempt exploitation to confirm and rate severity of vulnerabilities' },
    { category: 'Exploitation', title: 'Privilege Escalation', description: 'Attempt to escalate privileges post-exploitation' },
    { category: 'Post-Exploitation', title: 'Persistence Assessment', description: 'Assess potential for persistent access' },
    { category: 'Post-Exploitation', title: 'Lateral Movement', description: 'Assess potential for lateral movement within the network' },
    { category: 'Reporting', title: 'Finding Documentation', description: 'Document all findings with PoC, impact, and remediation guidance' },
    { category: 'Reporting', title: 'Executive Summary', description: 'Write non-technical executive summary for stakeholders' },
    { category: 'Reporting', title: 'Remediation Verification', description: 'Verify fixes after client remediation (retest)' },
  ],
};

function cuid(): string {
  return randomBytes(12).toString('base64url');
}

@Injectable()
export class MethodologyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.methodology.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { checks: true, assignments: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(orgId: string, dto: { name: string; description?: string; preset?: string }) {
    const preset = dto.preset ?? 'CUSTOM';
    const checks = PRESETS[preset] ?? [];

    return this.prisma.methodology.create({
      data: {
        id: cuid(),
        organizationId: orgId,
        name: dto.name,
        description: dto.description,
        preset,
        checks: {
          create: checks.map((c, i) => ({
            id: cuid(),
            title: c.title,
            description: c.description,
            category: c.category,
            sortOrder: i,
          })),
        },
      },
      include: { checks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async getOne(id: string, orgId: string) {
    const m = await this.prisma.methodology.findFirst({
      where: { id, organizationId: orgId },
      include: { checks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!m) throw new NotFoundException('Methodology not found');
    return m;
  }

  async delete(id: string, orgId: string) {
    const m = await this.prisma.methodology.findFirst({ where: { id, organizationId: orgId } });
    if (!m) throw new NotFoundException('Methodology not found');
    await this.prisma.methodology.delete({ where: { id } });
  }

  async assign(methodologyId: string, projectId: string, orgId: string) {
    const m = await this.prisma.methodology.findFirst({
      where: { id: methodologyId, organizationId: orgId },
      include: { checks: true },
    });
    if (!m) throw new NotFoundException('Methodology not found');

    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!project) throw new NotFoundException('Project not found');

    const assignmentId = cuid();
    const assignment = await this.prisma.methodologyAssignment.upsert({
      where: { methodologyId_projectId: { methodologyId, projectId } },
      update: {},
      create: {
        id: assignmentId,
        methodologyId,
        projectId,
        organizationId: orgId,
      },
    });

    // Create progress entries for any checks that don't have one yet
    const existing = await this.prisma.methodologyProgress.findMany({
      where: { assignmentId: assignment.id },
      select: { checkId: true },
    });
    const existingCheckIds = new Set(existing.map((e) => e.checkId));
    const toCreate = m.checks.filter((c) => !existingCheckIds.has(c.id));

    if (toCreate.length > 0) {
      await this.prisma.methodologyProgress.createMany({
        data: toCreate.map((c) => ({
          id: cuid(),
          assignmentId: assignment.id,
          checkId: c.id,
          organizationId: orgId,
        })),
      });
    }

    return assignment;
  }

  async getProjectProgress(projectId: string, orgId: string) {
    const assignments = await this.prisma.methodologyAssignment.findMany({
      where: { projectId, organizationId: orgId },
      include: {
        methodology: { select: { id: true, name: true, preset: true } },
        progress: {
          include: { check: { select: { title: true, category: true, sortOrder: true } } },
          orderBy: { check: { sortOrder: 'asc' } },
        },
      },
    });
    return assignments;
  }

  async toggleCheck(
    assignmentId: string,
    checkId: string,
    orgId: string,
    completed: boolean,
    notes: string | undefined,
    userId: string,
  ) {
    const prog = await this.prisma.methodologyProgress.findFirst({
      where: { assignmentId, checkId, organizationId: orgId },
    });
    if (!prog) throw new NotFoundException('Progress entry not found');

    return this.prisma.methodologyProgress.update({
      where: { assignmentId_checkId: { assignmentId, checkId } },
      data: {
        completed,
        notes,
        completedById: completed ? userId : null,
        completedAt: completed ? new Date() : null,
      },
    });
  }

  async addCheck(methodologyId: string, orgId: string, dto: { title: string; description?: string; category?: string }) {
    const m = await this.prisma.methodology.findFirst({ where: { id: methodologyId, organizationId: orgId } });
    if (!m) throw new NotFoundException('Methodology not found');

    const maxOrder = await this.prisma.methodologyCheck.aggregate({
      where: { methodologyId },
      _max: { sortOrder: true },
    });

    return this.prisma.methodologyCheck.create({
      data: {
        id: cuid(),
        methodologyId,
        title: dto.title,
        description: dto.description,
        category: dto.category ?? 'Custom',
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }
}
