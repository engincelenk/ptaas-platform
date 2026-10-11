'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { TrendChart } from '@/components/monitoring/trend-chart';
import { ComplianceDashboard } from '@/components/compliance/compliance-dashboard';
import { AiStrategyDialog } from '@/components/strategy/ai-strategy-dialog';
import { ExecutiveReportDialog } from '@/components/reports/executive-report-dialog';
import { HealthBadge } from '@/components/targets/health-badge';
import { ShareDialog } from '@/components/share/share-dialog';
import { ImportFindingsDialog } from '@/components/findings/import-dialog';
import { trackVisit } from '@/components/search/global-search';
import { toast } from 'sonner';

function ClientPortalButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const { token } = await apiClient.post<{ token: string; expiresAt: string }>(
        `/projects/${projectId}/portal-token`,
        {},
      );
      const url = `${window.location.origin}/portal/${token}`;
      setPortalUrl(url);
      await navigator.clipboard.writeText(url);
      toast.success('Client portal link copied to clipboard');
    } catch {
      toast.error('Failed to generate portal link');
    } finally {
      setLoading(false);
    }
  };

  if (portalUrl) {
    return (
      <button
        onClick={() => { void navigator.clipboard.writeText(portalUrl); toast.success('Copied!'); }}
        className="rounded-md border border-teal-300 bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
        title={portalUrl}
      >
        <span className="text-xs">🔗</span>
        Copy Portal Link
      </button>
    );
  }

  return (
    <button
      onClick={generate}
      disabled={loading}
      className="rounded-md border border-teal-300 bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
    >
      <span className="text-xs">🌐</span>
      {loading ? 'Generating…' : 'Client Portal'}
    </button>
  );
}

interface WeekBucket {
  week: string;
  CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; INFO: number; total: number;
}
interface TrendData {
  weeks: WeekBucket[];
  totalNew: number;
  totalResolved: number;
  openByseverity: Record<string, number>;
}

function useToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    // apiClient stores token in memory — fall back to localStorage for download links
    setToken(localStorage.getItem('ptaas_access_token'));
  }, []);
  return token;
}

type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

interface Target {
  id: string;
  type: string;
  value: string;
  verificationStatus: VerificationStatus;
  verificationMethod: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  targets: Target[];
  createdAt: string;
}

const STATUS_STYLES: Record<VerificationStatus, string> = {
  VERIFIED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PENDING:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  FAILED:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const token = useToken();
  const [project, setProject] = useState<Project | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [execReportOpen, setExecReportOpen] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, { isUp: boolean; statusCode?: number | null; responseTimeMs?: number | null }>>({});
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';

  useEffect(() => {
    Promise.all([
      apiClient.get<Project>(`/projects/${projectId}`),
      apiClient.get<TrendData>(`/projects/${projectId}/trends`).catch(() => null),
    ])
      .then(([proj, trendData]) => {
        setProject(proj);
        setTrends(trendData);
        trackVisit({ href: `/projects/${projectId}`, label: proj.name, sub: 'Project', type: 'project' });
        // Load health status for each WEB target
        const webTargets = proj.targets.filter((t) => t.type === 'WEB');
        Promise.all(
          webTargets.map((t) =>
            apiClient.get<{ isUp: boolean; statusCode?: number | null; responseTimeMs?: number | null } | null>(
              `/projects/${projectId}/targets/${t.id}/health/latest`,
            ).catch(() => null).then((h) => ({ id: t.id, health: h })),
          ),
        ).then((results) => {
          const map: typeof healthMap = {};
          for (const r of results) if (r.health) map[r.id] = r.health;
          setHealthMap(map);
        });
      })
      .catch(() => setError('Project not found'))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleArchive() {
    if (!confirm('Archive this project? It will be hidden from the dashboard.')) return;
    await apiClient.delete(`/projects/${projectId}`);
    router.push('/dashboard');
  }

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-muted rounded" /><div className="h-64 bg-muted rounded-xl" /></div>;
  if (error || !project) return <p className="text-destructive">{error || 'Not found'}</p>;

  const verifiedCount = project.targets.filter((t) => t.verificationStatus === 'VERIFIED').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold mt-2">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Report
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>
          <button
            onClick={handleArchive}
            className="text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            Archive
          </button>
        </div>
      </div>

      {shareOpen && (
        <ShareDialog
          projectId={projectId}
          projectName={project.name}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

      {importOpen && (
        <ImportFindingsDialog
          projectId={projectId}
          targets={project.targets ?? []}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); router.refresh(); }}
        />
      )}

      {execReportOpen && (
        <ExecutiveReportDialog
          projectId={projectId}
          projectName={project.name}
          onClose={() => setExecReportOpen(false)}
        />
      )}

      {/* Quick nav + Report exports */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex gap-2 items-center overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <Link
            href={`/projects/${projectId}/scans`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            Scans
          </Link>
          <Link
            href={`/projects/${projectId}/findings`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            Findings
          </Link>
          <Link
            href={`/projects/${projectId}/assets`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            Attack Surface
          </Link>
          <Link
            href={`/projects/${projectId}/attack-paths`}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1.5"
          >
            <span className="text-xs">⛓</span>
            Attack Paths
          </Link>
          <Link
            href={`/projects/${projectId}/reports`}
            className="rounded-md border border-indigo-200 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">📄</span>
            Reports
          </Link>
          <Link
            href={`/projects/${projectId}/activity`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">📋</span>
            Activity
          </Link>
          <Link
            href={`/projects/${projectId}/schedules`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">🕐</span>
            Schedules
          </Link>
          <Link
            href={`/projects/${projectId}/report-builder`}
            className="rounded-md border border-indigo-300 bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">🛠️</span>
            Report Builder
          </Link>
          <button
            onClick={() => setExecReportOpen(true)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">📊</span>
            Executive PDF
          </button>
          <ClientPortalButton projectId={projectId} />
          <Link
            href={`/projects/${projectId}/engagement`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">📄</span>
            Engagement
          </Link>
          <Link
            href={`/projects/${projectId}/sla`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">⏱️</span>
            SLA
          </Link>
          <Link
            href={`/projects/${projectId}/compliance`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">📋</span>
            Compliance
          </Link>
          <Link
            href={`/projects/${projectId}/checklist`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">✅</span>
            Checklist
          </Link>
          <Link
            href={`/projects/${projectId}/scope`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">🎯</span>
            Scope
          </Link>
          <Link
            href={`/projects/${projectId}/risk-acceptances`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">🛡️</span>
            Risk
          </Link>
          <Link
            href={`/projects/${projectId}/share`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-xs">🔗</span>
            Share
          </Link>
          <AiStrategyDialog projectId={projectId} />
        </div>

        {/* Report download buttons — use ?token= auth because these are file downloads */}
        {token && (
          <div className="flex gap-2">
            <a
              href={`${apiBase}/api/v1/projects/${projectId}/reports/executive.pdf?token=${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 012-2h8l4 4v10a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              </svg>
              Executive PDF
            </a>
            <a
              href={`${apiBase}/api/v1/projects/${projectId}/reports/technical.pdf?token=${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 012-2h8l4 4v10a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              </svg>
              Technical PDF
            </a>
            <a
              href={`${apiBase}/api/v1/projects/${projectId}/reports/scorecard.pdf?token=${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-800 px-3 py-1.5 text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-medium"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 012-2h8l4 4v10a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              </svg>
              Score Card
            </a>
            {/* Compliance PDF dropdown */}
            <div className="relative group">
              <button className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 px-3 py-1.5 text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Compliance
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              <div className="absolute right-0 mt-1 w-44 bg-background border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 p-1">
                {(['ISO27001', 'OWASP', 'SOC2'] as const).map((fw) => (
                  <a
                    key={fw}
                    href={`${apiBase}/api/v1/projects/${projectId}/reports/compliance.pdf?framework=${fw}&token=${token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                  >
                    <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 w-16">{fw}</span>
                    <span className="text-muted-foreground text-xs">{fw === 'ISO27001' ? 'ISO 27001' : fw === 'OWASP' ? 'OWASP Top 10' : 'SOC 2 Type II'}</span>
                  </a>
                ))}
              </div>
            </div>

            <a
              href={`${apiBase}/api/v1/projects/${projectId}/reports/findings.json?token=${token}`}
              download
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              JSON Export
            </a>
            <a
              href={`${apiBase}/api/v1/projects/${projectId}/sdk/typescript`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-1.5"
              onClick={(e) => {
                e.preventDefault();
                const t = localStorage.getItem('ptaas_access_token') ?? '';
                fetch(`${apiBase}/api/v1/projects/${projectId}/sdk/typescript`, {
                  headers: { Authorization: `Bearer ${t}` },
                }).then((r) => r.blob()).then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `ptaas-sdk-${projectId}.ts`; a.click();
                  URL.revokeObjectURL(url);
                });
              }}
            >
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              TS SDK
            </a>
          </div>
        )}
      </div>

      {/* Trend Chart */}
      {trends && trends.weeks.some((w) => w.total > 0) && (
        <section className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Finding Trends (12 weeks)</h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-green-600 dark:text-green-400">↓ {trends.totalResolved} resolved</span>
              <span className="text-red-600 dark:text-red-400">↑ {trends.totalNew} new</span>
            </div>
          </div>
          <TrendChart weeks={trends.weeks} />
          <div className="grid grid-cols-5 gap-2 overflow-x-auto">
            {(['CRITICAL','HIGH','MEDIUM','LOW','INFO'] as const).map((s) => (
              <div key={s} className="text-center min-w-0">
                <p className="text-lg font-semibold">{trends.openByseverity[s] ?? 0}</p>
                <p className="text-xs text-muted-foreground truncate">{s}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Compliance */}
      <section className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium mb-4">OWASP Top 10 Compliance</h2>
        <ComplianceDashboard projectId={projectId} />
      </section>

      {/* Targets */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium">Targets</h2>
            <p className="text-sm text-muted-foreground">
              {verifiedCount}/{project.targets.length} verified
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/targets/new`}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Add Target
          </Link>
        </div>

        {project.targets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="font-medium">No targets yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Add a domain, IP, or URL to start scanning.
            </p>
            <Link
              href={`/projects/${projectId}/targets/new`}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Add first target
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Target</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Health</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Method</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {project.targets.map((target) => (
                  <tr key={target.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{target.value}</td>
                    <td className="px-4 py-3 text-muted-foreground">{target.type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[target.verificationStatus]}`}>
                        {target.verificationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {target.type === 'WEB'
                        ? <HealthBadge status={healthMap[target.id] ?? null} />
                        : <span className="text-xs text-muted-foreground">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {target.verificationMethod ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/projects/${projectId}/targets/${target.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        {target.verificationStatus === 'VERIFIED' ? 'Details' : 'Verify →'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
