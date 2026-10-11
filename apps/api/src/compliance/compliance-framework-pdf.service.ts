import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import type { Framework } from './compliance.constants';
import type { ComplianceService } from './compliance.service';

const FW_LABEL: Record<Framework, string> = {
  'pci-dss':  'PCI-DSS v4.0',
  'iso27001': 'ISO/IEC 27001:2022',
  'soc2':     'SOC 2 Trust Services Criteria',
  'gdpr':     'GDPR',
  'nis2':     'NIS2 Directive',
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#ca8a04', LOW: '#2563eb', INFO: '#6b7280',
};

export class ComplianceFrameworkPdfService {
  async generate(
    projectId: string,
    orgId: string,
    framework: Framework,
    projectName: string,
    service: ComplianceService,
    out: Writable,
  ) {
    const data = await service.getFrameworkDetail(projectId, orgId, framework);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(out);

    // Header
    doc.fontSize(20).fillColor('#1e293b').text(`Compliance Report`, { align: 'center' });
    doc.fontSize(14).fillColor('#475569').text(FW_LABEL[framework], { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#94a3b8').text(`Project: ${projectName}  ·  ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, { align: 'center' });
    doc.moveDown(1);

    // Summary
    const boxY = doc.y;
    doc.rect(50, boxY, 495, 52).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fillColor('#334155').fontSize(9);
    doc.text(`Total Controls: ${data.total}`, 70, boxY + 10);
    doc.text(`Affected: ${data.affected}`, 220, boxY + 10);
    doc.text(`Compliant: ${data.compliant}`, 340, boxY + 10);
    const scoreColor = data.score >= 80 ? '#16a34a' : data.score >= 50 ? '#d97706' : '#dc2626';
    doc.fontSize(20).fillColor(scoreColor).text(`${data.score}%`, 450, boxY + 8);
    doc.moveDown(3.5);

    // Controls
    for (const ctrl of data.controls) {
      if (doc.y > 710) doc.addPage();

      const statusColor = ctrl.openCount > 0 ? '#dc2626' : '#16a34a';
      const statusLabel = ctrl.openCount > 0 ? `✗ ${ctrl.openCount} open finding(s)` : '✓ No open findings';

      doc.fontSize(10).fillColor('#1e293b').text(`${ctrl.control.id}  —  ${ctrl.control.name}`);
      doc.fontSize(8).fillColor('#64748b').text(ctrl.control.description, { indent: 10 });
      doc.fontSize(8).fillColor(statusColor).text(statusLabel, { indent: 10 });

      if (ctrl.findings.length > 0) {
        for (const f of ctrl.findings.slice(0, 5)) {
          if (doc.y > 750) doc.addPage();
          doc.fontSize(7).fillColor(SEV_COLOR[f.severity] ?? '#6b7280')
             .text(`  [${f.severity}] `, { continued: true });
          doc.fillColor('#334155').text(f.title, { continued: true });
          doc.fillColor('#94a3b8').text(`  (${f.status})`);
        }
        if (ctrl.findings.length > 5) {
          doc.fontSize(7).fillColor('#94a3b8').text(`  … and ${ctrl.findings.length - 5} more`);
        }
      }

      doc.moveDown(0.6);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.4);
    }

    doc.end();
  }
}
