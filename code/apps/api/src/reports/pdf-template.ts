import type { ReportData } from './reports.service';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6',
  INFO: '#6b7280',
};

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Kritisch',
  HIGH: 'Hoch',
  MEDIUM: 'Mittel',
  LOW: 'Niedrig',
  INFO: 'Info',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Offen',
  CONFIRMED: 'Bestätigt',
  FIXED: 'Behoben',
  WONT_FIX: 'Wird nicht behoben',
  FALSE_POSITIVE: 'False Positive',
};

export function generatePdfHtml(data: ReportData): string {
  const { project, findings, generatedAt } = data;

  const bySeverity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((s) => ({
    severity: s,
    count: findings.filter((f) => f.severity === s).length,
  }));

  const openCount = findings.filter((f) => f.status === 'OPEN' || f.status === 'CONFIRMED').length;

  const findingsHtml = findings
    .map(
      (f, i) => `
      <div class="finding">
        <div class="finding-header">
          <span class="finding-number">#${i + 1}</span>
          <span class="severity-badge" style="background:${SEVERITY_COLORS[f.severity]}20;color:${SEVERITY_COLORS[f.severity]};border:1px solid ${SEVERITY_COLORS[f.severity]}40">
            ${SEVERITY_LABELS[f.severity]}
          </span>
          ${f.cvssScore != null ? `<span class="cvss">CVSS ${f.cvssScore.toFixed(1)}</span>` : ''}
          ${f.cweId ? `<span class="cwe">${f.cweId}</span>` : ''}
          <span class="status">${STATUS_LABELS[f.status] ?? f.status}</span>
        </div>
        <h3 class="finding-title">${escapeHtml(f.title)}</h3>
        ${f.affectedUrl ? `<p class="affected-url">🔗 ${escapeHtml(f.affectedUrl)}</p>` : ''}
        <p class="description">${escapeHtml(f.description)}</p>
        ${
          f.remediation
            ? `<div class="remediation">
                <strong>Empfehlung:</strong>
                <p>${escapeHtml(f.remediation)}</p>
               </div>`
            : ''
        }
      </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; }

    /* Cover */
    .cover { page-break-after: always; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 60px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; }
    .cover-label { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #94a3b8; margin-bottom: 16px; }
    .cover-title { font-size: 36px; font-weight: 700; line-height: 1.2; margin-bottom: 8px; }
    .cover-subtitle { font-size: 18px; color: #94a3b8; margin-bottom: 40px; }
    .cover-meta { display: flex; gap: 40px; margin-top: 60px; border-top: 1px solid #334155; padding-top: 24px; }
    .cover-meta-item { }
    .cover-meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
    .cover-meta-value { font-size: 14px; font-weight: 600; margin-top: 4px; }

    /* Content */
    .content { padding: 40px 60px; }
    h2 { font-size: 20px; font-weight: 700; margin: 32px 0 16px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 32px; }
    .summary-card { border-radius: 8px; padding: 16px; text-align: center; }
    .summary-count { font-size: 28px; font-weight: 800; }
    .summary-label { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; opacity: 0.8; }

    /* Findings */
    .finding { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 16px; page-break-inside: avoid; }
    .finding-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .finding-number { font-size: 11px; font-weight: 600; color: #94a3b8; }
    .severity-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
    .cvss { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 3px 8px; border-radius: 4px; }
    .cwe { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 3px 8px; border-radius: 4px; }
    .status { font-size: 11px; color: #64748b; margin-left: auto; }
    .finding-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
    .affected-url { font-size: 11px; color: #3b82f6; margin-bottom: 8px; font-family: monospace; }
    .description { color: #475569; line-height: 1.6; }
    .remediation { margin-top: 12px; background: #f0fdf4; border-left: 3px solid #22c55e; padding: 12px; border-radius: 0 6px 6px 0; }
    .remediation strong { color: #15803d; font-size: 12px; }
    .remediation p { color: #166534; margin-top: 4px; line-height: 1.5; }

    /* Footer */
    .footer { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; }

    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Cover -->
  <div class="cover">
    <p class="cover-label">Penetration Test Report</p>
    <h1 class="cover-title">${escapeHtml(project.name)}</h1>
    <p class="cover-subtitle">${project.targets[0] ?? ''}</p>
    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Erstellt am</div>
        <div class="cover-meta-value">${new Date(generatedAt).toLocaleDateString('de-DE')}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Findings gesamt</div>
        <div class="cover-meta-value">${findings.length}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Offen</div>
        <div class="cover-meta-value">${openCount}</div>
      </div>
    </div>
  </div>

  <div class="content">

    <!-- Zusammenfassung -->
    <h2>Executive Summary</h2>
    <div class="summary-grid">
      ${bySeverity
        .map(
          ({ severity, count }) => `
        <div class="summary-card" style="background:${SEVERITY_COLORS[severity]}15;border:1px solid ${SEVERITY_COLORS[severity]}30">
          <div class="summary-count" style="color:${SEVERITY_COLORS[severity]}">${count}</div>
          <div class="summary-label" style="color:${SEVERITY_COLORS[severity]}">${SEVERITY_LABELS[severity]}</div>
        </div>`,
        )
        .join('')}
    </div>

    <!-- Findings -->
    <h2>Gefundene Schwachstellen</h2>
    ${findings.length === 0 ? '<p style="color:#94a3b8">Keine Findings gefunden.</p>' : findingsHtml}

    <div class="footer">
      <p>Generiert von PTaaS Platform · ${new Date(generatedAt).toLocaleString('de-DE')}</p>
      <p style="margin-top:4px">Vertraulich – nur für interne Verwendung</p>
    </div>

  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
