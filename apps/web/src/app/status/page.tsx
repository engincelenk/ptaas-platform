'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { apiUrl } from '@/lib/api-client';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs: number | null;
}

interface StatusData {
  status: 'operational' | 'degraded' | 'down';
  timestamp: string;
  services: ServiceStatus[];
}

const STATUS_META = {
  operational: {
    label: 'Operational',
    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    chip: 'bg-green-100 text-green-700',
    dot: 'bg-green-400',
  },
  degraded: {
    label: 'Degraded',
    icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    chip: 'bg-yellow-100 text-yellow-700',
    dot: 'bg-yellow-400',
  },
  down: {
    label: 'Down',
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    chip: 'bg-red-100 text-red-700',
    dot: 'bg-red-400',
  },
};

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/status'));
      const json: StatusData = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch {
      setData({
        status: 'down',
        timestamp: new Date().toISOString(),
        services: [{ name: 'API', status: 'down', latencyMs: null }],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const overall = data?.status ?? 'operational';
  const meta = STATUS_META[overall];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              P
            </div>
            <span className="font-semibold text-gray-900">PTaaS Platform Status</span>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        {/* Overall status banner */}
        <div className={`flex items-center gap-4 rounded-2xl p-6 ${overall === 'operational' ? 'bg-green-50 border border-green-200' : overall === 'degraded' ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
          <div className={`h-12 w-12 rounded-full flex items-center justify-center ${overall === 'operational' ? 'bg-green-100' : overall === 'degraded' ? 'bg-yellow-100' : 'bg-red-100'}`}>
            {overall === 'operational'
              ? <CheckCircle2 className="h-7 w-7 text-green-500" />
              : overall === 'degraded'
              ? <AlertTriangle className="h-7 w-7 text-yellow-500" />
              : <XCircle className="h-7 w-7 text-red-500" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {overall === 'operational' ? 'All systems operational' : overall === 'degraded' ? 'Partial service disruption' : 'Major outage'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Last checked: {lastRefresh.toLocaleTimeString('en-GB')}
              {data?.timestamp && ` · API timestamp: ${new Date(data.timestamp).toLocaleTimeString('en-GB')}`}
            </p>
          </div>
        </div>

        {/* Service list */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Services</h2>
          </div>
          {loading && !data ? (
            <div className="animate-pulse space-y-px">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-50" />)}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {(data?.services ?? []).map((svc) => {
                const m = STATUS_META[svc.status];
                return (
                  <li key={svc.name} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${m.dot} ${svc.status === 'operational' ? 'animate-pulse' : ''}`} />
                      <span className="font-medium text-gray-900">{svc.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {svc.latencyMs !== null && (
                        <span className="text-xs text-gray-400">{svc.latencyMs}ms</span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.chip}`}>
                        {m.icon} {m.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Auto-refreshes every 60 seconds · Status page powered by PTaaS
        </p>
      </main>
    </div>
  );
}
