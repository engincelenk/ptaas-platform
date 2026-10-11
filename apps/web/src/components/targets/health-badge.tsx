'use client';

interface HealthStatus {
  isUp: boolean;
  statusCode?: number | null;
  responseTimeMs?: number | null;
  checkedAt?: string | null;
}

interface Props {
  status: HealthStatus | null;
  loading?: boolean;
}

export function HealthBadge({ status, loading }: Props) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-0.5 rounded-full border bg-muted/30">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
        Checking…
      </span>
    );
  }

  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-0.5 rounded-full border">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        Unknown
      </span>
    );
  }

  if (status.isUp) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        UP
        {status.responseTimeMs != null && (
          <span className="text-green-600 dark:text-green-500 font-normal">{status.responseTimeMs}ms</span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded-full">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
      DOWN
      {status.statusCode != null && (
        <span className="text-red-600 dark:text-red-500 font-normal">HTTP {status.statusCode}</span>
      )}
    </span>
  );
}
