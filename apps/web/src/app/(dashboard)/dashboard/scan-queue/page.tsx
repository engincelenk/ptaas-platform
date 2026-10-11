'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface QueuedScan {
  id: string;
  type: string;
  status: string;
  progress: number | null;
  createdAt: string;
  startedAt: string | null;
  project: { id: string; name: string };
  target: { value: string };
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  QUEUED:    <Clock className="h-4 w-4 text-muted-foreground" />,
  RUNNING:   <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  FAILED:    <XCircle className="h-4 w-4 text-destructive" />,
  CANCELLED: <XCircle className="h-4 w-4 text-muted-foreground" />,
};

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'bg-muted text-muted-foreground',
  RUNNING: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export default function ScanQueuePage() {
  const [scans, setScans] = useState<QueuedScan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<QueuedScan[]>('/scans/queue')
      .then(setScans)
      .catch(() => {})
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      apiClient.get<QueuedScan[]>('/scans/queue').then(setScans).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scan-Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aktive und geplante Scans · aktualisiert alle 10 s
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : scans.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <Clock className="mx-auto mb-3 h-8 w-8 opacity-30" />
          <p className="text-sm">Keine aktiven Scans in der Queue.</p>
          <p className="text-xs mt-1">Starte einen Scan in einem deiner Projekte.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm" aria-label="Scan-Queue">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Projekt</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Target</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Typ</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Fortschritt</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Gestartet</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {scans.map((scan) => (
                <tr key={scan.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICON[scan.status] ?? STATUS_ICON.QUEUED}
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_LABEL[scan.status] ?? STATUS_LABEL.QUEUED}`}>
                        {scan.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${scan.project.id}`}
                      className="font-medium hover:underline"
                    >
                      {scan.project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                    {scan.target.value}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{scan.type}</td>
                  <td className="px-4 py-3">
                    {scan.status === 'RUNNING' && scan.progress != null ? (
                      <div className="flex items-center gap-2">
                        <div
                          role="progressbar"
                          aria-valuenow={scan.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Scan-Fortschritt ${scan.progress}%`}
                          className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]"
                        >
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${scan.progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{scan.progress}%</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {scan.startedAt
                      ? new Date(scan.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                      : 'Wartet…'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
