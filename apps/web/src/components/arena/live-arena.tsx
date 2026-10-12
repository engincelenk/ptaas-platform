'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Shield, Swords } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { categoryLabel } from '@/lib/arena-logic';
import type { ArenaAttemptView, ArenaGoal, ArenaVerdict } from '@/lib/arena-types';
import { VerdictBadge } from './badges';
import { TranscriptText } from './transcript-text';

const DOT_CLASS: Record<ArenaVerdict, string> = {
  BREACH: 'bg-red-600',
  BLOCKED: 'bg-green-600',
  UNCLEAR: 'bg-yellow-500',
};

interface LiveArenaProps {
  attempts: ArenaAttemptView[];
  goals: ArenaGoal[];
  projectId: string | null;
  running: boolean;
}

export function LiveArena({ attempts, goals, projectId, running }: LiveArenaProps) {
  const [goalFilter, setGoalFilter] = useState<string>('ALL');

  const goalTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of goals) m.set(g.key, g.title);
    return m;
  }, [goals]);

  const byGoal = useMemo(() => {
    const m = new Map<string, ArenaAttemptView[]>();
    for (const a of attempts) {
      const list = m.get(a.goalKey) ?? [];
      list.push(a);
      m.set(a.goalKey, list);
    }
    return m;
  }, [attempts]);

  const visible = goalFilter === 'ALL' ? attempts : (byGoal.get(goalFilter) ?? []);

  return (
    <div className="space-y-4">
      {/* Round history per goal */}
      {byGoal.size > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rundenverlauf je Ziel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGoalFilter('ALL')}
                className={`rounded-md border px-2.5 py-1 text-xs ${goalFilter === 'ALL' ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
              >
                Alle ({attempts.length})
              </button>
              {[...byGoal.entries()].map(([key, list]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGoalFilter(key)}
                  className={`rounded-md border px-2.5 py-1 text-xs flex items-center gap-2 ${goalFilter === key ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
                >
                  <span className="truncate max-w-[16rem]">{goalTitle.get(key) ?? key}</span>
                  <span className="flex gap-0.5" aria-label="Runden">
                    {list.map((a) => (
                      <span
                        key={a.id}
                        title={`Runde ${a.round}`}
                        className={`h-2.5 w-2.5 rounded-full ${a.verdict ? DOT_CLASS[a.verdict] : 'bg-muted-foreground/40'}`}
                      />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Split view */}
      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="bg-red-600/10 border-b md:border-b-0 md:border-r border-red-600/30 px-4 py-2 flex items-center gap-2">
            <Swords className="h-4 w-4 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Rot – PTaaS-KI greift an</p>
              <p className="text-[11px] text-muted-foreground">Angriffe auf deine KI</p>
            </div>
          </div>
          <div className="hidden md:flex bg-blue-600/10 px-4 py-2 items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Blau – deine KI / Abwehr</p>
              <p className="text-[11px] text-muted-foreground">Antworten und Bewertung</p>
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {running
              ? 'Warte auf den ersten Angriff …'
              : 'Noch keine Angriffe vorhanden. Der Duell-Verlauf erscheint hier, sobald der Run gestartet wurde.'}
          </div>
        ) : (
          <ol className="divide-y" aria-live="polite" aria-label="Duell-Verlauf">
            {visible.map((a) => (
              <li key={a.id} className="grid grid-cols-1 md:grid-cols-2" data-testid="attempt-row">
                <div className="p-3 space-y-1.5 bg-red-600/5 md:border-r border-red-600/20">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-red-700 dark:text-red-400">Runde {a.round}</span>
                    <span>·</span>
                    <span>{a.technique}</span>
                    <span>·</span>
                    <span>{goalTitle.get(a.goalKey) ?? a.goalKey}</span>
                    <span>·</span>
                    <span>{categoryLabel(a.category)}</span>
                    {a.kind === 'RECON' && <span className="rounded bg-secondary px-1">Recon</span>}
                  </div>
                  <TranscriptText text={a.attackText} />
                </div>
                <div className="p-3 space-y-1.5 bg-blue-600/5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="md:hidden text-[11px] font-medium text-blue-700 dark:text-blue-400">
                      Blau – Antwort
                    </span>
                    <VerdictBadge verdict={a.verdict} />
                    {a.confidence !== null && (
                      <span className="text-[11px] text-muted-foreground">
                        Konfidenz {Math.round(a.confidence * 100)} %
                      </span>
                    )}
                    {a.findingId && projectId && (
                      <Link
                        href={`/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(a.findingId)}`}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        Finding <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  {a.responseText === null ? (
                    <p className="text-xs text-muted-foreground italic">Antwort steht noch aus …</p>
                  ) : (
                    <TranscriptText text={a.responseText} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
