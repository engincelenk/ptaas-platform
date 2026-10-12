'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { KindBadge } from '@/components/arena/badges';
import { kindOf } from '@/lib/arena-kinds';
import { TargetDialog } from '@/components/arena/target-dialog';
import { VerificationPanel } from '@/components/arena/verification-panel';
import { useArenaRole } from '@/hooks/use-arena-role';
import { apiClient } from '@/lib/api-client';
import { isOperator, verificationLabel } from '@/lib/arena-logic';
import type { AiTargetView, ArenaProjectRef } from '@/lib/arena-types';

const TONE = {
  good: 'bg-green-600 text-white',
  warn: 'bg-yellow-500 text-black',
  bad: 'bg-red-600 text-white',
} as const;

export default function ArenaTargetsPage() {
  const role = useArenaRole();
  const operator = isOperator(role);

  const [targets, setTargets] = useState<AiTargetView[] | null>(null);
  const [projects, setProjects] = useState<ArenaProjectRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AiTargetView | null>(null);
  const [openVerify, setOpenVerify] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTargets(await apiClient.get<AiTargetView[]>('/arena/targets'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Targets konnten nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    void load();
    apiClient
      .get<ArenaProjectRef[]>('/projects')
      .then((p) => setProjects(p.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setProjects([]));
  }, [load]);

  async function remove(id: string) {
    setActionError(null);
    try {
      await apiClient.delete<unknown>(`/arena/targets/${encodeURIComponent(id)}`);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/arena" className="text-sm text-muted-foreground hover:text-foreground">
            ← AI Arena
          </Link>
          <h1 className="text-2xl font-bold mt-1">KI-Targets</h1>
          <p className="text-sm text-muted-foreground">
            Deine KI-Endpunkte. Nur verifizierte Targets können getestet werden.
          </p>
        </div>
        {operator && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Target anlegen
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}{' '}
          <button className="underline" onClick={() => void load()}>
            Erneut versuchen
          </button>
        </div>
      )}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {targets === null && !error ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : targets && targets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
            <p>Noch kein Target vorhanden.</p>
            <p>
              Lege den https-Endpunkt deiner KI an (z. B. deinen Chatbot) und verifiziere, dass er dir gehört. Provider-Hosts
              wie api.openai.com sind nicht erlaubt.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(targets ?? []).map((t) => {
            const v = verificationLabel(t);
            return (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-2">
                        {t.name} <KindBadge kind={kindOf(t)} />
                        {t.environment === 'STAGING' && (
                          <span className="text-[11px] rounded bg-secondary px-1.5 py-0.5">Staging</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground break-all">{t.endpointUrl}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Adapter {t.adapter} · API-Key {t.hasApiKey ? 'hinterlegt' : 'nicht hinterlegt'} ·{' '}
                        {t.fragmentCount} Prompt-Fragmente
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[v.tone]}`}>{v.text}</span>
                      {t.verification.expiresAt && t.verification.status === 'VERIFIED' && (
                        <span className="text-xs text-muted-foreground">
                          bis {new Date(t.verification.expiresAt).toLocaleDateString('de-DE')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenVerify(openVerify === t.id ? null : t.id)}
                    >
                      {t.verification.status === 'VERIFIED' && t.verification.fresh ? 'Verifikation' : 'Verifizieren'}
                    </Button>
                    {operator && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(t);
                            setDialogOpen(true);
                          }}
                        >
                          Bearbeiten
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">
                              Löschen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Target „{t.name}“ löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Das Löschen ist nur möglich, solange kein Run auf diesem Target läuft.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground"
                                onClick={() => void remove(t.id)}
                              >
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                  {openVerify === t.id && (
                    <VerificationPanel target={t} canVerify={operator} onVerified={() => void load()} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TargetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        target={editing}
        projects={projects}
        onSaved={() => void load()}
      />
    </div>
  );
}
