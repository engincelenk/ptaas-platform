'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import {
  RotateCcw, CheckCircle2, XCircle, Clock,
  AlertTriangle, ChevronRight,
} from 'lucide-react';

const SEV_BG: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  LOW:      'bg-blue-100 text-blue-700',
  INFO:     'bg-gray-100 text-gray-600',
};

interface RetestFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  retestStatus: string;
  retestRequestedAt: string | null;
  retestCompletedAt: string | null;
  scan: { projectId: string; project: { name: string } } | null;
}

interface RetestData {
  pending: RetestFinding[];
  passed:  RetestFinding[];
  failed:  RetestFinding[];
  total:   number;
}

function timeAgo(date: string | null) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RetestRow({ finding, showResult }: { finding: RetestFinding; showResult?: boolean }) {
  const projectId = finding.scan?.projectId;
  const href = projectId ? `/projects/${projectId}/findings/${finding.id}` : '#';

  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 truncate">{finding.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SEV_BG[finding.severity] ?? 'bg-gray-100 text-gray-600'}`}>
            {finding.severity[0] + finding.severity.slice(1).toLowerCase()}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
          {finding.scan?.project?.name && (
            <span>{finding.scan.project.name}</span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Requested {timeAgo(finding.retestRequestedAt)}
          </span>
          {showResult && finding.retestCompletedAt && (
            <span>Completed {timeAgo(finding.retestCompletedAt)}</span>
          )}
        </div>
      </div>
      {showResult && finding.retestStatus === 'PASSED' && (
        <span className="flex items-center gap-1 shrink-0 text-xs font-semibold text-green-600">
          <CheckCircle2 className="h-4 w-4" /> Fixed
        </span>
      )}
      {showResult && finding.retestStatus === 'FAILED' && (
        <span className="flex items-center gap-1 shrink-0 text-xs font-semibold text-red-600">
          <XCircle className="h-4 w-4" /> Still Vulnerable
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-400 transition-colors" />
    </Link>
  );
}

function Section({
  title, icon, items, emptyText, showResult,
}: {
  title: string;
  icon: React.ReactNode;
  items: RetestFinding[];
  emptyText: string;
  showResult?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        {icon}
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">{emptyText}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((f) => <RetestRow key={f.id} finding={f} showResult={showResult} />)}
        </div>
      )}
    </div>
  );
}

export default function RetestsDashboardPage() {
  const [data, setData] = useState<RetestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<RetestData>('/dashboard/retests')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-gray-100" />
        <div className="grid sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-8 rounded-lg bg-gray-100" />)}
        </div>
        {[1, 2, 3].map((i) => <div key={i} className="h-48 rounded-xl bg-gray-100" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-red-300" />
        <p className="text-sm text-gray-500">{error ?? 'Failed to load retests'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Retest Dashboard</h1>
            <p className="text-sm text-gray-500">Track all retest requests across projects</p>
          </div>
        </div>
        <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', count: data.pending.length, color: 'text-yellow-600', bg: 'bg-yellow-50', icon: <Clock className="h-5 w-5 text-yellow-500" /> },
          { label: 'Passed', count: data.passed.length, color: 'text-green-600', bg: 'bg-green-50', icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> },
          { label: 'Failed', count: data.failed.length, color: 'text-red-600', bg: 'bg-red-50', icon: <XCircle className="h-5 w-5 text-red-500" /> },
        ].map(({ label, count, color, bg, icon }) => (
          <div key={label} className={`rounded-xl border border-gray-100 ${bg} p-4 flex items-center gap-3`}>
            {icon}
            <div>
              <p className={`text-2xl font-bold tabular-nums ${color}`}>{count}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sections */}
      <Section
        title="Pending Retests"
        icon={<Clock className="h-4 w-4 text-yellow-500" />}
        items={data.pending}
        emptyText="No retests currently running"
      />
      <Section
        title="Failed — Still Vulnerable"
        icon={<XCircle className="h-4 w-4 text-red-500" />}
        items={data.failed}
        emptyText="No failed retests"
        showResult
      />
      <Section
        title="Passed — Fix Verified"
        icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
        items={data.passed}
        emptyText="No passed retests yet"
        showResult
      />
    </div>
  );
}
