import { cn } from '@/lib/utils';
import type { ScanStatus } from '@/hooks/use-scans';

const config: Record<ScanStatus, { label: string; classes: string; pulse?: boolean }> = {
  QUEUED:    { label: 'In Warteschlange', classes: 'bg-blue-500/10 text-blue-400',   pulse: true },
  RUNNING:   { label: 'Läuft',            classes: 'bg-yellow-500/10 text-yellow-400', pulse: true },
  COMPLETED: { label: 'Abgeschlossen',    classes: 'bg-green-500/10 text-green-400' },
  FAILED:    { label: 'Fehlgeschlagen',   classes: 'bg-red-500/10 text-red-400' },
  CANCELLED: { label: 'Abgebrochen',      classes: 'bg-gray-500/10 text-gray-400' },
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const { label, classes, pulse } = config[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', classes)}>
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
            status === 'RUNNING' ? 'bg-yellow-400' : 'bg-blue-400')} />
          <span className={cn('relative inline-flex h-2 w-2 rounded-full',
            status === 'RUNNING' ? 'bg-yellow-400' : 'bg-blue-400')} />
        </span>
      )}
      {label}
    </span>
  );
}
