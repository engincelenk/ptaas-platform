'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { ShieldAlert, ShieldOff, Clock, AlertTriangle } from 'lucide-react';

type Decision = 'ACCEPTED' | 'DEFERRED' | 'FALSE_POSITIVE';

interface RiskEntry {
  id: string;
  decision: Decision;
  justification: string;
  expiresAt: string | null;
  reviewedAt: string;
  approvedBy: { name: string; email: string } | null;
  finding: { id: string; title: string; severity: string; status: string } | null;
}

const SEV_BG: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-blue-100 text-blue-700',
  INFO: 'bg-gray-100 text-gray-600',
};

const DECISION_CONFIG: Record<Decision, { label: string; icon: React.ReactNode; style: string }> = {
  ACCEPTED:       { label: 'Accepted',       icon: <ShieldAlert className="h-4 w-4" />, style: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  DEFERRED:       { label: 'Deferred',       icon: <Clock className="h-4 w-4" />,       style: 'text-blue-600 bg-blue-50 border-blue-200' },
  FALSE_POSITIVE: { label: 'False Positive', icon: <ShieldOff className="h-4 w-4" />,   style: 'text-gray-600 bg-gray-50 border-gray-200' },
};

function daysUntil(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export default function RiskAcceptancesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [entries, setEntries] = useState<RiskEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<RiskEntry[]>(`/projects/${projectId}/risk-acceptances`)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-gray-100" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 text-yellow-600">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Risk Acceptances</h1>
          <p className="text-sm text-gray-500">{entries.length} active decision{entries.length !== 1 ? 's' : ''} in this project</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 py-16 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No risk acceptances recorded for this project.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const cfg = DECISION_CONFIG[e.decision];
            const days = daysUntil(e.expiresAt);
            const expiringSoon = days !== null && days <= 7;

            return (
              <div key={e.id} className={`rounded-xl border p-4 ${cfg.style}`}>
                <div className="flex items-start gap-3">
                  {cfg.icon}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{cfg.label}</span>
                      {e.finding && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SEV_BG[e.finding.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {e.finding.severity}
                        </span>
                      )}
                      {expiringSoon && (
                        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          <AlertTriangle className="h-3 w-3" />
                          {days! <= 0 ? 'Expired' : `Expires in ${days}d`}
                        </span>
                      )}
                    </div>
                    {e.finding && (
                      <Link
                        href={`/projects/${projectId}/findings/${e.finding.id}`}
                        className="mt-0.5 block truncate text-sm font-medium hover:underline"
                      >
                        {e.finding.title}
                      </Link>
                    )}
                    <p className="mt-1 text-xs opacity-80">{e.justification}</p>
                    <p className="mt-1 text-[10px] opacity-60">
                      Approved by {e.approvedBy?.name ?? '—'} · {new Date(e.reviewedAt).toLocaleDateString('en-GB')}
                      {e.expiresAt && ` · Expires ${new Date(e.expiresAt).toLocaleDateString('en-GB')}`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
