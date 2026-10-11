'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface Asset {
  id: string;
  value: string;
  type: string;
  status: 'SUGGESTED' | 'ACTIVE' | 'OFFLINE' | 'IGNORED';
  httpStatus: number | null;
  httpTitle: string | null;
  httpServer: string | null;
  technologies: string[];
  ipAddresses: string[];
  dnsIssues: string[];
  discoveredAt: string;
  target: { id: string; verificationStatus: string } | null;
}

interface AsmScan {
  id: string;
  rootDomain: string;
  status: string;
  assetsFound: number;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  SUGGESTED: 'default',
  ACTIVE: 'secondary',
  OFFLINE: 'destructive',
  IGNORED: 'outline',
};

const DNS_ISSUE_LABELS: Record<string, string> = {
  SPF_MISSING: 'No SPF record',
  SPF_SOFT_FAIL: 'SPF soft-fail (~all)',
  DMARC_MISSING: 'No DMARC record',
  DMARC_POLICY_NONE: 'DMARC policy=none',
  MX_MISSING: 'No MX record',
  WILDCARD_DNS_ENABLED: 'Wildcard DNS (*)',
};

export default function AssetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [scans, setScans] = useState<AsmScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [discovering, setDiscovering] = useState(false);
  const [rootDomain, setRootDomain] = useState('');

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      apiClient.get<Asset[]>(`/projects/${projectId}/asm/assets${statusFilter ? `?status=${statusFilter}` : ''}`),
      apiClient.get<AsmScan[]>(`/projects/${projectId}/asm/scans`),
    ]);
    setAssets(a);
    setScans(s);
  }, [projectId, statusFilter]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Auto-refresh every 60s to pick up live ASM scan results
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const startDiscovery = async () => {
    if (!rootDomain.trim()) return;
    setDiscovering(true);
    try {
      await apiClient.post(`/projects/${projectId}/asm/discover`, { rootDomain: rootDomain.trim() });
      toast.success('Discovery scan queued — assets will appear as they are found');
      await load();
    } catch {
      toast.error('Failed to start discovery');
    } finally {
      setDiscovering(false);
    }
  };

  const acceptAsset = async (assetId: string) => {
    try {
      await apiClient.post(`/projects/${projectId}/asm/assets/${assetId}/accept`, {});
      toast.success('Asset accepted — added as Target (pending verification)');
      await load();
    } catch {
      toast.error('Failed to accept asset');
    }
  };

  const dismissAsset = async (assetId: string) => {
    try {
      await apiClient.patch(`/projects/${projectId}/asm/assets/${assetId}/dismiss`, {});
      await load();
    } catch {
      toast.error('Failed to dismiss');
    }
  };

  const suggested = assets.filter((a) => a.status === 'SUGGESTED');
  const others = assets.filter((a) => a.status !== 'SUGGESTED');
  const newThisWeek = assets.filter((a) => {
    const age = Date.now() - new Date(a.discoveredAt).getTime();
    return age < 7 * 24 * 3600 * 1000;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Project
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Attack Surface</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discovered subdomains, IPs and DNS security issues for this project.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/projects/${projectId}/assets/graph`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            Asset Graph →
          </Link>
        </div>
      </div>

      {/* Monitoring status + new-asset banner */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          Continuous monitoring active — re-scans daily at 06:00 UTC
        </div>
        {newThisWeek > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 font-medium">
            ✨ {newThisWeek} new asset{newThisWeek !== 1 ? 's' : ''} discovered this week
          </div>
        )}
      </div>

      {/* Start discovery */}
      <div className="rounded-xl border p-4 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-sm font-medium">Root Domain</label>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
            placeholder="example.com"
            value={rootDomain}
            onChange={(e) => setRootDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startDiscovery()}
          />
        </div>
        <Button onClick={startDiscovery} disabled={discovering || !rootDomain.trim()}>
          {discovering ? 'Starting…' : 'Discover Subdomains'}
        </Button>
      </div>

      {/* Recent scans */}
      {scans.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Recent Discovery Scans
          </h2>
          <div className="flex flex-wrap gap-2">
            {scans.slice(0, 5).map((s) => (
              <div key={s.id} className="rounded-md border px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="font-mono">{s.rootDomain}</span>
                <Badge variant={s.status === 'COMPLETED' ? 'secondary' : s.status === 'FAILED' ? 'destructive' : 'outline'} className="text-xs">
                  {s.status}
                </Badge>
                <span className="text-muted-foreground">{s.assetsFound} found</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'SUGGESTED', 'ACTIVE', 'OFFLINE', 'IGNORED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No assets discovered yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Enter a root domain above and run discovery to find subdomains automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Suggestions first */}
          {suggested.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {suggested.length} New Suggestions
              </h2>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Host</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">HTTP</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Technologies</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">DNS Issues</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {suggested.map((asset) => (
                      <tr key={asset.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs">{asset.value}</span>
                          {asset.ipAddresses.length > 0 && (
                            <p className="text-xs text-muted-foreground">{asset.ipAddresses[0]}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {asset.httpStatus ? (
                            <span className={asset.httpStatus < 400 ? 'text-green-600' : 'text-red-500'}>
                              {asset.httpStatus}
                            </span>
                          ) : '—'}
                          {asset.httpTitle && (
                            <p className="text-muted-foreground truncate max-w-[180px]">{asset.httpTitle}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {asset.technologies.slice(0, 3).map((t) => (
                              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {asset.dnsIssues.slice(0, 2).map((issue) => (
                              <Badge key={issue} variant="destructive" className="text-xs">
                                {DNS_ISSUE_LABELS[issue] ?? issue}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="default" onClick={() => acceptAsset(asset.id)}>
                              Add Target
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => dismissAsset(asset.id)}>
                              Dismiss
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Active / Offline / Ignored */}
          {others.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Known Assets
              </h2>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Host</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Technologies</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">DNS Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {others.map((asset) => (
                      <tr key={asset.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{asset.value}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[asset.status] ?? 'outline'}>{asset.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {asset.technologies.slice(0, 3).map((t) => (
                              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {asset.dnsIssues.slice(0, 2).map((issue) => (
                              <Badge key={issue} variant="destructive" className="text-xs">
                                {DNS_ISSUE_LABELS[issue] ?? issue}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
