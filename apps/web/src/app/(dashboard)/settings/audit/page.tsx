'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Search, RefreshCw, ChevronDown, ChevronRight, Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';

interface AuditEntry {
  id: string;
  action: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
  user?: { id: string; name: string; email: string };
}

interface AuditStats {
  total: number;
  topActions: Array<{ action: string; count: number }>;
  dailyActivity: Array<{ date: string; count: number }>;
}

interface AuditPage {
  data: AuditEntry[];
  total: number;
  page: number;
  pages: number;
}

function parseOrgId(): string | null {
  try {
    const t = localStorage.getItem('ptaas_access_token') ?? '';
    return JSON.parse(atob(t.split('.')[1])).orgId ?? null;
  } catch { return null; }
}

// Action verb → color
function actionColor(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('login') || a.includes('view') || a.includes('read') || a.includes('list')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
  if (a.includes('create') || a.includes('add') || a.includes('invite') || a.includes('register')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (a.includes('update') || a.includes('edit') || a.includes('change') || a.includes('assign')) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }
  if (a.includes('delete') || a.includes('revoke') || a.includes('remove') || a.includes('disable')) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }
  if (a.includes('scan') || a.includes('trigger') || a.includes('run')) {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  }
  return 'bg-muted text-muted-foreground';
}

function ActivityBar({ days }: { days: Array<{ date: string; count: number }> }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {days.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count} events`}
          style={{ height: `${Math.max((d.count / max) * 100, 4)}%` }}
          className="flex-1 bg-primary/60 rounded-sm hover:bg-primary transition-colors cursor-default"
        />
      ))}
    </div>
  );
}

function MetadataCell({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;
  return (
    <>
      <tr
        className={`hover:bg-muted/20 transition-colors ${hasMetadata ? 'cursor-pointer' : ''}`}
        onClick={() => hasMetadata && setOpen((o) => !o)}
      >
        <td className="px-4 py-2.5 w-6">
          {hasMetadata && (
            open
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${actionColor(entry.action)}`}>
            {entry.action}
          </span>
        </td>
        <td className="px-4 py-2.5 hidden sm:table-cell">
          {entry.user ? (
            <div>
              <p className="text-xs font-medium">{entry.user.name}</p>
              <p className="text-xs text-muted-foreground">{entry.user.email}</p>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">System</span>
          )}
        </td>
        <td className="px-4 py-2.5 hidden md:table-cell">
          {entry.resource ? (
            <span className="text-xs text-muted-foreground font-mono">
              {entry.resource}{entry.resourceId ? `·${entry.resourceId.slice(0, 8)}` : ''}
            </span>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-2.5 hidden lg:table-cell">
          <span className="text-xs text-muted-foreground font-mono">{entry.ipAddress ?? '—'}</span>
        </td>
        <td className="px-4 py-2.5 text-right">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(entry.createdAt).toLocaleString()}
          </span>
        </td>
      </tr>
      {open && hasMetadata && (
        <tr className="bg-muted/30">
          <td />
          <td colSpan={5} className="px-4 py-3">
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all overflow-x-auto max-h-48">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

const RANGE_OPTIONS = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '0', label: 'All time' },
];

function rangeToFrom(days: string): string | undefined {
  if (!days || days === '0') return undefined;
  const d = new Date();
  d.setDate(d.getDate() - parseInt(days));
  return d.toISOString();
}

export default function AuditPage() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [logs, setLogs] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('30');
  const [exporting, setExporting] = useState(false);
  const orgId = parseOrgId();

  const load = useCallback(async (p = 1, action = actionFilter, days = range) => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (action) params.set('action', action);
      const from = rangeToFrom(days);
      if (from) params.set('from', from);

      const [s, l] = await Promise.all([
        stats ? Promise.resolve(stats) : apiClient.get<AuditStats>(`/organizations/${orgId}/audit/stats`),
        apiClient.get<AuditPage>(`/organizations/${orgId}/audit/logs?${params}`),
      ]);
      setStats(s);
      setLogs(l);
      setPage(p);
    } catch { toast.error('Failed to load audit logs'); }
    finally { setLoading(false); }
  }, [orgId, actionFilter, stats, range]);

  useEffect(() => { load(1, '', '30'); }, []);

  const handleRangeChange = (v: string) => {
    setRange(v);
    load(1, actionFilter, v);
  };

  const handleActionFilter = (action: string) => {
    setActionFilter(action);
    load(1, action, range);
  };

  const exportCsv = () => {
    if (!orgId) return;
    // Server-side export (M48) — up to 10,000 entries
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    const from = rangeToFrom(range);
    if (from) params.set('from', from);
    const token = localStorage.getItem('ptaas_access_token') ?? '';
    const url = `${process.env.NEXT_PUBLIC_API_URL}/organizations/${orgId}/audit/export?${params}&token=${token}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success('Audit trail export started');
  };

  const filtered = search
    ? logs?.data.filter((e) =>
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        e.user?.name.toLowerCase().includes(search.toLowerCase()) ||
        e.user?.email.toLowerCase().includes(search.toLowerCase()),
      )
    : logs?.data;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full history of actions taken within your organization.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || loading}>
            <Download className={`mr-2 h-3.5 w-3.5 ${exporting ? 'animate-pulse' : ''}`} />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setStats(null); load(1, actionFilter, range); }} disabled={loading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Activity chart + Top actions */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Activity (30 days)</p>
              <p className="text-xs text-muted-foreground">{stats.total} events</p>
            </div>
            <ActivityBar days={stats.dailyActivity} />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{stats.dailyActivity[0]?.date}</span>
              <span>{stats.dailyActivity[stats.dailyActivity.length - 1]?.date}</span>
            </div>
          </div>
          <div className="rounded-xl border p-4 space-y-2">
            <p className="text-sm font-medium">Top Actions</p>
            <div className="space-y-1.5">
              {stats.topActions.slice(0, 7).map(({ action, count }) => (
                <div key={action} className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleActionFilter(action)}
                    className={`text-xs truncate text-left transition-colors hover:text-foreground ${
                      actionFilter === action ? 'text-foreground font-medium' : 'text-muted-foreground'
                    }`}
                    title={action}
                  >
                    {action}
                  </button>
                  <span className="text-xs font-medium tabular-nums shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-8 text-sm w-56"
            placeholder="Search action or user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={range} onValueChange={handleRangeChange}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {actionFilter && (
          <Badge variant="secondary" className="gap-1 h-8 px-3">
            <span className="text-xs">{actionFilter}</span>
            <button onClick={() => handleActionFilter('')} className="ml-1 hover:opacity-60 text-sm leading-none">×</button>
          </Badge>
        )}
        {logs && (
          <span className="text-xs text-muted-foreground ml-auto">
            {logs.total.toLocaleString()} events
          </span>
        )}
      </div>

      {/* Log table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="w-6 px-4 py-2.5" />
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Action</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">User</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Resource</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">IP</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && !filtered ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  </td>
                </tr>
              ))
            ) : (filtered ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No audit events found
                </td>
              </tr>
            ) : (
              (filtered ?? []).map((e) => <MetadataCell key={e.id} entry={e} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {logs && logs.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            Page {page} of {logs.pages} · {logs.total.toLocaleString()} total
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
              Previous
            </Button>
            {Array.from({ length: Math.min(logs.pages, 5) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page - 2 + i;
              if (p < 1 || p > logs.pages) return null;
              return (
                <Button
                  key={p}
                  variant={p === page ? 'default' : 'outline'}
                  size="sm"
                  className="w-8"
                  onClick={() => load(p)}
                  disabled={loading}
                >
                  {p}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" disabled={page >= logs.pages || loading} onClick={() => load(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
