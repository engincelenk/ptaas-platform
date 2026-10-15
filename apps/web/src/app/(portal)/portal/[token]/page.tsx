'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-client';


const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-600',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-blue-400',
  INFO: 'bg-gray-400',
};

const SEVERITY_TEXT: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-50 border-red-200',
  HIGH: 'text-orange-700 bg-orange-50 border-orange-200',
  MEDIUM: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  LOW: 'text-blue-700 bg-blue-50 border-blue-200',
  INFO: 'text-gray-600 bg-gray-50 border-gray-200',
};

interface Summary {
  project: {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    organization: { name: string; logoUrl: string | null };
    targets: Array<{ value: string; type: string }>;
  };
  stats: {
    totalFindings: number;
    openFindings: number;
    resolvedFindings: number;
    bySeverity: Record<string, number>;
  };
}

interface Finding {
  id: string;
  title: string;
  severity: string;
  status: string;
  cvssScore: number | null;
  cveIds: string[];
  recommendation: string | null;
  retestStatus: string | null;
  target: { value: string; type: string } | null;
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [s, f] = await Promise.all([
          fetch(apiUrl(`/portal/${token}/summary`)).then(async (r) => {
            if (!r.ok) throw new Error(((await r.json()) as { message?: string }).message ?? 'Invalid link');
            return r.json() as Promise<Summary>;
          }),
          fetch(apiUrl(`/portal/${token}/findings`)).then((r) => r.json() as Promise<Finding[]>),
        ]);
        setSummary(s);
        setFindings(f);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load portal');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-64" />
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="text-center py-20">
      <p className="text-lg font-semibold text-gray-700">This link is invalid or has expired</p>
      <p className="text-sm text-gray-500 mt-2">{error}</p>
    </div>
  );

  if (!summary) return null;

  const { project, stats } = summary;
  const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  const filtered = severityFilter ? findings.filter(f => f.severity === severityFilter) : findings;
  const resolvedPct = stats.totalFindings > 0
    ? Math.round((stats.resolvedFindings / stats.totalFindings) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{project.organization.name}</p>
            <h1 className="text-3xl font-bold mt-1">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground mt-1">{project.description}</p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Started {new Date(project.createdAt).toLocaleDateString()}</p>
            <p className="mt-1">{project.targets.length} scope item{project.targets.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Scope */}
        {project.targets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {project.targets.map((t) => (
              <span key={t.value} className="rounded-full border px-2.5 py-1 text-xs font-mono bg-white">
                {t.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Total Findings</p>
          <p className="text-3xl font-bold mt-1">{stats.totalFindings}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="text-3xl font-bold mt-1 text-orange-600">{stats.openFindings}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Resolved</p>
          <p className="text-3xl font-bold mt-1 text-green-600">{stats.resolvedFindings}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Remediation</p>
          <p className="text-3xl font-bold mt-1">{resolvedPct}%</p>
        </div>
      </div>

      {/* Severity Bar */}
      <div className="rounded-xl border bg-white p-5">
        <p className="text-sm font-semibold mb-3">Findings by Severity</p>
        <div className="space-y-2.5">
          {severityOrder.map((sev) => {
            const count = stats.bySeverity[sev] ?? 0;
            const pct = stats.totalFindings > 0 ? (count / stats.totalFindings) * 100 : 0;
            return (
              <div key={sev} className="flex items-center gap-3">
                <span className="w-20 text-xs font-medium text-right shrink-0">{sev}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${SEVERITY_COLOR[sev] ?? 'bg-gray-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-6 text-xs text-right shrink-0 font-mono">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Findings List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Findings ({filtered.length})</h2>
          <div className="flex gap-1.5">
            {['', ...severityOrder].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  severityFilter === s ? 'bg-gray-800 text-white' : 'border bg-white hover:bg-gray-50'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((finding) => (
            <Link
              key={finding.id}
              href={`/portal/${token}/findings/${finding.id}`}
              className="block rounded-xl border bg-white p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{finding.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${SEVERITY_TEXT[finding.severity] ?? ''}`}>
                      {finding.severity}
                    </span>
                    {finding.target && (
                      <span className="text-xs text-muted-foreground font-mono">{finding.target.value}</span>
                    )}
                    {finding.cveIds.length > 0 && (
                      <span className="text-xs text-blue-600">{finding.cveIds[0]}</span>
                    )}
                    {finding.cvssScore != null && (
                      <span className="text-xs text-muted-foreground">CVSS {finding.cvssScore.toFixed(1)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    finding.status === 'RESOLVED' ? 'bg-green-100 text-green-700' :
                    finding.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {finding.status.replace('_', ' ')}
                  </span>
                  {finding.retestStatus && (
                    <p className="text-xs text-muted-foreground mt-1">{finding.retestStatus}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}

          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed bg-white p-10 text-center">
              <p className="text-muted-foreground text-sm">No findings match this filter.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
