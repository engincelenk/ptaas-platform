'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, CheckCircle2, XCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiClient } from '@/lib/api-client';

type IntegrationType = 'WEBHOOK' | 'GITHUB' | 'JIRA' | 'SLACK';

interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  enabled: boolean;
  events: string[];
  createdAt: string;
}

const TYPE_META: Record<IntegrationType, { label: string; icon: string; description: string }> = {
  WEBHOOK: { label: 'Webhook', icon: '🔗', description: 'HTTP POST to any URL with HMAC-SHA256 signature' },
  GITHUB: { label: 'GitHub Issues', icon: '🐙', description: 'Create GitHub Issues for new findings' },
  JIRA: { label: 'Jira', icon: '📋', description: 'Create Jira Issues for new findings' },
  SLACK: { label: 'Slack', icon: '💬', description: 'Send Slack messages on scan events' },
};

const ALL_EVENTS = [
  'finding.created',
  'finding.critical',
  'finding.overdue',
  'scan.completed',
  'scan.failed',
  'sla.breach',
  'risk.accepted',
  'retest.completed',
  'engagement.signed',
];

interface Delivery {
  id: string;
  event: string;
  status: string;
  responseCode: number | null;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

function DeliveryLog({ integrationId }: { integrationId: string }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<Delivery[]>(`/integrations/${integrationId}/deliveries`);
      setDeliveries(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [integrationId]);

  if (loading) return <div className="py-4 text-center text-xs text-muted-foreground">Loading deliveries…</div>;
  if (deliveries.length === 0) return <div className="py-4 text-center text-xs text-muted-foreground">No deliveries yet.</div>;

  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Deliveries</span>
        <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
      <div className="rounded-lg border divide-y text-xs">
        {deliveries.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-3 py-2">
            <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${
              d.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
              d.status === 'FAILED'  ? 'bg-red-100 text-red-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>{d.status}</span>
            <span className="font-mono text-muted-foreground shrink-0">
              {d.responseCode ? `HTTP ${d.responseCode}` : '—'}
            </span>
            <span className="flex-1 truncate text-foreground">{d.event}</span>
            <span className="shrink-0 text-muted-foreground">
              {d.lastAttemptAt
                ? new Date(d.lastAttemptAt).toLocaleString()
                : new Date(d.createdAt).toLocaleString()}
            </span>
            {d.attempts > 1 && (
              <span className="shrink-0 text-orange-500">{d.attempts}× retried</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<IntegrationType | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await apiClient.get<Integration[]>('/integrations');
      setIntegrations(data);
    } catch {
      toast.error('Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await apiClient.patch(`/integrations/${id}`, { enabled });
      setIntegrations((prev) => prev.map((i) => i.id === id ? { ...i, enabled } : i));
    } catch {
      toast.error('Failed to update integration');
    }
  };

  const remove = async (id: string) => {
    try {
      await apiClient.delete(`/integrations/${id}`);
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
      toast.success('Integration removed');
    } catch {
      toast.error('Failed to remove integration');
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect PTaaS to your development workflow — GitHub, Jira, Slack, or custom webhooks.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Integration
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.entries(TYPE_META) as [IntegrationType, typeof TYPE_META[IntegrationType]][]).map(
              ([type, meta]) => (
                <DropdownMenuItem
                  key={type}
                  onClick={() => { setAddType(type); setAddOpen(true); }}
                >
                  {meta.icon} {meta.label}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {integrations.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
            No integrations configured. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {integrations.map((integration) => {
            const meta = TYPE_META[integration.type];
            return (
              <Card key={integration.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{meta.icon}</span>
                      <div>
                        <CardTitle className="text-base">{integration.name}</CardTitle>
                        <CardDescription>{meta.label}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={integration.enabled}
                        onCheckedChange={(v) => toggleEnabled(integration.id, v)}
                      />
                      {integration.enabled
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <XCircle className="h-4 w-4 text-muted-foreground" />
                      }
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={async () => {
                          try {
                            await apiClient.post(`/integrations/${integration.id}/test`, {});
                            toast.success('Test delivery queued');
                          } catch {
                            toast.error('Test failed');
                          }
                        }}
                      >
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove(integration.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1 flex-wrap">
                      {integration.events.map((e) => (
                        <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                      ))}
                    </div>
                    <button
                      onClick={() => setExpandedLog(expandedLog === integration.id ? null : integration.id)}
                      className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expandedLog === integration.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Deliveries
                    </button>
                  </div>
                  {expandedLog === integration.id && (
                    <DeliveryLog integrationId={integration.id} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {addOpen && addType && (
        <AddIntegrationDialog
          type={addType}
          onClose={() => { setAddOpen(false); setAddType(null); }}
          onCreated={() => { setAddOpen(false); setAddType(null); load(); }}
        />
      )}
    </div>
  );
}

function AddIntegrationDialog({
  type, onClose, onCreated,
}: { type: IntegrationType; onClose: () => void; onCreated: () => void }) {
  const meta = TYPE_META[type];
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(`My ${meta.label}`);
  const [events, setEvents] = useState(['finding.created', 'scan.completed']);
  const [fields, setFields] = useState<Record<string, string>>({});

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const toggleEvent = (ev: string) =>
    setEvents((prev) => prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]);

  const submit = async () => {
    setLoading(true);
    try {
      await apiClient.post('/integrations', { type, name, events, ...fields });
      toast.success(`${meta.label} integration created`);
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create integration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{meta.icon} Connect {meta.label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Type-specific fields */}
          {type === 'WEBHOOK' && <>
            <div className="space-y-1.5">
              <Label>Webhook URL</Label>
              <Input placeholder="https://hooks.example.com/..." onChange={set('webhookUrl')} />
            </div>
            <div className="space-y-1.5">
              <Label>Signing Secret (optional)</Label>
              <Input type="password" placeholder="Used for HMAC-SHA256 signature" onChange={set('webhookSecret')} />
            </div>
          </>}

          {type === 'GITHUB' && <>
            <div className="space-y-1.5">
              <Label>GitHub Token</Label>
              <Input type="password" placeholder="ghp_…" onChange={set('githubToken')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Repo Owner</Label>
                <Input placeholder="acme-corp" onChange={set('repoOwner')} />
              </div>
              <div className="space-y-1.5">
                <Label>Repo Name</Label>
                <Input placeholder="web-app" onChange={set('repoName')} />
              </div>
            </div>
          </>}

          {type === 'JIRA' && <>
            <div className="space-y-1.5">
              <Label>Jira Base URL</Label>
              <Input placeholder="https://acme.atlassian.net" onChange={set('jiraBaseUrl')} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="user@acme.com" onChange={set('jiraEmail')} />
            </div>
            <div className="space-y-1.5">
              <Label>API Token</Label>
              <Input type="password" onChange={set('jiraToken')} />
            </div>
            <div className="space-y-1.5">
              <Label>Project Key</Label>
              <Input placeholder="SEC" onChange={set('jiraProjectKey')} />
            </div>
          </>}

          {type === 'SLACK' && <>
            <div className="space-y-1.5">
              <Label>Bot Token</Label>
              <Input type="password" placeholder="xoxb-…" onChange={set('slackToken')} />
            </div>
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Input placeholder="#security-alerts" onChange={set('slackChannel')} />
            </div>
          </>}

          <div className="space-y-2">
            <Label>Trigger on events</Label>
            <div className="flex gap-2 flex-wrap">
              {ALL_EVENTS.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    events.includes(ev)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border'
                  }`}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || events.length === 0}>
            {loading ? 'Connecting…' : `Connect ${meta.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
