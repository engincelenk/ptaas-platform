'use client';

import { useState } from 'react';
import { Shield, Activity, Clock, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApiAuth } from '@/hooks/use-api-auth';
import { useAuditLogs } from '@/hooks/use-audit-logs';
import { cn } from '@/lib/utils';

const RESOURCE_FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'project', label: 'Projekte' },
  { value: 'scan', label: 'Scans' },
  { value: 'finding', label: 'Findings' },
  { value: 'report', label: 'Reports' },
  { value: 'user', label: 'Benutzer' },
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'text-green-400 bg-green-400/10',
  UPDATE: 'text-blue-400 bg-blue-400/10',
  DELETE: 'text-red-400 bg-red-400/10',
  LOGIN: 'text-purple-400 bg-purple-400/10',
  EXPORT: 'text-yellow-400 bg-yellow-400/10',
};

const PAGE_SIZE = 25;

export default function SettingsPage() {
  useApiAuth();
  const [resource, setResource] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useAuditLogs({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    resource: resource || undefined,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  function actionColor(action: string) {
    const key = Object.keys(ACTION_COLORS).find((k) => action.toUpperCase().includes(k));
    return key ? ACTION_COLORS[key] : 'text-gray-400 bg-gray-400/10';
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Konto & Audit-Protokoll</p>
      </div>

      {/* Audit Logs */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Audit-Protokoll</h2>
            {data && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {data.total} Einträge
              </span>
            )}
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            {RESOURCE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => { setResource(f.value); setPage(0); }}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  resource === f.value
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 p-5 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Protokoll...</span>
          </div>
        )}

        {!isLoading && (!data?.logs || data.logs.length === 0) && (
          <div className="p-10 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">Keine Einträge gefunden.</p>
          </div>
        )}

        {data?.logs && data.logs.length > 0 && (
          <>
            <div className="divide-y divide-border">
              {data.logs.map((log) => (
                <div key={log.id} className="flex items-start gap-4 px-5 py-3">
                  {/* Zeitstempel */}
                  <div className="flex w-36 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(log.createdAt).toLocaleString('de-DE', {
                      day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}</span>
                  </div>

                  {/* Action Badge */}
                  <span className={cn(
                    'mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
                    actionColor(log.action),
                  )}>
                    {log.action}
                  </span>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium capitalize">{log.resource}</span>
                      {log.resourceId && (
                        <span className="ml-1 font-mono text-xs text-muted-foreground">
                          #{log.resourceId.slice(0, 8)}
                        </span>
                      )}
                    </p>
                    {log.user && (
                      <p className="text-xs text-muted-foreground">{log.user.email}</p>
                    )}
                  </div>

                  {/* IP */}
                  {log.ipAddress && (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {log.ipAddress}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <span className="text-xs text-muted-foreground">
                  Seite {page + 1} von {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-md border border-border p-1.5 hover:bg-accent disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="rounded-md border border-border p-1.5 hover:bg-accent disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
