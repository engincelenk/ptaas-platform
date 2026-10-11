'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ShieldX, ShieldAlert, HelpCircle, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Project {
  id: string;
  name: string;
}

interface ComplianceReport {
  projectId: string;
  score: number;
  categories: Array<{
    category: { id: string; name: string };
    status: 'COMPLIANT' | 'WARNING' | 'CRITICAL' | 'UNCHECKED';
    openCount: number;
  }>;
}

interface ProjectCompliance {
  project: Project;
  report: ComplianceReport | null;
  loading: boolean;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
    : score >= 50 ? 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400'
    : 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
  return (
    <span className={`text-lg font-bold px-3 py-1 rounded-full ${color}`}>{score}%</span>
  );
}

const STATUS_ICONS = {
  COMPLIANT: <ShieldCheck className="h-3.5 w-3.5 text-green-500" />,
  WARNING: <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />,
  CRITICAL: <ShieldX className="h-3.5 w-3.5 text-red-500" />,
  UNCHECKED: <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />,
};

function CategoryGrid({ categories }: { categories: ComplianceReport['categories'] }) {
  return (
    <div className="grid grid-cols-5 gap-1 mt-3">
      {categories.map((c) => (
        <div key={c.category.id} title={`${c.category.id}: ${c.category.name}`}
          className="flex flex-col items-center gap-0.5">
          {STATUS_ICONS[c.status]}
          <span className="text-[10px] text-muted-foreground font-mono">{c.category.id}</span>
        </div>
      ))}
    </div>
  );
}

export default function ComplianceDashboardPage() {
  const [items, setItems] = useState<ProjectCompliance[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    apiClient.get<Project[]>('/projects')
      .then((projects) => {
        setItems(projects.map((p) => ({ project: p, report: null, loading: true })));
        setLoadingProjects(false);

        // Fetch compliance for each project in parallel
        projects.forEach((p) => {
          apiClient.get<ComplianceReport>(`/projects/${p.id}/compliance`)
            .then((report) => {
              setItems((prev) =>
                prev.map((item) => item.project.id === p.id ? { ...item, report, loading: false } : item),
              );
            })
            .catch(() => {
              setItems((prev) =>
                prev.map((item) => item.project.id === p.id ? { ...item, loading: false } : item),
              );
            });
        });
      })
      .catch(() => setLoadingProjects(false));
  }, []);

  const loaded = items.filter((i) => !i.loading && i.report);
  const avgScore = loaded.length > 0
    ? Math.round(loaded.reduce((sum, i) => sum + (i.report?.score ?? 0), 0) / loaded.length)
    : null;

  const critical = items.filter((i) =>
    i.report?.categories.some((c) => c.status === 'CRITICAL'),
  ).length;

  if (loadingProjects) {
    return <div className="p-8 text-muted-foreground">Loading compliance data…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compliance Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          OWASP Top 10 compliance status across all projects.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Org Average Score</p>
          <div className="mt-2">
            {avgScore !== null
              ? <ScoreBadge score={avgScore} />
              : <span className="text-muted-foreground text-sm">Calculating…</span>
            }
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Projects with CRITICAL</p>
          <p className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">{critical}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Projects</p>
          <p className="mt-2 text-2xl font-bold">{items.length}</p>
        </div>
      </div>

      {/* Per-project cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map(({ project, report, loading }) => (
          <div key={project.id} className="rounded-xl border p-4 space-y-2 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{project.name}</p>
                {report && <ScoreBadge score={report.score} />}
                {loading && <span className="text-xs text-muted-foreground">Analyzing…</span>}
                {!loading && !report && <span className="text-xs text-muted-foreground">No data</span>}
              </div>
              <Link
                href={`/projects/${project.id}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {report && <CategoryGrid categories={report.categories} />}

            {report && (
              <div className="flex gap-3 text-xs text-muted-foreground pt-1">
                {(['CRITICAL', 'WARNING', 'COMPLIANT', 'UNCHECKED'] as const).map((s) => {
                  const count = report.categories.filter((c) => c.status === s).length;
                  if (count === 0) return null;
                  return (
                    <span key={s} className="flex items-center gap-1">
                      {STATUS_ICONS[s]}
                      {count}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
