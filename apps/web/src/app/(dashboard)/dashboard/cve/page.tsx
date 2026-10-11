'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Zap, TrendingUp, AlertTriangle } from 'lucide-react';

interface TopCve {
  cveId: string;
  maxCvss: number | null;
  maxEpss: number | null;
  findingCount: number;
  severities: string[];
}

interface FindingRow {
  id: string;
  title: string;
  severity: string;
  cvssScore: number | null;
  epssScore: number | null;
  epssPercentile?: number | null;
  cveIds: string[];
  projectId: string | null;
  projectName: string | null;
}

interface CveIntelligence {
  summary: {
    totalWithCve: number;
    kevListedCount: number;
    epssHighRiskCount: number;
    avgCvss: number | null;
    avgEpss: number | null;
  };
  topCves: TopCve[];
  kevFindings: FindingRow[];
  epssHighRisk: FindingRow[];
  cvssDistribution: Record<string, number>;
}

const SEV: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  LOW:      'bg-blue-100 text-blue-700',
  INFO:     'bg-gray-100 text-gray-500',
};

function CvssBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.min((score / 10) * 100, 100);
  const color = score >= 9 ? 'bg-red-500' : score >= 7 ? 'bg-orange-400' : score >= 4 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-gray-100">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold">{score.toFixed(1)}</span>
    </div>
  );
}

function EpssChip({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.round(score * 100);
  const color = pct >= 50 ? 'text-red-700 bg-red-100' : pct >= 20 ? 'text-orange-700 bg-orange-100' : 'text-gray-600 bg-gray-100';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{pct}%</span>;
}

type Tab = 'top-cves' | 'kev' | 'epss';

export default function CveIntelligencePage() {
  const [data, setData] = useState<CveIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('top-cves');

  useEffect(() => {
    apiClient.get<CveIntelligence>('/dashboard/cve-intelligence')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4 p-6">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );

  if (!data) return <div className="p-6 text-muted-foreground">Failed to load CVE intelligence.</div>;

  const { summary, topCves, kevFindings, epssHighRisk, cvssDistribution } = data;

  // CVSS distribution chart
  const distBuckets = [
    { label: 'Critical (9–10)', key: 'critical', color: 'bg-red-500' },
    { label: 'High (7–9)',      key: 'high',     color: 'bg-orange-400' },
    { label: 'Medium (4–7)',    key: 'medium',   color: 'bg-yellow-400' },
    { label: 'Low (0–4)',       key: 'low',      color: 'bg-green-400' },
    { label: 'Unknown',         key: 'unknown',  color: 'bg-gray-300' },
  ];
  const totalDist = distBuckets.reduce((s, b) => s + (cvssDistribution[b.key] ?? 0), 0);

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-red-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CVE Intelligence</h1>
          <p className="text-sm text-gray-400">Vulnerability exposure analysis — CVSS, EPSS exploitation probability, and CISA KEV listings.</p>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Findings with CVE',  value: summary.totalWithCve,    icon: <AlertTriangle className="h-5 w-5" />, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' },
          { label: 'KEV Listed',          value: summary.kevListedCount,  icon: <ShieldAlert className="h-5 w-5" />,  color: 'text-red-700',  bg: 'bg-red-50',  border: 'border-red-200' },
          { label: 'EPSS > 50%',          value: summary.epssHighRiskCount, icon: <Zap className="h-5 w-5" />,       color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
          { label: 'Avg CVSS',            value: summary.avgCvss?.toFixed(1) ?? '—', icon: <TrendingUp className="h-5 w-5" />, color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
          { label: 'Avg EPSS',            value: summary.avgEpss !== null ? `${Math.round((summary.avgEpss ?? 0) * 100)}%` : '—', icon: <TrendingUp className="h-5 w-5" />, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
        ].map(({ label, value, icon, color, bg, border }) => (
          <div key={label} className={`rounded-xl border p-4 ${bg} ${border}`}>
            <div className={`flex items-center gap-1.5 ${color} mb-1`}>{icon}<span className="text-xs font-medium">{label}</span></div>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* CVSS Distribution bar */}
      {totalDist > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-gray-700">CVSS Score Distribution</p>
          <div className="flex h-4 w-full overflow-hidden rounded-full">
            {distBuckets.map((b) => {
              const count = cvssDistribution[b.key] ?? 0;
              if (count === 0) return null;
              return (
                <div
                  key={b.key}
                  className={`${b.color} transition-all`}
                  style={{ width: `${(count / totalDist) * 100}%` }}
                  title={`${b.label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {distBuckets.map((b) => (
              <div key={b.key} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${b.color}`} />
                {b.label}: <span className="font-semibold text-gray-700">{cvssDistribution[b.key] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-gray-100">
        {([
          { key: 'top-cves', label: `Top CVEs (${topCves.length})` },
          { key: 'kev',      label: `KEV Listed (${kevFindings.length})` },
          { key: 'epss',     label: `High EPSS (${epssHighRisk.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'top-cves' && (
        topCves.length === 0
          ? <p className="py-16 text-center text-sm text-gray-400">No CVE data available yet. Run scans with CVE enrichment enabled.</p>
          : <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3">CVE ID</th>
                    <th className="px-4 py-3">Max CVSS</th>
                    <th className="px-4 py-3">Max EPSS</th>
                    <th className="px-4 py-3">Findings</th>
                    <th className="px-4 py-3">Severities</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topCves.map((cve) => (
                    <tr key={cve.cveId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-indigo-600">
                        <a
                          href={`https://nvd.nist.gov/vuln/detail/${cve.cveId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {cve.cveId}
                        </a>
                      </td>
                      <td className="px-4 py-3"><CvssBar score={cve.maxCvss} /></td>
                      <td className="px-4 py-3"><EpssChip score={cve.maxEpss} /></td>
                      <td className="px-4 py-3 font-semibold text-gray-700">{cve.findingCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {cve.severities.map((s) => (
                            <span key={s} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SEV[s] ?? 'bg-gray-100 text-gray-500'}`}>{s}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {tab === 'kev' && (
        kevFindings.length === 0
          ? <p className="py-16 text-center text-sm text-gray-400">No CISA KEV-listed vulnerabilities found in open findings.</p>
          : <div className="space-y-2">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <strong>CISA Known Exploited Vulnerabilities (KEV):</strong> These CVEs have confirmed active exploitation in the wild. CISA mandates federal agencies remediate KEV findings within 2 weeks (critical) or 6 months (others).
              </div>
              {kevFindings.map((f) => (
                <FindingCard key={f.id} finding={f} showEpss={false} />
              ))}
            </div>
      )}

      {tab === 'epss' && (
        epssHighRisk.length === 0
          ? <p className="py-16 text-center text-sm text-gray-400">No findings with EPSS ≥ 50% exploitation probability.</p>
          : <div className="space-y-2">
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                <strong>EPSS (Exploit Prediction Scoring System):</strong> Probability that this CVE will be exploited in the next 30 days. Findings shown here have ≥ 50% exploitation probability.
              </div>
              {epssHighRisk.map((f) => (
                <FindingCard key={f.id} finding={f} showEpss />
              ))}
            </div>
      )}
    </div>
  );
}

function FindingCard({ finding, showEpss }: { finding: FindingRow; showEpss: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <span className={`mt-0.5 shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SEV[finding.severity] ?? 'bg-gray-100 text-gray-500'}`}>
        {finding.severity}
      </span>
      <div className="flex-1 min-w-0">
        {finding.projectId ? (
          <Link href={`/projects/${finding.projectId}/findings/${finding.id}`} className="block truncate text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors">
            {finding.title}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium text-gray-900">{finding.title}</p>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {finding.projectName && <Badge variant="outline" className="text-xs">{finding.projectName}</Badge>}
          {finding.cveIds.slice(0, 3).map((c) => (
            <span key={c} className="font-mono text-xs text-indigo-500">{c}</span>
          ))}
          {finding.cveIds.length > 3 && <span className="text-xs text-gray-400">+{finding.cveIds.length - 3} more</span>}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <CvssBar score={finding.cvssScore} />
        {showEpss && <EpssChip score={finding.epssScore} />}
      </div>
    </div>
  );
}
