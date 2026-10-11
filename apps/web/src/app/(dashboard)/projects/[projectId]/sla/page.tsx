'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Clock, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

interface SlaFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  createdAt: string;
  owasp: string | null;
  slaDeadline: string;
  slaStatus: SlaStatus;
  slaDaysRemaining: number;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  LOW:      'bg-blue-100 text-blue-700',
  INFO:     'bg-gray-100 text-gray-500',
};

const SLA_META: Record<SlaStatus, { label: string; icon: React.ReactNode; chip: string }> = {
  ON_TRACK: { label: 'On Track',  icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,  chip: 'bg-green-100 text-green-700' },
  AT_RISK:  { label: 'At Risk',   icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />, chip: 'bg-yellow-100 text-yellow-700' },
  BREACHED: { label: 'Breached',  icon: <ShieldAlert   className="h-4 w-4 text-red-500" />,   chip: 'bg-red-100 text-red-700' },
};

type FilterStatus = 'ALL' | SlaStatus;

export default function SlaPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [findings, setFindings] = useState<SlaFinding[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<FilterStatus>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiClient.get<SlaFinding[]>(`/projects/${projectId}/findings/sla`).finally(() => setLoading(false));
    setFindings(data);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const shown = filter === 'ALL' ? findings : findings.filter((f) => f.slaStatus === filter);

  const counts = {
    BREACHED: findings.filter((f) => f.slaStatus === 'BREACHED').length,
    AT_RISK:  findings.filter((f) => f.slaStatus === 'AT_RISK').length,
    ON_TRACK: findings.filter((f) => f.slaStatus === 'ON_TRACK').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900">SLA Tracking</h1>
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/reports/sla.pdf?token=${typeof window !== 'undefined' ? localStorage.getItem('ptaas_access_token') ?? '' : ''}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          📄 SLA Report PDF
        </a>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {([
          { key: 'BREACHED', label: 'Breached', bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700'    },
          { key: 'AT_RISK',  label: 'At Risk',  bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
          { key: 'ON_TRACK', label: 'On Track', bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700'  },
        ] as const).map(({ key, label, bg, border, text }) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? 'ALL' : key)}
            className={`rounded-xl border p-4 text-left transition-all ${bg} ${border} ${filter === key ? 'ring-2 ring-offset-1 ring-indigo-400' : 'hover:shadow-sm'}`}
          >
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <p className={`mt-1 text-3xl font-bold ${text}`}>{counts[key]}</p>
          </button>
        ))}
      </div>

      {counts.BREACHED > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <strong>{counts.BREACHED}</strong> finding{counts.BREACHED !== 1 ? 's have' : ' has'} exceeded the SLA remediation deadline.
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-gray-100" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-400" />
          <p className="font-medium text-gray-700">{filter === 'ALL' ? 'No findings' : `No ${SLA_META[filter].label} findings`}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Finding</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Deadline</th>
                <th className="px-4 py-3 text-left">Days Remaining</th>
                <th className="px-4 py-3 text-left">SLA Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map((f) => {
                const sla = SLA_META[f.slaStatus];
                const isFixed = ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED'].includes(f.status);
                return (
                  <tr key={f.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${projectId}/findings/${f.id}`}
                        className="font-medium text-gray-900 hover:text-indigo-600 transition-colors line-clamp-1"
                      >
                        {f.title}
                      </Link>
                      {f.owasp && <p className="text-xs text-gray-400 mt-0.5">{f.owasp}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SEV_COLOR[f.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                        {f.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(f.slaDeadline).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3">
                      {isFixed ? (
                        <span className="text-xs text-gray-400">Resolved</span>
                      ) : (
                        <span className={f.slaDaysRemaining < 0 ? 'font-semibold text-red-600' : f.slaDaysRemaining <= 7 ? 'font-semibold text-yellow-600' : 'text-gray-600'}>
                          {f.slaDaysRemaining < 0 ? `${Math.abs(f.slaDaysRemaining)}d overdue` : `${f.slaDaysRemaining}d left`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${sla.chip}`}>
                        {sla.icon} {sla.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
