'use client';

import Link from 'next/link';
import { Shield, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { RunStatusBadge } from '@/components/arena/badges';
import { useApiQuery } from '@/hooks/use-api-query';
import { useArenaRole } from '@/hooks/use-arena-role';
import { formatPercent, isOperator } from '@/lib/arena-logic';
import type { ArenaOverview, ArenaRunSummary } from '@/lib/arena-types';

export default function ArenaHomePage() {
  const role = useArenaRole();
  const overview = useApiQuery<ArenaOverview>('/arena/overview');
  const runs = useApiQuery<ArenaRunSummary[]>('/arena/runs');
  const operator = isOperator(role);

  const loading = overview.isLoading || runs.isLoading;
  const error = overview.error ?? runs.error;
  const o = overview.data;
  const recent = [...(runs.data ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Arena</h1>
          <p className="text-sm text-muted-foreground">
            Teste die Abwehr deiner KI im Duell: Rot greift an, Blau verteidigt.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/arena/targets">Targets</Link>
          </Button>
          {operator && (
            <Button asChild>
              <Link href="/arena/runs/new">Neues Duell</Link>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Daten konnten nicht geladen werden: {error.message}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Targets" value={o?.targets ?? 0} />
          <KpiCard label="Runs" value={o?.runs.total ?? 0} sub={o && o.runs.awaitingApproval > 0 ? `${o.runs.awaitingApproval} warten auf Freigabe` : undefined} />
          <KpiCard label="Laufend" value={o?.runs.running ?? 0} color="orange" />
          <KpiCard label="Durchbruchsrate" value={o?.breachRate == null ? null : formatPercent(o.breachRate)} color="red" sub="Letzter Run" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Letzte Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : recent.length === 0 ? (
            <div className="py-8 text-center space-y-4" data-testid="arena-empty">
              <div className="flex justify-center gap-6">
                <div className="flex flex-col items-center gap-1">
                  <Swords className="h-8 w-8 text-red-600" />
                  <span className="text-sm font-semibold text-red-700 dark:text-red-400">Rot</span>
                  <span className="text-xs text-muted-foreground max-w-[10rem]">Die PTaaS-KI greift an</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Shield className="h-8 w-8 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Blau</span>
                  <span className="text-xs text-muted-foreground max-w-[10rem]">Deine KI / Abwehr antwortet</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Noch kein Duell gestartet. Lege zuerst ein KI-Target an und verifiziere, dass der Endpunkt dir gehört.
                Danach wählst du Angriffsziele und ein Budget, ein Admin gibt den Run frei – dann siehst du live, wie
                deine KI sich schlägt, und erhältst konkrete Verbesserungsvorschläge.
              </p>
              <div className="flex justify-center gap-2">
                <Button asChild>
                  <Link href="/arena/targets">Target anlegen</Link>
                </Button>
                {operator && (
                  <Button variant="outline" asChild>
                    <Link href="/arena/runs/new">Neues Duell</Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/arena/runs/${encodeURIComponent(r.id)}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-accent/40 -mx-2 px-2 rounded-md"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.targetName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.goalCount} Ziele · {new Date(r.createdAt).toLocaleString('de-DE')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        Durchbruchsrate {formatPercent(r.breachRate)}
                      </span>
                      <RunStatusBadge status={r.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
