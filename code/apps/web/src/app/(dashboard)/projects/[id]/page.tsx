'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, ShieldAlert, Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useScans, useCancelScan } from '@/hooks/use-scans';
import { useApiAuth } from '@/hooks/use-api-auth';
import { ScanStatusBadge } from '@/components/scans/scan-status-badge';
import { StartScanDialog } from '@/components/scans/start-scan-dialog';

const SCAN_TYPE_LABELS: Record<string, string> = {
  FULL: 'Full Scan',
  WEB_ONLY: 'Web Security',
  SSL_ONLY: 'SSL/TLS',
  PORTS_ONLY: 'Port Scan',
};

export default function ProjectDetailPage() {
  useApiAuth();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: scans, isLoading: scansLoading } = useScans(id);
  const cancelScan = useCancelScan(id);
  const [showScanDialog, setShowScanDialog] = useState(false);

  if (projectLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Projekt nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/projects"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Projekte
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{project.targets[0]}</p>
          {project.description && (
            <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/findings?projectId=${id}`}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <ShieldAlert className="h-4 w-4" />
            Findings ansehen
          </Link>
          <button
            onClick={() => setShowScanDialog(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Play className="h-4 w-4" />
            Scan starten
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-medium">Scan-Verlauf</h2>
        </div>

        {scansLoading && (
          <div className="flex items-center gap-2 p-5 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Scans...</span>
          </div>
        )}

        {!scansLoading && (!scans || scans.length === 0) && (
          <div className="p-5 text-center text-sm text-muted-foreground">
            Noch keine Scans durchgeführt.
          </div>
        )}

        {scans && scans.length > 0 && (
          <div className="divide-y divide-border">
            {scans.map((scan) => (
              <div key={scan.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {SCAN_TYPE_LABELS[scan.type] ?? scan.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(scan.createdAt).toLocaleString('de-DE')}
                    </p>
                  </div>
                  <ScanStatusBadge status={scan.status} />
                </div>
                <div className="flex items-center gap-4">
                  {scan._count && scan._count.findings > 0 && (
                    <Link
                      href={`/findings?scanId=${scan.id}`}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {scan._count.findings} Findings
                    </Link>
                  )}
                  {(scan.status === 'QUEUED' || scan.status === 'RUNNING') && (
                    <button
                      onClick={() => cancelScan.mutate(scan.id)}
                      disabled={cancelScan.isPending}
                      className="text-xs text-destructive hover:opacity-70 disabled:opacity-50"
                    >
                      Abbrechen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showScanDialog && (
        <StartScanDialog projectId={id} onClose={() => setShowScanDialog(false)} />
      )}
    </div>
  );
}
