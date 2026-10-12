'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { KindBadge, OwaspBadge } from '@/components/arena/badges';
import { goalsForKind, kindOf } from '@/lib/arena-kinds';
import { useApiQuery } from '@/hooks/use-api-query';
import { useArenaRole } from '@/hooks/use-arena-role';
import { apiClient } from '@/lib/api-client';
import {
  categoryLabel,
  clampInt,
  estimateRequests,
  groupGoalsByCategory,
  isOperator,
  isTargetSelectable,
  verificationLabel,
} from '@/lib/arena-logic';
import {
  ARENA_UI_LIMITS,
  type AiTargetView,
  type ArenaGoal,
  type ArenaRunView,
  type CreateRunBody,
} from '@/lib/arena-types';

const STEPS = ['Target', 'Ziele & Budget', 'Zusammenfassung'] as const;

export default function NewArenaRunPage() {
  const router = useRouter();
  const role = useArenaRole();
  const targetsQ = useApiQuery<AiTargetView[]>('/arena/targets');
  const catalogQ = useApiQuery<ArenaGoal[]>('/arena/catalog');

  const [step, setStep] = useState(0);
  const [targetId, setTargetId] = useState('');
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [maxRounds, setMaxRounds] = useState(5);
  const [maxRequests, setMaxRequests] = useState(200);
  const [maxTokens, setMaxTokens] = useState(300_000);
  const [rps, setRps] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const targets = targetsQ.data ?? [];
  const catalog = useMemo(() => catalogQ.data ?? [], [catalogQ.data]);
  const selectedTarget = targets.find((t) => t.id === targetId) ?? null;
  const kind = kindOf(selectedTarget);
  const kindGoals = useMemo(() => goalsForKind(catalog, kind), [catalog, kind]);
  const grouped = useMemo(() => groupGoalsByCategory(kindGoals), [kindGoals]);

  // Goals of another kind must never stay selected after the target changed.
  useEffect(() => {
    const allowed = new Set(kindGoals.map((g) => g.id));
    setGoalIds((prev) => (prev.every((id) => allowed.has(id)) ? prev : prev.filter((id) => allowed.has(id))));
  }, [kindGoals]);

  // Drop a selection that is no longer selectable.
  useEffect(() => {
    if (selectedTarget && !isTargetSelectable(selectedTarget)) setTargetId('');
  }, [selectedTarget]);

  const estimate = estimateRequests({ goalCount: goalIds.length, maxRounds, maxRequests });
  const canNext =
    step === 0 ? selectedTarget !== null && isTargetSelectable(selectedTarget) : step === 1 ? goalIds.length > 0 : true;

  function toggleGoal(id: string, on: boolean) {
    setGoalIds((prev) => (on ? [...new Set([...prev, id])] : prev.filter((g) => g !== id)));
  }

  function toggleCategory(ids: string[], on: boolean) {
    setGoalIds((prev) => (on ? [...new Set([...prev, ...ids])] : prev.filter((g) => !ids.includes(g))));
  }

  async function submit() {
    if (!selectedTarget) return;
    setBusy(true);
    setErr(null);
    const body: CreateRunBody = {
      aiTargetId: selectedTarget.id,
      goalIds,
      maxRounds,
      maxRequests,
      maxTokens,
      requestsPerSecond: rps,
    };
    try {
      const run = await apiClient.post<ArenaRunView>('/arena/runs', body);
      await apiClient.post<ArenaRunView>(`/arena/runs/${encodeURIComponent(run.id)}/submit`);
      router.push(`/arena/runs/${encodeURIComponent(run.id)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Einreichen fehlgeschlagen');
      setBusy(false);
    }
  }

  if (role !== null && !isOperator(role)) {
    return (
      <div className="space-y-3">
        <p className="text-sm">Nur Admins und Security Engineers können Duelle anlegen.</p>
        <Button variant="outline" asChild>
          <Link href="/arena">Zurück zur Arena</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/arena" className="text-sm text-muted-foreground hover:text-foreground">
          ← AI Arena
        </Link>
        <h1 className="text-2xl font-bold mt-1">Neues Duell</h1>
      </div>

      <ol className="flex gap-2 text-xs" aria-label="Fortschritt">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-accent' : 'text-muted-foreground'}`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">1. Target wählen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {targetsQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : targetsQ.error ? (
              <p className="text-sm text-destructive">{targetsQ.error.message}</p>
            ) : targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch kein Target vorhanden.{' '}
                <Link href="/arena/targets" className="underline">
                  Target anlegen
                </Link>
              </p>
            ) : (
              targets.map((t) => {
                const ok = isTargetSelectable(t);
                const v = verificationLabel(t);
                return (
                  <label
                    key={t.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${ok ? 'cursor-pointer hover:bg-accent/40' : 'opacity-60 cursor-not-allowed'} ${targetId === t.id ? 'border-primary' : ''}`}
                  >
                    <input
                      type="radio"
                      name="target"
                      className="mt-1"
                      disabled={!ok}
                      checked={targetId === t.id}
                      onChange={() => setTargetId(t.id)}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {t.name} <KindBadge kind={kindOf(t)} />
                      </span>
                      <span className="block text-xs text-muted-foreground break-all">{t.endpointUrl}</span>
                      <span className="block text-xs mt-1">
                        {ok ? v.text : `${v.text} – `}
                        {!ok && (
                          <Link href="/arena/targets" className="underline">
                            in Targets verifizieren
                          </Link>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">2. Angriffsziele</CardTitle>
              <p className="text-xs text-muted-foreground">
                Alle Ziele nutzen harmlose Stellvertreter-Ziele (z. B. Marker ausgeben, Prompt-Fragmente verraten).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {kind === 'AGENT' && (
                <div className="rounded-md border border-orange-500/60 bg-orange-500/10 p-3 text-sm" data-testid="agent-warning">
                  <p className="font-semibold">Agent-Test: nur Staging, Tools müssen sandboxed sein.</p>
                  <p className="text-xs text-muted-foreground">
                    Die Angriffe fordern nur harmlose Marker-Argumente an, keine Schreib-, Lösch-, Sende- oder Zahlungsaktionen.
                    Der Run lässt sich nur starten, wenn Staging und Sandbox am Target bestätigt sind.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Ziele für <KindBadge kind={kind} />
              </div>
              {catalogQ.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : catalogQ.error ? (
                <p className="text-sm text-destructive">{catalogQ.error.message}</p>
              ) : grouped.length === 0 ? (
                <p className="text-sm text-muted-foreground">Der Katalog ist leer.</p>
              ) : (
                grouped.map(([cat, goals]) => {
                  const ids = goals.map((g) => g.id);
                  const all = ids.every((id) => goalIds.includes(id));
                  return (
                    <div key={cat} className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <Checkbox checked={all} onCheckedChange={(c) => toggleCategory(ids, c)} />
                        {categoryLabel(cat)}
                      </label>
                      <div className="space-y-1.5 pl-6">
                        {goals.map((g) => (
                          <label key={g.id} className="flex items-start gap-2 text-sm cursor-pointer">
                            <Checkbox
                              className="mt-0.5"
                              checked={goalIds.includes(g.id)}
                              onCheckedChange={(c) => toggleGoal(g.id, c)}
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">{g.title}</span>
                                {g.owaspRef && <OwaspBadge>{g.owaspRef}</OwaspBadge>}
                                {g.atlasRef && <OwaspBadge>{g.atlasRef}</OwaspBadge>}
                                <span className="text-[10px] uppercase text-muted-foreground">{g.baseSeverity}</span>
                              </span>
                              <span className="block text-xs text-muted-foreground">{g.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Budget</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <NumberField
                  id="b-rounds"
                  label="Max. Runden je Ziel"
                  value={maxRounds}
                  min={1}
                  max={ARENA_UI_LIMITS.maxRounds}
                  onChange={setMaxRounds}
                />
                <NumberField
                  id="b-req"
                  label="Max. Requests"
                  value={maxRequests}
                  min={1}
                  max={ARENA_UI_LIMITS.maxRequestsPerRun}
                  onChange={setMaxRequests}
                />
                <NumberField
                  id="b-tok"
                  label="Max. Tokens"
                  value={maxTokens}
                  min={1000}
                  max={ARENA_UI_LIMITS.maxTokensPerRun}
                  onChange={setMaxTokens}
                />
                <NumberField
                  id="b-rps"
                  label="Requests pro Sekunde"
                  value={rps}
                  min={1}
                  max={ARENA_UI_LIMITS.maxRequestsPerSecond}
                  onChange={setRps}
                />
              </div>
              <p className="text-sm">
                Geschätzte Requests: <span className="font-semibold">{estimate}</span> von {maxRequests} erlaubten
                ({goalIds.length} Ziele × bis zu {maxRounds} Runden).
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 2 && selectedTarget && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3. Zusammenfassung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Target:</span> {selectedTarget.name} <KindBadge kind={kind} />{' '}
              <span className="text-xs text-muted-foreground break-all">({selectedTarget.endpointUrl})</span>
            </p>
            <p>
              <span className="text-muted-foreground">Ziele:</span> {goalIds.length}
            </p>
            <p>
              <span className="text-muted-foreground">Budget:</span> {maxRounds} Runden · {maxRequests} Requests ·{' '}
              {maxTokens.toLocaleString('de-DE')} Tokens · {rps} Req/s
            </p>
            <p>
              <span className="text-muted-foreground">Geschätzt:</span> ca. {estimate} Requests
            </p>
            <p className="text-xs text-muted-foreground pt-2">
              Der Run wird zunächst nur eingereicht. Ein Admin muss ihn freigeben, bevor er gestartet werden kann.
            </p>
            {err && (
              <p role="alert" className="text-destructive">
                {err}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
          Zurück
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Weiter
          </Button>
        ) : (
          <Button onClick={submit} disabled={busy || goalIds.length === 0}>
            {busy ? 'Wird eingereicht …' : 'Zur Freigabe einreichen'}
          </Button>
        )}
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clampInt(Number(e.target.value), min, max))}
      />
      <p className="text-[11px] text-muted-foreground">
        Obergrenze: {max.toLocaleString('de-DE')}
      </p>
    </div>
  );
}
