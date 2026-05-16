'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useFindings, useUpdateFinding, type Severity, type FindingStatus } from '@/hooks/use-findings';
import { useApiAuth } from '@/hooks/use-api-auth';
import { severityColors } from '@/lib/api';
import { cn } from '@/lib/utils';

const SEVERITY_LABELS: Record<Severity, string> = {
  CRITICAL: 'Kritisch',
  HIGH: 'Hoch',
  MEDIUM: 'Mittel',
  LOW: 'Niedrig',
  INFO: 'Info',
};

const STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: 'Offen',
  CONFIRMED: 'Bestätigt',
  FIXED: 'Behoben',
  WONT_FIX: 'Wird nicht behoben',
  FALSE_POSITIVE: 'False Positive',
};

const ALL_STATUSES: FindingStatus[] = ['OPEN', 'CONFIRMED', 'FIXED', 'WONT_FIX', 'FALSE_POSITIVE'];
const ALL_SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export default function FindingsPage() {
  useApiAuth();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') ?? undefined;
  const scanId = searchParams.get('scanId') ?? undefined;

  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<FindingStatus | 'ALL'>('ALL');

  const { data: findings, isLoading, error } = useFindings(projectId, scanId);
  const updateFinding = useUpdateFinding();

  const filtered = findings?.filter((f) => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (statusFilter !== 'ALL' && f.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Findings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle gefundenen Sicherheitslücken
          {projectId && ' (gefiltert nach Projekt)'}
          {scanId && ' (gefiltert nach Scan)'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Severity | 'ALL')}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="ALL">Alle Schweregrade</option>
          {ALL_SEVERITIES.map((s) => (
            <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FindingStatus | 'ALL')}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="ALL">Alle Status</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        {filtered && (
          <span className="text-sm text-muted-foreground">
            {filtered.length} Finding{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Lade Findings...</span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Findings konnten nicht geladen werden.
        </div>
      )}

      {filtered && filtered.length === 0 && !isLoading && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">Keine Findings gefunden.</p>
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {filtered.map((finding) => (
            <div key={finding.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        severityColors[finding.severity],
                      )}
                    >
                      {SEVERITY_LABELS[finding.severity]}
                    </span>
                    {finding.cweId && (
                      <span className="text-xs text-muted-foreground">{finding.cweId}</span>
                    )}
                    {finding.cvssScore !== undefined && finding.cvssScore !== null && (
                      <span className="text-xs text-muted-foreground">
                        CVSS {finding.cvssScore.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 font-medium text-foreground">{finding.title}</h3>
                  {finding.affectedUrl && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {finding.affectedUrl}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {finding.description}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{finding.project.name}</span>
                    <span>·</span>
                    <span>{finding.scan.type}</span>
                    <span>·</span>
                    <span>{new Date(finding.createdAt).toLocaleDateString('de-DE')}</span>
                  </div>
                </div>

                <div className="shrink-0">
                  <select
                    value={finding.status}
                    onChange={(e) =>
                      updateFinding.mutate({
                        id: finding.id,
                        status: e.target.value as FindingStatus,
                      })
                    }
                    disabled={updateFinding.isPending}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
