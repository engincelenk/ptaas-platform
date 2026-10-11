import { Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService, BUCKET_REPORTS } from '../minio/minio.service';

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#CA8A04',
  LOW: '#16A34A',
  INFO: '#6B7280',
};

function cvssLabel(score: number | null): string {
  if (score === null) return 'N/A';
  if (score >= 9.0) return `${score} CRITICAL`;
  if (score >= 7.0) return `${score} HIGH`;
  if (score >= 4.0) return `${score} MEDIUM`;
  if (score >= 0.1) return `${score} LOW`;
  return `${score} NONE`;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  private async loadProjectData(projectId: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      include: {
        organization: { select: { name: true, logoUrl: true, brandPrimaryColor: true, brandCompanyName: true, brandFooterText: true } },
        findings: {
          where: { status: { notIn: ['FALSE_POSITIVE', 'CLOSED'] } },
          orderBy: [{ severity: 'asc' }, { aiRiskScore: 'desc' }],
          include: {
            target: { select: { value: true, type: true } },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // ─── CSV Export ─────────────────────────────────────────────────────────────

  async exportCsv(projectId: string, orgId: string, res: Response): Promise<void> {
    const project = await this.loadProjectData(projectId, orgId);
    const safe = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const cols = [
      'ID', 'Title', 'Severity', 'Status', 'CVSS Score', 'CVSS Vector',
      'CVE IDs', 'CWE IDs', 'OWASP', 'Target', 'Matched At',
      'AI Risk Score', 'AI Explanation', 'AI Remediation', 'Created At',
    ];

    const rows = project.findings.map((f) => [
      f.id, f.title, f.severity, f.status,
      f.cvssScore ?? '', f.cvssVector ?? '',
      (f.cveIds ?? []).join(';'), (f.cweIds ?? []).join(';'),
      f.owasp ?? '', f.target.value, f.matchedAt ?? '',
      f.aiRiskScore ?? '', f.aiExplanation ?? '', f.aiRemediation ?? '',
      f.createdAt.toISOString(),
    ].map(safe).join(','));

    const csv = [cols.join(','), ...rows].join('\r\n');
    const filename = `findings-${project.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM for Excel UTF-8 compatibility
  }

  // ─── Excel Export ────────────────────────────────────────────────────────────

  async exportExcel(projectId: string, orgId: string, res: Response): Promise<void> {
    const project = await this.loadProjectData(projectId, orgId);
    const findings = project.findings;

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'PTaaS Platform';
    wb.created  = new Date();
    wb.modified = new Date();
    wb.properties.date1904 = false;

    const SEV_FILL: Record<string, ExcelJS.Fill> = {
      CRITICAL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } },
      HIGH:     { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } },
      MEDIUM:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAB308' } },
      LOW:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } },
      INFO:     { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B7280' } },
    };
    const WHITE_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
    const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };

    const bySeverity: Record<string, number> = {};
    for (const s of SEVERITY_ORDER) bySeverity[s] = 0;
    for (const f of findings) bySeverity[f.severity]++;

    const avgCvss = findings.filter((f) => f.cvssScore).length > 0
      ? (findings.reduce((s, f) => s + (f.cvssScore ?? 0), 0) / findings.filter((f) => f.cvssScore).length).toFixed(1)
      : 'N/A';

    // ── Sheet 1: Executive Summary ────────────────────────────────────────────
    const summarySheet = wb.addWorksheet('Executive Summary', {
      pageSetup: { orientation: 'portrait', fitToPage: true },
    });
    summarySheet.columns = [
      { width: 28 }, { width: 20 }, { width: 20 }, { width: 20 },
    ];

    // Title block
    summarySheet.mergeCells('A1:D1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = `PTaaS Security Report — ${project.name}`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = HEADER_FILL;
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 36;

    summarySheet.mergeCells('A2:D2');
    const orgCell = summarySheet.getCell('A2');
    orgCell.value = `Organization: ${project.organization.name}   ·   Exported: ${new Date().toLocaleDateString('en-GB')}`;
    orgCell.font = { italic: true, color: { argb: 'FF64748B' } };
    orgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    orgCell.alignment = { horizontal: 'center' };

    summarySheet.addRow([]);

    // KPI row headers
    const kpiHeaderRow = summarySheet.addRow(['Total Findings', 'Critical', 'High', 'Avg CVSS']);
    kpiHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF6366F1' } } };
    });

    const kpiRow = summarySheet.addRow([
      findings.length, bySeverity.CRITICAL, bySeverity.HIGH, avgCvss,
    ]);
    kpiRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, size: 18 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNum === 2 && bySeverity.CRITICAL > 0) cell.font = { ...cell.font, color: { argb: 'FFEF4444' } };
      if (colNum === 3 && bySeverity.HIGH > 0)     cell.font = { ...cell.font, color: { argb: 'FFF97316' } };
    });
    summarySheet.getRow(kpiRow.number).height = 32;

    summarySheet.addRow([]);

    // Severity breakdown
    const sevHeaderRow = summarySheet.addRow(['Severity', 'Count', 'Percentage', 'SLA (days)']);
    sevHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = { bottom: { style: 'thin' } };
    });

    const SLA: Record<string, number> = { CRITICAL: 7, HIGH: 30, MEDIUM: 90, LOW: 180, INFO: 365 };
    for (const sev of SEVERITY_ORDER) {
      if (bySeverity[sev] === 0) continue;
      const pct = findings.length > 0 ? ((bySeverity[sev] / findings.length) * 100).toFixed(1) + '%' : '0%';
      const row = summarySheet.addRow([sev, bySeverity[sev], pct, SLA[sev]]);
      const sevCell = row.getCell(1);
      sevCell.fill   = SEV_FILL[sev] ?? SEV_FILL.INFO;
      sevCell.font   = WHITE_FONT;
      sevCell.alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
    }

    summarySheet.addRow([]);
    summarySheet.addRow(['Status', 'Count']);
    const statusGroups: Record<string, number> = {};
    for (const f of findings) statusGroups[f.status] = (statusGroups[f.status] ?? 0) + 1;
    for (const [status, count] of Object.entries(statusGroups)) {
      summarySheet.addRow([status, count]);
    }

    // ── Sheet 2: All Findings ─────────────────────────────────────────────────
    const findingsSheet = wb.addWorksheet('Findings');
    findingsSheet.columns = [
      { header: 'ID',            key: 'id',           width: 36 },
      { header: 'Title',         key: 'title',        width: 48 },
      { header: 'Severity',      key: 'severity',     width: 12 },
      { header: 'Status',        key: 'status',       width: 14 },
      { header: 'CVSS Score',    key: 'cvss',         width: 12 },
      { header: 'CVE IDs',       key: 'cves',         width: 20 },
      { header: 'CWE IDs',       key: 'cwes',         width: 16 },
      { header: 'OWASP',         key: 'owasp',        width: 10 },
      { header: 'Target',        key: 'target',       width: 36 },
      { header: 'Matched At',    key: 'matchedAt',    width: 40 },
      { header: 'AI Risk Score', key: 'aiRisk',       width: 14 },
      { header: 'AI Remediation',key: 'aiRemediation',width: 60 },
      { header: 'Created At',    key: 'createdAt',    width: 22 },
    ];

    // Style header row
    const findHeaderRow = findingsSheet.getRow(1);
    findHeaderRow.eachCell((cell) => {
      cell.fill  = HEADER_FILL;
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF6366F1' } } };
    });
    findingsSheet.getRow(1).height = 20;
    findingsSheet.autoFilter = 'A1:M1';
    findingsSheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const f of findings) {
      const row = findingsSheet.addRow({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        cvss: f.cvssScore ?? '',
        cves: (f.cveIds ?? []).join(', '),
        cwes: (f.cweIds ?? []).join(', '),
        owasp: f.owasp ?? '',
        target: f.target.value,
        matchedAt: f.matchedAt ?? '',
        aiRisk: f.aiRiskScore ?? '',
        aiRemediation: f.aiRemediation ?? '',
        createdAt: f.createdAt.toISOString().slice(0, 19).replace('T', ' '),
      });

      const sevCell = row.getCell('severity');
      if (SEV_FILL[f.severity]) {
        sevCell.fill = SEV_FILL[f.severity];
        sevCell.font = WHITE_FONT;
        sevCell.alignment = { horizontal: 'center' };
      }
      row.getCell('aiRemediation').alignment = { wrapText: true };
    }

    // ── Sheet 3: CVSS Breakdown ───────────────────────────────────────────────
    const cvssSheet = wb.addWorksheet('CVSS Breakdown');
    cvssSheet.columns = [
      { header: 'Title',      key: 'title',    width: 50 },
      { header: 'Severity',   key: 'severity', width: 12 },
      { header: 'CVSS Score', key: 'cvss',     width: 12 },
      { header: 'CVSS Vector',key: 'vector',   width: 45 },
      { header: 'CVE IDs',    key: 'cves',     width: 24 },
    ];

    cvssSheet.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });
    cvssSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const withCvss = findings.filter((f) => f.cvssScore !== null).sort((a, b) => (b.cvssScore ?? 0) - (a.cvssScore ?? 0));
    for (const f of withCvss) {
      const row = cvssSheet.addRow({
        title: f.title,
        severity: f.severity,
        cvss: f.cvssScore,
        vector: f.cvssVector ?? '',
        cves: (f.cveIds ?? []).join(', '),
      });
      const sevCell = row.getCell('severity');
      if (SEV_FILL[f.severity]) {
        sevCell.fill = SEV_FILL[f.severity];
        sevCell.font = WHITE_FONT;
        sevCell.alignment = { horizontal: 'center' };
      }
      row.getCell('cvss').numFmt = '0.0';
      row.getCell('cvss').alignment = { horizontal: 'center' };
    }

    // ── Sheet 4: OWASP Mapping ────────────────────────────────────────────────
    const owaspSheet = wb.addWorksheet('OWASP Mapping');
    owaspSheet.columns = [
      { header: 'OWASP Category', key: 'category', width: 12 },
      { header: 'Count',          key: 'count',    width: 10 },
      { header: 'Findings',       key: 'findings', width: 80 },
    ];

    owaspSheet.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });
    owaspSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const byOwasp: Record<string, string[]> = {};
    for (const f of findings) {
      if (f.owasp) {
        (byOwasp[f.owasp] ??= []).push(f.title);
      }
    }

    const OWASP_LABELS: Record<string, string> = {
      A01: 'A01 — Broken Access Control', A02: 'A02 — Cryptographic Failures',
      A03: 'A03 — Injection', A04: 'A04 — Insecure Design',
      A05: 'A05 — Security Misconfiguration', A06: 'A06 — Vulnerable Components',
      A07: 'A07 — Identification & Auth Failures', A08: 'A08 — Software Integrity Failures',
      A09: 'A09 — Logging & Monitoring Failures', A10: 'A10 — Server-Side Request Forgery',
    };

    for (const [cat, titles] of Object.entries(byOwasp).sort((a, b) => a[0].localeCompare(b[0]))) {
      const row = owaspSheet.addRow({
        category: OWASP_LABELS[cat] ?? cat,
        count: titles.length,
        findings: titles.join('\n'),
      });
      row.getCell('findings').alignment = { wrapText: true };
      row.height = Math.min(15 * titles.length, 120);
    }

    // ── Stream response ───────────────────────────────────────────────────────
    const filename = `report-${project.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  }

  // ─── JSON Export ────────────────────────────────────────────────────────────

  async exportJson(projectId: string, orgId: string) {
    const project = await this.loadProjectData(projectId, orgId);

    const bySeverity: Record<string, number> = {};
    for (const s of SEVERITY_ORDER) bySeverity[s] = 0;
    for (const f of project.findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;

    return {
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        organization: project.organization.name,
      },
      summary: {
        totalFindings: project.findings.length,
        bySeverity,
      },
      findings: project.findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        cvssScore: f.cvssScore,
        cvssVector: f.cvssVector,
        cveIds: f.cveIds,
        cweIds: f.cweIds,
        owasp: f.owasp,
        matchedAt: f.matchedAt,
        target: f.target.value,
        aiExplanation: f.aiExplanation,
        aiRemediation: f.aiRemediation,
        aiFpScore: f.aiFpScore,
        aiRiskScore: f.aiRiskScore,
        createdAt: f.createdAt,
      })),
    };
  }

  // ─── SARIF 2.1.0 Export (M47) ───────────────────────────────────────────────

  async exportSarif(projectId: string, orgId: string) {
    const project = await this.loadProjectData(projectId, orgId);

    const SEVERITY_LEVEL: Record<string, string> = {
      CRITICAL: 'error',
      HIGH:     'error',
      MEDIUM:   'warning',
      LOW:      'note',
      INFO:     'none',
    };

    const rules = new Map<string, object>();
    for (const f of project.findings) {
      const ruleId = f.templateId ?? f.title.replace(/\s+/g, '-').toLowerCase().slice(0, 64);
      if (!rules.has(ruleId)) {
        rules.set(ruleId, {
          id: ruleId,
          name: f.templateName ?? f.title,
          shortDescription: { text: f.title },
          fullDescription: { text: f.aiExplanation ?? f.title },
          defaultConfiguration: { level: SEVERITY_LEVEL[f.severity] ?? 'warning' },
          properties: {
            tags: ['security', f.owasp ?? 'unclassified'],
            'security-severity': String(f.cvssScore ?? (f.severity === 'CRITICAL' ? 9.8 : f.severity === 'HIGH' ? 7.5 : f.severity === 'MEDIUM' ? 4.3 : 2.0)),
          },
          ...(f.cveIds?.length ? { helpUri: `https://nvd.nist.gov/vuln/detail/${f.cveIds[0]}` } : {}),
        });
      }
    }

    return {
      version: '2.1.0',
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: project.organization.brandCompanyName ?? 'PTaaS',
              version: '4.0.0',
              informationUri: 'https://github.com/ptaas/ptaas-platform',
              rules: Array.from(rules.values()),
            },
          },
          results: project.findings.map((f) => ({
            ruleId: f.templateId ?? f.title.replace(/\s+/g, '-').toLowerCase().slice(0, 64),
            level: SEVERITY_LEVEL[f.severity] ?? 'warning',
            message: { text: f.aiExplanation ?? f.title },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: f.matchedAt ?? f.target.value, uriBaseId: '%SRCROOT%' },
                },
              },
            ],
            properties: {
              severity: f.severity,
              status: f.status,
              cvssScore: f.cvssScore,
              cveIds: f.cveIds,
              cweIds: f.cweIds,
              findingId: f.id,
            },
          })),
          invocations: [
            {
              executionSuccessful: true,
              endTimeUtc: new Date().toISOString(),
            },
          ],
        },
      ],
    };
  }

  // ─── Executive PDF ───────────────────────────────────────────────────────────

  async streamExecutivePdf(projectId: string, orgId: string, res: Response): Promise<void> {
    const project = await this.loadProjectData(projectId, orgId);
    const findings = project.findings;

    const criticals = findings.filter((f) => f.severity === 'CRITICAL');
    const highs = findings.filter((f) => f.severity === 'HIGH');

    const bySeverity: Record<string, number> = {};
    for (const s of SEVERITY_ORDER) bySeverity[s] = 0;
    for (const f of findings) bySeverity[f.severity]++;

    const avgRisk = findings.length > 0
      ? Math.round(findings.reduce((s, f) => s + (f.aiRiskScore ?? 0), 0) / findings.length)
      : 0;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ptaas-executive-${project.name.replace(/\s/g, '-')}.pdf"`,
    );

    const brandColor = project.organization.brandPrimaryColor ?? '#0F172A';
    const brandName  = project.organization.brandCompanyName  ?? 'PTaaS';
    const brandFooter = project.organization.brandFooterText  ?? 'Confidential — PTaaS Security Platform';

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    // ── Cover ──
    doc
      .rect(0, 0, doc.page.width, 200)
      .fill(brandColor)
      .fillColor('#FFFFFF')
      .fontSize(28)
      .font('Helvetica-Bold')
      .text('Security Assessment', 50, 80, { align: 'center' })
      .fontSize(14)
      .font('Helvetica')
      .text('Executive Summary', { align: 'center' })
      .moveDown(0.5)
      .fontSize(11)
      .fillColor('#94A3B8')
      .text(project.organization.name, { align: 'center' })
      .text(`Project: ${project.name}`, { align: 'center' })
      .text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });

    doc.fillColor(brandColor).moveDown(3);

    void brandName; void brandFooter; // used in footer/other report types

    // ── Risk Summary ──
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('Risk Summary', 50)
      .moveDown(0.5);

    const riskLevel = avgRisk >= 75 ? 'CRITICAL' : avgRisk >= 50 ? 'HIGH' : avgRisk >= 25 ? 'MEDIUM' : 'LOW';
    const riskColor = SEVERITY_COLOR[riskLevel] ?? '#6B7280';

    doc
      .fontSize(48)
      .font('Helvetica-Bold')
      .fillColor(riskColor)
      .text(String(avgRisk), 50, doc.y, { continued: true })
      .fontSize(16)
      .fillColor('#64748B')
      .text(` / 100 — ${riskLevel} Risk`, { baseline: 'bottom' })
      .moveDown(1);

    // ── Severity Breakdown ──
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('Findings by Severity')
      .moveDown(0.3);

    const barX = 50;
    const barMaxW = 400;
    const total = Math.max(findings.length, 1);

    for (const sev of SEVERITY_ORDER) {
      const count = bySeverity[sev] ?? 0;
      const color = SEVERITY_COLOR[sev] ?? '#6B7280';
      const barW = Math.max((count / total) * barMaxW, count > 0 ? 4 : 0);

      doc.rect(barX, doc.y, barW, 16).fill(color);
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#0F172A')
        .text(`  ${sev}: ${count}`, barX + barW + 8, doc.y - 12);
      doc.moveDown(0.2);
    }

    doc.moveDown(1);

    // ── Top Critical Findings ──
    if (criticals.length > 0 || highs.length > 0) {
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#0F172A')
        .text('Top Priority Findings')
        .moveDown(0.5);

      const topFindings = [...criticals, ...highs].slice(0, 5);
      for (const f of topFindings) {
        const color = SEVERITY_COLOR[f.severity] ?? '#6B7280';
        doc
          .rect(50, doc.y, 4, 40)
          .fill(color)
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#0F172A')
          .text(f.title, 62, doc.y - 40)
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#64748B')
          .text(
            `${f.severity}${f.cvssScore ? ` · CVSS ${f.cvssScore}` : ''} · ${f.target.value}`,
            62,
          );
        if (f.aiBusinessImpact) {
          doc.fillColor('#374151').text(f.aiBusinessImpact, 62);
        }
        doc.moveDown(0.8);
      }
    }

    // ── Remediation Progress ──
    doc.moveDown(1);
    const allFindings = await this.prisma.finding.findMany({
      where: { projectId, organizationId: orgId },
      select: { status: true, severity: true, createdAt: true },
    });
    const totalAll   = allFindings.length;
    const fixedCount = allFindings.filter((f) => f.status === 'FIXED').length;
    const openCount  = allFindings.filter((f) => !['FIXED','FALSE_POSITIVE','CLOSED'].includes(f.status)).length;
    const fpCount    = allFindings.filter((f) => f.status === 'FALSE_POSITIVE').length;
    const fixedPct   = totalAll > 0 ? Math.round((fixedCount / totalAll) * 100) : 0;

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('Remediation Progress')
      .moveDown(0.4);

    // Progress bar
    const progBarW = 460;
    const progBarH = 18;
    const bx = 50;
    doc.rect(bx, doc.y, progBarW, progBarH).fillAndStroke('#E2E8F0', '#E2E8F0');
    if (fixedCount > 0) {
      doc.rect(bx, doc.y - progBarH, Math.round((fixedCount / totalAll) * progBarW), progBarH).fill('#22C55E');
    }
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#374151')
      .text(`Fixed: ${fixedCount} (${fixedPct}%)   Open: ${openCount}   False Positive: ${fpCount}   Total: ${totalAll}`, 50);

    doc.moveDown(1);

    // ── SLA Status ──
    const slaDaysMap: Record<string, number> = { CRITICAL: 7, HIGH: 30, MEDIUM: 90, LOW: 180, INFO: 365 };
    const now = Date.now();
    let slaBreached = 0; let slaAtRisk = 0; let slaOnTrack = 0;
    for (const f of allFindings) {
      if (['FIXED','FALSE_POSITIVE','CLOSED'].includes(f.status)) { slaOnTrack++; continue; }
      const days     = slaDaysMap[f.severity] ?? 365;
      const deadline = new Date(f.createdAt.getTime() + days * 86400000);
      const rem      = Math.ceil((deadline.getTime() - now) / 86400000);
      if (rem < 0)                         slaBreached++;
      else if (rem / days <= 0.25)         slaAtRisk++;
      else                                 slaOnTrack++;
    }

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('SLA Status')
      .moveDown(0.4);

    const slaItems = [
      { label: 'Breached',  count: slaBreached, color: '#DC2626' },
      { label: 'At Risk',   count: slaAtRisk,   color: '#CA8A04' },
      { label: 'On Track',  count: slaOnTrack,  color: '#16A34A' },
    ];
    for (const { label, count, color } of slaItems) {
      doc.rect(50, doc.y, 12, 12).fill(color);
      doc.fontSize(10).font('Helvetica').fillColor('#374151')
        .text(`  ${label}: ${count}`, 68, doc.y - 10);
      doc.moveDown(0.15);
    }

    // ── Compliance Scorecard ──
    doc.addPage();
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('Compliance Scorecard')
      .moveDown(0.5);

    const complianceFindings = await this.prisma.finding.findMany({
      where: { projectId, organizationId: orgId },
      select: { owasp: true, cweIds: true, status: true },
    });
    const owaspCounts: Record<string, number> = {};
    for (const f of complianceFindings) {
      if (f.owasp) { owaspCounts[f.owasp] = (owaspCounts[f.owasp] ?? 0) + 1; }
    }
    const owaspTop = Object.entries(owaspCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#64748B')
      .text('Top OWASP Categories by Finding Count').moveDown(0.3);

    const owaspMax = owaspTop[0]?.[1] ?? 1;
    for (const [cat, cnt] of owaspTop) {
      const bw = Math.max(Math.round((cnt / owaspMax) * 380), 4);
      doc.rect(50, doc.y, bw, 14).fill('#6366F1');
      doc.fontSize(9).font('Helvetica').fillColor('#0F172A')
        .text(`  ${cat}: ${cnt}`, 50 + bw + 6, doc.y - 10);
      doc.moveDown(0.25);
    }

    // ── Recommendations ──
    doc
      .addPage()
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('Key Recommendations')
      .moveDown(0.5);

    const top3 = findings.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const f = top3[i];
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(SEVERITY_COLOR[f.severity] ?? '#0F172A')
        .text(`${i + 1}. ${f.title}`)
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#374151');
      if (f.aiRemediation) {
        const lines = f.aiRemediation.split('\n').slice(0, 3).join('\n');
        doc.text(lines, { width: 480 });
      }
      doc.moveDown(0.8);
    }

    // ── Engagement sign-off block ──
    const engagement = await this.prisma.engagement.findUnique({
      where: { projectId },
      include: { signedOffBy: { select: { name: true, email: true } } },
    });
    if (engagement) {
      doc.moveDown(2);
      doc.fontSize(9).font('Helvetica').fillColor('#94A3B8')
        .text('─'.repeat(80), 50);
      doc.moveDown(0.3);
      const sigLine = engagement.signedOffBy
        ? `Engagement signed off by ${engagement.signedOffBy.name} (${engagement.signedOffBy.email}) on ${new Date(engagement.signedOffAt!).toLocaleDateString()}`
        : 'Engagement: ' + engagement.title + ' · Status: ' + engagement.status;
      doc.fontSize(9).fillColor('#64748B').text(sigLine, 50);
    }

    doc.end();
  }

  // ─── Technical PDF ───────────────────────────────────────────────────────────

  async streamTechnicalPdf(projectId: string, orgId: string, res: Response): Promise<void> {
    const project = await this.loadProjectData(projectId, orgId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ptaas-technical-${project.name.replace(/\s/g, '-')}.pdf"`,
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    // Cover
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('Technical Security Report', { align: 'center' })
      .fontSize(12)
      .font('Helvetica')
      .fillColor('#64748B')
      .text(`${project.name} · ${project.organization.name}`, { align: 'center' })
      .text(new Date().toLocaleDateString(), { align: 'center' })
      .moveDown(2);

    // Per-finding detail
    for (const f of project.findings) {
      if (doc.y > 680) doc.addPage();

      const color = SEVERITY_COLOR[f.severity] ?? '#6B7280';
      doc
        .rect(50, doc.y, doc.page.width - 100, 1)
        .fill('#E2E8F0')
        .moveDown(0.2)
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor('#0F172A')
        .text(f.title, 50)
        .fontSize(10)
        .font('Helvetica')
        .fillColor(color)
        .text(f.severity, { continued: true })
        .fillColor('#64748B')
        .text(
          `  |  CVSS: ${cvssLabel(f.cvssScore)}  |  ${f.target.value}  |  Status: ${f.status}`,
        );

      if (f.cveIds.length > 0) {
        doc.fillColor('#374151').text(`CVE: ${f.cveIds.join(', ')}`);
      }
      if (f.cweIds.length > 0) {
        doc.text(`CWE: ${f.cweIds.join(', ')}`);
      }
      if (f.owasp) {
        doc.text(`OWASP: ${f.owasp}`);
      }
      if (f.matchedAt) {
        doc.text(`Matched: ${f.matchedAt}`);
      }

      if (f.aiExplanation) {
        doc
          .moveDown(0.3)
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#0F172A')
          .text('Explanation:')
          .font('Helvetica')
          .fillColor('#374151')
          .text(f.aiExplanation, { width: 480 });
      }

      if (f.aiRemediation) {
        doc
          .moveDown(0.3)
          .font('Helvetica-Bold')
          .fillColor('#0F172A')
          .text('Remediation:')
          .font('Helvetica')
          .fillColor('#374151')
          .text(f.aiRemediation, { width: 480 });
      }

      // HTTP evidence snippet (truncated to 300 chars in PDF)
      if (f.httpRequest) {
        doc
          .moveDown(0.3)
          .font('Helvetica-Bold')
          .fillColor('#0F172A')
          .text('HTTP Request (truncated):')
          .font('Courier')
          .fontSize(8)
          .fillColor('#1E293B')
          .text(f.httpRequest.substring(0, 300), { width: 480 });
        doc.font('Helvetica').fontSize(10);
      }

      doc.moveDown(1);
    }

    doc.end();
  }

  // ─── Security Score Card ────────────────────────────────────────────────────

  async generateScorecard(projectId: string, orgId: string, res: Response): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      include: {
        organization: { select: { name: true } },
        findings: {
          orderBy: [{ severity: 'asc' }, { aiRiskScore: 'desc' }],
          select: {
            id: true, title: true, severity: true, status: true,
            owasp: true, aiRiskScore: true, epssScore: true,
            kevListed: true, createdAt: true, dueDate: true,
          },
        },
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { createdAt: true, status: true, _count: { select: { findings: true } } },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const findings = project.findings;
    const open = findings.filter((f) => ['OPEN', 'IN_PROGRESS'].includes(f.status));
    const fixed = findings.filter((f) => ['FIXED', 'VERIFIED'].includes(f.status));
    const fp = findings.filter((f) => f.status === 'FALSE_POSITIVE');

    const sev = (s: string) => findings.filter((f) => f.severity === s && ['OPEN', 'IN_PROGRESS'].includes(f.status)).length;
    const counts = { CRITICAL: sev('CRITICAL'), HIGH: sev('HIGH'), MEDIUM: sev('MEDIUM'), LOW: sev('LOW'), INFO: sev('INFO') };

    const riskScore = open.length === 0 ? 0 : Math.min(
      Math.round(open.reduce((s, f) => s + (f.aiRiskScore ?? 0), 0) / Math.max(open.length, 1)),
      100,
    );
    const riskLevel = riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW';
    const riskColor = SEVERITY_COLOR[riskLevel];

    const now = new Date();
    const slaBreaches = open.filter((f) => {
      if (!f.dueDate) return false;
      return f.dueDate < now;
    }).length;

    // OWASP distribution
    const owaspMap: Record<string, number> = {};
    for (const f of open) {
      if (f.owasp) { const k = f.owasp.split('–')[0]?.trim() ?? f.owasp; owaspMap[k] = (owaspMap[k] ?? 0) + 1; }
    }
    const owaspEntries = Object.entries(owaspMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const owaspMax = Math.max(...owaspEntries.map((e) => e[1]), 1);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="scorecard-${project.name.replace(/\s+/g, '-')}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const W = doc.page.width;
    const INDENT = 50;

    // ── PAGE 1: Cover ──────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 240).fill('#0F172A');

    // Accent bar
    doc.rect(0, 240, W, 6).fill(riskColor);

    doc.fillColor('#FFFFFF')
      .fontSize(10).font('Helvetica').text('SECURITY SCORE CARD', INDENT, 70, { characterSpacing: 3 })
      .fontSize(32).font('Helvetica-Bold').text(project.name, INDENT, 100)
      .fontSize(12).font('Helvetica').fillColor('#94A3B8')
      .text(project.organization.name, INDENT, 148)
      .text(`Generated ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, INDENT, 164);

    // Risk score badge
    const badgeX = W - 160;
    doc.roundedRect(badgeX, 80, 110, 110, 8).fill(riskColor);
    doc.fillColor('#FFFFFF').fontSize(52).font('Helvetica-Bold').text(String(riskScore), badgeX, 92, { width: 110, align: 'center' });
    doc.fontSize(11).font('Helvetica').text('/ 100', badgeX, 148, { width: 110, align: 'center' });
    doc.fontSize(10).text(riskLevel, badgeX, 166, { width: 110, align: 'center' });

    // ── KPIs ──────────────────────────────────────────────────────────────────
    doc.fillColor('#0F172A').moveDown(0);
    const kpiY = 280;

    const kpis = [
      { label: 'Total Findings', value: String(findings.length) },
      { label: 'Open', value: String(open.length), color: open.length > 0 ? '#DC2626' : '#16A34A' },
      { label: 'Fixed / Verified', value: String(fixed.length), color: '#16A34A' },
      { label: 'SLA Breaches', value: String(slaBreaches), color: slaBreaches > 0 ? '#DC2626' : '#16A34A' },
    ];
    const kpiW = (W - INDENT * 2) / kpis.length;
    kpis.forEach(({ label, value, color }, i) => {
      const x = INDENT + i * kpiW;
      doc.rect(x, kpiY, kpiW - 8, 72).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fillColor(color ?? '#0F172A').fontSize(28).font('Helvetica-Bold').text(value, x + 8, kpiY + 10, { width: kpiW - 24, align: 'center' });
      doc.fillColor('#64748B').fontSize(9).font('Helvetica').text(label.toUpperCase(), x + 8, kpiY + 48, { width: kpiW - 24, align: 'center', characterSpacing: 1 });
    });

    // ── Severity bars ──────────────────────────────────────────────────────────
    const sevY = kpiY + 98;
    doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text('Open Findings by Severity', INDENT, sevY);

    const barMaxW = W - INDENT * 2 - 80;
    const maxCount = Math.max(...Object.values(counts), 1);
    SEVERITY_ORDER.forEach((sev, i) => {
      const count = counts[sev as keyof typeof counts] ?? 0;
      const y = sevY + 26 + i * 24;
      const bw = (count / maxCount) * barMaxW;
      doc.rect(INDENT + 60, y, barMaxW, 14).fill('#F1F5F9');
      if (bw > 0) doc.rect(INDENT + 60, y, bw, 14).fill(SEVERITY_COLOR[sev] ?? '#6B7280');
      doc.fillColor('#374151').fontSize(9).font('Helvetica').text(sev, INDENT, y + 2, { width: 55, align: 'right' });
      doc.fillColor('#374151').text(String(count), INDENT + 62 + bw + 4, y + 2);
    });

    // ── Status donut (simplified as segments) ──────────────────────────────────
    const donutY = sevY + 170;
    doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text('Status Distribution', INDENT, donutY);

    const statusGroups = [
      { label: 'Open',         color: '#EF4444', count: findings.filter((f) => f.status === 'OPEN').length },
      { label: 'In Progress',  color: '#F97316', count: findings.filter((f) => f.status === 'IN_PROGRESS').length },
      { label: 'Fixed',        color: '#22C55E', count: findings.filter((f) => f.status === 'FIXED').length },
      { label: 'Verified',     color: '#10B981', count: findings.filter((f) => f.status === 'VERIFIED').length },
      { label: 'False +',      color: '#94A3B8', count: findings.filter((f) => f.status === 'FALSE_POSITIVE').length },
      { label: 'Accepted',     color: '#CBD5E1', count: findings.filter((f) => f.status === 'ACCEPTED_RISK').length },
    ].filter((s) => s.count > 0);

    const totalFindings = Math.max(findings.length, 1);
    let legendX = INDENT;
    statusGroups.forEach(({ label, color, count }) => {
      doc.rect(legendX, donutY + 22, 10, 10).fill(color);
      doc.fillColor('#374151').fontSize(9).font('Helvetica')
        .text(`${label} (${count})`, legendX + 14, donutY + 22);
      legendX += 90;
      if (legendX > W - 100) legendX = INDENT;
    });

    // Horizontal stacked bar
    const stackY = donutY + 50;
    const stackW = W - INDENT * 2;
    let stackX = INDENT;
    statusGroups.forEach(({ color, count }) => {
      const sw = Math.round((count / totalFindings) * stackW);
      if (sw > 0) { doc.rect(stackX, stackY, sw, 20).fill(color); stackX += sw; }
    });
    doc.rect(INDENT, stackY, stackW, 20).stroke('#E2E8F0');

    // ── OWASP ──────────────────────────────────────────────────────────────────
    doc.addPage();
    doc.fillColor('#0F172A').fontSize(18).font('Helvetica-Bold').text('OWASP Top 10 Distribution', INDENT, 50);

    owaspEntries.forEach(([cat, count], i) => {
      const y = 90 + i * 30;
      const bw = (count / owaspMax) * (W - INDENT * 2 - 100);
      doc.rect(INDENT + 80, y, W - INDENT * 2 - 80, 18).fill('#F1F5F9');
      if (bw > 0) doc.rect(INDENT + 80, y, bw, 18).fill('#6366F1');
      doc.fillColor('#374151').fontSize(9).font('Helvetica').text(cat, INDENT, y + 4, { width: 75, align: 'right' });
      doc.fillColor('#374151').text(String(count), INDENT + 84 + bw, y + 4);
    });
    if (owaspEntries.length === 0) {
      doc.fillColor('#94A3B8').fontSize(11).text('No OWASP-tagged findings found.', INDENT, 90);
    }

    // ── Top 10 Findings ────────────────────────────────────────────────────────
    const tableY = 90 + owaspEntries.length * 30 + 40;
    doc.fillColor('#0F172A').fontSize(18).font('Helvetica-Bold').text('Top 10 Open Findings', INDENT, tableY);

    const top10 = open.sort((a, b) => (b.aiRiskScore ?? 0) - (a.aiRiskScore ?? 0)).slice(0, 10);
    const colW = [(W - INDENT * 2) * 0.45, 70, 90, 50, 50, 30];
    const headers = ['Title', 'Severity', 'Status', 'Risk', 'EPSS', 'KEV'];
    let ty = tableY + 30;

    // Header row
    doc.rect(INDENT, ty, W - INDENT * 2, 18).fill('#0F172A');
    let tx = INDENT + 4;
    headers.forEach((h, i) => {
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(h, tx, ty + 4, { width: colW[i], lineBreak: false });
      tx += colW[i];
    });
    ty += 18;

    top10.forEach((f, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(INDENT, ty, W - INDENT * 2, 16).fill(bg);
      tx = INDENT + 4;
      const row = [
        f.title.slice(0, 55) + (f.title.length > 55 ? '…' : ''),
        f.severity,
        f.status.replace('_', ' '),
        f.aiRiskScore != null ? String(Math.round(f.aiRiskScore)) : '—',
        f.epssScore != null ? f.epssScore.toFixed(2) : '—',
        f.kevListed ? '✓' : '',
      ];
      row.forEach((cell, i) => {
        const color = i === 1 ? (SEVERITY_COLOR[f.severity] ?? '#374151') : '#374151';
        doc.fillColor(color).fontSize(8).font(i === 1 ? 'Helvetica-Bold' : 'Helvetica')
          .text(cell, tx, ty + 3, { width: colW[i], lineBreak: false });
        tx += colW[i];
      });
      ty += 16;
    });

    // ── Trend ──────────────────────────────────────────────────────────────────
    if (project.scans.length > 1) {
      doc.addPage();
      doc.fillColor('#0F172A').fontSize(18).font('Helvetica-Bold').text('Scan History (last 8 scans)', INDENT, 50);
      const scans = [...project.scans].reverse();
      const trendMaxFindings = Math.max(...scans.map((s) => s._count.findings), 1);
      const trendW = W - INDENT * 2;
      const trendH = 120;
      const trendBaseY = 200;
      const stepX = trendW / Math.max(scans.length - 1, 1);

      // Axes
      doc.moveTo(INDENT, trendBaseY - trendH).lineTo(INDENT, trendBaseY).lineTo(INDENT + trendW, trendBaseY).stroke('#CBD5E1');

      // Line
      const pts = scans.map((s, i) => ({
        x: INDENT + i * stepX,
        y: trendBaseY - (s._count.findings / trendMaxFindings) * trendH,
      }));
      doc.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => doc.lineTo(p.x, p.y));
      doc.strokeColor('#6366F1').lineWidth(2).stroke();

      pts.forEach((p, i) => {
        doc.circle(p.x, p.y, 3).fill('#6366F1');
        doc.fillColor('#374151').fontSize(8).font('Helvetica')
          .text(String(scans[i]._count.findings), p.x - 8, p.y - 16);
      });
    }

    doc.end();
  }

  // ─── Compliance PDF ──────────────────────────────────────────────────────────

  async generateCompliancePdf(
    projectId: string,
    orgId: string,
    framework: 'ISO27001' | 'OWASP' | 'SOC2',
    res: Response,
  ): Promise<void> {
    const project = await this.loadProjectData(projectId, orgId);
    const findings = project.findings as Array<{
      id: string; title: string; severity: string; status: string;
      owasp: string | null; cvssScore: number | null;
    }>;

    const controls = FRAMEWORK_CONTROLS[framework];
    const controlResults = controls.map((ctrl) => {
      const mapped = findings.filter((f) => ctrl.owaspCategories.some((cat) => f.owasp?.includes(cat)) || ctrl.severities.includes(f.severity));
      const open = mapped.filter((f) => ['OPEN', 'IN_PROGRESS'].includes(f.status));
      const status: 'PASS' | 'FAIL' | 'PARTIAL' = open.length === 0 ? 'PASS' : open.length < mapped.length ? 'PARTIAL' : 'FAIL';
      return { ...ctrl, findings: mapped, openCount: open.length, status };
    });

    const passing = controlResults.filter((c) => c.status === 'PASS').length;
    const coverage = Math.round((passing / controls.length) * 100);

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-${framework}-${project.name.replace(/\s+/g, '-')}.pdf"`);
    doc.pipe(res);

    const W = 595 - 100; // usable width
    const DARK = '#0F172A'; const MUTED = '#64748B'; const BORDER = '#E2E8F0';
    const PASS_COLOR = '#16A34A'; const FAIL_COLOR = '#DC2626'; const PARTIAL_COLOR = '#CA8A04';
    const ACCENT = '#6366F1';

    // ── Page 1: Cover ──────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 200).fill(DARK);

    // Framework badge
    const badgeX = 50;
    doc.roundedRect(badgeX, 40, 90, 24, 4).fill(ACCENT);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
      .text(framework, badgeX + 6, 48, { width: 78, align: 'center' });

    doc.fillColor('#FFFFFF').fontSize(28).font('Helvetica-Bold').text('Compliance Report', 50, 80);
    doc.fontSize(14).font('Helvetica').fillColor('#94A3B8').text(project.name, 50, 116);
    doc.fontSize(10).fillColor('#64748B').text(`${project.organization.name} · Generated ${new Date().toLocaleDateString('de-DE')}`, 50, 140);
    doc.fillColor('#334155').fontSize(8).text('CONFIDENTIAL', 50, 170, { characterSpacing: 3 });

    // Coverage summary box
    doc.rect(50, 220, W, 100).fill('#F8FAFC').stroke(BORDER);
    const cx = 50 + W / 2;
    doc.fillColor(coverage >= 80 ? PASS_COLOR : coverage >= 50 ? PARTIAL_COLOR : FAIL_COLOR)
      .fontSize(48).font('Helvetica-Bold').text(`${coverage}%`, cx - 60, 235, { width: 120, align: 'center' });
    doc.fillColor(MUTED).fontSize(10).font('Helvetica').text('Control Coverage', cx - 60, 288, { width: 120, align: 'center' });

    // Stats row
    const stats = [
      { label: 'Total Controls', value: String(controls.length) },
      { label: 'Passing', value: String(passing), color: PASS_COLOR },
      { label: 'Partial', value: String(controlResults.filter((c) => c.status === 'PARTIAL').length), color: PARTIAL_COLOR },
      { label: 'Failing', value: String(controlResults.filter((c) => c.status === 'FAIL').length), color: FAIL_COLOR },
      { label: 'Open Findings', value: String(findings.filter((f) => f.status === 'OPEN').length) },
    ];
    const colW = W / stats.length;
    stats.forEach((s, i) => {
      const sx = 50 + i * colW;
      doc.fillColor(s.color ?? DARK).fontSize(20).font('Helvetica-Bold').text(s.value, sx, 345, { width: colW, align: 'center' });
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(s.label, sx, 370, { width: colW, align: 'center' });
    });

    // Disclaimer
    doc.fillColor(MUTED).fontSize(8).text(
      `This report maps security findings to ${framework} controls. Compliance status is derived from open findings per control area and does not constitute a formal audit opinion.`,
      50, 430, { width: W }
    );

    // ── Page 2+: Control Mapping ───────────────────────────────────────────────
    doc.addPage();
    let y = 50;

    const header = (txt: string) => {
      doc.rect(50, y, W, 22).fill(DARK);
      doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold').text(txt, 56, y + 6);
      y += 30;
    };

    const statusBadge = (status: string, bx: number, by: number) => {
      const c = status === 'PASS' ? PASS_COLOR : status === 'FAIL' ? FAIL_COLOR : PARTIAL_COLOR;
      doc.roundedRect(bx, by, 46, 14, 3).fill(c);
      doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold').text(status, bx + 2, by + 4, { width: 42, align: 'center' });
    };

    header(`${framework} Control Mapping — ${project.name}`);

    // Column headers
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold');
    doc.text('Control ID', 50, y);
    doc.text('Description', 110, y);
    doc.text('Findings', 380, y);
    doc.text('Status', 440, y);
    y += 14;
    doc.moveTo(50, y).lineTo(50 + W, y).strokeColor(BORDER).stroke();
    y += 6;

    for (const ctrl of controlResults) {
      // Page break check
      if (y > 750) { doc.addPage(); y = 50; header(`${framework} Control Mapping (continued)`); y += 10; }

      const rowH = Math.max(36, ctrl.findings.slice(0, 2).length * 14 + 18);
      doc.rect(50, y, W, rowH).fill(ctrl.status === 'PASS' ? '#F0FDF4' : ctrl.status === 'FAIL' ? '#FEF2F2' : '#FFFBEB').stroke(BORDER);

      doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold').text(ctrl.id, 54, y + 6, { width: 50 });
      doc.font('Helvetica').text(ctrl.name, 110, y + 6, { width: 262 });

      // List up to 2 finding titles
      ctrl.findings.slice(0, 2).forEach((f, fi) => {
        doc.fillColor(MUTED).fontSize(7).text(`· ${f.title.slice(0, 55)}${f.title.length > 55 ? '…' : ''}`, 110, y + 20 + fi * 12, { width: 262 });
      });
      if (ctrl.findings.length > 2) {
        doc.fillColor(MUTED).fontSize(7).text(`+${ctrl.findings.length - 2} more`, 110, y + 20 + 2 * 12, { width: 262 });
      }

      doc.fillColor(DARK).fontSize(8).font('Helvetica').text(String(ctrl.findings.length), 395, y + 6, { width: 40, align: 'center' });
      statusBadge(ctrl.status, 440, y + 6);

      y += rowH + 4;
    }

    doc.end();
  }

  // ─── Custom / Report-Builder PDF ─────────────────────────────────────────────

  async streamCustomPdf(
    projectId: string,
    orgId: string,
    dto: {
      title?: string;
      classification?: string;
      executiveSummary?: string;
      findingIds?: string[];
      sections: string[];
    },
    res: Response,
  ): Promise<void> {
    const project = await this.loadProjectData(projectId, orgId);
    const allFindings = project.findings as Array<{
      id: string; title: string; severity: string; status: string;
      description: string | null; aiRemediation: string | null;
      cvssScore: number | null; cvssVector: string | null;
      cveIds: string[]; owasp: string | null; cweIds: string[];
      aiRiskScore: number | null; matchedAt: string | null;
      target: { value: string; type: string };
    }>;

    const findings = dto.findingIds?.length
      ? allFindings.filter((f) => dto.findingIds!.includes(f.id))
      : allFindings;

    const reportTitle = dto.title ?? 'Penetration Test Report';
    const classification = dto.classification ?? 'CONFIDENTIAL';

    const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;

    const safeProjectName = project.name.replace(/[^a-zA-Z0-9-]/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ptaas-custom-${safeProjectName}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    const W = doc.page.width;
    const DARK = '#0F172A';
    const ACCENT = '#6366F1';

    const section = (title: string) => {
      doc.addPage();
      doc.rect(0, 0, W, 60).fill(DARK);
      doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
        .text(title, 50, 20, { align: 'left' });
      doc.fillColor(DARK).font('Helvetica').fontSize(11).moveDown(2);
    };

    const orderedSections = dto.sections.length > 0 ? dto.sections : ['cover', 'executive_summary', 'methodology', 'risk_matrix', 'findings', 'remediation'];

    for (const sec of orderedSections) {
      switch (sec) {
        case 'cover': {
          // Cover page (first — no addPage needed for first section)
          doc.rect(0, 0, W, 240).fill(DARK);
          doc.fillColor('#FFFFFF').fontSize(30).font('Helvetica-Bold')
            .text(reportTitle, 50, 80, { align: 'center' });
          doc.fontSize(12).font('Helvetica').fillColor('#94A3B8')
            .text(project.organization.name, { align: 'center' })
            .text(`Project: ${project.name}`, { align: 'center' })
            .text(`Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, { align: 'center' });
          doc.rect(0, 250, W, 30).fill(ACCENT);
          doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
            .text(classification, 0, 258, { align: 'center', width: W });
          doc.fillColor(DARK).moveDown(5);
          doc.fontSize(11).font('Helvetica').fillColor('#374151')
            .text(`This report was generated by the PTaaS platform. It contains ${findings.length} finding(s) selected by the security team.`, 50, 330, { width: W - 100 });
          break;
        }

        case 'executive_summary': {
          section('Executive Summary');
          const summaryText = dto.executiveSummary?.trim()
            || `This penetration test was conducted on ${project.name} by ${project.organization.name}. The assessment identified ${findings.length} security issue(s) across the selected scope.`;
          doc.fontSize(11).font('Helvetica').fillColor('#374151')
            .text(summaryText, { lineGap: 4, paragraphGap: 6 });
          doc.moveDown();
          // Severity summary box
          const rows: [string, number][] = SEVERITY_ORDER
            .filter((s) => bySeverity[s] > 0)
            .map((s) => [s, bySeverity[s]]);
          if (rows.length > 0) {
            doc.fontSize(13).font('Helvetica-Bold').fillColor(DARK).text('Finding Summary').moveDown(0.5);
            for (const [sev, cnt] of rows) {
              const color = SEVERITY_COLOR[sev] ?? '#6B7280';
              doc.rect(50, doc.y, 10, 10).fill(color);
              doc.fillColor(DARK).fontSize(11).font('Helvetica')
                .text(`  ${sev}: ${cnt}`, 65, doc.y - 10);
              doc.moveDown(0.5);
            }
          }
          break;
        }

        case 'methodology': {
          section('Testing Methodology');
          const methods = [
            ['Reconnaissance', 'Passive and active information gathering, DNS enumeration, service fingerprinting.'],
            ['Vulnerability Assessment', 'Automated and manual scanning using industry-standard toolchains (Nuclei, OWASP ZAP).'],
            ['Exploitation & Verification', 'Confirmed vulnerabilities are manually verified to eliminate false positives.'],
            ['Reporting', 'Findings documented with severity (CVSS), business impact, and concrete remediation steps.'],
          ];
          for (const [name, desc] of methods) {
            doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text(name).moveDown(0.2);
            doc.fontSize(11).font('Helvetica').fillColor('#374151').text(desc, { lineGap: 3 }).moveDown(0.8);
          }
          break;
        }

        case 'risk_matrix': {
          section('Risk Matrix');
          doc.fontSize(11).font('Helvetica').fillColor('#374151')
            .text('Severity distribution of selected findings:', { lineGap: 3 }).moveDown(0.5);
          const maxCount = Math.max(1, ...SEVERITY_ORDER.map((s) => bySeverity[s] ?? 0));
          const barAreaW = W - 160;
          for (const sev of SEVERITY_ORDER) {
            const cnt = bySeverity[sev] ?? 0;
            const barW = Math.round((cnt / maxCount) * barAreaW);
            const color = SEVERITY_COLOR[sev] ?? '#6B7280';
            const y = doc.y;
            doc.fontSize(10).font('Helvetica').fillColor(DARK).text(sev.padEnd(10), 50, y + 2);
            if (barW > 0) doc.rect(130, y, barW, 14).fill(color);
            doc.fillColor(DARK).text(String(cnt), 135 + barAreaW + 5, y + 2);
            doc.y = y + 20;
          }
          break;
        }

        case 'findings': {
          section('Findings');
          if (findings.length === 0) {
            doc.fontSize(11).font('Helvetica').fillColor('#6B7280').text('No findings selected.');
            break;
          }
          for (const f of findings) {
            if (doc.y > doc.page.height - 150) doc.addPage();
            const color = SEVERITY_COLOR[f.severity] ?? '#6B7280';
            doc.rect(50, doc.y, 4, 20).fill(color);
            doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK)
              .text(f.title, 60, doc.y - 20);
            doc.fontSize(9).font('Helvetica').fillColor('#6B7280')
              .text(`${f.severity}  ·  CVSS: ${f.cvssScore?.toFixed(1) ?? 'N/A'}  ·  ${f.owasp ?? ''}  ·  Target: ${f.target.value}`);
            if (f.description) {
              doc.moveDown(0.3).fontSize(10).fillColor('#374151')
                .text(f.description.slice(0, 500), { lineGap: 2 });
            }
            if (f.aiRemediation) {
              doc.moveDown(0.3).fontSize(10).font('Helvetica-Bold').fillColor(DARK)
                .text('Recommendation: ', { continued: true })
                .font('Helvetica').fillColor('#374151')
                .text(f.aiRemediation.slice(0, 400), { lineGap: 2 });
            }
            doc.moveDown(1).moveTo(50, doc.y).lineTo(W - 50, doc.y).strokeColor('#E5E7EB').stroke();
            doc.moveDown(0.5);
          }
          break;
        }

        case 'remediation': {
          section('Remediation Roadmap');
          doc.fontSize(11).font('Helvetica').fillColor('#374151')
            .text('Prioritise remediation in the following order based on CVSS severity and exploitability:', { lineGap: 3 }).moveDown(0.5);
          const priorities = [
            { label: 'Immediate (0–7 days)',  sevs: ['CRITICAL'] },
            { label: 'Short-term (7–30 days)',  sevs: ['HIGH'] },
            { label: 'Medium-term (30–90 days)', sevs: ['MEDIUM'] },
            { label: 'Long-term (90+ days)',  sevs: ['LOW', 'INFO'] },
          ];
          for (const { label, sevs } of priorities) {
            const bucket = findings.filter((f) => sevs.includes(f.severity));
            if (bucket.length === 0) continue;
            doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK).text(`${label} — ${bucket.length} finding(s)`).moveDown(0.3);
            for (const f of bucket.slice(0, 10)) {
              doc.fontSize(10).font('Helvetica').fillColor('#374151').text(`• ${f.title}`, { lineGap: 2 });
            }
            if (bucket.length > 10) {
              doc.fontSize(9).fillColor('#9CA3AF').text(`  … and ${bucket.length - 10} more`);
            }
            doc.moveDown(0.5);
          }
          break;
        }
      }
    }

    doc.end();
  }

  // ─── SLA Compliance Report PDF ───────────────────────────────────────────────

  async streamSlaPdf(projectId: string, orgId: string, res: Response): Promise<void> {
    const [project, slaModule] = await Promise.all([
      this.prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        include: {
          organization: { select: { name: true } },
          findings: {
            where: { status: { notIn: ['FALSE_POSITIVE', 'CLOSED'] } },
            select: {
              id: true, title: true, severity: true, status: true,
              createdAt: true, dueDate: true, cvssScore: true,
              target: { select: { value: true } },
            },
            orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
      this.prisma.slaPolicy.findUnique({ where: { organizationId: orgId } }),
    ]);
    if (!project) throw new NotFoundException('Project not found');

    const policy = slaModule ?? { criticalDays: 7, highDays: 30, mediumDays: 90, lowDays: 180, infoDays: 365 };
    const slaDays: Record<string, number> = {
      CRITICAL: policy.criticalDays,
      HIGH:     policy.highDays,
      MEDIUM:   policy.mediumDays,
      LOW:      policy.lowDays,
      INFO:     policy.infoDays,
    };

    const now = Date.now();
    const enriched = project.findings.map((f) => {
      const days = slaDays[f.severity] ?? 365;
      const deadline = new Date(f.createdAt.getTime() + days * 86400000);
      const remaining = Math.ceil((deadline.getTime() - now) / 86400000);
      const fixed = ['FIXED', 'VERIFIED', 'ACCEPTED_RISK'].includes(f.status);
      const status = fixed ? 'ON_TRACK' : remaining < 0 ? 'BREACHED' : remaining / days <= 0.25 ? 'AT_RISK' : 'ON_TRACK';
      return { ...f, deadline, remaining, slaStatus: status };
    });

    const breached = enriched.filter((f) => f.slaStatus === 'BREACHED');
    const atRisk   = enriched.filter((f) => f.slaStatus === 'AT_RISK');
    const onTrack  = enriched.filter((f) => f.slaStatus === 'ON_TRACK');
    const compliancePct = enriched.length > 0
      ? Math.round(((onTrack.length) / enriched.length) * 100)
      : 100;

    const filename = `sla-report-${project.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'SLA Compliance Report', Author: 'PTaaS Platform' } });
    doc.pipe(res);

    const W = 495;
    const col = { r: '#DC2626', o: '#F59E0B', g: '#16A34A', b: '#2563EB', gray: '#6B7280' };

    // Cover
    doc.rect(0, 0, 595, 180).fill('#0F172A');
    doc.fontSize(22).fillColor('#FFFFFF').text('SLA Compliance Report', 50, 60);
    doc.fontSize(12).fillColor('#94A3B8').text(project.name, 50, 92);
    doc.text(`${project.organization.name}  ·  Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`, 50, 112);
    doc.moveDown(4);

    // KPI row
    const kpis = [
      { label: 'Total Findings', value: String(enriched.length), color: col.b },
      { label: 'Compliant', value: `${compliancePct}%`, color: col.g },
      { label: 'SLA Breached', value: String(breached.length), color: breached.length > 0 ? col.r : col.g },
      { label: 'At Risk', value: String(atRisk.length), color: atRisk.length > 0 ? col.o : col.g },
    ];
    const kpiW = W / kpis.length;
    const kpiY = doc.y + 10;
    kpis.forEach((k, i) => {
      const x = 50 + i * kpiW;
      doc.rect(x, kpiY, kpiW - 8, 60).fill('#F8FAFC').stroke('#E2E8F0');
      doc.fontSize(20).fillColor(k.color).text(k.value, x + 8, kpiY + 8, { width: kpiW - 16, align: 'center' });
      doc.fontSize(8).fillColor(col.gray).text(k.label, x + 8, kpiY + 36, { width: kpiW - 16, align: 'center' });
    });
    doc.moveDown(5);

    // SLA Policy table
    doc.fontSize(12).fillColor('#1E293B').text('SLA Policy', { underline: true });
    doc.moveDown(0.4);
    ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].forEach((sev) => {
      doc.fontSize(9).fillColor(SEVERITY_COLOR[sev] ?? col.gray)
        .text(`${sev}`, 50, doc.y, { continued: true, width: 100 });
      doc.fillColor('#1E293B').text(`${slaDays[sev]} days remediation target`);
    });
    doc.moveDown(1);

    // Breach table
    if (breached.length > 0) {
      doc.addPage();
      doc.fontSize(14).fillColor('#DC2626').text(`SLA Breaches (${breached.length})`, { underline: true });
      doc.moveDown(0.5);
      const headers = ['Finding', 'Severity', 'Target', 'Deadline', 'Overdue'];
      const colWidths = [180, 70, 100, 80, 65];
      let x = 50;
      doc.rect(50, doc.y, W, 18).fill('#FEF2F2');
      headers.forEach((h, i) => {
        doc.fontSize(8).fillColor('#991B1B').text(h, x + 4, doc.y - 14, { width: colWidths[i] });
        x += colWidths[i];
      });
      doc.moveDown(0.2);
      breached.forEach((f) => {
        if (doc.y > 750) { doc.addPage(); }
        x = 50;
        const row = [
          f.title.substring(0, 35) + (f.title.length > 35 ? '…' : ''),
          f.severity,
          f.target?.value?.substring(0, 20) ?? '—',
          f.deadline.toLocaleDateString('en-GB'),
          `${Math.abs(f.remaining)}d overdue`,
        ];
        row.forEach((cell, i) => {
          doc.fontSize(8).fillColor(i === 1 ? (SEVERITY_COLOR[f.severity] ?? col.gray) : '#1E293B')
            .text(cell, x + 4, doc.y, { width: colWidths[i] - 4 });
          x += colWidths[i];
        });
        doc.moveDown(0.5);
      });
    }

    // At-risk section
    if (atRisk.length > 0) {
      doc.addPage();
      doc.fontSize(14).fillColor('#F59E0B').text(`At Risk — Approaching Deadline (${atRisk.length})`, { underline: true });
      doc.moveDown(0.5);
      atRisk.forEach((f) => {
        if (doc.y > 750) doc.addPage();
        doc.fontSize(9).fillColor(SEVERITY_COLOR[f.severity] ?? col.gray).text(`[${f.severity}]`, 50, doc.y, { continued: true, width: 70 });
        doc.fillColor('#1E293B').text(`${f.title.substring(0, 55)} — ${f.remaining}d remaining`, { width: 400 });
      });
    }

    // Footer
    doc.fontSize(7).fillColor(col.gray)
      .text(`PTaaS Platform · Confidential · Generated ${new Date().toISOString()}`, 50, 820, { align: 'center', width: W });

    doc.end();
  }
}

// ─── Framework Control Definitions ──────────────────────────────────────────────

interface Control { id: string; name: string; owaspCategories: string[]; severities: string[] }

const FRAMEWORK_CONTROLS: Record<string, Control[]> = {
  ISO27001: [
    { id: 'A.5.1', name: 'Policies for information security', owaspCategories: [], severities: ['CRITICAL'] },
    { id: 'A.6.1', name: 'Internal organisation', owaspCategories: [], severities: [] },
    { id: 'A.8.1', name: 'Responsibility for assets', owaspCategories: ['A05'], severities: [] },
    { id: 'A.9.1', name: 'Business requirements of access control', owaspCategories: ['A01', 'A07'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A.9.4', name: 'System and application access control', owaspCategories: ['A01', 'A04'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A.10.1', name: 'Cryptographic controls', owaspCategories: ['A02'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A.12.1', name: 'Operational procedures and responsibilities', owaspCategories: ['A05', 'A06'], severities: [] },
    { id: 'A.12.6', name: 'Management of technical vulnerabilities', owaspCategories: ['A06', 'A09'], severities: ['CRITICAL', 'HIGH', 'MEDIUM'] },
    { id: 'A.13.1', name: 'Network security management', owaspCategories: ['A10'], severities: ['HIGH'] },
    { id: 'A.14.2', name: 'Security in development & support', owaspCategories: ['A03', 'A08'], severities: ['CRITICAL', 'HIGH', 'MEDIUM'] },
    { id: 'A.16.1', name: 'Management of information security incidents', owaspCategories: [], severities: ['CRITICAL'] },
    { id: 'A.18.1', name: 'Compliance with legal and contractual requirements', owaspCategories: ['A02', 'A05'], severities: [] },
  ],
  OWASP: [
    { id: 'A01:2021', name: 'Broken Access Control', owaspCategories: ['A01'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A02:2021', name: 'Cryptographic Failures', owaspCategories: ['A02'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A03:2021', name: 'Injection', owaspCategories: ['A03'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A04:2021', name: 'Insecure Design', owaspCategories: ['A04'], severities: ['HIGH', 'MEDIUM'] },
    { id: 'A05:2021', name: 'Security Misconfiguration', owaspCategories: ['A05'], severities: ['HIGH', 'MEDIUM'] },
    { id: 'A06:2021', name: 'Vulnerable & Outdated Components', owaspCategories: ['A06'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A07:2021', name: 'Identification and Authentication Failures', owaspCategories: ['A07'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A08:2021', name: 'Software and Data Integrity Failures', owaspCategories: ['A08'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'A09:2021', name: 'Security Logging & Monitoring Failures', owaspCategories: ['A09'], severities: ['MEDIUM', 'LOW'] },
    { id: 'A10:2021', name: 'Server-Side Request Forgery (SSRF)', owaspCategories: ['A10'], severities: ['CRITICAL', 'HIGH'] },
  ],
  SOC2: [
    { id: 'CC1.1', name: 'Control Environment — Integrity & ethical values', owaspCategories: [], severities: ['CRITICAL'] },
    { id: 'CC2.1', name: 'Communication of information security policies', owaspCategories: [], severities: [] },
    { id: 'CC3.1', name: 'Risk assessment process', owaspCategories: [], severities: ['CRITICAL', 'HIGH'] },
    { id: 'CC5.1', name: 'Control activities to mitigate risks', owaspCategories: ['A01', 'A03', 'A07'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'CC6.1', name: 'Logical access security measures', owaspCategories: ['A01', 'A07'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'CC6.6', name: 'External threat mitigation', owaspCategories: ['A03', 'A10'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'CC6.7', name: 'Transmission of data', owaspCategories: ['A02'], severities: ['CRITICAL', 'HIGH'] },
    { id: 'CC7.1', name: 'Vulnerability detection & monitoring', owaspCategories: ['A06', 'A09'], severities: ['HIGH', 'MEDIUM'] },
    { id: 'CC7.2', name: 'Monitoring for anomalies', owaspCategories: ['A09'], severities: ['MEDIUM'] },
    { id: 'CC8.1', name: 'Change management process', owaspCategories: ['A05', 'A08'], severities: ['HIGH', 'MEDIUM'] },
    { id: 'CC9.2', name: 'Risk mitigation — vendor & business partner management', owaspCategories: ['A06'], severities: ['HIGH'] },
    { id: 'A1.1', name: 'Availability — capacity planning', owaspCategories: [], severities: [] },
  ],
};
