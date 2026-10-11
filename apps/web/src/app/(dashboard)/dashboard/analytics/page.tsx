'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import {
  TrendingUp, ShieldCheck, Activity, Clock, Zap,
  AlertTriangle, CheckCircle2, BarChart3,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface VelocityRow { severity: string; avgDays: number; count: number }
interface SlaRow { severity: string; withinSla: number; total: number; rate: number | null; slaDays: number | null }
interface SlaCompliance { overallRate: number | null; bySeverity: SlaRow[] }
interface ActivityItem {
  id: string; type: string; action: string; title: string;
  severity?: string; projectName?: string; projectId?: string; timestamp: string;
}
interface ProjectHealth {
  id: string; name: string; riskScore: number;
  openCount: number; criticalCount: number; fixRate: number | null; lastScan: string | null;
}
interface Analytics {
  velocity: VelocityRow[];
  slaCompliance: SlaCompliance;
  activityFeed: ActivityItem[];
  projectHealth: ProjectHealth[];
}

// ── Colours ────────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#3b82f6', INFO: '#6b7280',
};
const SEV_BG: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  LOW:      'bg-blue-100 text-blue-700',
  INFO:     'bg-gray-100 text-gray-600',
};
const ACTION_ICON: Record<string, string> = {
  'finding.created':      '🔍',
  'scan.completed':       '✅',
  'scan.started':         '▶️',
  'retest.requested':     '🔄',
  'retest.completed':     '✔️',
  'finding.status_changed': '📝',
};

// ── Sparkline (SVG bar chart) ──────────────────────────────────────────────────

function VelocityBar({ severity, avgDays, count, maxDays }: VelocityRow & { maxDays: number }) {
  const pct = maxDays > 0 ? Math.min((avgDays / maxDays) * 100, 100) : 0;
  const SLA: Record<string, number> = { CRITICAL: 7, HIGH: 30, MEDIUM: 90, LOW: 180 };
  const sla = SLA[severity];
  const ok = sla != null && avgDays <= sla;

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEV_BG[severity] ?? 'bg-gray-100 text-gray-600'}`}>
          {severity[0] + severity.slice(1).toLowerCase()}
        </span>
      </div>
      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: SEV_COLOR[severity] ?? '#6b7280' }}
        />
        {sla != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-400/60"
            style={{ left: `${Math.min((sla / maxDays) * 100, 100)}%` }}
            title={`SLA: ${sla}d`}
          />
        )}
      </div>
      <div className="w-28 shrink-0 flex items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums">{avgDays.toFixed(1)}d</span>
        {ok
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
        <span className="text-xs text-gray-400">({count})</span>
      </div>
    </div>
  );
}

// ── SLA Donut ──────────────────────────────────────────────────────────────────

function SlaDonut({ rate }: { rate: number | null }) {
  if (rate === null) return <p className="text-xs text-gray-400">No data</p>;
  const r = 36, c = 2 * Math.PI * r;
  const dash = (rate / 100) * c;
  const color = rate >= 80 ? '#22c55e' : rate >= 60 ? '#eab308' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-xl font-bold tabular-nums" style={{ color }}>{rate}%</span>
      </div>
    </div>
  );
}

// ── Risk Score Bar ─────────────────────────────────────────────────────────────

function RiskBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-orange-400' : 'bg-green-500';
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<Analytics>('/dashboard/analytics')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-56 rounded bg-gray-100" />
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-56 rounded-xl bg-gray-100" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-red-300" />
        <p className="text-sm text-gray-500">{error ?? 'Failed to load analytics'}</p>
      </div>
    );
  }

  const maxDays = Math.max(...data.velocity.map((v) => v.avgDays), 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">Remediation velocity, SLA compliance, and project health</p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* Remediation Velocity */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Zap className="h-5 w-5 text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-900">Remediation Velocity</h2>
            <span className="ml-auto text-xs text-gray-400">Last 90 days · SLA marker = dashed line</span>
          </div>
          {data.velocity.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No fixed findings in the last 90 days</p>
          ) : (
            <div className="space-y-3">
              {data.velocity.map((v) => (
                <VelocityBar key={v.severity} {...v} maxDays={maxDays} />
              ))}
            </div>
          )}
          <p className="mt-4 text-[11px] text-gray-400">
            SLA targets: Critical 7d · High 30d · Medium 90d · Low 180d
          </p>
        </div>

        {/* SLA Compliance */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            <h2 className="text-sm font-semibold text-gray-900">SLA Compliance Rate</h2>
            <span className="ml-auto text-xs text-gray-400">Last 180 days</span>
          </div>
          <div className="flex items-center gap-8">
            <div className="shrink-0">
              <SlaDonut rate={data.slaCompliance.overallRate} />
              <p className="mt-1 text-center text-xs text-gray-400">Overall</p>
            </div>
            <div className="flex-1 space-y-3">
              {data.slaCompliance.bySeverity.map((row) => (
                <div key={row.severity} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${SEV_BG[row.severity] ?? ''}`}>
                      {row.severity[0] + row.severity.slice(1).toLowerCase()}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {row.rate != null ? `${row.rate}%` : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${row.rate ?? 0}%`,
                        backgroundColor: SEV_COLOR[row.severity] ?? '#6b7280',
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400">
                    {row.withinSla}/{row.total} within {row.slaDays}d SLA
                  </p>
                </div>
              ))}
              {data.slaCompliance.bySeverity.length === 0 && (
                <p className="text-sm text-gray-400">No fixed findings yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-900">Activity Feed</h2>
          </div>
          {data.activityFeed.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No recent activity</p>
          ) : (
            <div className="space-y-0 divide-y divide-gray-50">
              {data.activityFeed.map((item) => (
                <div key={`${item.type}-${item.id}`} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 shrink-0 text-base" role="img" aria-hidden>
                    {ACTION_ICON[item.action] ?? '🔔'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-gray-800">{item.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {item.severity && (
                        <span className={`rounded px-1.5 py-px text-[10px] font-bold ${SEV_BG[item.severity] ?? ''}`}>
                          {item.severity[0]}
                        </span>
                      )}
                      {item.projectName && (
                        <span className="text-[10px] text-gray-400 truncate">{item.projectName}</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-400 tabular-nums">
                    {timeAgo(item.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Project Health */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-500" />
            <h2 className="text-sm font-semibold text-gray-900">Project Health</h2>
            <TrendingUp className="ml-auto h-4 w-4 text-gray-300" />
          </div>
          {data.projectHealth.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No active projects</p>
          ) : (
            <div className="space-y-4">
              {data.projectHealth.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="block space-y-1.5 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-900 truncate max-w-[60%]">{p.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {p.criticalCount > 0 && (
                        <span className="flex items-center gap-0.5 text-red-600 font-semibold">
                          <AlertTriangle className="h-3 w-3" />{p.criticalCount}
                        </span>
                      )}
                      <span className="text-gray-400">{p.openCount} open</span>
                      {p.fixRate != null && (
                        <span className="text-green-600 font-semibold">{p.fixRate}% fixed</span>
                      )}
                    </div>
                  </div>
                  <RiskBar score={p.riskScore} />
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>Risk {p.riskScore}/100</span>
                    {p.lastScan && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        Scanned {timeAgo(p.lastScan)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
