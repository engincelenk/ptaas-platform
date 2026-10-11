'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Shield, Copy, Terminal, Zap, AlertTriangle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';

interface ScanPolicy {
  id: string;
  name: string;
  description?: string;
  nucleiTags: string[];
  nucleiSeverities: string[];
  excludedTemplates: string[];
  maxDurationSeconds: number;
  rateLimit: number;
  createdAt: string;
}

function parseOrgId(): string | null {
  try {
    const t = localStorage.getItem('ptaas_access_token') ?? '';
    return JSON.parse(atob(t.split('.')[1])).orgId ?? null;
  } catch { return null; }
}

const SEVERITY_OPTS = ['critical', 'high', 'medium', 'low', 'info'];
const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  info: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400',
};

const TAG_SUGGESTIONS = [
  'cves', 'misconfigurations', 'exposures', 'takeovers',
  'technologies', 'network', 'ssl', 'fuzzing', 'auth', 'injection',
];

const PRESETS: Array<{ icon: React.ReactNode; name: string; description: string; values: Partial<ScanPolicy> }> = [
  {
    icon: <AlertTriangle className="h-4 w-4" />,
    name: 'Critical CVEs Only',
    description: 'Fast scan for critical CVEs only — ideal for CI/CD gates',
    values: { nucleiTags: ['cves'], nucleiSeverities: ['critical'], rateLimit: 150, maxDurationSeconds: 900 },
  },
  {
    icon: <Shield className="h-4 w-4" />,
    name: 'OWASP Top 10',
    description: 'Covers injection, misconfigurations, exposures, and auth issues',
    values: { nucleiTags: ['injection', 'misconfigurations', 'exposures', 'auth'], nucleiSeverities: ['critical', 'high', 'medium'], rateLimit: 100, maxDurationSeconds: 3600 },
  },
  {
    icon: <Eye className="h-4 w-4" />,
    name: 'Light Recon',
    description: 'Technology fingerprinting + SSL checks — non-intrusive discovery',
    values: { nucleiTags: ['technologies', 'ssl', 'exposures'], nucleiSeverities: ['info', 'low', 'medium'], rateLimit: 50, maxDurationSeconds: 1800 },
  },
  {
    icon: <Zap className="h-4 w-4" />,
    name: 'Full Audit',
    description: 'All templates, all severities — thorough but slow',
    values: { nucleiTags: [], nucleiSeverities: [], rateLimit: 30, maxDurationSeconds: 14400 },
  },
];

function buildCliPreview(policy: Partial<ScanPolicy>): string {
  const parts = ['nuclei -target <URL>'];
  if (policy.nucleiTags && policy.nucleiTags.length > 0)
    parts.push(`-tags ${policy.nucleiTags.join(',')}`);
  if (policy.nucleiSeverities && policy.nucleiSeverities.length > 0)
    parts.push(`-severity ${policy.nucleiSeverities.join(',')}`);
  if (policy.excludedTemplates && policy.excludedTemplates.length > 0)
    parts.push(`-exclude-templates ${policy.excludedTemplates.join(',')}`);
  if (policy.rateLimit) parts.push(`-rate-limit ${policy.rateLimit}`);
  if (policy.maxDurationSeconds)
    parts.push(`-timeout ${Math.round(policy.maxDurationSeconds / 60)}`);
  return parts.join(' \\\n  ');
}

function TagInput({ label, value, onChange, suggestions, placeholder }: {
  label: string; value: string[]; onChange: (v: string[]) => void;
  suggestions?: string[]; placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const add = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput('');
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 min-h-9 rounded-md border border-input px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 text-xs">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="hover:opacity-60 ml-0.5">×</button>
          </Badge>
        ))}
        <input
          className="flex-1 min-w-24 outline-none bg-transparent text-sm"
          placeholder={value.length === 0 ? (placeholder ?? 'Add…') : ''}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input); }
            if (e.key === 'Backspace' && !input && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyCard({ policy, onEdit, onDelete, onDuplicate }: {
  policy: ScanPolicy;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const preview = buildCliPreview(policy);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="font-medium text-sm">{policy.name}</p>
          </div>
          {policy.description && (
            <p className="text-xs text-muted-foreground mt-1 ml-6">{policy.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 ml-6 text-xs text-muted-foreground">
            {policy.nucleiTags.length > 0 && (
              <span className="flex items-center gap-1">
                Tags:
                {policy.nucleiTags.map((t) => (
                  <span key={t} className="bg-muted px-1.5 py-0.5 rounded font-mono">{t}</span>
                ))}
              </span>
            )}
            {policy.nucleiSeverities.length > 0 && (
              <span className="flex items-center gap-1">
                {policy.nucleiSeverities.map((s) => (
                  <span key={s} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${SEV_COLORS[s] ?? 'bg-muted'}`}>
                    {s}
                  </span>
                ))}
              </span>
            )}
            {policy.nucleiTags.length === 0 && policy.nucleiSeverities.length === 0 && (
              <span className="italic">All templates, all severities</span>
            )}
            <span>{policy.rateLimit} req/s</span>
            <span>{Math.round(policy.maxDurationSeconds / 60)} min max</span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Duplicate" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="border-t border-border bg-muted/30 px-4 py-2 flex items-start gap-2">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">{preview}</pre>
      </div>
    </div>
  );
}

function PolicyDialog({ policy, orgId, onClose, onSaved }: {
  policy: ScanPolicy | null; orgId: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(policy?.name ?? '');
  const [description, setDescription] = useState(policy?.description ?? '');
  const [tags, setTags] = useState<string[]>(policy?.nucleiTags ?? []);
  const [severities, setSeverities] = useState<string[]>(policy?.nucleiSeverities ?? []);
  const [excluded, setExcluded] = useState<string[]>(policy?.excludedTemplates ?? []);
  const [maxDuration, setMaxDuration] = useState(policy?.maxDurationSeconds ?? 3600);
  const [rateLimit, setRateLimit] = useState(policy?.rateLimit ?? 150);
  const [saving, setSaving] = useState(false);

  const applyPreset = (preset: typeof PRESETS[number]) => {
    if (preset.values.nucleiTags !== undefined) setTags(preset.values.nucleiTags);
    if (preset.values.nucleiSeverities !== undefined) setSeverities(preset.values.nucleiSeverities);
    if (preset.values.rateLimit !== undefined) setRateLimit(preset.values.rateLimit);
    if (preset.values.maxDurationSeconds !== undefined) setMaxDuration(preset.values.maxDurationSeconds);
    if (!name) setName(preset.name);
    if (!description) setDescription(preset.description);
  };

  const preview = buildCliPreview({ nucleiTags: tags, nucleiSeverities: severities, excludedTemplates: excluded, rateLimit, maxDurationSeconds: maxDuration });

  const save = async () => {
    setSaving(true);
    const payload = {
      name, description: description || undefined,
      nucleiTags: tags, nucleiSeverities: severities, excludedTemplates: excluded,
      maxDurationSeconds: maxDuration, rateLimit,
    };
    try {
      if (policy) {
        await apiClient.patch(`/organizations/${orgId}/scan-policies/${policy.id}`, payload);
        toast.success('Policy updated');
      } else {
        await apiClient.post(`/organizations/${orgId}/scan-policies`, payload);
        toast.success('Policy created');
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const copyPreview = () => {
    navigator.clipboard.writeText(preview);
    toast.success('CLI command copied');
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{policy ? 'Edit Scan Policy' : 'New Scan Policy'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Presets — only in new mode */}
          {!policy && (
            <div className="space-y-2">
              <Label>Start from a preset</Label>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((pr) => (
                  <button
                    key={pr.name}
                    type="button"
                    onClick={() => applyPreset(pr)}
                    className="flex items-start gap-2.5 text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors group"
                  >
                    <span className="text-muted-foreground group-hover:text-foreground mt-0.5">{pr.icon}</span>
                    <div>
                      <p className="text-xs font-medium leading-tight">{pr.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{pr.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input placeholder="CVE-Only Scan" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!!policy} />
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="What this policy is for…" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <TagInput
            label="Nuclei Tags (–tags)"
            value={tags}
            onChange={setTags}
            suggestions={TAG_SUGGESTIONS}
            placeholder="Type and press Enter…"
          />

          <div className="space-y-2">
            <Label>Severity Filter (–severity)</Label>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverities((prev) =>
                    prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                  )}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    severities.includes(s)
                      ? SEV_COLORS[s] + ' border-transparent'
                      : 'bg-muted text-muted-foreground border-border hover:border-muted-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Leave empty to include all severities.</p>
          </div>

          <TagInput
            label="Excluded Templates (–exclude-templates)"
            value={excluded}
            onChange={setExcluded}
            placeholder="template-id…"
          />

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label>Rate Limit — <span className="font-normal text-muted-foreground">{rateLimit} req/s</span></Label>
              <input
                type="range" min={10} max={500} step={10} value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>10 (slow)</span><span>500 (fast)</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max Duration — <span className="font-normal text-muted-foreground">{Math.round(maxDuration / 60)} min</span></Label>
              <input
                type="range" min={60} max={14400} step={60} value={maxDuration}
                onChange={(e) => setMaxDuration(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1 min</span><span>4 h</span>
              </div>
            </div>
          </div>

          {/* Live CLI Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                Nuclei CLI Preview
              </Label>
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={copyPreview}>
                <Copy className="h-3 w-3" />Copy
              </Button>
            </div>
            <pre className="bg-muted rounded-lg px-4 py-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto leading-relaxed">
              {preview}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name}>
            {saving ? 'Saving…' : policy ? 'Update Policy' : 'Create Policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ScanPoliciesPage() {
  const [policies, setPolicies] = useState<ScanPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScanPolicy | null | 'new'>(null);
  const orgId = parseOrgId();

  const load = async () => {
    if (!orgId) return;
    try {
      const data = await apiClient.get<ScanPolicy[]>(`/organizations/${orgId}/scan-policies`);
      setPolicies(data);
    } catch { toast.error('Failed to load policies'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    if (!orgId || !confirm('Delete this scan policy?')) return;
    try {
      await apiClient.delete(`/organizations/${orgId}/scan-policies/${id}`);
      setPolicies((p) => p.filter((x) => x.id !== id));
      toast.success('Policy deleted');
    } catch { toast.error('Failed to delete policy'); }
  };

  const duplicate = async (policy: ScanPolicy) => {
    if (!orgId) return;
    try {
      await apiClient.post(`/organizations/${orgId}/scan-policies`, {
        name: `${policy.name} (copy)`,
        description: policy.description,
        nucleiTags: policy.nucleiTags,
        nucleiSeverities: policy.nucleiSeverities,
        excludedTemplates: policy.excludedTemplates,
        maxDurationSeconds: policy.maxDurationSeconds,
        rateLimit: policy.rateLimit,
      });
      toast.success('Policy duplicated');
      load();
    } catch { toast.error('Failed to duplicate policy'); }
  };

  if (loading) return (
    <div className="max-w-3xl space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scan Policies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable Nuclei scan configurations — control tags, severities, rate limits, and excluded templates.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="mr-2 h-4 w-4" />New Policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Shield className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium">No scan policies yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create a policy to standardize how Nuclei scans run across your organization.
          </p>
          <Button onClick={() => setEditing('new')}>Create first policy</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <PolicyCard
              key={p.id}
              policy={p}
              onEdit={() => setEditing(p)}
              onDelete={() => remove(p.id)}
              onDuplicate={() => duplicate(p)}
            />
          ))}
        </div>
      )}

      {editing && orgId && (
        <PolicyDialog
          policy={editing === 'new' ? null : editing}
          orgId={orgId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
