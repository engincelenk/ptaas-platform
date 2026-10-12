'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api-client';
import type { AiTargetVerification, AiTargetView, VerificationMethod } from '@/lib/arena-types';
import { TranscriptText } from './transcript-text';

const METHODS: { value: VerificationMethod; label: string }[] = [
  { value: 'DNS_TXT', label: 'DNS-TXT-Eintrag' },
  { value: 'HTTP_FILE', label: 'Datei auf dem Server' },
  { value: 'META_TAG', label: 'Meta-Tag auf der Seite' },
];

export function VerificationPanel({
  target,
  canVerify,
  onVerified,
}: {
  target: AiTargetView;
  canVerify: boolean;
  onVerified: () => void;
}) {
  const [info, setInfo] = useState<AiTargetVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [method, setMethod] = useState<VerificationMethod>('DNS_TXT');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    apiClient
      .get<AiTargetVerification>(`/arena/targets/${encodeURIComponent(target.id)}/verification`)
      .then((v) => {
        if (cancelled) return;
        setInfo(v);
        if (v.method) setMethod(v.method);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target.id, target.verification.status, target.verification.verifiedAt]);

  async function verify() {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        `/arena/targets/${encodeURIComponent(target.id)}/verify`,
        { method },
      );
      setResult(res);
      onVerified();
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : 'Verifikation fehlgeschlagen' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-28 w-full" />;
  if (loadErr) return <p className="text-sm text-destructive">{loadErr}</p>;
  if (!info) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <p className="text-sm">
        Bestätige, dass dir dieser Endpunkt gehört. Wähle eine Methode, richte sie mit dem Token ein und klicke
        „Verifizieren“. Die Verifikation gilt 30 Tage.
      </p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Verifikationsmethode">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={method === m.value}
            onClick={() => setMethod(m.value)}
            className={`rounded-md border px-3 py-1.5 text-xs ${method === m.value ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">Anleitung</p>
        <div className="rounded-md border bg-background p-3">
          <TranscriptText text={info.instructions[method]} className="font-sans text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">Token</p>
        <code className="block rounded-md border bg-background p-2 text-xs break-all select-all">{info.token}</code>
      </div>

      <p className="text-xs text-muted-foreground">
        Hinweis: Hosts von Modell-Providern (z. B. api.openai.com, api.anthropic.com) können nicht verifiziert werden –
        verwende deinen eigenen Endpunkt.
      </p>

      {info.expiresAt && (
        <p className="text-xs text-muted-foreground">
          {info.fresh ? 'Gültig bis' : 'Abgelaufen am'} {new Date(info.expiresAt).toLocaleDateString('de-DE')}
          {!info.fresh && ' – bitte neu verifizieren.'}
        </p>
      )}

      {result && (
        <p
          role="status"
          className={`text-sm ${result.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
        >
          {result.message}
        </p>
      )}

      {canVerify ? (
        <Button size="sm" onClick={verify} disabled={busy}>
          {busy ? 'Prüfe …' : 'Verifizieren'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Verifizieren dürfen nur Admins und Security Engineers.</p>
      )}
    </div>
  );
}
