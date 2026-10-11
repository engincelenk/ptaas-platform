'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Download, FileText, X, BarChart3, ShieldCheck, Clock } from 'lucide-react';

interface Stats {
  openFindings: number;
  criticalCount: number;
  highCount: number;
  avgRiskScore: number | null;
}

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export function ExecutiveReportDialog({ projectId, projectName, onClose }: Props) {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [slaSummary, setSla]  = useState<{ breached: number; atRisk: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get<{ kpis: Stats }>('/dashboard/executive').catch(() => null),
      apiClient.get<{ breached: number; atRisk: number }>('/dashboard/sla-summary').catch(() => null),
    ]).then(([exec, sla]) => {
      setStats(exec?.kpis ?? null);
      setSla(sla);
    }).finally(() => setLoading(false));
  }, [projectId]);

  function download() {
    const token = localStorage.getItem('ptaas_access_token') ?? '';
    const base  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    window.open(
      `${base}/api/v1/projects/${projectId}/reports/executive.pdf?token=${encodeURIComponent(token)}`,
      '_blank',
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl bg-slate-900 px-5 py-4">
          <div className="flex items-center gap-2 text-white">
            <FileText className="h-5 w-5 text-indigo-400" />
            <span className="font-semibold">Executive Report</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900">{projectName}</p>
            <p className="text-xs text-gray-400">Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Report Contents</p>
            {[
              { icon: <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />, label: 'Risk Summary & Severity Breakdown' },
              { icon: <ShieldCheck className="h-3.5 w-3.5 text-green-500" />, label: 'Top Priority Findings with Business Impact' },
              { icon: <BarChart3 className="h-3.5 w-3.5 text-yellow-500" />, label: 'Remediation Progress' },
              { icon: <Clock className="h-3.5 w-3.5 text-red-500" />, label: 'SLA Status (On Track / At Risk / Breached)' },
              { icon: <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />, label: 'OWASP Compliance Scorecard' },
              { icon: <FileText className="h-3.5 w-3.5 text-gray-400" />, label: 'Key Recommendations' },
              { icon: <FileText className="h-3.5 w-3.5 text-gray-400" />, label: 'Engagement Sign-off (if available)' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-gray-600">
                {icon}
                <span className="text-xs">{label}</span>
              </div>
            ))}
          </div>

          {/* Live stats preview */}
          {loading ? (
            <div className="animate-pulse h-12 rounded-xl bg-gray-100" />
          ) : stats && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Open', value: stats.openFindings, color: 'text-gray-800' },
                { label: 'Critical', value: stats.criticalCount, color: 'text-red-600' },
                { label: 'SLA Breached', value: slaSummary?.breached ?? 0, color: slaSummary?.breached ? 'text-red-600' : 'text-green-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-gray-400">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={download}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
