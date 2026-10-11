'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Sparkles, Loader2, CheckCircle2, XCircle, Play } from 'lucide-react';

interface ScanPlanStep {
  type: 'QUICK' | 'FULL' | 'WEB_CRAWL' | 'API_SCAN';
  tags?: string[];
  severities?: string[];
  priority: number;
  rationale: string;
}

interface Strategy {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  fingerprint: {
    technologies: string[];
    statusCode: number | null;
    error?: string;
  } | null;
  plan: ScanPlanStep[];
  reasoning: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const SCAN_TYPE_LABELS: Record<string, string> = {
  QUICK: 'Quick CVE Scan',
  FULL: 'Full Deep Scan',
  WEB_CRAWL: 'Web Crawl (ZAP)',
  API_SCAN: 'API Scan (ZAP)',
};

const SCAN_TYPE_COLORS: Record<string, string> = {
  QUICK: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  FULL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  WEB_CRAWL: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  API_SCAN: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
};

export function AiStrategyDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [polling, setPolling] = useState(false);

  const pollStrategy = useCallback(async (strategyId: string) => {
    setPolling(true);
    const maxAttempts = 30; // 60s max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const s = await apiClient.get<Strategy>(`/projects/${projectId}/strategy/${strategyId}`);
        setStrategy(s);
        if (s.status === 'COMPLETED' || s.status === 'FAILED') {
          setPolling(false);
          return;
        }
      } catch {
        // continue polling
      }
    }
    setPolling(false);
  }, [projectId]);

  const handleGenerate = async () => {
    setLoading(true);
    setStrategy(null);
    try {
      const result = await apiClient.post<{ strategyId: string; status: string }>(
        `/projects/${projectId}/strategy`,
        {},
      );
      const pending: Strategy = {
        id: result.strategyId,
        status: 'PENDING',
        fingerprint: null,
        plan: [],
        reasoning: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
      };
      setStrategy(pending);
      toast.success('AI analysis started — analysing target…');
      pollStrategy(result.strategyId);
    } catch {
      toast.error('Failed to start strategy analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!strategy) return;
    setExecuting(true);
    try {
      const result = await apiClient.post<{ createdScans: string[]; stepsCount: number }>(
        `/projects/${projectId}/strategy/${strategy.id}/execute`,
        {},
      );
      toast.success(`${result.stepsCount} scan${result.stepsCount !== 1 ? 's' : ''} queued from AI plan`);
      setOpen(false);
    } catch {
      toast.error('Failed to execute strategy');
    } finally {
      setExecuting(false);
    }
  };

  const isAnalysing = strategy?.status === 'PENDING' || strategy?.status === 'RUNNING' || polling;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/30">
          <Sparkles className="h-3.5 w-3.5" />
          AI Strategy
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Scan Strategy
          </DialogTitle>
          <DialogDescription>
            Claude analyses your target's technology stack and generates an optimised scan plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!strategy && !loading && (
            <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
              <Sparkles className="h-8 w-8 text-purple-400 mx-auto" />
              <p className="text-sm text-muted-foreground">
                The AI will fingerprint your target, analyse previous findings, and generate a prioritised scan plan.
              </p>
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {strategy && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2 text-sm">
                {isAnalysing && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                    <span className="text-muted-foreground">Analysing target…</span>
                  </>
                )}
                {strategy.status === 'COMPLETED' && (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-green-700 dark:text-green-400">Analysis complete</span>
                  </>
                )}
                {strategy.status === 'FAILED' && (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-700 dark:text-red-400">{strategy.errorMessage ?? 'Analysis failed'}</span>
                  </>
                )}
              </div>

              {/* Fingerprint */}
              {strategy.fingerprint?.technologies && strategy.fingerprint.technologies.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Detected Stack</p>
                  <div className="flex flex-wrap gap-1">
                    {strategy.fingerprint.technologies.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Reasoning */}
              {strategy.reasoning && (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground italic">
                  {strategy.reasoning}
                </div>
              )}

              {/* Plan steps */}
              {strategy.plan.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Scan Plan ({strategy.plan.length} steps)
                  </p>
                  {[...strategy.plan]
                    .sort((a, b) => a.priority - b.priority)
                    .map((step, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                          {step.priority}
                        </span>
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SCAN_TYPE_COLORS[step.type]}`}>
                              {SCAN_TYPE_LABELS[step.type] ?? step.type}
                            </span>
                            {step.tags?.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px] h-4">{tag}</Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">{step.rationale}</p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!strategy && (
            <Button onClick={handleGenerate} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Analyse Target
            </Button>
          )}
          {strategy && strategy.status !== 'COMPLETED' && !isAnalysing && (
            <Button onClick={handleGenerate} variant="outline" disabled={loading} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Re-analyse
            </Button>
          )}
          {strategy?.status === 'COMPLETED' && strategy.plan.length > 0 && (
            <>
              <Button variant="outline" onClick={handleGenerate} disabled={executing}>
                Re-analyse
              </Button>
              <Button onClick={handleExecute} disabled={executing} className="gap-2">
                {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Execute Plan
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
