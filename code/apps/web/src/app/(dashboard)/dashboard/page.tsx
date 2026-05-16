'use client';

import Link from 'next/link';
import { Loader2, ShieldAlert, FolderOpen, Activity, CheckCircle } from 'lucide-react';
import { useApiAuth } from '@/hooks/use-api-auth';
import { useDashboardStats } from '@/hooks/use-dashboard';
import { useProjects } from '@/hooks/use-projects';
import { severityColors } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  useApiAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: projects, isLoading: projectsLoading } = useProjects();

  const recentProjects = projects?.slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          href="/projects"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          + Neuer Scan
        </Link>
      </div>

      {statsLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Lade Statistiken...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="CRITICAL"
            value={stats?.critical ?? 0}
            className={severityColors['CRITICAL']}
            icon={<ShieldAlert className="h-4 w-4" />}
            href="/findings?severity=CRITICAL"
          />
          <StatCard
            label="HIGH"
            value={stats?.high ?? 0}
            className={severityColors['HIGH']}
            icon={<ShieldAlert className="h-4 w-4" />}
            href="/findings?severity=HIGH"
          />
          <StatCard
            label="MEDIUM"
            value={stats?.medium ?? 0}
            className={severityColors['MEDIUM']}
            icon={<ShieldAlert className="h-4 w-4" />}
            href="/findings?severity=MEDIUM"
          />
          <StatCard
            label="OPEN"
            value={stats?.openFindings ?? 0}
            className="text-blue-400 bg-blue-500/10"
            icon={<Activity className="h-4 w-4" />}
            href="/findings"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-medium">Aktive Projekte</h2>
            <Link href="/projects" className="text-xs text-primary hover:opacity-70">
              Alle ansehen →
            </Link>
          </div>

          {projectsLoading ? (
            <div className="flex items-center gap-2 p-5 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Lade...</span>
            </div>
          ) : !recentProjects || recentProjects.length === 0 ? (
            <div className="p-5 text-center">
              <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">Noch keine Projekte</p>
              <Link
                href="/projects"
                className="mt-2 inline-block text-xs text-primary hover:opacity-70"
              >
                Jetzt erstellen →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-accent transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{project.targets[0]}</p>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span>{project._count?.scans ?? 0} Scans</span>
                    {(project._count?.findings ?? 0) > 0 && (
                      <span className={cn('font-medium', severityColors['HIGH'])}>
                        {project._count?.findings} Findings
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-medium">Übersicht</h2>
          </div>
          <div className="p-5 space-y-4">
            <OverviewItem
              icon={<FolderOpen className="h-4 w-4 text-primary" />}
              label="Projekte gesamt"
              value={stats?.totalProjects ?? projects?.length ?? 0}
              loading={statsLoading}
            />
            <OverviewItem
              icon={<Activity className="h-4 w-4 text-yellow-400" />}
              label="Aktive Scans"
              value={stats?.activeScans ?? 0}
              loading={statsLoading}
            />
            <OverviewItem
              icon={<CheckCircle className="h-4 w-4 text-green-400" />}
              label="Behobene Findings"
              value={stats?.resolvedFindings ?? 0}
              loading={statsLoading}
            />
            <OverviewItem
              icon={<ShieldAlert className="h-4 w-4 text-orange-400" />}
              label="Offene Findings"
              value={stats?.openFindings ?? 0}
              loading={statsLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  className,
  icon,
  href,
}: {
  label: string;
  value: number;
  className: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card p-4 hover:border-primary/50 transition-colors"
    >
      <div className={cn('flex items-center gap-2 text-xs font-medium', className)}>
        {icon}
        {label}
      </div>
      <p className={cn('mt-2 text-3xl font-bold', className)}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">Findings</p>
    </Link>
  );
}

function OverviewItem({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (
        <span className="text-sm font-semibold">{value}</span>
      )}
    </div>
  );
}
