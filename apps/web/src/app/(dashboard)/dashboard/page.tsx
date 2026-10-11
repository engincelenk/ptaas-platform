'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { OrgTrendChart } from '@/components/dashboard/org-trend-chart';
import { OwaspHeatmap } from '@/components/dashboard/owasp-heatmap';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ShieldAlert, TrendingUp, CheckCircle2 } from 'lucide-react';
import { GettingStartedChecklist } from '@/components/onboarding/getting-started-checklist';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  _count: { targets: number };
}

interface Kpis {
  openFindings: number;
  criticalCount: number;
  highCount: number;
  verifiedCount: number;
  avgRiskScore: number | null;
}

interface TrendPoint { week: string; newFindings: number; resolvedFindings: number; }
interface TopProject { id: string; name: string; openCount: number; criticalCount: number; riskScore: number; }
interface OwaspEntry { owasp: string; count: number; }
interface SlaItem { id: string; title: string; severity: string; daysOpen: number; projectId: string | null; }
interface SlaBreaches { criticalBreachCount: number; highBreachCount: number; items: SlaItem[]; }

interface ExecutiveDashboard {
  kpis: Kpis;
  trend: TrendPoint[];
  topProjects: TopProject[];
  owaspDistribution: OwaspEntry[];
  slaBreaches: SlaBreaches;
}

function riskColor(score: number) {
  if (score >= 75) return 'text-red-600';
  if (score >= 50) return 'text-orange-600';
  if (score >= 25) return 'text-yellow-600';
  return 'text-green-600';
}

function riskBar(score: number) {
  const color = score >= 75 ? 'bg-red-500' : score >= 50 ? 'bg-orange-400' : score >= 25 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className="w-20 h-1.5 bg-muted rounded overflow-hidden">
      <div className={`h-full rounded ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [exec, setExec] = useState<ExecutiveDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [cisoView, setCisoView] = useState(false);

  const [expiringCount, setExpiringCount] = useState(0);
  const [slaSummary, setSlaSummary] = useState<{ breached: number; atRisk: number; total: number } | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get<Project[]>('/projects'),
      apiClient.get<ExecutiveDashboard>('/dashboard/executive').catch(() => null),
      apiClient.get<any[]>('/dashboard/risk-acceptances/expiring').catch(() => []),
      apiClient.get<{ breached: number; atRisk: number; total: number }>('/dashboard/sla-summary').catch(() => null),
    ])
      .then(([projs, execData, expiring, sla]) => {
        setProjects(projs);
        setExec(execData);
        setExpiringCount(expiring?.length ?? 0);
        setSlaSummary(sla);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;

  const { kpis, trend, topProjects, owaspDistribution, slaBreaches } = exec ?? {
    kpis: { openFindings: 0, criticalCount: 0, highCount: 0, verifiedCount: 0, avgRiskScore: null },
    trend: [],
    topProjects: [],
    owaspDistribution: [],
    slaBreaches: { criticalBreachCount: 0, highBreachCount: 0, items: [] },
  };

  const totalBreaches = (slaBreaches?.criticalBreachCount ?? 0) + (slaBreaches?.highBreachCount ?? 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Security posture overview · {projects.length} active project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/cve"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1.5"
          >
            <ShieldAlert className="h-4 w-4" />
            CVE Intel
          </Link>
          <Link
            href="/dashboard/analytics"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <TrendingUp className="h-4 w-4" />
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => setCisoView((v) => !v)}
            aria-pressed={cisoView}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${cisoView ? 'bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-950/40 dark:border-violet-700 dark:text-violet-300' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            CISO View
          </button>
          <Link
            href="/projects/new"
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New Project
          </Link>
        </div>
      </div>

      {/* Getting Started Checklist */}
      <GettingStartedChecklist />

      {/* Critical findings without owner action banner (wireframe: 02-dashboard-scan) */}
      {kpis.criticalCount > 0 && slaBreaches.items.some((i) => i.severity === 'CRITICAL') && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 px-5 py-4"
        >
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
              {kpis.criticalCount} Critical Finding{kpis.criticalCount !== 1 ? 's' : ''} erfordern deine Entscheidung
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
              Mindestens {slaBreaches.criticalBreachCount} davon haben die SLA-Frist überschritten — Owner zuweisen oder Risiko akzeptieren.
            </p>
          </div>
          <Link
            href="/dashboard/retests"
            className="shrink-0 rounded-lg border border-orange-300 bg-white dark:bg-orange-950 px-3 py-1.5 text-xs font-medium text-orange-700 dark:text-orange-300 hover:bg-orange-100 transition-colors"
          >
            Jetzt ansehen
          </Link>
        </div>
      )}

      {/* CISO AI Briefing */}
      {cisoView && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧠</span>
            <h2 className="text-sm font-semibold text-violet-900 dark:text-violet-200">CISO AI-Briefing</h2>
            <span className="ml-auto text-xs text-violet-500">powered by AI</span>
          </div>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-white/70 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-800 p-3">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-1">Risikolage</p>
              <p className="text-muted-foreground">
                {kpis.criticalCount > 0
                  ? `${kpis.criticalCount} kritische Findings offen. Sofortiger Handlungsbedarf.`
                  : 'Keine kritischen Findings offen. Lage stabil.'}
              </p>
            </div>
            <div className="rounded-lg bg-white/70 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-800 p-3">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-1">Was erfordert deine Entscheidung?</p>
              <p className="text-muted-foreground">
                {slaBreaches.items.length > 0
                  ? `${slaBreaches.items.length} Findings ohne Owner · ${slaBreaches.criticalBreachCount} SLA-Überschreitung${slaBreaches.criticalBreachCount !== 1 ? 'en' : ''}`
                  : 'Keine offenen Entscheidungen.'}
              </p>
            </div>
            <div className="rounded-lg bg-white/70 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-800 p-3">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-1">Security-Score</p>
              <p className={`text-2xl font-bold ${kpis.avgRiskScore != null ? riskColor(kpis.avgRiskScore) : 'text-muted-foreground'}`}>
                {kpis.avgRiskScore != null ? `${Math.round(kpis.avgRiskScore)}/100` : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Open Findings"  value={kpis.openFindings}   color={kpis.openFindings > 0 ? 'orange' : 'green'} />
        <KpiCard label="Critical"       value={kpis.criticalCount}  color={kpis.criticalCount > 0 ? 'red' : 'green'}   sub="open" />
        <KpiCard label="High"           value={kpis.highCount}      color={kpis.highCount > 0 ? 'orange' : 'green'}    sub="open" />
        <KpiCard label="Verified Fixed" value={kpis.verifiedCount}  color="green" />
        <KpiCard label="Avg Risk Score" value={kpis.avgRiskScore != null ? `${kpis.avgRiskScore}/100` : '—'} color={kpis.avgRiskScore != null && kpis.avgRiskScore >= 50 ? 'red' : 'blue'} />
      </div>

      {/* SLA Breach Banner */}
      {totalBreaches > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-400">
              {totalBreaches} SLA breach{totalBreaches !== 1 ? 'es' : ''} detected
            </p>
            <p className="text-xs text-red-700 dark:text-red-500 mt-0.5">
              {slaBreaches.criticalBreachCount > 0 && `${slaBreaches.criticalBreachCount} Critical open >7 days`}
              {slaBreaches.criticalBreachCount > 0 && slaBreaches.highBreachCount > 0 && ' · '}
              {slaBreaches.highBreachCount > 0 && `${slaBreaches.highBreachCount} High open >30 days`}
            </p>
          </div>
          <div className="space-y-1 min-w-0 max-w-xs">
            {slaBreaches.items.slice(0, 3).map((item) => (
              <Link
                key={item.id}
                href={item.projectId ? `/projects/${item.projectId}/findings/${item.id}` : '#'}
                className="block text-xs truncate text-red-700 dark:text-red-400 hover:underline"
              >
                {item.daysOpen}d — {item.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Trend + OWASP */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-xl border p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Finding Trend (12 weeks)
          </h2>
          {trend.length > 0 ? (
            <OrgTrendChart data={trend} />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No trend data yet</p>
          )}
        </section>

        <section className="rounded-xl border p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            OWASP Top 10 Distribution
          </h2>
          <OwaspHeatmap data={owaspDistribution} />
        </section>
      </div>

      {/* Risk Acceptances expiring widget */}
      {expiringCount > 0 && (
        <Link
          href="/dashboard/retests"
          className="flex items-center gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-3.5 hover:bg-yellow-100 transition-colors"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 text-yellow-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-800">
              {expiringCount} risk acceptance{expiringCount !== 1 ? 's' : ''} expiring within 30 days
            </p>
            <p className="text-xs text-yellow-600">Review and renew or re-open findings before they expire automatically.</p>
          </div>
          <span className="shrink-0 text-xs text-yellow-500">Review →</span>
        </Link>
      )}

      {/* SLA summary widget */}
      {slaSummary && slaSummary.breached > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3.5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              {slaSummary.breached} finding{slaSummary.breached !== 1 ? 's' : ''} have breached their SLA deadline
              {slaSummary.atRisk > 0 && `, ${slaSummary.atRisk} more at risk`}
            </p>
            <p className="text-xs text-red-600">Go to the project SLA view to review deadlines and assign remediation owners.</p>
          </div>
        </div>
      )}
      {slaSummary && slaSummary.breached === 0 && slaSummary.atRisk > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-3.5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-800">
              {slaSummary.atRisk} finding{slaSummary.atRisk !== 1 ? 's are' : ' is'} at risk of breaching SLA
            </p>
            <p className="text-xs text-yellow-600">Review and remediate before the deadline.</p>
          </div>
        </div>
      )}

      {/* Top Projects */}
      {topProjects.length > 0 && (
        <section className="rounded-xl border p-5 space-y-3">
          <h2 className="text-sm font-semibold">Top Projects by Risk</h2>
          <div className="space-y-2">
            {topProjects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-4 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.openCount} open</span>
                {p.criticalCount > 0 && (
                  <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded">
                    {p.criticalCount} CRIT
                  </span>
                )}
                {riskBar(p.riskScore)}
                <span className={`text-sm font-semibold w-8 text-right ${riskColor(p.riskScore)}`}>
                  {p.riskScore}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Projects Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">All Projects</h2>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <p className="font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first project to start scanning.</p>
            <Link href="/projects/new" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
              Create project
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group rounded-xl border bg-card p-5 hover:border-ring transition-colors"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-medium group-hover:text-primary transition-colors">{p.name}</h3>
                  <span className="text-xs text-muted-foreground bg-muted rounded px-2 py-0.5">
                    {p._count.targets} targets
                  </span>
                </div>
                {p.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{p.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  Created {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted" />)}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-56 rounded-xl bg-muted" />
        <div className="h-56 rounded-xl bg-muted" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted" />)}
      </div>
    </div>
  );
}
