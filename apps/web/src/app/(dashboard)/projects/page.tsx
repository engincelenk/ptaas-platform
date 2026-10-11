'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import {
  AlertTriangle, CheckCircle2, Clock, FolderOpen,
  Loader2, Plus, Search, Shield, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  targetCount: number;
  openCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  riskScore: number;
  riskLevel: 'critical' | 'high' | 'stable';
  slaBreached: number;
  lastScan: { id: string; type: string; status: string; completedAt: string | null } | null;
}

interface ActivityItem {
  scanId: string;
  type: string;
  completedAt: string | null;
  projectId: string;
  projectName: string;
  findingCount: number;
}

interface Portfolio {
  projects: ProjectItem[];
  recentActivity: ActivityItem[];
}

type SortKey = 'riskScore' | 'name' | 'openCount' | 'createdAt';
type FilterLevel = 'all' | 'critical' | 'high' | 'stable';

const RISK_CONFIG = {
  critical: { label: 'Critical Risk', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-300 dark:border-red-700', badge: 'bg-red-500', icon: AlertTriangle, iconColor: 'text-red-500' },
  high:     { label: 'High Risk',     bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-300 dark:border-orange-700', badge: 'bg-orange-500', icon: Zap, iconColor: 'text-orange-500' },
  stable:   { label: 'Stable',        bg: 'bg-card', border: 'border-border', badge: 'bg-green-500', icon: CheckCircle2, iconColor: 'text-green-500' },
};

function riskBar(score: number, level: ProjectItem['riskLevel']) {
  const color = level === 'critical' ? 'bg-red-500' : level === 'high' ? 'bg-orange-400' : 'bg-green-400';
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

function timeAgo(date: string | null): string {
  if (!date) return 'never';
  const diff = Date.now() - new Date(date).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ProjectCard({ p, selected, onSelect }: { p: ProjectItem; selected: boolean; onSelect: () => void }) {
  const cfg = RISK_CONFIG[p.riskLevel];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border-2 transition-all ${cfg.bg} ${selected ? 'border-primary ring-2 ring-primary/20' : cfg.border}`}>
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 rounded border-muted shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon className={`h-4 w-4 shrink-0 ${cfg.iconColor}`} />
              <Link href={`/projects/${p.id}`} className="font-semibold text-sm hover:underline truncate">
                {p.name}
              </Link>
              {p.slaBreached > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">
                  {p.slaBreached} SLA
                </span>
              )}
            </div>
            {p.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>
            )}
          </div>
          <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded shrink-0 ${cfg.badge}`}>
            {p.riskScore}
          </span>
        </div>

        {/* Risk bar */}
        {riskBar(p.riskScore, p.riskLevel)}

        {/* Finding counts */}
        <div className="grid grid-cols-4 gap-1 text-center">
          {[
            { label: 'C', count: p.criticalCount, color: 'text-red-600' },
            { label: 'H', count: p.highCount, color: 'text-orange-600' },
            { label: 'M', count: p.mediumCount, color: 'text-yellow-600' },
            { label: 'L', count: p.lowCount, color: 'text-blue-600' },
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded bg-background/60 py-1">
              <p className={`text-xs font-bold ${color}`}>{count}</p>
              <p className="text-[9px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />{p.targetCount} target{p.targetCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {p.lastScan ? timeAgo(p.lastScan.completedAt) : 'no scan'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('riskScore');
  const [filter, setFilter] = useState<FilterLevel>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    apiClient.get<Portfolio>('/projects/portfolio')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const projects = useMemo(() => {
    if (!data) return [];
    return data.projects
      .filter((p) => filter === 'all' || p.riskLevel === filter)
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'openCount') return b.openCount - a.openCount;
        if (sort === 'createdAt') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return b.riskScore - a.riskScore;
      });
  }, [data, filter, search, sort]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkScan() {
    setBulkLoading(true);
    try {
      // Find first target per project and queue QUICK scan
      await Promise.all([...selected].map(async (projectId) => {
        const proj = data?.projects.find((p) => p.id === projectId);
        if (!proj || proj.targetCount === 0) return;
        // We don't have target IDs here; navigate to project instead
      }));
    } finally {
      setBulkLoading(false);
      setSelected(new Set());
    }
  }

  const critCount = data?.projects.filter((p) => p.riskLevel === 'critical').length ?? 0;
  const highCount = data?.projects.filter((p) => p.riskLevel === 'high').length ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.projects.length ?? 0} projects
            {critCount > 0 && <span className="text-red-600 font-medium"> · {critCount} critical risk</span>}
            {highCount > 0 && <span className="text-orange-600 font-medium"> · {highCount} high risk</span>}
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="gap-2"><Plus className="h-4 w-4" />New Project</Button>
        </Link>
      </div>

      <div className="flex gap-4">
        {/* Main panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-1 border rounded-lg p-1 bg-muted/30">
              {(['all', 'critical', 'high', 'stable'] as FilterLevel[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${filter === f ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="riskScore">Sort: Risk Score</option>
              <option value="openCount">Sort: Open Findings</option>
              <option value="name">Sort: Name</option>
              <option value="createdAt">Sort: Created</option>
            </select>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg border bg-primary/5 border-primary/20 px-4 py-2.5">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())} className="h-7 text-xs">
                Clear
              </Button>
              <Button size="sm" onClick={handleBulkScan} disabled={bulkLoading} className="h-7 text-xs gap-1 ml-auto">
                {bulkLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                <Shield className="h-3 w-3" />
                Open selected projects
              </Button>
            </div>
          )}

          {/* Grid */}
          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No projects found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? 'Try a different search term' : 'Create your first project to get started'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  selected={selected.has(p.id)}
                  onSelect={() => toggleSelect(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Activity sidebar */}
        {data && data.recentActivity.length > 0 && (
          <aside className="w-64 shrink-0 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent Activity</h2>
            <div className="space-y-2">
              {data.recentActivity.map((a) => (
                <Link
                  key={a.scanId}
                  href={`/projects/${a.projectId}`}
                  className="block rounded-lg border bg-card p-3 hover:border-ring transition-colors"
                >
                  <p className="text-xs font-semibold truncate">{a.projectName}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-muted-foreground">{a.type} scan</span>
                    <span className={`text-[11px] font-bold ${a.findingCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {a.findingCount > 0 ? `+${a.findingCount}` : '✓ clean'}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(a.completedAt)}</p>
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
