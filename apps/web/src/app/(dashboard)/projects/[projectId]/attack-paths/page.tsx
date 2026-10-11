'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AttackPathGraph } from '@/components/attack-paths/attack-path-graph';
import { toast } from 'sonner';
import { ChevronLeft, Sparkles, Loader2, ShieldAlert, RefreshCw } from 'lucide-react';

interface AttackNode {
  id: string;
  label: string;
  severity: string;
  owasp: string | null;
  cvssScore: number | null;
  priorityScore: number | null;
  position: { x: number; y: number };
}

interface AttackEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface AttackPath {
  id: string;
  title: string;
  description: string | null;
  nodes: AttackNode[];
  edges: AttackEdge[];
  impactScore: number | null;
  likelihood: string | null;
  createdAt: string;
}

const LIKELIHOOD_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  HIGH:     'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  MEDIUM:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  LOW:      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

export default function AttackPathsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [paths, setPaths] = useState<AttackPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);

  const loadPaths = async () => {
    const data = await apiClient.get<AttackPath[]>(`/projects/${projectId}/attack-paths`);
    setPaths(data);
  };

  useEffect(() => {
    loadPaths().finally(() => setLoading(false));
  }, [projectId]);

  const handleAnalyse = async () => {
    setAnalysing(true);
    try {
      const result = await apiClient.post<AttackPath[]>(`/projects/${projectId}/attack-paths/analyse`, {});
      setPaths(result);
      if (result.length === 0) {
        toast.info('No attack chains identified — findings may not be logically connected, or fewer than 2 MEDIUM+ findings exist.');
      } else {
        toast.success(`${result.length} attack path${result.length !== 1 ? 's' : ''} identified`);
      }
    } catch {
      toast.error('Attack path analysis failed');
    } finally {
      setAnalysing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/projects/${projectId}`}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Project
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-red-500" />
              Attack Paths
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-identified chains of vulnerabilities that could be combined into a real attack.
            </p>
          </div>
          <Button onClick={handleAnalyse} disabled={analysing} className="gap-2">
            {analysing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : paths.length > 0 ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analysing ? 'Analysing…' : paths.length > 0 ? 'Re-analyse' : 'Analyse Attack Paths'}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!analysing && paths.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center space-y-3">
          <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No attack paths yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Click "Analyse Attack Paths" to let Claude identify vulnerability chains in your findings.
            Requires at least 2 MEDIUM or higher findings.
          </p>
        </div>
      )}

      {/* Loading shimmer during analysis */}
      {analysing && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border p-5 space-y-3 animate-pulse">
              <div className="h-5 w-64 bg-muted rounded" />
              <div className="h-4 w-full bg-muted rounded" />
              <div className="h-56 bg-muted rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Attack path cards */}
      {!analysing && paths.map((path) => (
        <div key={path.id} className="rounded-xl border p-5 space-y-4">
          {/* Card header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-base font-semibold">{path.title}</h2>
              {path.description && (
                <p className="text-sm text-muted-foreground mt-1">{path.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {path.likelihood && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${LIKELIHOOD_COLORS[path.likelihood] ?? ''}`}>
                  {path.likelihood} likelihood
                </span>
              )}
              {path.impactScore != null && (
                <div className="text-right">
                  <p className="text-2xl font-bold leading-none text-red-600">
                    {Math.round(path.impactScore)}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Impact</p>
                </div>
              )}
            </div>
          </div>

          {/* Graph */}
          <AttackPathGraph nodes={path.nodes} edges={path.edges} />

          {/* Node legend */}
          <div className="flex flex-wrap gap-2 pt-1">
            {path.nodes.map((node) => (
              <Link
                key={node.id}
                href={`/projects/${projectId}/findings/${node.id}`}
                className="inline-flex items-center gap-1.5 text-xs rounded-md border px-2 py-1 hover:bg-muted transition-colors"
              >
                <span className={`w-2 h-2 rounded-full ${
                  node.severity === 'CRITICAL' ? 'bg-red-500'
                  : node.severity === 'HIGH' ? 'bg-orange-500'
                  : node.severity === 'MEDIUM' ? 'bg-yellow-500'
                  : 'bg-green-500'
                }`} />
                {node.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
