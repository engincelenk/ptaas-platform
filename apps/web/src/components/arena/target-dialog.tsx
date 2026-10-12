'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';
import { validateEndpointUrl } from '@/lib/arena-logic';
import type {
  AiTargetView,
  ArenaAdapter,
  ArenaProjectRef,
  CreateAiTargetBody,
} from '@/lib/arena-types';

const ADAPTERS: { value: ArenaAdapter; label: string }[] = [
  { value: 'OPENAI_COMPAT', label: 'OpenAI-kompatibel (chat/completions)' },
  { value: 'ANTHROPIC', label: 'Anthropic Messages-Format' },
  { value: 'GENERIC_JSON', label: 'Generisches JSON (eigene Mappings)' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. Secrets are write-only and never shown. */
  target: AiTargetView | null;
  projects: ArenaProjectRef[];
  onSaved: () => void;
}

export function TargetDialog({ open, onOpenChange, target, projects, onSaved }: Props) {
  const editing = target !== null;
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [adapter, setAdapter] = useState<ArenaAdapter>('OPENAI_COMPAT');
  const [requestMapping, setRequestMapping] = useState('');
  const [responseMapping, setResponseMapping] = useState('');
  const [authHeaderName, setAuthHeaderName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [fragments, setFragments] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setApiKey('');
    setFragments('');
    setRequestMapping('');
    setResponseMapping('');
    setProjectId(target?.projectId ?? projects[0]?.id ?? '');
    setName(target?.name ?? '');
    setEndpointUrl(target?.endpointUrl ?? '');
    setAdapter(target?.adapter ?? 'OPENAI_COMPAT');
    setAuthHeaderName(target?.authHeaderName ?? '');
  }, [open, target, projects]);

  const urlError = endpointUrl ? validateEndpointUrl(endpointUrl) : null;
  const valid = name.trim().length > 0 && endpointUrl.length > 0 && !urlError && (editing || projectId !== '');

  async function save() {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    const body: CreateAiTargetBody = {
      name: name.trim(),
      endpointUrl: endpointUrl.trim(),
      adapter,
      ...(requestMapping.trim() ? { requestMapping: requestMapping.trim() } : {}),
      ...(responseMapping.trim() ? { responseMapping: responseMapping.trim() } : {}),
      ...(authHeaderName.trim() ? { authHeaderName: authHeaderName.trim() } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(fragments.trim()
        ? { knownPromptFragments: fragments.split('\n').map((l) => l.trim()).filter(Boolean) }
        : {}),
    };
    try {
      if (editing && target) {
        await apiClient.patch<AiTargetView>(`/arena/targets/${encodeURIComponent(target.id)}`, body);
      } else {
        await apiClient.post<AiTargetView>('/arena/targets', { ...body, projectId });
      }
      setApiKey('');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogClose />
        <DialogHeader>
          <DialogTitle>{editing ? 'Target bearbeiten' : 'KI-Target anlegen'}</DialogTitle>
          <DialogDescription>
            Nur dein eigener https-Endpunkt (Port 443). Provider-Hosts wie api.openai.com oder api.anthropic.com sind
            nicht erlaubt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="at-project">Projekt</Label>
              <select
                id="at-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {projects.length === 0 && <option value="">Kein Projekt vorhanden</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="at-name">Name</Label>
            <Input id="at-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="at-url">Endpunkt-URL (https)</Label>
            <Input
              id="at-url"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://chat.example.com/api/chat"
            />
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="at-adapter">Adapter</Label>
            <select
              id="at-adapter"
              value={adapter}
              onChange={(e) => setAdapter(e.target.value as ArenaAdapter)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {ADAPTERS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {adapter === 'GENERIC_JSON' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="at-reqmap">Request-Mapping (optional)</Label>
                <Textarea
                  id="at-reqmap"
                  value={requestMapping}
                  onChange={(e) => setRequestMapping(e.target.value)}
                  placeholder='{"message":"$prompt"}'
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="at-resmap">Response-Mapping (optional)</Label>
                <Input
                  id="at-resmap"
                  value={responseMapping}
                  onChange={(e) => setResponseMapping(e.target.value)}
                  placeholder="data.answer"
                />
              </div>
            </>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="at-hdr">Auth-Header (optional)</Label>
              <Input
                id="at-hdr"
                value={authHeaderName}
                onChange={(e) => setAuthHeaderName(e.target.value)}
                placeholder="Authorization"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="at-key">API-Key (optional)</Label>
              <Input
                id="at-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={target?.hasApiKey ? 'Gespeichert – leer lassen zum Beibehalten' : ''}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Der API-Key wird verschlüsselt gespeichert und nie wieder angezeigt.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="at-frag">Bekannte Prompt-Fragmente (optional, eine Zeile je Fragment)</Label>
            <Textarea
              id="at-frag"
              value={fragments}
              onChange={(e) => setFragments(e.target.value)}
              rows={3}
              placeholder={
                target && target.fragmentCount > 0
                  ? `${target.fragmentCount} Fragmente gespeichert – neue Eingabe ersetzt sie`
                  : 'Teile deines System-Prompts, die nie nach außen gelangen dürfen'
              }
            />
          </div>

          {err && (
            <p role="alert" className="text-sm text-destructive">
              {err}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? 'Speichert …' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
