'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Send, Zap,
  CheckCircle2, XCircle, Clock, Pause, Play, Copy, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { apiClient } from '@/lib/api-client';

interface Integration {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  events: string[];
  createdAt: string;
  updatedAt: string;
}

interface Delivery {
  id: string;
  event: string;
  status: string;
  responseCode: number | null;
  responseBody: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

const ALL_EVENTS = [
  { id: 'finding.created', label: 'Finding Created', description: 'New vulnerability found' },
  { id: 'finding.updated', label: 'Finding Updated', description: 'Status or severity changed' },
  { id: 'finding.closed', label: 'Finding Closed', description: 'Finding resolved or closed' },
  { id: 'scan.started', label: 'Scan Started', description: 'New scan begins' },
  { id: 'scan.completed', label: 'Scan Completed', description: 'Scan finishes with results' },
  { id: 'scan.failed', label: 'Scan Failed', description: 'Scan encountered an error' },
  { id: 'sla.breach', label: 'SLA Breach', description: 'Finding exceeds its SLA deadline' },
  { id: 'member.invited', label: 'Member Invited', description: 'New user invited to org' },
];

function StatusIcon({ status, code }: { status: string; code: number | null }) {
  if (status === 'SUCCESS' || (code && code >= 200 && code < 300)) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  }
  if (status === 'PENDING') {
    return <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
  }
  return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
}

function DeliveryRow({ d }: { d: Delivery }) {
  const [open, setOpen] = useState(false);
  const isOk = d.status === 'SUCCESS' || (d.responseCode && d.responseCode >= 200 && d.responseCode < 300);

  return (
    <>
      <tr
        className="hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-3 py-2 w-5">
          {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <StatusIcon status={d.status} code={d.responseCode} />
            <span className="text-xs font-mono">{d.event}</span>
          </div>
        </td>
        <td className="px-3 py-2">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            isOk
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {d.responseCode ?? d.status}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{d.attempts} attempt{d.attempts !== 1 ? 's' : ''}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground text-right whitespace-nowrap">
          {new Date(d.createdAt).toLocaleString()}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td />
          <td colSpan={4} className="px-3 py-3">
            {d.responseBody ? (
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-auto">
                {d.responseBody}
              </pre>
            ) : (
              <span className="text-xs text-muted-foreground italic">No response body</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function WebhookCard({ hook, onRefresh }: { hook: Integration; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadDeliveries = async () => {
    setLoadingDeliveries(true);
    try {
      const data = await apiClient.get<Delivery[]>(`/integrations/${hook.id}/deliveries`);
      setDeliveries(data);
    } catch { toast.error('Failed to load deliveries'); }
    finally { setLoadingDeliveries(false); }
  };

  const toggleExpand = () => {
    if (!expanded) loadDeliveries();
    setExpanded((e) => !e);
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await apiClient.post(`/integrations/${hook.id}/test`, {});
      toast.success('Test delivery queued — check the delivery log in a moment');
      setTimeout(() => loadDeliveries(), 2000);
    } catch { toast.error('Failed to send test'); }
    finally { setTesting(false); }
  };

  const toggleEnabled = async () => {
    setToggling(true);
    try {
      await apiClient.patch(`/integrations/${hook.id}`, { enabled: !hook.enabled });
      toast.success(hook.enabled ? 'Webhook paused' : 'Webhook activated');
      onRefresh();
    } catch { toast.error('Failed to update webhook'); }
    finally { setToggling(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete webhook "${hook.name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/integrations/${hook.id}`);
      toast.success('Webhook deleted');
      onRefresh();
    } catch { toast.error('Failed to delete'); }
  };

  const lastDelivery = deliveries[0];

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-card">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{hook.name}</span>
            {!hook.enabled && (
              <Badge variant="secondary" className="text-[10px] px-1.5">Paused</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {hook.events.map((e) => (
              <span key={e} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                {e}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={hook.enabled}
            onCheckedChange={toggleEnabled}
            disabled={toggling}
          />
          <Button variant="ghost" size="sm" onClick={sendTest} disabled={testing} className="h-7 gap-1.5 text-xs">
            <Send className="h-3 w-3" />
            {testing ? 'Sending…' : 'Test'}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleExpand}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Delivery Log */}
      {expanded && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">Delivery Log</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={loadDeliveries} disabled={loadingDeliveries}>
              {loadingDeliveries ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
          {deliveries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              {loadingDeliveries ? 'Loading…' : 'No deliveries yet. Send a test to get started.'}
            </div>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-border">
                {deliveries.slice(0, 20).map((d) => <DeliveryRow key={d.id} d={d} />)}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function CreateWebhookDialog({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(
    new Set(['finding.created', 'scan.completed']),
  );
  const [saving, setSaving] = useState(false);

  const generateSecret = () => {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    setSecret(Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join(''));
    setShowSecret(true);
  };

  const toggleEvent = (id: string) => {
    const s = new Set(selectedEvents);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedEvents(s);
  };

  const create = async () => {
    if (!url.startsWith('http')) { toast.error('URL must start with http:// or https://'); return; }
    setSaving(true);
    try {
      await apiClient.post('/integrations', {
        name,
        type: 'WEBHOOK',
        webhookUrl: url,
        ...(secret && { webhookSecret: secret }),
        events: [...selectedEvents],
      });
      toast.success('Webhook created');
      onCreate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create webhook');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New Webhook</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input placeholder="Slack Alerts" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Endpoint URL <span className="text-destructive">*</span></Label>
            <Input
              placeholder="https://hooks.example.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
            />
            <p className="text-xs text-muted-foreground">PTaaS will POST JSON payloads to this URL.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Secret <span className="text-muted-foreground font-normal">(optional HMAC signing)</span></Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Leave empty to skip signature verification"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="pr-9 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={generateSecret} className="shrink-0">
                Generate
              </Button>
              {secret && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => { navigator.clipboard.writeText(secret); toast.success('Copied'); }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              The signature is sent as <code className="bg-muted px-1 rounded">X-PTaaS-Signature</code> (HMAC-SHA256).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Events to subscribe</Label>
            <div className="rounded-lg border divide-y overflow-hidden">
              {ALL_EVENTS.map((e) => (
                <label key={e.id} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
                  <Checkbox
                    checked={selectedEvents.has(e.id)}
                    onCheckedChange={() => toggleEvent(e.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-mono font-medium">{e.id}</span>
                    <p className="text-xs text-muted-foreground">{e.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {selectedEvents.size === 0 && (
              <p className="text-xs text-amber-600">Select at least one event.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving || !name || !url || selectedEvents.size === 0}>
            {saving ? 'Creating…' : 'Create Webhook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<Integration[]>('/integrations');
      setHooks(data.filter((i: Integration) => i.type === 'WEBHOOK'));
    } catch { toast.error('Failed to load webhooks'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="max-w-3xl space-y-3">
      {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send real-time HTTP notifications to external services when events occur.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />Add Webhook
        </Button>
      </div>

      {/* Webhook list */}
      {hooks.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Zap className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium">No webhooks yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Connect your tools — Slack, SIEM, Jira, or any HTTP endpoint.
          </p>
          <Button onClick={() => setCreating(true)}>Add first webhook</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {hooks.map((h) => (
            <WebhookCard key={h.id} hook={h} onRefresh={load} />
          ))}
        </div>
      )}

      {/* Payload reference */}
      <div className="rounded-xl border p-5 space-y-3">
        <p className="text-sm font-medium">Example payload</p>
        <pre className="bg-muted rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto">{`{
  "event": "finding.created",
  "timestamp": "2026-06-24T10:00:00Z",
  "organizationId": "org_...",
  "data": {
    "id": "finding_...",
    "title": "SQL Injection in /api/search",
    "severity": "CRITICAL",
    "projectId": "proj_..."
  }
}`}</pre>
        <p className="text-xs text-muted-foreground">
          Verify authenticity with the <code className="bg-muted px-1 rounded">X-PTaaS-Signature</code> header (HMAC-SHA256 of the raw body).
        </p>
      </div>

      {creating && (
        <CreateWebhookDialog
          onClose={() => setCreating(false)}
          onCreate={() => { setCreating(false); load(); }}
        />
      )}
    </div>
  );
}
