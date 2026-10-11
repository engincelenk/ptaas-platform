'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, HelpCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

type CategoryStatus = 'COMPLIANT' | 'WARNING' | 'CRITICAL' | 'UNCHECKED';

interface CategoryResult {
  category: {
    id: string;
    name: string;
    description: string;
    iso27001Controls: string[];
  };
  status: CategoryStatus;
  openCount: number;
  criticalCount: number;
}

interface ComplianceReport {
  projectId: string;
  score: number;
  categories: CategoryResult[];
  generatedAt: string;
}

const STATUS_CONFIG: Record<CategoryStatus, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badgeClass: string;
  rowClass: string;
}> = {
  COMPLIANT: {
    icon: ShieldCheck,
    label: 'Compliant',
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    rowClass: '',
  },
  WARNING: {
    icon: ShieldAlert,
    label: 'Warning',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    rowClass: 'bg-amber-50/40 dark:bg-amber-950/20',
  },
  CRITICAL: {
    icon: ShieldX,
    label: 'Critical',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    rowClass: 'bg-red-50/40 dark:bg-red-950/20',
  },
  UNCHECKED: {
    icon: HelpCircle,
    label: 'Not Tested',
    badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
    rowClass: '',
  },
};

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';

  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth="8"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="20" fontWeight="bold"
      >
        {score}%
      </text>
    </svg>
  );
}

export function ComplianceDashboard({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<ComplianceReport>(`/projects/${projectId}/compliance`);
      setReport(data);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem('ptaas_access_token') ?? '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/projects/${projectId}/compliance/pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-${projectId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Run a compliance check to see your OWASP Top 10 status.
        </p>
        <Button onClick={load} disabled={loading}>
          {loading ? 'Analyzing…' : 'Run Compliance Check'}
        </Button>
      </div>
    );
  }

  const failing = report.categories.filter(
    (c) => c.status === 'CRITICAL' || c.status === 'WARNING',
  );

  return (
    <div className="space-y-6">
      {/* Score header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <ScoreRing score={report.score} />
          <div>
            <p className="text-lg font-semibold">Compliance Score</p>
            <p className="text-sm text-muted-foreground">
              {10 - failing.length} / 10 OWASP categories passing
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Checked {new Date(report.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={downloading}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {downloading ? 'Generating…' : 'PDF Report'}
          </Button>
        </div>
      </div>

      {/* Categories table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Category</th>
              <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">ISO 27001</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs text-muted-foreground">Open</th>
              <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.categories.map((cat) => {
              const cfg = STATUS_CONFIG[cat.status];
              const Icon = cfg.icon;
              return (
                <tr key={cat.category.id} className={cat.status !== 'COMPLIANT' && cat.status !== 'UNCHECKED' ? cfg.rowClass : ''}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      <span className="text-muted-foreground mr-1">{cat.category.id}</span>
                      {cat.category.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                      {cat.category.description}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {cat.category.iso27001Controls.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {cat.openCount > 0 ? (
                      <span className="text-sm font-medium">{cat.openCount}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${cfg.badgeClass}`}>
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Remediation hints */}
      {failing.length > 0 && (
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm font-semibold">Remediation Priority</p>
          {failing.map((c) => (
            <div key={c.category.id} className="flex items-start gap-2 text-sm">
              <ShieldX className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div>
                <span className="font-medium">{c.category.id} {c.category.name}</span>
                <span className="text-muted-foreground"> — {c.openCount} open finding{c.openCount > 1 ? 's' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
