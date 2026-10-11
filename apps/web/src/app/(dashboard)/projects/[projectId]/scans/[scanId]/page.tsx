'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { ScanProgress } from '@/components/scans/scan-progress';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ChevronLeft, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const SEVERITY_COLORS = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'secondary',
  INFO: 'secondary',
} as const;

interface Scan {
  id: string;
  type: string;
  status: string;
  progress: number;
  currentActivity: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  target: { id: string; value: string; type: string };
  findings: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    matchedAt: string | null;
    createdAt: string;
  }>;
  _count: { findings: number };
}

export default function ScanDetailPage() {
  const { projectId, scanId } = useParams<{ projectId: string; scanId: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const token = typeof window !== 'undefined' ? localStorage.getItem('ptaas_access_token') : null;

  const loadScan = useCallback(async () => {
    const data = await apiClient.get<Scan>(`/projects/${projectId}/scans/${scanId}`);
    setScan(data);
  }, [projectId, scanId]);

  useEffect(() => {
    loadScan().finally(() => setLoading(false));
  }, [loadScan]);

  const handleComplete = (status: 'COMPLETED' | 'FAILED' | 'CANCELLED') => {
    // Reload scan data when the SSE stream completes
    loadScan();
  };

  const handleCancel = async () => {
    try {
      await apiClient.delete(`/projects/${projectId}/scans/${scanId}`);
      toast.success('Scan cancelled');
      loadScan();
    } catch {
      toast.error('Failed to cancel scan');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!scan) return null;

  const isActive = ['QUEUED', 'RUNNING'].includes(scan.status);
  const duration =
    scan.startedAt && scan.completedAt
      ? Math.round(
          (new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime()) / 1000,
        )
      : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/projects/${projectId}/scans`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{scan.target.value}</h1>
            <p className="text-sm text-muted-foreground">
              {scan.type} Scan
              {duration !== null && ` · ${duration}s`}
            </p>
          </div>
        </div>

        {isActive && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel scan?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will stop the scan immediately. Findings collected so far will be kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep running</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel}>Cancel scan</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Live progress (only shown for active scans) */}
      {isActive && (
        <div className="rounded-lg border p-4">
          <ScanProgress
            projectId={projectId}
            scanId={scanId}
            token={token}
            onComplete={handleComplete}
          />
        </div>
      )}

      {/* Completed summary */}
      {!isActive && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge
              variant={scan.status === 'COMPLETED' ? 'default' : 'destructive'}
              className="mt-1"
            >
              {scan.status}
            </Badge>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Findings</p>
            <p className="mt-1 text-2xl font-semibold">{scan._count.findings}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Duration</p>
            <p className="mt-1 text-2xl font-semibold">
              {duration !== null ? `${duration}s` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Findings table */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Findings
          {scan.findings.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({scan.findings.length})
            </span>
          )}
        </h2>

        {scan.findings.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {isActive ? 'Findings will appear here as the scan runs…' : 'No findings found.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Matched At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scan.findings.map((finding) => (
                <TableRow key={finding.id}>
                  <TableCell className="font-medium">{finding.title}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS] ??
                        'secondary'
                      }
                    >
                      {finding.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{finding.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {finding.matchedAt ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
