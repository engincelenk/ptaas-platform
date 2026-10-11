'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { StartScanDialog } from '@/components/scans/start-scan-dialog';
import { Play, ChevronRight } from 'lucide-react';

interface Target {
  id: string;
  value: string;
  type: string;
  verificationStatus: string;
}

interface Scan {
  id: string;
  type: string;
  status: string;
  progress: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  target: { id: string; value: string; type: string };
  _count: { findings: number };
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive'> = {
  QUEUED: 'secondary',
  RUNNING: 'default',
  COMPLETED: 'default',
  FAILED: 'destructive',
  CANCELLED: 'secondary',
};

export default function ScansPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [scans, setScans] = useState<Scan[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);

  const loadData = async () => {
    const [scansData, projectData] = await Promise.all([
      apiClient.get<Scan[]>(`/projects/${projectId}/scans`),
      apiClient.get<{ targets: Target[] }>(`/projects/${projectId}`),
    ]);
    setScans(scansData);
    setTargets(projectData.targets?.filter((t) => t.verificationStatus === 'VERIFIED') ?? []);
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [projectId]);

  const handleStartScan = (target: Target) => {
    setSelectedTarget(target);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scans</h1>
          <p className="text-sm text-muted-foreground">
            All scans for this project. Only verified targets can be scanned.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/scans/diff`}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs">🔄</span> Compare Scans
          </Link>
          {targets.length > 0 && (
            <Button onClick={() => handleStartScan(targets[0])}>
              <Play className="mr-2 h-4 w-4" />
              New Scan
            </Button>
          )}
        </div>
      </div>

      {targets.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No verified targets yet.{' '}
          <Link href={`/projects/${projectId}`} className="underline underline-offset-4">
            Verify a target first.
          </Link>
        </div>
      )}

      {scans.length === 0 && targets.length > 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No scans yet. Start your first scan above.
        </div>
      )}

      {scans.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Target</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead>Started</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {scans.map((scan) => (
              <TableRow key={scan.id}>
                <TableCell className="font-medium">{scan.target.value}</TableCell>
                <TableCell>
                  <Badge variant="outline">{scan.type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_COLORS[scan.status] ?? 'secondary'}>
                    {scan.status}
                    {scan.status === 'RUNNING' && ` (${scan.progress}%)`}
                  </Badge>
                </TableCell>
                <TableCell>{scan._count.findings}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {scan.startedAt
                    ? new Date(scan.startedAt).toLocaleString()
                    : new Date(scan.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/projects/${projectId}/scans/${scan.id}`}>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {selectedTarget && (
        <StartScanDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projectId={projectId}
          targetId={selectedTarget.id}
          targetValue={selectedTarget.value}
        />
      )}
    </div>
  );
}
