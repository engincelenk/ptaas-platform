'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/use-api-query';
import { apiClient } from '@/lib/api-client';
import { canSubmitApproval, type ApprovalChecks } from '@/lib/arena-logic';
import type { ApproveRunBody, ArenaRoe, ArenaRunView } from '@/lib/arena-types';
import { TranscriptText } from './transcript-text';

const CHECK_LABELS: Record<keyof ApprovalChecks, string> = {
  noProduction: 'Das Ziel ist KEIN Produktivsystem mit echten Kunden- oder Personendaten.',
  noSideEffects: 'Die KI löst keine realen Nebenwirkungen aus (keine Zahlungen, Mails, Löschungen o. Ä.).',
  noTools: 'Die KI hat in dieser Umgebung keinen Zugriff auf schreibende Tools oder interne Systeme.',
  providerTosAccepted: 'Die Nutzungsbedingungen des Modell-Providers erlauben diesen Test; ich bin dazu berechtigt.',
};

/** Approval panel. The caller only mounts this for ADMIN users in AWAITING_APPROVAL. */
export function ApprovalPanel({ run, onDone }: { run: ArenaRunView; onDone: () => void }) {
  const { data: roe, isLoading, error } = useApiQuery<ArenaRoe>('/arena/roe/current');
  const [checks, setChecks] = useState<ApprovalChecks>({
    noProduction: false,
    noSideEffects: false,
    noTools: false,
    providerTosAccepted: false,
  });
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = canSubmitApproval(checks, contact, roe?.version ?? null);

  async function approve() {
    if (!roe || !ready) return;
    setBusy(true);
    setErr(null);
    const body: ApproveRunBody = {
      roeVersion: roe.version,
      emergencyContact: contact.trim(),
      confirmations: {
        noProduction: true,
        noSideEffects: true,
        noTools: true,
        providerTosAccepted: true,
      },
    };
    try {
      await apiClient.post<ArenaRunView>(`/arena/runs/${encodeURIComponent(run.id)}/approve`, body);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Freigabe fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-yellow-500/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Freigabe (nur Admin)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Die Freigabe wird mit deinem Namen, Zeitstempel und der Version der Einsatzregeln (RoE) protokolliert.
        </p>

        {isLoading && <Skeleton className="h-32 w-full" />}
        {error && <p className="text-sm text-destructive">RoE konnte nicht geladen werden: {error.message}</p>}
        {roe && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Rules of Engagement – Version {roe.version}</p>
            <div className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-3">
              <TranscriptText text={roe.content} className="font-sans text-sm" />
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(Object.keys(CHECK_LABELS) as (keyof ApprovalChecks)[]).map((k) => (
            <label key={k} className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                className="mt-0.5"
                checked={checks[k]}
                onCheckedChange={(c) => setChecks((prev) => ({ ...prev, [k]: c }))}
              />
              <span>{CHECK_LABELS[k]}</span>
            </label>
          ))}
        </div>

        <div className="space-y-1.5 max-w-md">
          <Label htmlFor="emergency-contact">Notfallkontakt (Name + Telefon/E-Mail)</Label>
          <Input
            id="emergency-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="z. B. Max Mustermann, +49 …"
            maxLength={200}
          />
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <Button onClick={approve} disabled={!ready || busy}>
          {busy ? 'Wird freigegeben …' : 'Run freigeben'}
        </Button>
      </CardContent>
    </Card>
  );
}
