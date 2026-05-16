import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFormat } from '@prisma/client';
import { generatePdfHtml } from './pdf-template';

export interface ReportData {
  project: {
    id: string;
    name: string;
    targets: string[];
    description: string | null;
  };
  findings: {
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    cvssScore: number | null;
    cweId: string | null;
    affectedUrl: string | null;
    remediation: string | null;
    scan: { type: string };
  }[];
  generatedAt: string;
  tenantId: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Daten laden ───────────────────────────────────────────────────────────
  private async loadReportData(
    projectId: string,
    tenantId: string,
    scanId?: string,
  ): Promise<ReportData> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const findings = await this.prisma.finding.findMany({
      where: {
        projectId,
        tenantId,
        ...(scanId ? { scanId } : {}),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      include: { scan: { select: { type: true } } },
    });

    return {
      project: {
        id: project.id,
        name: project.name,
        targets: project.targets,
        description: project.description,
      },
      findings: findings.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity,
        status: f.status,
        cvssScore: f.cvssScore,
        cweId: f.cweId,
        affectedUrl: f.affectedUrl,
        remediation: f.remediation,
        scan: { type: f.scan.type },
      })),
      generatedAt: new Date().toISOString(),
      tenantId,
    };
  }

  // ── JSON-Export ───────────────────────────────────────────────────────────
  async generateJson(
    projectId: string,
    tenantId: string,
    scanId?: string,
  ): Promise<{ report: ReportData; buffer: Buffer }> {
    const report = await this.loadReportData(projectId, tenantId, scanId);

    await this.prisma.report.create({
      data: { projectId, tenantId, scanId, format: ReportFormat.JSON },
    });

    return {
      report,
      buffer: Buffer.from(JSON.stringify(report, null, 2), 'utf-8'),
    };
  }

  // ── PDF-Export ────────────────────────────────────────────────────────────
  async generatePdf(
    projectId: string,
    tenantId: string,
    scanId?: string,
  ): Promise<{ buffer: Buffer; projectName: string }> {
    const report = await this.loadReportData(projectId, tenantId, scanId);
    const html = generatePdfHtml(report);

    let puppeteer: typeof import('puppeteer');
    try {
      puppeteer = await import('puppeteer');
    } catch {
      throw new InternalServerErrorException('Puppeteer nicht verfügbar');
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      await this.prisma.report.create({
        data: { projectId, tenantId, scanId, format: ReportFormat.PDF },
      });

      return { buffer: Buffer.from(pdf), projectName: report.project.name };
    } finally {
      await browser.close();
    }
  }

  // ── Archiv ────────────────────────────────────────────────────────────────
  async findAll(projectId: string, tenantId: string) {
    return this.prisma.report.findMany({
      where: { projectId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Stub (alte generate-Methode) ──────────────────────────────────────────
  async generate(
    projectId: string,
    format: ReportFormat,
    tenantId: string,
    scanId?: string,
  ) {
    await this.loadReportData(projectId, tenantId, scanId);
    return this.prisma.report.create({
      data: { projectId, tenantId, scanId, format },
    });
  }
}
