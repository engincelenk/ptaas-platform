import { runStatusClass, runStatusLabel, VERDICT_CLASS, VERDICT_LABEL } from '@/lib/arena-logic';
import type { ArenaVerdict } from '@/lib/arena-types';

export function RunStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${runStatusClass(status)}`}
    >
      {runStatusLabel(status)}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: ArenaVerdict | null }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
        Wird bewertet…
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${VERDICT_CLASS[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function OwaspBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
      {children}
    </span>
  );
}
