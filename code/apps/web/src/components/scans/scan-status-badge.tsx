import { cn } from '@/lib/utils';
import type { ScanStatus } from '@/hooks/use-scans';

const config: Record<ScanStatus, { label: string; classes: string }> = {
  QUEUED: { label: 'In Warteschlange', classes: 'bg-blue-500/10 text-blue-400' },
  RUNNING: { label: 'Läuft', classes: 'bg-yellow-500/10 text-yellow-400' },
  COMPLETED: { label: 'Abgeschlossen', classes: 'bg-green-500/10 text-green-400' },
  FAILED: { label: 'Fehlgeschlagen', classes: 'bg-red-500/10 text-red-400' },
  CANCELLED: { label: 'Abgebrochen', classes: 'bg-gray-500/10 text-gray-400' },
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const { label, classes } = config[status];
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', classes)}>
      {label}
    </span>
  );
}
