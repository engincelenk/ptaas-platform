'use client';

import { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { useApiAuth } from '@/hooks/use-api-auth';
import { useProjects } from '@/hooks/use-projects';
import { useReports, downloadReport } from '@/hooks/use-reports';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
  useApiAuth();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [downloading, setDownloading] = useState<'pdf' | 'json' | null>(null);

  const { data: reports, isLoading: reportsLoading } = useReports(selectedProjectId);

  async function handleDownload(format: 'pdf' | 'json') {
    if (!selectedProjectId) return;
    setDownloading(format);
    try {
      downloadReport(selectedProjectId, format);
    } finally {
      // Kurze Verzögerung damit der Browser den Download startet
      setTimeout(() => setDownloading(null), 1500);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF und JSON Export deiner Pentest-Ergebnisse
        </p>
      </div>

      {/* Projekt-Auswahl + Download */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <h2 className="font-medium">Report generieren</h2>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Projekt auswählen</label>
          {projectsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Lade Projekte...</span>
            </div>
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— Projekt wählen —</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.targets[0]})
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedProjectId && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleDownload('pdf')}
              disabled={downloading !== null}
              className={cn(
                'flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors',
                'hover:bg-accent disabled:opacity-50',
              )}
            >
              {downloading === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 text-red-500" />
              )}
              PDF herunterladen
            </button>

            <button
              onClick={() => handleDownload('json')}
              disabled={downloading !== null}
              className={cn(
                'flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors',
                'hover:bg-accent disabled:opacity-50',
              )}
            >
              {downloading === 'json' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4 text-blue-500" />
              )}
              JSON herunterladen
            </button>
          </div>
        )}
      </div>

      {/* Report-Archiv */}
      {selectedProjectId && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-medium">Generierte Reports</h2>
          </div>

          {reportsLoading && (
            <div className="flex items-center gap-2 p-5 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Lade Reports...</span>
            </div>
          )}

          {!reportsLoading && (!reports || reports.length === 0) && (
            <div className="p-5 text-center text-sm text-muted-foreground">
              Noch keine Reports generiert.
            </div>
          )}

          {reports && reports.length > 0 && (
            <div className="divide-y divide-border">
              {reports.map((report) => (
                <div key={report.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    {report.format === 'PDF' ? (
                      <FileText className="h-4 w-4 text-red-400 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{report.format} Report</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(report.createdAt).toLocaleString('de-DE')}
                        {report.scanId && ' · Scan-spezifisch'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      downloadReport(
                        selectedProjectId,
                        report.format.toLowerCase() as 'pdf' | 'json',
                        report.scanId,
                      )
                    }
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Nochmal laden
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
