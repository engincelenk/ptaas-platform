'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Clock, Users, CheckCircle2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';

interface Assignee { id: string; name: string; email: string }

interface Breach {
  id: string;
  title: string;
  severity: string;
  status: string;
  ageDays: number;
  daysOverdue: number;
  slaDays: number;
  projectId: string;
  project: { name: string };
  assignedTo: Assignee | null;
}

interface Stats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  avgDaysOverdue: number;
}

interface OrgMember { userId: string; role: string; user: { id: string; name: string; email: string } }

const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const SLA_LIMITS: Record<string, number> = { CRITICAL: 7, HIGH: 30, MEDIUM: 90, LOW: 180 };

function OverdueBadge({ days }: { days: number }) {
  const color = days > 30 ? 'text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
    : days > 7 ? 'text-orange-600 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
    : 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      <Clock className="h-3 w-3" />
      +{days}d
    </span>
  );
}

export default function SLADashboard() {
  const [breaches, setBreaches] = useState<Breach[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterSev, setFilterSev] = useState('ALL');
  const [filterProject, setFilterProject] = useState('ALL');
  const [bulkAssignId, setBulkAssignId] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = async () => {
    try {
      const [data, org] = await Promise.all([
        apiClient.get<{ stats: Stats; breaches: Breach[] }>('/findings/sla-breaches'),
        apiClient.get<OrgMember[]>('/organizations/members').catch(() => []),
      ]);
      setStats(data.stats);
      setBreaches(data.breaches);
      setMembers(org as OrgMember[]);
    } catch { toast.error('Failed to load SLA data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const projects = useMemo(() => {
    const names = [...new Set(breaches.map((b) => b.project.name))];
    return names.sort();
  }, [breaches]);

  const filtered = useMemo(() => breaches.filter((b) => {
    if (filterSev !== 'ALL' && b.severity !== filterSev) return false;
    if (filterProject !== 'ALL' && b.project.name !== filterProject) return false;
    return true;
  }), [breaches, filterSev, filterProject]);

  const allSelected = filtered.length > 0 && filtered.every((b) => selected.has(b.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((b) => b.id)));
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const bulkAssign = async () => {
    if (!bulkAssignId || selected.size === 0) return;
    setBulkLoading(true);
    try {
      await apiClient.post('/findings/bulk-assign', {
        ids: [...selected],
        assignedToId: bulkAssignId === '__unassign__' ? null : bulkAssignId,
      });
      toast.success(`Assigned ${selected.size} finding${selected.size > 1 ? 's' : ''}`);
      setSelected(new Set());
      setBulkAssignId('');
      load();
    } catch { toast.error('Failed to assign'); }
    finally { setBulkLoading(false); }
  };

  const bulkRequestRetest = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      // Mark all selected as IN_PROGRESS (signals retest intent)
      await apiClient.post('/findings/bulk-status', { ids: [...selected], status: 'IN_PROGRESS' });
      toast.success(`Retest requested for ${selected.size} finding${selected.size > 1 ? 's' : ''}`);
      setSelected(new Set());
      load();
    } catch { toast.error('Failed to request retest'); }
    finally { setBulkLoading(false); }
  };

  const bulkClose = async (status: string) => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      await apiClient.post('/findings/bulk-status', { ids: [...selected], status });
      toast.success(`Updated ${selected.size} finding${selected.size > 1 ? 's' : ''} to ${status}`);
      setSelected(new Set());
      load();
    } catch { toast.error('Failed to update'); }
    finally { setBulkLoading(false); }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
        <div className="h-96 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            SLA Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Findings that have exceeded their remediation SLA — Critical 7d · High 30d · Medium 90d · Low 180d
          </p>
        </div>
        <Button variant="outline" onClick={load} size="sm">Refresh</Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Breaches', value: stats.total, color: 'text-foreground' },
            { label: 'Critical', value: stats.critical, color: 'text-red-600' },
            { label: 'High', value: stats.high, color: 'text-orange-600' },
            { label: 'Medium', value: stats.medium, color: 'text-yellow-600' },
            { label: 'Low', value: stats.low, color: 'text-blue-600' },
            { label: 'Avg. Overdue', value: `${stats.avgDaysOverdue}d`, color: 'text-muted-foreground' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4 text-center">
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters + Bulk actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={filterSev} onValueChange={setFilterSev}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All severities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All projects</SelectItem>
            {projects.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">{selected.size} selected</span>
            <Select value={bulkAssignId} onValueChange={setBulkAssignId}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Assign to…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassign__">Unassign</SelectItem>
                {members.map((m) => <SelectItem key={m.user.id} value={m.user.id}>{m.user.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={bulkAssign} disabled={bulkLoading || !bulkAssignId}>
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Assign
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkClose('IN_PROGRESS')} disabled={bulkLoading}>
              Mark In Progress
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkClose('ACCEPTED_RISK')} disabled={bulkLoading} className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950/20">
              Accept Risk
            </Button>
            <Button size="sm" variant="outline" onClick={bulkRequestRetest} disabled={bulkLoading} className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/20">
              Request Retest
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border p-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <p className="font-semibold text-green-700 dark:text-green-400">No SLA breaches!</p>
          <p className="text-sm text-muted-foreground mt-1">All findings are within their remediation windows.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-primary cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Finding</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Severity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Project</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Age</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SLA</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Overdue</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assignee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b) => (
                <tr key={b.id} className={`transition-colors hover:bg-muted/30 ${selected.has(b.id) ? 'bg-accent/20' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} className="h-4 w-4 accent-primary cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${b.projectId}/findings/${b.id}`}
                      className="font-medium hover:text-primary transition-colors line-clamp-1"
                    >
                      {b.title}
                    </Link>
                    <span className={`text-xs mt-0.5 inline-block px-1.5 rounded ${b.status === 'IN_PROGRESS' ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20' : 'text-muted-foreground'}`}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs ${SEV_COLORS[b.severity] ?? ''}`}>{b.severity}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/projects/${b.projectId}`} className="text-muted-foreground hover:text-foreground transition-colors text-xs">
                      {b.project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">{b.ageDays}d</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{SLA_LIMITS[b.severity]}d</td>
                  <td className="px-4 py-3"><OverdueBadge days={b.daysOverdue} /></td>
                  <td className="px-4 py-3 text-xs">
                    {b.assignedTo
                      ? <span className="text-foreground font-medium">{b.assignedTo.name}</span>
                      : <span className="text-muted-foreground italic">Unassigned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground bg-muted/30">
            {filtered.length} breach{filtered.length !== 1 ? 'es' : ''} shown
            {filtered.length !== breaches.length && ` (${breaches.length} total)`}
          </div>
        </div>
      )}
    </div>
  );
}
