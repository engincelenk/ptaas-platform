'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { ScheduleCard } from '@/components/monitoring/schedule-card';
import { Badge } from '@/components/ui/badge';
import { StartScanDialog } from '@/components/scans/start-scan-dialog';
import { Button } from '@/components/ui/button';
import { HealthBadge } from '@/components/targets/health-badge';
import { ResponseTimeChart } from '@/components/targets/response-time-chart';

interface Target {
  id: string;
  type: string;
  value: string;
  verificationStatus: string;
  verificationMethod: string | null;
  verifiedAt: string | null;
  scheduleEnabled: boolean;
  scheduleCron: string | null;
  lastScheduledAt: string | null;
  createdAt: string;
}

export default function TargetDetailPage() {
  const { projectId, targetId } = useParams<{ projectId: string; targetId: string }>();
  const [target, setTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanOpen, setScanOpen] = useState(false);
  const [healthLatest, setHealthLatest] = useState<{ isUp: boolean; statusCode?: number | null; responseTimeMs?: number | null; checkedAt?: string | null } | null>(null);
  const [healthHistory, setHealthHistory] = useState<Array<{ isUp: boolean; statusCode: number | null; responseTimeMs: number | null; checkedAt: string }>>([]);
  const [healthLoading, setHealthLoading] = useState(true);

  const load = () =>
    apiClient
      .get<Target>(`/projects/${projectId}/targets/${targetId}`)
      .then(setTarget)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [targetId]);

  useEffect(() => {
    Promise.all([
      apiClient.get<typeof healthLatest>(`/projects/${projectId}/targets/${targetId}/health/latest`).catch(() => null),
      apiClient.get<typeof healthHistory>(`/projects/${projectId}/targets/${targetId}/health`).catch(() => []),
    ]).then(([latest, history]) => {
      setHealthLatest(latest);
      setHealthHistory(history ?? []);
    }).finally(() => setHealthLoading(false));
  }, [projectId, targetId]);

  if (loading) return <div className="p-8 animate-pulse h-64 bg-muted rounded-xl" />;
  if (!target) return <p className="text-destructive p-8">Target not found</p>;

  const isVerified = target.verificationStatus === 'VERIFIED';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Project
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-xl font-semibold font-mono">{target.value}</h1>
            <p className="text-sm text-muted-foreground">{target.type}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isVerified ? 'default' : 'secondary'}>
              {target.verificationStatus}
            </Badge>
            {isVerified && (
              <Button size="sm" onClick={() => setScanOpen(true)}>
                Start Scan
              </Button>
            )}
          </div>
        </div>
      </div>

      {target.verifiedAt && (
        <div className="rounded-xl border p-4 text-sm space-y-1">
          <p className="font-medium">Verification</p>
          <p className="text-muted-foreground">Method: {target.verificationMethod ?? '—'}</p>
          <p className="text-muted-foreground">
            Verified: {new Date(target.verifiedAt).toLocaleDateString()}
          </p>
        </div>
      )}

      {isVerified && (
        <ScheduleCard
          targetId={target.id}
          scheduleEnabled={target.scheduleEnabled}
          scheduleCron={target.scheduleCron}
          lastScheduledAt={target.lastScheduledAt}
          onUpdated={load}
        />
      )}

      {/* Health Monitor */}
      <div className="rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Health Monitor</h2>
          <HealthBadge status={healthLatest} loading={healthLoading} />
        </div>
        {healthLatest?.checkedAt && (
          <p className="text-xs text-muted-foreground">
            Last checked {new Date(healthLatest.checkedAt).toLocaleString()}
          </p>
        )}
        <ResponseTimeChart data={healthHistory} />
      </div>

      <div className="flex gap-4">
        <Link
          href={`/projects/${projectId}/scans?targetId=${target.id}`}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          View scans →
        </Link>
        <Link
          href={`/projects/${projectId}/findings?targetId=${target.id}`}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          View findings →
        </Link>
      </div>

      {scanOpen && (
        <StartScanDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          projectId={projectId}
          targetId={target.id}
          targetValue={target.value}
        />
      )}
    </div>
  );
}
