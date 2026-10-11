'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Globe, Server, Search, Filter, Download, ChevronDown, ChevronRight,
  ShieldAlert, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';

interface Asset {
  id: string;
  value: string;
  type: string;
  status: string;
  rootDomain: string;
  httpStatus: number | null;
  httpTitle: string | null;
  httpServer: string | null;
  technologies: string[];
  ipAddresses: string[];
  dnsIssues: string[];
  discoveredAt: string;
  lastSeenAt: string;
  project: { id: string; name: string };
  target: { id: string; verificationStatus: string } | null;
}

interface Stats {
  total: number;
  newThisWeek: number;
  highRisk: number;
  services: number;
}

const STATUS_COLORS: Record<string, string> = {
  SUGGESTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  OFFLINE: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
  IGNORED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  SUBDOMAIN: <Globe className="h-3.5 w-3.5" />,
  IP: <Server className="h-3.5 w-3.5" />,
  URL: <Globe className="h-3.5 w-3.5" />,
};

function httpStatusColor(code: number | null): string {
  if (!code) return 'text-muted-foreground';
  if (code < 300) return 'text-green-600';
  if (code < 400) return 'text-blue-600';
  if (code < 500) return 'text-yellow-600';
  return 'text-red-600';
}

function AssetRow({ asset, onAction }: { asset: Asset; onAction: () => void }) {
  const [open, setOpen] = useState(false);

  const age = Math.floor((Date.now() - new Date(asset.discoveredAt).getTime()) / (24 * 3600 * 1000));

  return (
    <>
      <tr
        className="hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-3 py-2.5 w-5 text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{TYPE_ICONS[asset.type] ?? <Globe className="h-3.5 w-3.5" />}</span>
            <span className="font-mono text-sm font-medium">{asset.value}</span>
            {asset.dnsIssues.length > 0 && (
              <span title="DNS issues detected" className="shrink-0"><ShieldAlert className="h-3.5 w-3.5 text-orange-500" /></span>
            )}
          </div>
          {asset.httpTitle && (
            <p className="text-xs text-muted-foreground ml-6 truncate max-w-xs">{asset.httpTitle}</p>
          )}
        </td>
        <td className="px-3 py-2.5 hidden sm:table-cell">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${STATUS_COLORS[asset.status] ?? 'bg-muted text-muted-foreground'}`}>
            {asset.status}
          </span>
        </td>
        <td className="px-3 py-2.5 hidden md:table-cell">
          <Link
            href={`/projects/${asset.project.id}`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {asset.project.name}
          </Link>
        </td>
        <td className="px-3 py-2.5 hidden lg:table-cell">
          <span className={`text-xs font-mono font-medium ${httpStatusColor(asset.httpStatus)}`}>
            {asset.httpStatus ?? '—'}
          </span>
        </td>
        <td className="px-3 py-2.5 hidden lg:table-cell">
          <div className="flex flex-wrap gap-1 max-w-[160px]">
            {asset.technologies.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">{t}</span>
            ))}
            {asset.technologies.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{asset.technologies.length - 3}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground whitespace-nowrap">
          {age === 0 ? 'Today' : `${age}d ago`}
        </td>
      </tr>

      {open && (
        <tr className="bg-muted/10">
          <td />
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground font-medium mb-1">IP Addresses</p>
                {asset.ipAddresses.length > 0
                  ? asset.ipAddresses.map((ip) => <p key={ip} className="font-mono">{ip}</p>)
                  : <p className="text-muted-foreground">—</p>}
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">Server</p>
                <p className="font-mono">{asset.httpServer ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">DNS Issues</p>
                {asset.dnsIssues.length > 0
                  ? asset.dnsIssues.map((d) => <p key={d} className="text-orange-600">{d}</p>)
                  : <p className="text-muted-foreground">None</p>}
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">Target</p>
                {asset.target ? (
                  <div className="flex items-center gap-1.5">
                    {asset.target.verificationStatus === 'VERIFIED'
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      : <Clock className="h-3.5 w-3.5 text-yellow-500" />}
                    <span>{asset.target.verificationStatus}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Not added as target</span>
                )}
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">All Technologies</p>
                <div className="flex flex-wrap gap-1">
                  {asset.technologies.length > 0
                    ? asset.technologies.map((t) => (
                        <span key={t} className="bg-muted px-1.5 py-0.5 rounded font-mono">{t}</span>
                      ))
                    : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">Last Seen</p>
                <p>{new Date(asset.lastSeenAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">Root Domain</p>
                <p className="font-mono">{asset.rootDomain}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1">Discovered</p>
                <p>{new Date(asset.discoveredAt).toLocaleString()}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Link href={`/projects/${asset.project.id}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs">View Project</Button>
              </Link>
              {asset.httpStatus && (
                <a href={`https://${asset.value}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Globe className="h-3 w-3" /> Open
                  </Button>
                </a>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AssetInventoryPage() {
  const [data, setData] = useState<{ stats: Stats; assets: Asset[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (s = search, status = filterStatus, type = filterType) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (s) params.set('search', s);
      if (status !== 'ALL') params.set('status', status);
      if (type !== 'ALL') params.set('type', type);
      const result = await apiClient.get<{ stats: Stats; assets: Asset[] }>(`/assets?${params}`);
      setData(result);
    } catch { toast.error('Failed to load assets'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (v: string) => {
    setSearch(v);
    const t = setTimeout(() => load(v, filterStatus, filterType), 300);
    return () => clearTimeout(t);
  };

  const handleStatusFilter = (v: string) => { setFilterStatus(v); load(search, v, filterType); };
  const handleTypeFilter = (v: string) => { setFilterType(v); load(search, filterStatus, v); };

  const exportCsv = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const rows = [
        ['Value', 'Type', 'Status', 'Project', 'HTTP Status', 'Server', 'Technologies', 'IP Addresses', 'Discovered'],
        ...data.assets.map((a) => [
          a.value, a.type, a.status, a.project.name,
          String(a.httpStatus ?? ''), a.httpServer ?? '',
          a.technologies.join('; '), a.ipAddresses.join('; '),
          new Date(a.discoveredAt).toISOString(),
        ]),
      ];
      const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asset-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.assets.length} assets`);
    } finally { setExporting(false); }
  };

  const types = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.assets.map((a) => a.type))];
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Globe className="h-6 w-6 text-muted-foreground" />
            Asset Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All discovered assets across your attack surface — subdomains, IPs, services.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || !data}>
          <Download className={`mr-2 h-3.5 w-3.5 ${exporting ? 'animate-pulse' : ''}`} />
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      {data?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Assets', value: data.stats.total, icon: <Globe className="h-4 w-4" />, color: 'text-foreground' },
            { label: 'New this week', value: data.stats.newThisWeek, icon: <Clock className="h-4 w-4" />, color: 'text-blue-600' },
            { label: 'High-Risk Targets', value: data.stats.highRisk, icon: <ShieldAlert className="h-4 w-4" />, color: 'text-red-600' },
            { label: 'Live Services', value: data.stats.services, icon: <Server className="h-4 w-4" />, color: 'text-green-600' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <div className={`flex items-center gap-2 ${color} mb-1`}>
                {icon}
                <span className="text-2xl font-bold tabular-nums">{value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-8 text-sm w-56"
            placeholder="Search assets…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={filterStatus} onValueChange={handleStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="SUGGESTED">Suggested</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="OFFLINE">Offline</SelectItem>
            <SelectItem value="IGNORED">Ignored</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={handleTypeFilter}>
          <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            {data.assets.length} asset{data.assets.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      {loading && !data ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : !data || data.assets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-16 text-center">
          <Globe className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium">No assets found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Run an ASM discovery scan on a project to populate your asset inventory.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="w-5 px-3 py-2.5" />
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Asset</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Project</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">HTTP</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Technologies</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Discovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.assets.map((a) => (
                <AssetRow key={a.id} asset={a} onAction={load} />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            Showing {data.assets.length} of {data.stats.total} assets
          </div>
        </div>
      )}
    </div>
  );
}
