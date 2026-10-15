'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Copy, Eye, EyeOff, Key, CheckCheck, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { apiClient } from '@/lib/api-client';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  createdByName?: string;
}

const AVAILABLE_SCOPES: { id: string; label: string; description: string }[] = [
  { id: 'read:findings', label: 'read:findings', description: 'Read findings & vulnerabilities' },
  { id: 'write:findings', label: 'write:findings', description: 'Create and update findings' },
  { id: 'read:projects', label: 'read:projects', description: 'Read projects and targets' },
  { id: 'write:scans', label: 'write:scans', description: 'Trigger and manage scans' },
  { id: 'read:reports', label: 'read:reports', description: 'Download reports and exports' },
  { id: 'admin', label: 'admin', description: 'Full admin access (all permissions)' },
];

const SCOPE_COLOR: Record<string, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'write:scans': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'write:findings': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  'read:findings': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'read:projects': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'read:reports': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

function parseOrgId(): string | null {
  try {
    const t = localStorage.getItem('ptaas_access_token') ?? '';
    return JSON.parse(atob(t.split('.')[1])).orgId ?? null;
  } catch { return null; }
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" onClick={copy} className="h-7 w-7 shrink-0" title={label ?? 'Copy'}>
      {copied ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const orgId = parseOrgId();

  const load = async () => {
    if (!orgId) return;
    try {
      const data = await apiClient.get<ApiKey[]>(`/organizations/${orgId}/api-keys`);
      setKeys(data);
    } catch { toast.error('Failed to load API keys'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const revoke = async (id: string, name: string) => {
    if (!orgId || !confirm(`Revoke "${name}"? All requests using this key will immediately fail.`)) return;
    try {
      await apiClient.delete(`/organizations/${orgId}/api-keys/${id}`);
      setKeys((k) => k.filter((x) => x.id !== id));
      toast.success('API key revoked');
    } catch { toast.error('Failed to revoke key'); }
  };

  if (loading) return (
    <div className="max-w-3xl space-y-4">
      {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
    </div>
  );

  const apiBase = typeof window !== 'undefined'
    ? `${window.location.origin.replace(':3000', ':3001')}/api/v1`
    : 'https://api.ptaas.example.com/api/v1';

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Authenticate API requests from CLI tools, CI/CD pipelines, and scripts.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />New Key
        </Button>
      </div>

      {/* One-time key reveal */}
      {newKey && (
        <Card className="border-green-500/40 bg-green-50/40 dark:bg-green-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
              <Key className="h-4 w-4" />
              Copy your new API key now — it won&apos;t be shown again
            </CardTitle>
            <CardDescription className="text-green-700/70 dark:text-green-400/70 text-xs">
              Store it in a secret manager (GitHub Secrets, Vault, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-background rounded border px-3 py-2 font-mono select-all overflow-x-auto">
                {showKey ? newKey : newKey.slice(0, 14) + '•'.repeat(Math.max(0, newKey.length - 14))}
              </code>
              <Button variant="ghost" size="icon" onClick={() => setShowKey((s) => !s)} className="h-9 w-9">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <CopyButton text={newKey} label="Copy key" />
            </div>
            <Button variant="link" size="sm" className="text-muted-foreground px-0 h-auto"
              onClick={() => { setNewKey(null); setShowKey(false); }}>
              I&apos;ve saved the key, dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Keys table */}
      {keys.length === 0 && !newKey ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Key className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium">No API keys yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create a key to start authenticating programmatic API access.
          </p>
          <Button onClick={() => setCreating(true)}>Create first key</Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Prefix</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Scopes</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Last Used</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Expires</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{k.name}</p>
                    {k.createdByName && <p className="text-xs text-muted-foreground">by {k.createdByName}</p>}
                    <p className="text-xs text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{k.keyPrefix}…</code>
                      <CopyButton text={k.keyPrefix} label="Copy prefix" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes && k.scopes.length > 0 ? k.scopes.map((s) => (
                        <span key={s} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${SCOPE_COLOR[s] ?? 'bg-muted text-muted-foreground'}`}>
                          {s}
                        </span>
                      )) : (
                        <span className="text-xs text-muted-foreground italic">all (no restriction)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {k.expiresAt ? (
                      <Badge variant={new Date(k.expiresAt) < new Date() ? 'destructive' : 'secondary'} className="text-xs">
                        {new Date(k.expiresAt) < new Date() ? 'Expired' : new Date(k.expiresAt).toLocaleDateString()}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => revoke(k.id, k.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {keys.length} key{keys.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Usage */}
      <div className="rounded-xl border p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          Usage examples
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">curl</p>
            <div className="relative group">
              <pre className="bg-muted rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto">{`curl -H "X-API-Key: ptaas_live_..." \\
  ${apiBase}/projects`}</pre>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton text={`curl -H "X-API-Key: ptaas_live_..." \\\n  ${apiBase}/projects`} label="Copy" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">GitHub Actions</p>
            <div className="relative group">
              <pre className="bg-muted rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto">{`- name: Fetch findings
  env:
    PTAAS_API_KEY: \${{ secrets.PTAAS_API_KEY }}
  run: |
    curl -H "X-API-Key: $PTAAS_API_KEY" \\
      ${apiBase}/findings/sla-breaches`}</pre>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton text={`curl -H "X-API-Key: $PTAAS_API_KEY" \\\n  ${apiBase}/findings/sla-breaches`} label="Copy" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {creating && orgId && (
        <CreateKeyDialog
          orgId={orgId}
          onClose={() => setCreating(false)}
          onCreated={(key) => { setCreating(false); setNewKey(key); load(); }}
        />
      )}
    </div>
  );
}

function CreateKeyDialog({ orgId, onClose, onCreated }: {
  orgId: string; onClose: () => void; onCreated: (key: string) => void;
}) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(
    new Set(['read:findings', 'read:projects']),
  );
  const [saving, setSaving] = useState(false);

  const toggleScope = (scope: string) => {
    const s = new Set(selectedScopes);
    if (scope === 'admin') {
      if (s.has('admin')) { s.delete('admin'); }
      else { s.clear(); s.add('admin'); }
    } else {
      s.delete('admin');
      s.has(scope) ? s.delete(scope) : s.add(scope);
    }
    setSelectedScopes(s);
  };

  const create = async () => {
    setSaving(true);
    try {
      const { key } = await apiClient.post<{ key: string }>(
        `/organizations/${orgId}/api-keys`,
        {
          name,
          scopes: [...selectedScopes],
          ...(expiresAt && { expiresAt: new Date(expiresAt).toISOString() }),
        },
      );
      onCreated(key);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setSaving(false);
    }
  };

  const minDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New API Key</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="CI/CD Pipeline"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Describe what this key is used for.</p>
          </div>

          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="rounded-lg border divide-y overflow-hidden">
              {AVAILABLE_SCOPES.map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <Checkbox
                    checked={selectedScopes.has(s.id)}
                    onCheckedChange={() => toggleScope(s.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className={`text-xs font-mono font-medium px-1.5 py-0.5 rounded ${SCOPE_COLOR[s.id] ?? 'bg-muted'}`}>
                      {s.label}
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {selectedScopes.size === 0 && (
              <p className="text-xs text-amber-600">Select at least one permission.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              Expiration{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              type="date"
              value={expiresAt}
              min={minDate}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave empty for a non-expiring key.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving || !name || selectedScopes.size === 0}>
            {saving ? 'Creating…' : 'Create Key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
