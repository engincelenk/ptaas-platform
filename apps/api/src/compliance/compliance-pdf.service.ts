import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ComplianceReport } from './compliance.service';

const STATUS_COLORS: Record<string, string> = {
  COMPLIANT: '#16a34a',
  WARNING: '#d97706',
  CRITICAL: '#dc2626',
  UNCHECKED: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  COMPLIANT: 'COMPLIANT',
  WARNING: 'WARNING (HIGH)',
  CRITICAL: 'CRITICAL',
  UNCHECKED: 'NOT TESTED',
};

@Injectable()
export class CompliancePdfService {
  async generateReport(report: ComplianceReport, projectName: string, orgName: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this._buildPdf(doc, report, projectName, orgName);
      doc.end();
    });
  }

  private _buildPdf(
    doc: PDFKit.PDFDocument,
    report: ComplianceReport,
    projectName: string,
    orgName: string,
  ) {
    const W = doc.page.width - 100;

    // ── Header ──────────────────────────────────────────────────────────────
    doc.rect(50, 50, W, 80).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
      .text('OWASP Top 10 Compliance Report', 70, 70);
    doc.fontSize(11).font('Helvetica')
      .text(`${orgName} · ${projectName}`, 70, 100);
    doc.moveDown(4);

    // ── Score summary ────────────────────────────────────────────────────────
    const scoreColor = report.score >= 80 ? '#16a34a' : report.score >= 50 ? '#d97706' : '#dc2626';
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold')
      .text('Compliance Score', 50, 155);
    doc.fillColor(scoreColor).fontSize(40).font('Helvetica-Bold')
      .text(`${report.score}%`, 50, 175);
    doc.fillColor('#6b7280').fontSize(10).font('Helvetica')
      .text(`Generated ${report.generatedAt.toUTCString()}`, 50, 225);
    doc.moveDown(2);

    // Legend
    const legend = [
      { status: 'COMPLIANT', label: 'Compliant — only low/info findings or no findings' },
      { status: 'WARNING', label: 'Warning — open HIGH severity findings' },
      { status: 'CRITICAL', label: 'Critical — open CRITICAL severity findings' },
      { status: 'UNCHECKED', label: 'Not Tested — no findings mapped to this category' },
    ];
    doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('Legend', 50);
    doc.moveDown(0.3);
    for (const l of legend) {
      const color = STATUS_COLORS[l.status];
      doc.rect(50, doc.y + 2, 10, 10).fill(color);
      doc.fillColor('#334155').fontSize(9).font('Helvetica')
        .text(`  ${l.label}`, 65, doc.y);
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(1);

    // ── OWASP Categories table ────────────────────────────────────────────────
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text('OWASP Top 10 2021 Status');
    doc.moveDown(0.8);

    for (const cat of report.categories) {
      const startY = doc.y;

      // Status badge
      const statusColor = STATUS_COLORS[cat.status];
      const badgeW = 80;
      doc.rect(50 + W - badgeW, startY, badgeW, 18).fill(statusColor);
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text(STATUS_LABELS[cat.status], 50 + W - badgeW, startY + 5, { width: badgeW, align: 'center' });

      // Category ID + Name
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
        .text(`${cat.category.id} — ${cat.category.name}`, 50, startY, { width: W - badgeW - 10 });
      doc.fillColor('#64748b').fontSize(9).font('Helvetica')
        .text(cat.category.description, 50, undefined, { width: W - badgeW - 10 });

      if (cat.openCount > 0) {
        doc.fillColor('#dc2626').fontSize(9).font('Helvetica')
          .text(`Open findings: ${cat.openCount}  (Critical: ${cat.criticalCount})`, 50);
      }

      // ISO 27001 controls
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
        .text(`ISO 27001 Controls: ${cat.category.iso27001Controls.join(', ')}`, 50);

      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor('#f1f5f9').stroke();
      doc.moveDown(0.5);

      // Page break guard
      if (doc.y > doc.page.height - 120) doc.addPage();
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    doc.addPage();
    doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('Recommendations');
    doc.moveDown(0.8);

    const failing = report.categories.filter(
      (c) => c.status === 'CRITICAL' || c.status === 'WARNING',
    );

    if (failing.length === 0) {
      doc.fillColor('#16a34a').fontSize(11).font('Helvetica')
        .text('No critical or high-severity issues found. Continue periodic scanning to maintain compliance.');
    } else {
      for (const c of failing) {
        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
          .text(`${c.category.id}: ${c.category.name}`);
        doc.fillColor('#475569').fontSize(10).font('Helvetica')
          .text(`→ Remediate ${c.openCount} open finding${c.openCount > 1 ? 's' : ''}. `
            + `Relevant ISO 27001 controls: ${c.category.iso27001Controls.join(', ')}.`);
        doc.moveDown(0.8);
      }
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageCount = (doc as any)._pageBuffer?.length ?? 1;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
        .text(
          `PTaaS Platform · Confidential · Page ${i + 1}`,
          50,
          doc.page.height - 40,
          { width: W, align: 'center' },
        );
    }
  }
}
