/**
 * Demo data seed — fills an existing org with a project, verified targets, completed scans and findings so the UI
 * shows a populated application without a running scanner. Idempotent: re-running does nothing once the demo exists.
 *
 * Run (from repo root, API infra running):
 *   DATABASE_URL=postgresql://ptaas:ptaas_pw@127.0.0.1:55432/ptaas_e2e \
 *     npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' scripts/seed-demo.ts
 *
 * Environment:
 *   DATABASE_URL  — must point to a local database (localhost / 127.0.0.1); the script refuses anything else
 *   DEMO_EMAIL    — user whose organization receives the data (default: admin@ptaas.local)
 */

import { randomBytes } from 'node:crypto';
import { PrismaClient } from '../packages/db/src/generated/client';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
type FindingStatus = 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'VERIFIED' | 'CLOSED' | 'FALSE_POSITIVE' | 'ACCEPTED_RISK';

const prisma = new PrismaClient();

const EMAIL = process.env.DEMO_EMAIL ?? 'admin@ptaas.local';
const PROJECT_NAME = 'Demo – Acme Webshop';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

interface DemoFinding {
  title: string;
  severity: Severity;
  status: FindingStatus;
  target: 0 | 1;
  scan: 0 | 1 | 2;
  templateId: string;
  path: string;
  cvss: number;
  cve?: string;
  cwe: string;
  owasp: string;
  description: string;
  remediation: string;
  dueInDays?: number;
}

const FINDINGS: DemoFinding[] = [
  { title: 'Apache HTTP Server Path Traversal (CVE-2021-41773)', severity: 'CRITICAL', status: 'OPEN', target: 0, scan: 1, templateId: 'CVE-2021-41773', path: 'https://shop.acme-demo.test/cgi-bin/.%2e/%2e%2e/etc/passwd', cvss: 9.8, cve: 'CVE-2021-41773', cwe: 'CWE-22', owasp: 'A01', description: 'Path normalization flaw allows reading files outside the document root.', remediation: 'Upgrade Apache HTTP Server to 2.4.51 or later.', dueInDays: 3 },
  { title: 'Exposed .git directory', severity: 'HIGH', status: 'IN_PROGRESS', target: 0, scan: 1, templateId: 'git-config', path: 'https://shop.acme-demo.test/.git/config', cvss: 7.5, cwe: 'CWE-538', owasp: 'A05', description: 'The repository metadata is publicly downloadable and may expose source code and credentials.', remediation: 'Block access to dot-directories at the web server and remove .git from the document root.', dueInDays: 7 },
  { title: 'SQL Injection in product search', severity: 'HIGH', status: 'OPEN', target: 0, scan: 1, templateId: 'generic-sqli', path: 'https://shop.acme-demo.test/search?q=1%27', cvss: 8.2, cwe: 'CWE-89', owasp: 'A03', description: 'The q parameter is concatenated into an SQL query; a single quote produces a database error.', remediation: 'Use parameterized queries and validate input server-side.', dueInDays: 5 },
  { title: 'Missing Strict-Transport-Security header', severity: 'MEDIUM', status: 'OPEN', target: 0, scan: 1, templateId: 'hsts-missing', path: 'https://shop.acme-demo.test/', cvss: 5.3, cwe: 'CWE-319', owasp: 'A02', description: 'Responses do not set HSTS, so browsers may be downgraded to plain HTTP.', remediation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains.' },
  { title: 'Cookie without Secure and HttpOnly flags', severity: 'MEDIUM', status: 'FIXED', target: 0, scan: 1, templateId: 'cookie-flags', path: 'https://shop.acme-demo.test/login', cvss: 5.0, cwe: 'CWE-614', owasp: 'A05', description: 'The session cookie can be read by scripts and sent over unencrypted connections.', remediation: 'Set Secure, HttpOnly and SameSite=Lax on session cookies.' },
  { title: 'Reflected XSS in /search', severity: 'MEDIUM', status: 'OPEN', target: 0, scan: 1, templateId: 'reflected-xss', path: 'https://shop.acme-demo.test/search?q=%3Cscript%3E', cvss: 6.1, cwe: 'CWE-79', owasp: 'A03', description: 'User input is reflected into the HTML response without encoding.', remediation: 'Encode output contextually and add a Content-Security-Policy.', dueInDays: 14 },
  { title: 'Server version disclosure', severity: 'LOW', status: 'ACCEPTED_RISK', target: 0, scan: 1, templateId: 'server-banner', path: 'https://shop.acme-demo.test/', cvss: 3.1, cwe: 'CWE-200', owasp: 'A05', description: 'The Server header reveals the exact web server version.', remediation: 'Set ServerTokens Prod and ServerSignature Off.' },
  { title: 'Directory listing enabled on /static/', severity: 'LOW', status: 'OPEN', target: 0, scan: 1, templateId: 'dir-listing', path: 'https://shop.acme-demo.test/static/', cvss: 3.7, cwe: 'CWE-548', owasp: 'A05', description: 'Autoindex exposes file names in the static directory.', remediation: 'Disable autoindex for public directories.' },
  { title: 'Technology fingerprint: nginx + PHP', severity: 'INFO', status: 'CLOSED', target: 0, scan: 1, templateId: 'tech-detect', path: 'https://shop.acme-demo.test/', cvss: 0, cwe: 'CWE-200', owasp: 'A05', description: 'Detected technologies: nginx, PHP, jQuery.', remediation: 'No action required.' },
  { title: 'Spring4Shell Remote Code Execution (CVE-2022-22965)', severity: 'CRITICAL', status: 'FIXED', target: 1, scan: 2, templateId: 'CVE-2022-22965', path: 'https://api.acme-demo.test/actuator', cvss: 9.8, cve: 'CVE-2022-22965', cwe: 'CWE-94', owasp: 'A06', description: 'Data binding on Spring MVC with JDK 9+ allows remote code execution.', remediation: 'Upgrade Spring Framework to 5.3.18 / 5.2.20 or later.' },
  { title: 'Spring Boot Actuator /env exposed', severity: 'HIGH', status: 'OPEN', target: 1, scan: 2, templateId: 'springboot-env', path: 'https://api.acme-demo.test/actuator/env', cvss: 7.5, cwe: 'CWE-215', owasp: 'A05', description: 'The /env endpoint returns configuration and potentially secrets without authentication.', remediation: 'Restrict actuator endpoints to an internal network and require authentication.', dueInDays: 2 },
  { title: 'Permissive CORS: Access-Control-Allow-Origin reflects any origin', severity: 'MEDIUM', status: 'IN_PROGRESS', target: 1, scan: 2, templateId: 'cors-misconfig', path: 'https://api.acme-demo.test/v1/orders', cvss: 6.5, cwe: 'CWE-942', owasp: 'A05', description: 'Any origin is reflected together with Allow-Credentials: true.', remediation: 'Use an explicit origin allowlist.', dueInDays: 10 },
  { title: 'Swagger UI publicly accessible', severity: 'LOW', status: 'OPEN', target: 1, scan: 2, templateId: 'swagger-api', path: 'https://api.acme-demo.test/swagger-ui.html', cvss: 3.5, cwe: 'CWE-200', owasp: 'A05', description: 'API documentation reveals all endpoints and models to unauthenticated users.', remediation: 'Protect the documentation or disable it in production.' },
  { title: 'Missing X-Content-Type-Options header', severity: 'INFO', status: 'FALSE_POSITIVE', target: 1, scan: 2, templateId: 'nosniff-missing', path: 'https://api.acme-demo.test/', cvss: 0, cwe: 'CWE-693', owasp: 'A05', description: 'Responses do not set X-Content-Type-Options: nosniff.', remediation: 'Add X-Content-Type-Options: nosniff.' },
];

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try { return new URL(url).hostname; } catch { return ''; }
  })();
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing to seed: DATABASE_URL host "${host || 'unset'}" is not local.`);
  }
}

async function main() {
  assertLocalDatabase();

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`User ${EMAIL} not found. Register/log in once first.`);
  const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
  if (!membership) throw new Error(`User ${EMAIL} has no organization.`);
  const organizationId = membership.organizationId;

  const existing = await prisma.project.findFirst({ where: { organizationId, name: PROJECT_NAME } });
  if (existing) {
    console.log(`Demo project already exists (${existing.id}) — nothing to do.`);
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: PROJECT_NAME,
      description: 'Demo data: a fictional webshop with a public site and a REST API.',
      organizationId,
      createdById: user.id,
    },
  });

  const base = { projectId: project.id, organizationId, createdById: user.id };
  const targetDefs = [
    { type: 'DOMAIN' as const, value: 'shop.acme-demo.test' },
    { type: 'DOMAIN' as const, value: 'api.acme-demo.test' },
  ];
  const targets = [];
  for (const t of targetDefs) {
    targets.push(await prisma.target.create({
      data: {
        ...base,
        ...t,
        verificationStatus: 'VERIFIED',
        verificationMethod: 'DNS_TXT',
        verificationToken: `demo-${randomBytes(12).toString('hex')}`,
        verifiedAt: daysAgo(30),
        lastVerifiedAt: daysAgo(1),
      },
    }));
  }

  // Scan 0: older shop scan, scan 1: latest shop scan, scan 2: API scan. One failed scan for the status view.
  const scanDefs = [
    { target: 0, type: 'QUICK' as const, status: 'COMPLETED' as const, started: 21, minutes: 6 },
    { target: 0, type: 'FULL' as const, status: 'COMPLETED' as const, started: 2, minutes: 41 },
    { target: 1, type: 'API_SCAN' as const, status: 'COMPLETED' as const, started: 1, minutes: 18 },
  ];
  const scans = [];
  for (const s of scanDefs) {
    const startedAt = new Date(daysAgo(s.started).getTime());
    scans.push(await prisma.scan.create({
      data: {
        ...base,
        targetId: targets[s.target].id,
        type: s.type,
        status: s.status,
        progress: 100,
        totalTemplates: 1200,
        startedAt,
        completedAt: new Date(startedAt.getTime() + s.minutes * 60 * 1000),
      },
    }));
  }
  await prisma.scan.create({
    data: {
      ...base,
      targetId: targets[1].id,
      type: 'QUICK',
      status: 'FAILED',
      errorMessage: 'Demo data: scanner unavailable',
      startedAt: daysAgo(5),
      completedAt: daysAgo(5),
    },
  });

  for (const f of FINDINGS) {
    const scan = scans[f.scan];
    await prisma.finding.create({
      data: {
        ...base,
        scanId: scan.id,
        targetId: targets[f.target].id,
        title: f.title,
        description: f.description,
        severity: f.severity,
        status: f.status,
        templateId: f.templateId,
        templateName: f.title,
        matchedAt: f.path,
        cvssScore: f.cvss,
        cveIds: f.cve ? [f.cve] : [],
        cweIds: [f.cwe],
        owasp: f.owasp,
        aiRemediation: f.remediation,
        dueDate: f.dueInDays ? new Date(Date.now() + f.dueInDays * DAY) : null,
        diffStatus: f.scan === 1 || f.scan === 2 ? 'NEW' : null,
        createdAt: scan.completedAt ?? new Date(),
      },
    });
  }

  console.log(`Demo data created for ${EMAIL}: project ${project.id}, ${targets.length} targets, ${scans.length + 1} scans, ${FINDINGS.length} findings.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
