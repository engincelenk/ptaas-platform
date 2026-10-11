import { Controller, Get, Param, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

const API_BASE_PLACEHOLDER = '%%API_BASE%%';
const PROJECT_ID_PLACEHOLDER = '%%PROJECT_ID%%';

function buildTypeScriptSdk(apiBase: string, projectId: string): string {
  return `/**
 * PTaaS TypeScript SDK — auto-generated for project ${projectId}
 * Base URL: ${apiBase}
 *
 * Usage:
 *   const client = new PTaaSClient({ apiKey: 'ptaas_...' });
 *   const findings = await client.findings.list('${projectId}');
 */

export interface PTaaSClientOptions {
  /** API key (ptaas_...) or JWT access token */
  apiKey: string;
  /** Override base URL (default: ${apiBase}) */
  baseUrl?: string;
}

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type ScanStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ScanType = 'QUICK' | 'FULL' | 'WEB_CRAWL' | 'API_SCAN';

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  status: string;
  templateId: string;
  matchedAt: string;
  owasp?: string;
  cvssScore?: number;
  cveIds: string[];
  cweIds: string[];
  createdAt: string;
}

export interface Scan {
  id: string;
  status: ScanStatus;
  type: ScanType;
  progress: number;
  findingsCount?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ComplianceReport {
  projectId: string;
  score: number;
  categories: Array<{
    category: { id: string; name: string; iso27001Controls: string[] };
    status: 'COMPLIANT' | 'WARNING' | 'CRITICAL' | 'UNCHECKED';
    openCount: number;
  }>;
  generatedAt: string;
}

class BaseResource {
  protected constructor(
    protected readonly http: (path: string, init?: RequestInit) => Promise<Response>,
    protected readonly projectId: string,
  ) {}
}

class FindingsResource extends BaseResource {
  async list(params?: { severity?: Severity; status?: string; page?: number; limit?: number }): Promise<Finding[]> {
    const qs = new URLSearchParams();
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const res = await this.http(\`/projects/\${this.projectId}/findings?\${qs}\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    const data = await res.json();
    return data.data ?? data;
  }

  async get(id: string): Promise<Finding> {
    const res = await this.http(\`/projects/\${this.projectId}/findings/\${id}\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    return res.json();
  }

  async updateStatus(id: string, status: string): Promise<Finding> {
    const res = await this.http(\`/projects/\${this.projectId}/findings/\${id}/status\`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    return res.json();
  }
}

class ScansResource extends BaseResource {
  async list(): Promise<Scan[]> {
    const res = await this.http(\`/projects/\${this.projectId}/scans\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    return res.json();
  }

  async start(options?: { type?: ScanType; policyId?: string }): Promise<Scan> {
    const res = await this.http(\`/projects/\${this.projectId}/scans\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: options?.type ?? 'QUICK', policyId: options?.policyId }),
    });
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    return res.json();
  }

  async get(id: string): Promise<Scan> {
    const res = await this.http(\`/projects/\${this.projectId}/scans/\${id}\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    return res.json();
  }

  /** Poll until scan completes or fails */
  async waitForCompletion(id: string, intervalMs = 5000): Promise<Scan> {
    while (true) {
      const scan = await this.get(id);
      if (scan.status === 'COMPLETED' || scan.status === 'FAILED' || scan.status === 'CANCELLED') {
        return scan;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

class ComplianceResource extends BaseResource {
  async get(): Promise<ComplianceReport> {
    const res = await this.http(\`/projects/\${this.projectId}/compliance\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    return res.json();
  }
}

export class PTaaSClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly findings: FindingsResource;
  readonly scans: ScansResource;
  readonly compliance: ComplianceResource;

  constructor(options: PTaaSClientOptions) {
    this.baseUrl = (options.baseUrl ?? '${apiBase}').replace(/\\/$/, '');
    this.apiKey = options.apiKey;

    const http = this._fetch.bind(this);
    const projectId = '${projectId}';
    this.findings = new FindingsResource(http, projectId);
    this.scans = new ScansResource(http, projectId);
    this.compliance = new ComplianceResource(http, projectId);
  }

  private async _fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = \`\${this.baseUrl}\${path.startsWith('/') ? path : '/' + path}\`;
    const headers = new Headers(init.headers);
    headers.set('Authorization', \`Bearer \${this.apiKey}\`);
    headers.set('Accept', 'application/json');
    return fetch(url, { ...init, headers });
  }
}
`;
}

@ApiTags('sdk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/sdk')
export class SdkController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('typescript')
  @ApiOperation({ summary: 'Download pre-built TypeScript SDK client for this project' })
  async downloadTypeScriptSdk(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: user.orgId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const apiBase = process.env.API_PUBLIC_URL ?? 'https://api.ptaas.example.com';
    const sdkContent = buildTypeScriptSdk(apiBase, projectId);
    const filename = `ptaas-sdk-${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ts`;

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(sdkContent).toString(),
    });
    res.send(sdkContent);
  }
}
