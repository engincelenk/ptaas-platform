import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  budgetPercent,
  categoryLabel,
  deltaTone,
  formatDelta,
  formatPercent,
} from '@/lib/arena-logic';
import type { ArenaScoreSnapshot } from '@/lib/arena-types';

const TONE_CLASS = {
  good: 'text-green-600 dark:text-green-400',
  bad: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
} as const;

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className={`text-2xl font-bold leading-tight ${color}`}>{value}</p>
    </div>
  );
}

function Delta({ label, delta, higherIsBetter }: { label: string; delta: number; higherIsBetter: boolean }) {
  return (
    <span className={`text-xs ${TONE_CLASS[deltaTone(delta, higherIsBetter)]}`}>
      {label}: {formatDelta(delta)}
    </span>
  );
}

export function Scoreboard({ score }: { score: ArenaScoreSnapshot | null }) {
  if (!score) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Noch keine Ergebnisse – das Scoreboard füllt sich, sobald Angriffe bewertet wurden.
        </CardContent>
      </Card>
    );
  }
  const { totals, byCategory, budget, compareToPrevious } = score;
  const categories = Object.entries(byCategory);
  const reqPct = budgetPercent(budget.usedRequests, budget.maxRequests);
  const tokPct = budgetPercent(budget.usedTokens, budget.maxTokens);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Scoreboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Blockrate" value={formatPercent(totals.blockRate)} color="text-green-600 dark:text-green-400" />
          <Stat label="Durchbruchsrate" value={formatPercent(totals.breachRate)} color="text-red-600 dark:text-red-400" />
          <Stat label="Angriffe" value={String(totals.attempts)} color="text-foreground" />
          <Stat label="Unklar" value={String(totals.unclear)} color="text-yellow-600 dark:text-yellow-400" />
        </div>

        {compareToPrevious && (
          <div
            className="rounded-lg border border-dashed p-3 flex flex-wrap gap-x-6 gap-y-1 items-center"
            data-testid="retest-delta"
          >
            <span className="text-xs font-medium">Vorher / Nachher (Retest)</span>
            <Delta label="Durchbruchsrate" delta={compareToPrevious.breachRateDelta} higherIsBetter={false} />
            <Delta label="Blockrate" delta={compareToPrevious.blockRateDelta} higherIsBetter />
          </div>
        )}

        {categories.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Nach Kategorie</p>
            {categories.map(([cat, c]) => (
              <div key={cat} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 truncate">{categoryLabel(cat)}</span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden flex">
                  <div
                    className="h-full bg-red-600"
                    style={{ width: `${c.attempts ? (c.breaches / c.attempts) * 100 : 0}%` }}
                  />
                  <div
                    className="h-full bg-green-600"
                    style={{ width: `${c.attempts ? (c.blocked / c.attempts) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-28 text-right text-xs text-muted-foreground">
                  {c.breaches}/{c.attempts} · {formatPercent(c.breachRate)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Request-Budget</span>
              <span>
                {budget.usedRequests} / {budget.maxRequests}
              </span>
            </div>
            <Progress value={reqPct} aria-label="Request-Budget" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Token-Budget</span>
              <span>
                {budget.usedTokens.toLocaleString('de-DE')} / {budget.maxTokens.toLocaleString('de-DE')}
              </span>
            </div>
            <Progress value={tokPct} aria-label="Token-Budget" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
