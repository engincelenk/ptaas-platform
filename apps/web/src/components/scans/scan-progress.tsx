'use client';

import { useEffect, useState } from 'react';
import { useScanEvents, type CriticalFindingEvent } from '@/hooks/use-scan-events';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ScanProgressProps {
  projectId: string;
  scanId: string;
  token: string | null;
  onComplete?: (status: 'COMPLETED' | 'FAILED' | 'CANCELLED') => void;
}

const STATUS_CONFIG = {
  QUEUED:    { label: 'Queued',    color: 'secondary', icon: Loader2   },
  RUNNING:   { label: 'Running',   color: 'default',   icon: Loader2   },
  COMPLETED: { label: 'Completed', color: 'default',   icon: CheckCircle2 },
  FAILED:    { label: 'Failed',    color: 'destructive', icon: XCircle },
  CANCELLED: { label: 'Cancelled', color: 'secondary', icon: XCircle   },
} as const;

export function ScanProgress({ projectId, scanId, token, onComplete }: ScanProgressProps) {
  const [criticalAlert, setCriticalAlert] = useState<CriticalFindingEvent | null>(null);

  const { event, connected } = useScanEvents({
    projectId,
    scanId,
    token,
    enabled: true,
    onCriticalFinding: (f) => setCriticalAlert(f),
  });

  useEffect(() => {
    if (!event) return;
    if (event.status === 'COMPLETED') {
      toast.success(`Scan complete — ${event.findingsCount} findings`);
      onComplete?.('COMPLETED');
    } else if (event.status === 'FAILED') {
      toast.error(`Scan failed: ${event.errorMessage ?? 'Unknown error'}`);
      onComplete?.('FAILED');
    } else if (event.status === 'CANCELLED') {
      onComplete?.('CANCELLED');
    }
  }, [event?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = event?.status ?? 'QUEUED';
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.QUEUED;
  const Icon = cfg.icon;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={cfg.color as 'default' | 'secondary' | 'destructive'}>
          <Icon className={`mr-1 h-3 w-3 ${status === 'RUNNING' ? 'animate-spin' : ''}`} />
          {cfg.label}
        </Badge>
        {event && (
          <span className="text-sm text-muted-foreground">
            {event.findingsCount} finding{event.findingsCount !== 1 ? 's' : ''} so far
          </span>
        )}
        {!connected && status === 'RUNNING' && (
          <span className="text-xs text-muted-foreground">(reconnecting…)</span>
        )}
      </div>

      {status === 'RUNNING' && (
        <>
          <Progress
            value={event?.progress ?? 0}
            className="h-2"
            role="progressbar"
            aria-valuenow={event?.progress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Scan-Fortschritt"
          />
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-xs text-muted-foreground truncate"
          >
            {event?.currentActivity ?? ''}
          </p>
        </>
      )}

      {criticalAlert && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="font-semibold">Kritisches Finding entdeckt!</p>
            <p className="text-xs mt-0.5">{criticalAlert.title}</p>
          </div>
          <button
            type="button"
            onClick={() => setCriticalAlert(null)}
            className="text-red-500 hover:text-red-700 text-xs underline"
          >
            Schließen
          </button>
        </div>
      )}

      {status === 'FAILED' && event?.errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{event.errorMessage}</span>
        </div>
      )}
    </div>
  );
}
