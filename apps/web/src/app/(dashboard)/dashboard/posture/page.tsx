'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Shield, TrendingUp, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

interface ProjectStat {
  projectId: string;
  projectName: string;
  totalFindings: number;
  openFindings: number;
  resolvedFindings: number;
  remediationRate: number;
  riskScore: number;
  bySeverity: Record<string, number>;
}

interface PostureData {
  summary: {
    totalProjects: number;
    totalFindings: number;
    openFindings: number;
    resolvedFindings: number;
    remediationRate: number;
    bySeverity: Record<string, number>;
  };
  projects: ProjectStat[];
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-400',
  MEDIUM:   'bg-yellow-400',
  LOW:      'bg-blue-400',
  INFO:     'bg-gray-300',
};

const SEV_TEXT: Record<string, string> = {
  CRITICAL: 'text-red-700',
  HIGH:     'text-orange-700',
  MEDIUM:   'text-yellow-700',
  LOW:      'text-blue-700',
  INFO:     'text-gray-500',
};

function RiskBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-orange-400' : score >= 20 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className="flex items-center gap-2 w-24">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-600 w-6">{score}</span>
    </div>
  );
}

function SeverityBar({ bySeverity, total }: { bySeverity: Record<string, number>; total: number }) {
  if (total === 0) return <div className="h-2 rounded-full bg-green-100" />;
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden gap-px">
      {order.map((sev) => {
        const count = bySeverity[sev] ?? 0;
        if (!count) return null;
        const pct = (count / total) * 100;
        return <div key={sev} className={`${SEV_COLOR[sev]}`} style={{ width: `${pct}%` }} title={`${sev}: ${count}`} />;
      })}
    </div>
  );
}

export default function PosturePage() {
  const [data, setData] = useState<PostureData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiClient.get<PostureData>('/dashboard/posture');
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 rounded bg-gray-100" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-gray-100" />)}
        </div>
        <div className="h-64 rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;
  const sevsOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Posture</h1>
          <p className="text-sm text-gray-500 mt-0.5">Org-wide risk overview across all {summary.totalProjects} projects</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects',    value: summary.totalProjects,   icon: <TrendingUp className="h-5 w-5 text-indigo-400" />,   bg: 'bg-indigo-50'  },
          { label: 'Open Findings',     value: summary.openFindings,    icon: <AlertTriangle className="h-5 w-5 text-orange-400" />, bg: 'bg-orange-50'  },
          { label: 'Resolved',          value: summary.resolvedFindings, icon: <CheckCircle2 className="h-5 w-5 text-green-400" />, bg: 'bg-green-50'   },
          { label: 'Remediation Rate',  value: `${summary.remediationRate}%`, icon: <Shield className="h-5 w-5 text-blue-400" />, bg: 'bg-blue-50'    },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border border-gray-100 ${kpi.bg} p-4 shadow-sm`}>
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">{kpi.icon} {kpi.label}</div>
            <p className="text-3xl font-bold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Org-wide severity distribution */}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Org-wide Finding Distribution</h2>
        <div className="space-y-2">
          {sevsOrder.map((sev) => {
            const count = summary.bySeverity[sev] ?? 0;
            const pct = summary.totalFindings > 0 ? (count / summary.totalFindings) * 100 : 0;
            return (
              <div key={sev} className="flex items-center gap-3">
                <span className={`w-20 text-xs font-semibold ${SEV_TEXT[sev]}`}>{sev}</span>
                <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full ${SEV_COLOR[sev]}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right text-xs text-gray-500">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-project comparison table */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Project Comparison</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Project</th>
              <th className="px-4 py-3 text-left">Severity Mix</th>
              <th className="px-4 py-3 text-right">Open</th>
              <th className="px-4 py-3 text-right">Rem. Rate</th>
              <th className="px-4 py-3 text-left">Risk Score</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.projects.map((p) => (
              <tr key={p.projectId} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{p.projectName}</td>
                <td className="px-4 py-3 w-40">
                  <SeverityBar bySeverity={p.bySeverity} total={p.totalFindings} />
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={p.openFindings > 0 ? 'font-semibold text-orange-600' : 'text-gray-400'}>
                    {p.openFindings}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={p.remediationRate >= 80 ? 'text-green-600' : p.remediationRate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                    {p.remediationRate}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RiskBar score={p.riskScore} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/projects/${p.projectId}`}
                    className="inline-flex items-center text-indigo-600 hover:text-indigo-700 text-xs"
                  >
                    View <ChevronRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.projects.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">No projects yet</div>
        )}
      </div>
    </div>
  );
}
