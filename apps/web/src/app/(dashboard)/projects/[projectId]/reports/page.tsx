'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText, FileSpreadsheet, Download, ExternalLink, Clock,
  ShieldCheck, BarChart3, FileJson, TableProperties, CheckSquare,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Report {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  ext: string;
  mime: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

const REPORTS: Report[] = [
  {
    id: 'executive',
    label: 'Executive Summary',
    description: 'Risk overview, KPI cards, top critical findings, and business-impact section. Designed for C-level stakeholders.',
    endpoint: 'executive.pdf',
    ext: 'pdf',
    mime: 'application/pdf',
    icon: <ShieldCheck className="w-6 h-6" />,
    badge: 'PDF',
    badgeColor: 'bg-red-100 text-red-700',
  },
  {
    id: 'technical',
    label: 'Technical Report',
    description: 'All findings with full CVSS scores, CWE IDs, OWASP categories, HTTP evidence, and AI remediation guidance.',
    endpoint: 'technical.pdf',
    ext: 'pdf',
    mime: 'application/pdf',
    icon: <FileText className="w-6 h-6" />,
    badge: 'PDF',
    badgeColor: 'bg-red-100 text-red-700',
  },
  {
    id: 'scorecard',
    label: 'Security Scorecard',
    description: 'Security score, OWASP radar chart, severity donut, SLA compliance, and month-over-month trend.',
    endpoint: 'scorecard.pdf',
    ext: 'pdf',
    mime: 'application/pdf',
    icon: <BarChart3 className="w-6 h-6" />,
    badge: 'PDF',
    badgeColor: 'bg-red-100 text-red-700',
  },
  {
    id: 'compliance-iso',
    label: 'ISO 27001 Compliance',
    description: 'Finding-to-control mapping for ISO/IEC 27001:2022. Shows which Annex A controls are affected.',
    endpoint: 'compliance.pdf?framework=ISO27001',
    ext: 'pdf',
    mime: 'application/pdf',
    icon: <CheckSquare className="w-6 h-6" />,
    badge: 'PDF',
    badgeColor: 'bg-red-100 text-red-700',
  },
  {
    id: 'compliance-soc2',
    label: 'SOC 2 Compliance',
    description: 'Maps findings to SOC 2 Trust Service Criteria (CC1–CC9, A1). Ready for auditor evidence packs.',
    endpoint: 'compliance.pdf?framework=SOC2',
    ext: 'pdf',
    mime: 'application/pdf',
    icon: <CheckSquare className="w-6 h-6" />,
    badge: 'PDF',
    badgeColor: 'bg-red-100 text-red-700',
  },
  {
    id: 'excel',
    label: 'Excel Export',
    description: '4-sheet workbook: Executive Summary, All Findings with filters, CVSS Breakdown, and OWASP Mapping.',
    endpoint: 'findings.xlsx',
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    icon: <FileSpreadsheet className="w-6 h-6" />,
    badge: 'XLSX',
    badgeColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'csv',
    label: 'CSV Export',
    description: 'All findings as UTF-8 CSV with BOM — ready for Excel, Google Sheets, or SIEM imports.',
    endpoint: 'findings.csv',
    ext: 'csv',
    mime: 'text/csv',
    icon: <TableProperties className="w-6 h-6" />,
    badge: 'CSV',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'json',
    label: 'JSON Export',
    description: 'Machine-readable JSON with full finding objects including AI scores — ideal for pipeline integrations.',
    endpoint: 'findings.json',
    ext: 'json',
    mime: 'application/json',
    icon: <FileJson className="w-6 h-6" />,
    badge: 'JSON',
    badgeColor: 'bg-yellow-100 text-yellow-700',
  },
];

export default function ReportsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [downloading, setDownloading] = useState<string | null>(null);
  const [lastDownloaded, setLastDownloaded] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function download(report: Report) {
    setDownloading(report.id);
    setError(null);

    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('ptaas_access_token') ?? '')
        : '';

      const url = `${API_URL}/projects/${projectId}/reports/${report.endpoint}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;

      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `report.${report.ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);

      setLastDownloaded((prev) => ({
        ...prev,
        [report.id]: new Date().toLocaleTimeString(),
      }));
    } catch (err) {
      setError(`${report.label}: ${(err as Error).message}`);
    } finally {
      setDownloading(null);
    }
  }

  function openInTab(report: Report) {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('ptaas_access_token') ?? '')
      : '';
    const url = `${API_URL}/projects/${projectId}/reports/${report.endpoint}${report.endpoint.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const pdfReports = REPORTS.filter((r) => r.ext === 'pdf');
  const dataReports = REPORTS.filter((r) => r.ext !== 'pdf');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Report Center</h1>
        <p className="mt-1 text-sm text-gray-500">
          Download security reports in various formats for stakeholders, auditors, and integrations.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* PDF Reports */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          PDF Reports
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pdfReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              downloading={downloading === report.id}
              lastDownloaded={lastDownloaded[report.id]}
              onDownload={() => download(report)}
              onOpenTab={() => openInTab(report)}
            />
          ))}
        </div>
      </section>

      {/* Data Exports */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Data Exports
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dataReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              downloading={downloading === report.id}
              lastDownloaded={lastDownloaded[report.id]}
              onDownload={() => download(report)}
              onOpenTab={report.ext === 'json' ? () => openInTab(report) : undefined}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportCard({
  report,
  downloading,
  lastDownloaded,
  onDownload,
  onOpenTab,
}: {
  report: Report;
  downloading: boolean;
  lastDownloaded?: string;
  onDownload: () => void;
  onOpenTab?: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          {report.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{report.label}</span>
            {report.badge && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${report.badgeColor}`}>
                {report.badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">{report.description}</p>
        </div>
      </div>

      {lastDownloaded && (
        <div className="mt-3 flex items-center gap-1 text-[11px] text-gray-400">
          <Clock className="w-3 h-3" />
          Last downloaded at {lastDownloaded}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onDownload}
          disabled={downloading}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {downloading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloading ? 'Generating…' : 'Download'}
        </button>
        {onOpenTab && (
          <button
            onClick={onOpenTab}
            title="Open in new tab"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
