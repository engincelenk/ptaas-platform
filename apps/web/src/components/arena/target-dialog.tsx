'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  KIND_LABEL,
  RAG_DELAY_MAX_MS,
  adapterForKind,
  allowedEnvironments,
  buildRagConfig,
  buildWidgetConfig,
  kindOf,
  type RagFormState,
  type WidgetFormState,
} from '@/lib/arena-kinds';
import type {
  AiTargetView,
  ArenaAdapter,
  ArenaEnvironment,
  ArenaProjectRef,
  ArenaTargetKind,
  AttestBody,
  CreateAiTargetBody,
} from '@/lib/arena-types';

const ADAPTERS: { value: ArenaAdapter; label: string }[] = [
  { value: 'OPENAI_COMPAT', label: 'OpenAI-kompatibel (chat/completions)' },
  { value: 'ANTHROPIC', label: 'Anthropic Messages-Format' },
  { value: 'GENERIC_JSON', label: 'Generisches JSON (eigene Mappings)' },
];

const KINDS: ArenaTargetKind[] = ['CHAT', 'RAG', 'AGENT', 'WIDGET'];

const EMPTY_RAG: RagFormState = {
  mode: 'AUTO',
  ingestUrl: '',
  ingestMethod: 'POST',
  ingestBody: '',
  docIdPath: '',
  deleteUrl: '',
  deleteMethod: 'DELETE',
  deleteBody: '',
  indexingDelayMs: 3000,
};

const EMPTY_WIDGET: WidgetFormState = {
  pageUrl: '',
  openSelector: '',
  iframeSelector: '',
  inputSelector: '',
  sendSelector: '',
  responseSelector: '',
  cookieConsentSelector: '',
  waitAfterOpenMs: 1500,
  responseTimeoutMs: 20000,
};

const SELECT_CLASS = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

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
  const [kind, setKind] = useState<ArenaTargetKind>('CHAT');
  const [environment, setEnvironment] = useState<ArenaEnvironment>('PRODUCTION');
  const [rag, setRag] = useState<RagFormState>(EMPTY_RAG);
  const [widget, setWidget] = useState<WidgetFormState>(EMPTY_WIDGET);
  const [dryRunName, setDryRunName] = useState('');
  const [dryRunValue, setDryRunValue] = useState('');
  const [toolCallsPath, setToolCallsPath] = useState('');
  const [attestRag, setAttestRag] = useState(false);
  const [attestStaging, setAttestStaging] = useState(false);
  const [attestSandbox, setAttestSandbox] = useState(false);
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
    const k = kindOf(target);
    setKind(k);
    setEnvironment(k === 'AGENT' ? 'STAGING' : (target?.environment ?? 'PRODUCTION'));
    const rc = target?.ragConfig;
    setRag(
      rc
        ? {
            mode: rc.mode,
            ingestUrl: rc.ingest?.url ?? '',
            ingestMethod: rc.ingest?.method ?? 'POST',
            ingestBody: rc.ingest ? JSON.stringify(rc.ingest.bodyTemplate, null, 2) : '',
            docIdPath: rc.ingest?.docIdPath ?? '',
            deleteUrl: rc.delete?.url ?? '',
            deleteMethod: rc.delete?.method ?? 'DELETE',
            deleteBody: rc.delete?.bodyTemplate ? JSON.stringify(rc.delete.bodyTemplate, null, 2) : '',
            indexingDelayMs: rc.indexingDelayMs ?? 3000,
          }
        : EMPTY_RAG,
    );
    const wc = target?.widgetConfig;
    setWidget(
      wc
        ? {
            pageUrl: wc.pageUrl,
            openSelector: wc.openSelector ?? '',
            iframeSelector: wc.iframeSelector ?? '',
            inputSelector: wc.inputSelector,
            sendSelector: wc.sendSelector ?? '',
            responseSelector: wc.responseSelector,
            cookieConsentSelector: wc.cookieConsentSelector ?? '',
            waitAfterOpenMs: wc.waitAfterOpenMs ?? 1500,
            responseTimeoutMs: wc.responseTimeoutMs ?? 20000,
          }
        : EMPTY_WIDGET,
    );
    setDryRunName(target?.agentConfig?.dryRunHeaderName ?? '');
    setDryRunValue(target?.agentConfig?.dryRunHeaderValue ?? '');
    setToolCallsPath(target?.agentConfig?.toolCallsPath ?? '');
    setAttestRag(false);
    setAttestStaging(false);
    setAttestSandbox(false);
  }, [open, target, projects]);

  function changeKind(next: ArenaTargetKind) {
    setKind(next);
    setAdapter((a) => adapterForKind(next, a));
    if (!allowedEnvironments(next).includes(environment)) setEnvironment('STAGING');
  }

  const urlError = endpointUrl ? validateEndpointUrl(endpointUrl) : null;
  const ragBuilt = kind === 'RAG' ? buildRagConfig(rag, endpointUrl) : null;
  const widgetBuilt = kind === 'WIDGET' ? buildWidgetConfig(widget, endpointUrl) : null;
  const configErrors = [...(ragBuilt?.errors ?? []), ...(widgetBuilt?.errors ?? [])];
  const valid =
    name.trim().length > 0 &&
    endpointUrl.length > 0 &&
    !urlError &&
    (editing || projectId !== '') &&
    configErrors.length === 0;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    const body: CreateAiTargetBody = {
      name: name.trim(),
      endpointUrl: endpointUrl.trim(),
      adapter: adapterForKind(kind, adapter),
      kind,
      environment: kind === 'AGENT' ? 'STAGING' : environment,
      ...(ragBuilt?.config ? { ragConfig: ragBuilt.config } : {}),
      ...(widgetBuilt?.config ? { widgetConfig: widgetBuilt.config } : {}),
      ...(kind === 'AGENT'
        ? {
            agentConfig: {
              ...(dryRunName.trim() ? { dryRunHeaderName: dryRunName.trim() } : {}),
              ...(dryRunValue.trim() ? { dryRunHeaderValue: dryRunValue.trim() } : {}),
              ...(toolCallsPath.trim() ? { toolCallsPath: toolCallsPath.trim() } : {}),
            },
          }
        : {}),
      ...(requestMapping.trim() ? { requestMapping: requestMapping.trim() } : {}),
      ...(responseMapping.trim() ? { responseMapping: responseMapping.trim() } : {}),
      ...(authHeaderName.trim() ? { authHeaderName: authHeaderName.trim() } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(fragments.trim()
        ? { knownPromptFragments: fragments.split('\n').map((l) => l.trim()).filter(Boolean) }
        : {}),
    };
    try {
      let saved: AiTargetView;
      if (editing && target) {
        saved = await apiClient.patch<AiTargetView>(`/arena/targets/${encodeURIComponent(target.id)}`, body);
      } else {
        saved = await apiClient.post<AiTargetView>('/arena/targets', { ...body, projectId });
      }
      // Attestations are sent after saving: config changes reset them on the server.
      const attest: AttestBody = {
        ...(kind === 'RAG' && rag.mode === 'MANUAL' && attestRag ? { ragDocsPlaced: true as const } : {}),
        ...(kind === 'AGENT' && attestStaging ? { stagingConfirmed: true as const } : {}),
        ...(kind === 'AGENT' && attestSandbox ? { sandboxAttested: true as const } : {}),
      };
      if (Object.keys(attest).length > 0) {
        await apiClient.post<unknown>(`/arena/targets/${encodeURIComponent(saved.id)}/attest`, attest);
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
                className={SELECT_CLASS}
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
            <Label htmlFor="at-kind">Art des Ziels</Label>
            <select
              id="at-kind"
              value={kind}
              onChange={(e) => changeKind(e.target.value as ArenaTargetKind)}
              className={SELECT_CLASS}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          {editing && (
            <p className="text-xs rounded-md border border-yellow-500/50 bg-yellow-500/10 p-2">
              Achtung: Änderungen an der Konfiguration setzen Runs auf Entwurf zurück und löschen die Attestierungen.
              Neue Freigaben sind danach nötig.
            </p>
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
            <Label htmlFor="at-env">Umgebung</Label>
            <select
              id="at-env"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as ArenaEnvironment)}
              className={SELECT_CLASS}
            >
              {allowedEnvironments(kind).map((env) => (
                <option key={env} value={env}>
                  {env === 'STAGING' ? 'Staging' : 'Produktion'}
                </option>
              ))}
            </select>
            {kind === 'AGENT' && (
              <p className="text-xs text-muted-foreground">
                Agenten dürfen ausschließlich in Staging getestet werden.
              </p>
            )}
          </div>

          {kind !== 'WIDGET' && (
            <div className="space-y-1.5">
              <Label htmlFor="at-adapter">Adapter</Label>
              <select
                id="at-adapter"
                value={adapter}
                onChange={(e) => setAdapter(e.target.value as ArenaAdapter)}
                className={SELECT_CLASS}
              >
                {ADAPTERS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind !== 'WIDGET' && adapter === 'GENERIC_JSON' && (
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

          {kind === 'RAG' && (
            <fieldset className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-xs font-semibold">RAG-Konfiguration</legend>
              <div className="space-y-1.5">
                <Label htmlFor="rag-mode">Modus</Label>
                <select
                  id="rag-mode"
                  value={rag.mode}
                  onChange={(e) => setRag({ ...rag, mode: e.target.value as RagFormState['mode'] })}
                  className={SELECT_CLASS}
                >
                  <option value="AUTO">Automatisch (PTaaS spielt Testdokumente ein und entfernt sie)</option>
                  <option value="MANUAL">Manuell (du platzierst die Dokumente selbst)</option>
                </select>
              </div>

              {rag.mode === 'AUTO' ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Ingest- und Delete-URL müssen auf demselben Host wie der Endpunkt liegen. Authentifizierung wie beim
                    Chat-Endpunkt. In Bodies sind {'{{content}}'} und {'{{docId}}'} als Platzhalter erlaubt.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="rag-iurl">Ingest-URL</Label>
                      <Input
                        id="rag-iurl"
                        value={rag.ingestUrl}
                        onChange={(e) => setRag({ ...rag, ingestUrl: e.target.value })}
                        placeholder="https://chat.example.com/api/docs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rag-imethod">Methode</Label>
                      <select
                        id="rag-imethod"
                        value={rag.ingestMethod}
                        onChange={(e) => setRag({ ...rag, ingestMethod: e.target.value as 'POST' | 'PUT' })}
                        className={SELECT_CLASS}
                      >
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rag-ibody">Ingest-Body (JSON)</Label>
                    <Textarea
                      id="rag-ibody"
                      rows={4}
                      value={rag.ingestBody}
                      onChange={(e) => setRag({ ...rag, ingestBody: e.target.value })}
                      placeholder={'{"id":"{{docId}}","text":"{{content}}"}'}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rag-docid">Dokument-ID-Pfad in der Antwort (optional)</Label>
                    <Input
                      id="rag-docid"
                      value={rag.docIdPath}
                      onChange={(e) => setRag({ ...rag, docIdPath: e.target.value })}
                      placeholder="data.id"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="rag-durl">Delete-URL (empfohlen)</Label>
                      <Input
                        id="rag-durl"
                        value={rag.deleteUrl}
                        onChange={(e) => setRag({ ...rag, deleteUrl: e.target.value })}
                        placeholder="https://chat.example.com/api/docs/{{docId}}"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rag-dmethod">Methode</Label>
                      <select
                        id="rag-dmethod"
                        value={rag.deleteMethod}
                        onChange={(e) => setRag({ ...rag, deleteMethod: e.target.value as 'DELETE' | 'POST' })}
                        className={SELECT_CLASS}
                      >
                        <option value="DELETE">DELETE</option>
                        <option value="POST">POST</option>
                      </select>
                    </div>
                  </div>
                  {rag.deleteUrl.trim() && (
                    <div className="space-y-1.5">
                      <Label htmlFor="rag-dbody">Delete-Body (JSON, optional)</Label>
                      <Textarea
                        id="rag-dbody"
                        rows={2}
                        value={rag.deleteBody}
                        onChange={(e) => setRag({ ...rag, deleteBody: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="rag-delay">Wartezeit bis zur Indexierung (ms, 0–{RAG_DELAY_MAX_MS})</Label>
                    <Input
                      id="rag-delay"
                      type="number"
                      min={0}
                      max={RAG_DELAY_MAX_MS}
                      value={rag.indexingDelayMs}
                      onChange={(e) => setRag({ ...rag, indexingDelayMs: Number(e.target.value) })}
                    />
                  </div>
                  {ragBuilt?.warnings.map((w) => (
                    <p key={w} className="text-xs text-yellow-700 dark:text-yellow-400">
                      {w}
                    </p>
                  ))}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Platziere die Testdokumente selbst im Index und trage ihre Marker unten bei „Bekannte
                    Prompt-Fragmente“ ein. PTaaS fragt nur danach ab.
                  </p>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox className="mt-0.5" checked={attestRag} onCheckedChange={setAttestRag} />
                    <span>Ich bestätige: Die Dokumente mit den Markern sind im Index platziert.</span>
                  </label>
                  {target?.attestations?.ragDocsPlacedAt && (
                    <p className="text-xs text-muted-foreground">
                      Bereits bestätigt am {new Date(target.attestations.ragDocsPlacedAt).toLocaleString('de-DE')}.
                    </p>
                  )}
                </>
              )}
            </fieldset>
          )}

          {kind === 'AGENT' && (
            <fieldset className="space-y-3 rounded-md border border-orange-500/50 p-3">
              <legend className="px-1 text-xs font-semibold">Agent-Konfiguration (nur Staging)</legend>
              <p className="text-xs text-muted-foreground">
                Der Agent darf nur in einer Staging-Umgebung mit sandboxed Tools getestet werden. Marker-Argumente haben
                keine echte Wirkung.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ag-hname">Dry-Run-Header (Name)</Label>
                  <Input
                    id="ag-hname"
                    value={dryRunName}
                    onChange={(e) => setDryRunName(e.target.value)}
                    placeholder="X-Dry-Run"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ag-hval">Dry-Run-Header (Wert)</Label>
                  <Input
                    id="ag-hval"
                    value={dryRunValue}
                    onChange={(e) => setDryRunValue(e.target.value)}
                    placeholder="true"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ag-path">Tool-Call-Pfad in der Antwort (optional)</Label>
                <Input
                  id="ag-path"
                  value={toolCallsPath}
                  onChange={(e) => setToolCallsPath(e.target.value)}
                  placeholder="choices.0.message.tool_calls"
                />
                <p className="text-xs text-muted-foreground">
                  Ohne Tool-Call-Trace kann ein Durchbruch höchstens als „Unklar“ gewertet werden.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox className="mt-0.5" checked={attestStaging} onCheckedChange={setAttestStaging} />
                <span>
                  Ich bestätige: Dieses Ziel ist eine isolierte Staging-Umgebung ohne Produktivdaten und -anbindung.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox className="mt-0.5" checked={attestSandbox} onCheckedChange={setAttestSandbox} />
                <span>Ich bestätige: Alle Tools des Agenten sind sandboxed bzw. im Dry-Run (keine echten Aktionen).</span>
              </label>
              {target?.attestations && (
                <p className="text-xs text-muted-foreground">
                  Staging bestätigt: {target.attestations.stagingConfirmedAt ? 'ja' : 'nein'} · Sandbox bestätigt:{' '}
                  {target.attestations.sandboxAttestedAt ? 'ja' : 'nein'}
                </p>
              )}
            </fieldset>
          )}

          {kind === 'WIDGET' && (
            <fieldset className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-xs font-semibold">Web-Widget-Konfiguration</legend>
              <p className="text-xs text-muted-foreground">
                PTaaS öffnet die Seite in einem automatisierten Browser. Die Seite muss auf dem verifizierten
                Endpunkt-Host liegen, alle anderen Hosts werden blockiert. Selektoren sind CSS-Selektoren (max. 200
                Zeichen).
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="w-page">Seiten-URL</Label>
                <Input
                  id="w-page"
                  value={widget.pageUrl}
                  onChange={(e) => setWidget({ ...widget, pageUrl: e.target.value })}
                  placeholder="https://www.example.com/support"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <WidgetField id="w-in" label="Eingabefeld *" value={widget.inputSelector} onChange={(v) => setWidget({ ...widget, inputSelector: v })} />
                <WidgetField id="w-resp" label="Antwort-Elemente *" value={widget.responseSelector} onChange={(v) => setWidget({ ...widget, responseSelector: v })} />
                <WidgetField id="w-send" label="Senden-Button" value={widget.sendSelector} onChange={(v) => setWidget({ ...widget, sendSelector: v })} />
                <WidgetField id="w-open" label="Widget öffnen (Launcher)" value={widget.openSelector} onChange={(v) => setWidget({ ...widget, openSelector: v })} />
                <WidgetField id="w-iframe" label="iFrame" value={widget.iframeSelector} onChange={(v) => setWidget({ ...widget, iframeSelector: v })} />
                <WidgetField id="w-cookie" label="Cookie-Banner akzeptieren" value={widget.cookieConsentSelector} onChange={(v) => setWidget({ ...widget, cookieConsentSelector: v })} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="w-wait">Wartezeit nach Öffnen (ms, 0–15000)</Label>
                  <Input
                    id="w-wait"
                    type="number"
                    min={0}
                    max={15000}
                    value={widget.waitAfterOpenMs}
                    onChange={(e) => setWidget({ ...widget, waitAfterOpenMs: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-timeout">Antwort-Timeout (ms, 1000–60000)</Label>
                  <Input
                    id="w-timeout"
                    type="number"
                    min={1000}
                    max={60000}
                    value={widget.responseTimeoutMs}
                    onChange={(e) => setWidget({ ...widget, responseTimeoutMs: Number(e.target.value) })}
                  />
                </div>
              </div>
            </fieldset>
          )}

          {configErrors.length > 0 && endpointUrl && (
            <ul className="text-xs text-destructive list-disc pl-4">
              {configErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
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

function WidgetField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} />
    </div>
  );
}
