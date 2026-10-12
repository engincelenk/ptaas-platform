'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { OctagonX, Play, RefreshCw, Send, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { KindBadge, RunStatusBadge } from '@/components/arena/badges';
import { Scoreboard } from '@/components/arena/scoreboard';
import { LiveArena } from '@/components/arena/live-arena';
import { RecommendationsPanel } from '@/components/arena/recommendations-panel';
import { ApprovalPanel } from '@/components/arena/approval-panel';
import { TranscriptText } from '@/components/arena/transcript-text';
import { useArenaRun } from '@/hooks/use-arena-run';
import { useArenaRole } from '@/hooks/use-arena-role';
import { apiClient } from '@/lib/api-client';
import { runActions } from '@/lib/arena-logic';
import { kindOf, ragCleanupText } from '@/lib/arena-kinds';
import type {
  AiTargetView,
  ArenaRecommendation,
  ArenaRunDetail,
  ArenaRunView,
} from '@/lib/arena-types';

export default function ArenaRunPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;
  const router = useRouter();
  const role = useArenaRole();

  const [run, setRun] = useState<ArenaRunDetail | null>(null);
  const [targets, setTargets] = useState<AiTargetView[]>([]);
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await apiClient.get<ArenaRunDetail>(`/arena/runs/${encodeURIComponent(runId)}`);
      setRun(detail);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
    apiClient
      .get<AiTargetView[]>('/arena/targets')
      .then((t) => {
        setTargets(t);
        setTargetsLoaded(true);
      })
      .catch(() => {
        setTargets([]);
        setTargetsLoaded(true);
      });
  }, [load]);

  const status = run?.status ?? null;
  const { live, connection, loadingInitial, initialError } = useArenaRun({
    runId,
    streamEnabled: status === 'RUNNING',
    onStatusChange: () => void load(),
  });

  const effectiveStatus = live.status ?? status ?? 'DRAFT';
  const score = live.score ?? run?.score ?? null;

  const recommendations: ArenaRecommendation[] = useMemo(() => {
    const m = new Map<string, ArenaRecommendation>();
    for (const r of run?.recommendations ?? []) m.set(r.id, r);
    for (const r of live.recommendations) m.set(r.id, r);
    return [...m.values()].sort((a, b) => a.priority - b.priority);
  }, [run?.recommendations, live.recommendations]);

  const aiTarget = useMemo(
    () => targets.find((t) => t.id === run?.aiTargetId) ?? null,
    [targets, run?.aiTargetId],
  );
  const projectId = aiTarget?.projectId ?? null;
  const kind = kindOf(aiTarget);
  const ragStatus = run?.artifactsSummary?.rag;
  const agentSummary = run?.artifactsSummary?.agent;

  const findingIds = useMemo(() => {
    const set = new Set<string>(live.findingIds);
    for (const a of live.attempts) if (a.findingId) set.add(a.findingId);
    return [...set];
  }, [live.findingIds, live.attempts]);

  const actions = runActions(role, effectiveStatus);

  async function act(name: string, path: string, body?: unknown) {
    setBusy(name);
    setActionError(null);
    try {
      const res = await apiClient.post<ArenaRunView>(`/arena/runs/${encodeURIComponent(runId)}/${path}`, body);
      if (path === 'retest') router.push(`/arena/runs/${encodeURIComponent(res.id)}`);
      else await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-3">
        <p className="text-destructive text-sm">{error ?? 'Run nicht gefunden.'}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Erneut versuchen
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/arena">Zur Arena</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/arena" className="text-sm text-muted-foreground hover:text-foreground">
            ← AI Arena
          </Link>
          <h1 className="text-2xl font-bold flex flex-wrap items-center gap-3 mt-1">
            Duell: {run.targetName}
            <RunStatusBadge status={effectiveStatus} />
            <KindBadge kind={kind} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {run.goalCount} Ziele · bis zu {run.maxRounds} Runden · Budget {run.maxRequests} Requests
            {run.retestOfRunId && (
              <>
                {' · '}
                <Link href={`/arena/runs/${encodeURIComponent(run.retestOfRunId)}`} className="underline">
                  Retest von früherem Run
                </Link>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === 'RUNNING' && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="connection">
              {connection === 'live' ? (
                <Wifi className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-yellow-600" />
              )}
              {connection === 'live'
                ? 'Live'
                : connection === 'polling'
                  ? 'Verbindung unterbrochen – aktualisiere per Polling'
                  : 'Verbinde …'}
            </span>
          )}
          {actions.canSubmit && (
            <Button onClick={() => act('submit', 'submit')} disabled={busy !== null}>
              <Send className="h-4 w-4 mr-2" /> Zur Freigabe einreichen
            </Button>
          )}
          {actions.canStart && (
            <Button onClick={() => act('start', 'start')} disabled={busy !== null}>
              <Play className="h-4 w-4 mr-2" /> {busy === 'start' ? 'Startet …' : 'Run starten'}
            </Button>
          )}
          {actions.canRetest && (
            <Button variant="outline" onClick={() => act('retest', 'retest')} disabled={busy !== null}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retest
            </Button>
          )}
          {actions.canAbort && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={busy !== null}>
                  <OctagonX className="h-4 w-4 mr-2" /> Not-Aus
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Run sofort abbrechen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Der Not-Aus stoppt alle weiteren Angriffe auf deine KI. Bereits gesendete Requests lassen sich nicht
                    zurückholen. Der Abbruch wird protokolliert.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Weiterlaufen lassen</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    onClick={() => void act('abort', 'abort', { reason: 'Manueller Not-Aus über die UI' })}
                  >
                    Jetzt abbrechen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {(live.reason || run.abortedReason) && (effectiveStatus === 'ABORTED' || effectiveStatus === 'FAILED') && (
        <div className="rounded-md border p-3 text-sm">
          <span className="font-medium">Grund: </span>
          <TranscriptText text={live.reason ?? run.abortedReason} className="inline font-sans text-sm" />
        </div>
      )}

      {effectiveStatus === 'AWAITING_APPROVAL' && !actions.canApprove && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          Dieser Run wartet auf die Freigabe durch einen Admin.
        </div>
      )}

      {actions.canApprove && targetsLoaded && (
        <ApprovalPanel run={run} kind={kind} onDone={() => void load()} />
      )}

      {kind === 'WIDGET' && (
        <div className="rounded-md border border-cyan-600/40 bg-cyan-600/10 p-3 text-sm" data-testid="widget-hint">
          Web-Widget-Test: PTaaS steuert eine automatisierte Browsersitzung ausschließlich auf der verifizierten Domain.
          Andere Hosts werden blockiert. Antworten werden nur als Text gelesen.
        </div>
      )}
      {kind === 'AGENT' && (
        <div className="rounded-md border border-orange-500/50 bg-orange-500/10 p-3 text-sm" data-testid="agent-hint">
          Agent-Test (nur Staging): Die Marker-Argumente sind wirkungslos, Tools müssen sandboxed oder im Dry-Run sein.
          {agentSummary && <> Bisher beobachtete Tool-Aufrufe: {agentSummary.toolCallsObserved}.</>}
        </div>
      )}
      {kind === 'RAG' && ragStatus && (
        <div
          data-testid="rag-cleanup"
          className={`rounded-md border p-3 text-sm ${ragCleanupText(ragStatus).tone === 'warn' ? 'border-yellow-500/60 bg-yellow-500/10' : 'border-purple-600/40 bg-purple-600/10'}`}
        >
          <span className="font-medium">RAG-Testdokumente: </span>
          {ragCleanupText(ragStatus).text}
        </div>
      )}

      {run.approvedByName && run.approvedAt && (
        <p className="text-xs text-muted-foreground">
          Freigegeben von <span className="font-medium">{run.approvedByName}</span> am{' '}
          {new Date(run.approvedAt).toLocaleString('de-DE')}
          {run.roeVersion !== null && <> · RoE v{run.roeVersion}</>}
          {run.emergencyContact && <> · Notfallkontakt: {run.emergencyContact}</>}
        </p>
      )}

      <Scoreboard score={score} />

      {initialError && (
        <p className="text-sm text-destructive">Transkript konnte nicht geladen werden: {initialError}</p>
      )}
      {loadingInitial ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <LiveArena
          attempts={live.attempts}
          goals={run.goals}
          projectId={projectId}
          running={effectiveStatus === 'RUNNING'}
        />
      )}

      <RecommendationsPanel items={recommendations} />

      {findingIds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Findings aus diesem Run ({findingIds.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {findingIds.map((id) => (
                <li key={id}>
                  {projectId ? (
                    <Link
                      href={`/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(id)}`}
                      className="text-primary hover:underline"
                    >
                      Finding {id.slice(0, 8)} öffnen →
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Finding {id.slice(0, 8)}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
