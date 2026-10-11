'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronRight, Download, Loader2, Search,
  ShieldCheck, Sparkles, X, Plus,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Finding {
  id: string;
  title: string;
  severity: string;
  status: string;
  owasp: string | null;
  aiRiskScore: number | null;
  aiFpScore: number | null;
  cveIds: string[];
  cweIds: string[];
  cvssScore: number | null;
  kevListed: boolean;
  createdAt: string;
  scan: { id: string; type: string };
  assignedTo: { id: string; name: string } | null;
}

interface RiskScore { score: number; level: string; findingCount: number; }

interface TriageSuggestion {
  id: string;
  title: string;
  suggestedStatus: string;
  reason: string;
  confidence: number;
}

interface FilterPreset { name: string; severity: string; status: string; owasp: string; }

const PRESETS_KEY = 'ptaas_finding_presets';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  HIGH:     'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  MEDIUM:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  LOW:      'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  INFO:     'bg-muted text-muted-foreground',
};
const RISK_LEVEL_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  HIGH:     'bg-orange-100 text-orange-800 border-orange-200',
  MEDIUM:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW:      'bg-green-100 text-green-800 border-green-200',
  NONE:     'bg-muted text-muted-foreground border',
};
const STATUSES = ['OPEN', 'IN_PROGRESS', 'FIXED', 'VERIFIED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'];
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toCSV(findings: Finding[]): string {
  const header = 'id,title,severity,status,owasp,riskScore,fpScore,cveIds,cvssScore,kev,createdAt';
  const rows = findings.map((f) =>
    [f.id, `"${f.title.replace(/"/g, '""')}"`, f.severity, f.status,
     f.owasp ?? '', f.aiRiskScore ?? '', f.aiFpScore ?? '',
     f.cveIds.join(';'), f.cvssScore ?? '', f.kevListed, f.createdAt].join(','),
  );
  return [header, ...rows].join('\n');
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

function FindingsPageContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [owaspFilter, setOwaspFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [cweFilter, setCweFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [orgTags, setOrgTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [orgMembers, setOrgMembers] = useState<{ userId: string; user: { id: string; name: string } }[]>([]);

  // Presets
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]'); } catch { return []; }
  });
  const [presetName, setPresetName] = useState('');
  const [showPresetInput, setShowPresetInput] = useState(false);

  // Bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // AI Triage
  const [triageSuggestions, setTriageSuggestions] = useState<TriageSuggestion[]>([]);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageApplying, setTriageApplying] = useState(false);
  const [showTriagePanel, setShowTriagePanel] = useState(false);

  // Inline status change
  const [statusMessage, setStatusMessage] = useState('');
  async function handleInlineStatusChange(findingId: string, newStatus: string) {
    try {
      await apiClient.patch(`/projects/${projectId}/findings/${findingId}`, { status: newStatus });
      setFindings((prev) => prev.map((f) => f.id === findingId ? { ...f, status: newStatus } : f));
      setStatusMessage(`Status geändert zu: ${newStatus.replace(/_/g, ' ')}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch { /* silent */ }
  }

  // Manual finding modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: '', description: '', severity: 'MEDIUM', cvssScore: '', cvssVector: '', owasp: '', cweIds: '', recommendation: '',
  });
  const [manualSaving, setManualSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function loadData() {
    const p = new URLSearchParams();
    if (severity) p.set('severity', severity);
    if (status) p.set('status', status);
    if (debouncedSearch) p.set('q', debouncedSearch);
    if (searchParams.get('scanId')) p.set('scanId', searchParams.get('scanId')!);

    const [found, risk] = await Promise.all([
      apiClient.get<Finding[]>(`/projects/${projectId}/findings?${p}`),
      apiClient.get<RiskScore>(`/projects/${projectId}/findings/risk-score`),
    ]);
    setFindings(found);
    setRiskScore(risk);
  }

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [projectId, severity, status, debouncedSearch]);

  useEffect(() => {
    Promise.all([
      apiClient.get<{ id: string; name: string; color: string }[]>('/org/tags').catch(() => []),
      apiClient.get<{ userId: string; user: { id: string; name: string } }[]>('/organizations/members').catch(() => []),
    ]).then(([tags, members]) => { setOrgTags(tags); setOrgMembers(members); });
  }, []);

  // ── Client-side OWASP + tag + CWE + assignedTo filter ──
  const filtered = useMemo(() => {
    let f = findings;
    if (owaspFilter)   f = f.filter((x) => x.owasp?.startsWith(owaspFilter));
    if (tagFilter)     f = f.filter((x) => (x as any).tagAssignments?.some((a: any) => a.tagId === tagFilter));
    if (cweFilter)     f = f.filter((x) => x.cweIds?.some((c) => c.toLowerCase().includes(cweFilter.toLowerCase())));
    if (assignedFilter) f = f.filter((x) => x.assignedTo?.id === assignedFilter);
    return f;
  }, [findings, owaspFilter, tagFilter, cweFilter, assignedFilter]);

  // ── Bulk actions ──
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((f) => f.id)));
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.size === 0) return;
    setBulkLoading(true);
    try {
      await apiClient.post(`/projects/${projectId}/findings/bulk-status`, {
        ids: [...selected],
        status: bulkStatus,
      });
      setSelected(new Set());
      setBulkStatus('');
      await loadData();
    } finally {
      setBulkLoading(false);
    }
  }

  // ── AI Triage ──
  async function saveManualFinding() {
    if (!manualForm.title.trim()) return;
    setManualSaving(true);
    try {
      await apiClient.post(`/projects/${projectId}/findings`, {
        title: manualForm.title.trim(),
        description: manualForm.description.trim() || undefined,
        severity: manualForm.severity,
        cvssScore: manualForm.cvssScore ? parseFloat(manualForm.cvssScore) : undefined,
        cvssVector: manualForm.cvssVector.trim() || undefined,
        owasp: manualForm.owasp.trim() || undefined,
        cweIds: manualForm.cweIds ? manualForm.cweIds.split(',').map((s) => s.trim()).filter(Boolean) : [],
        recommendation: manualForm.recommendation.trim() || undefined,
      });
      setShowManualModal(false);
      setManualForm({ title: '', description: '', severity: 'MEDIUM', cvssScore: '', cvssVector: '', owasp: '', cweIds: '', recommendation: '' });
      await loadData();
    } catch {
      /* toast already handled by apiClient */
    } finally {
      setManualSaving(false);
    }
  }

  async function runAiTriage() {
    setTriageLoading(true);
    setShowTriagePanel(true);
    try {
      const suggestions = await apiClient.post<TriageSuggestion[]>(`/projects/${projectId}/findings/ai-triage`, {});
      setTriageSuggestions(suggestions);
    } finally {
      setTriageLoading(false);
    }
  }

  async function applyTriageSuggestions() {
    setTriageApplying(true);
    try {
      // Group by status for batching
      const byStatus = triageSuggestions.reduce<Record<string, string[]>>((acc, s) => {
        (acc[s.suggestedStatus] ??= []).push(s.id);
        return acc;
      }, {});
      await Promise.all(
        Object.entries(byStatus).map(([st, ids]) =>
          apiClient.post(`/projects/${projectId}/findings/bulk-status`, { ids, status: st }),
        ),
      );
      setShowTriagePanel(false);
      setTriageSuggestions([]);
      await loadData();
    } finally {
      setTriageApplying(false);
    }
  }

  // ── Presets ──
  function savePreset() {
    if (!presetName.trim()) return;
    const p: FilterPreset = { name: presetName.trim(), severity, status, owasp: owaspFilter };
    const next = [...presets.filter((x) => x.name !== p.name), p];
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    setPresetName('');
    setShowPresetInput(false);
  }

  function applyPreset(p: FilterPreset) {
    setSeverity(p.severity);
    setStatus(p.status);
    setOwaspFilter(p.owasp);
  }

  function deletePreset(name: string) {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  }

  // ── OWASP options from findings ──
  const owaspOptions = useMemo(() => {
    const cats = new Set(findings.map((f) => f.owasp?.split('–')[0]?.trim()).filter(Boolean) as string[]);
    return [...cats].sort();
  }, [findings]);

  // ── Confidence color ──
  const confColor = (c: number) => c >= 80 ? 'text-green-600' : c >= 50 ? 'text-orange-500' : 'text-muted-foreground';

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Findings</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {findings.length} finding{findings.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {riskScore && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${RISK_LEVEL_COLORS[riskScore.level] ?? RISK_LEVEL_COLORS.NONE}`}>
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xl font-bold">{riskScore.score}</span>
              <Badge variant="outline" className="border-current text-xs">{riskScore.level}</Badge>
            </div>
          )}
          <Button size="sm" onClick={() => setShowManualModal(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />Add Finding
          </Button>
          <Button variant="outline" size="sm" onClick={runAiTriage} className="gap-1.5">
            <Sparkles className="h-4 w-4" />AI Triage
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => download(toCSV(filtered), `findings-${projectId}.csv`, 'text/csv')}>
            <Download className="h-4 w-4" />CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => download(JSON.stringify(filtered, null, 2), `findings-${projectId}.json`, 'application/json')}>
            <Download className="h-4 w-4" />JSON
          </Button>
        </div>
      </div>

      {/* AI Triage Panel */}
      {showTriagePanel && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI Triage Suggestions</span>
            </div>
            <button onClick={() => setShowTriagePanel(false)} className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {triageLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Analysing findings…
            </div>
          )}

          {!triageLoading && triageSuggestions.length === 0 && (
            <p className="text-sm text-muted-foreground">No suggestions generated.</p>
          )}

          {!triageLoading && triageSuggestions.length > 0 && (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {triageSuggestions.map((s) => (
                  <div key={s.id} className="flex items-start gap-3 rounded-lg border bg-background p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{s.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                        → {s.suggestedStatus.replace('_', ' ')}
                      </span>
                      <p className={`text-[11px] mt-1 ${confColor(s.confidence)}`}>{s.confidence}% confidence</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={applyTriageSuggestions} disabled={triageApplying} className="gap-1.5">
                  {triageApplying && <Loader2 className="h-3 w-3 animate-spin" />}
                  Apply all suggestions
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowTriagePanel(false); setTriageSuggestions([]); }}>
                  Dismiss
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filters row */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search findings…"
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <select value={severity} onChange={(e) => setSeverity(e.target.value)}
            className="text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>

          {owaspOptions.length > 0 && (
            <select value={owaspFilter} onChange={(e) => setOwaspFilter(e.target.value)}
              className="text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All OWASP</option>
              {owaspOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}

          {orgTags.length > 0 && (
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
              className="text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All Tags</option>
              {orgTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

          <input
            type="text"
            placeholder="CWE-ID filtern…"
            value={cweFilter}
            onChange={(e) => setCweFilter(e.target.value)}
            aria-label="Nach CWE-ID filtern"
            className="text-sm rounded-lg border bg-background px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {orgMembers.length > 0 && (
            <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}
              aria-label="Nach Verantwortlichem filtern"
              className="text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Alle Verantwortliche</option>
              {orgMembers.map((m) => <option key={m.userId} value={m.user.id}>{m.user.name}</option>)}
            </select>
          )}

          {(severity || status || owaspFilter || tagFilter || search || cweFilter || assignedFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSeverity(''); setStatus(''); setOwaspFilter(''); setTagFilter(''); setSearch(''); setCweFilter(''); setAssignedFilter(''); }}>
              Clear
            </Button>
          )}

          {/* Preset actions */}
          <div className="flex gap-1 ml-auto">
            {presets.map((p) => (
              <div key={p.name} className="flex items-center gap-0.5">
                <button onClick={() => applyPreset(p)} className="text-xs px-2 py-1 rounded border bg-muted/40 hover:bg-muted transition-colors">
                  {p.name}
                </button>
                <button onClick={() => deletePreset(p.name)} className="text-muted-foreground hover:text-red-500 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {showPresetInput ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') setShowPresetInput(false); }}
                  placeholder="Preset name"
                  className="text-xs px-2 py-1 rounded border bg-background w-28 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button size="sm" onClick={savePreset} className="h-7 text-xs px-2">Save</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowPresetInput(true)} className="h-7 text-xs">
                + Save filter
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-primary/5 border-primary/20 px-4 py-2.5 flex-wrap">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="text-sm rounded border bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Set status…</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <Button size="sm" onClick={applyBulkStatus} disabled={!bulkStatus || bulkLoading} className="h-7 text-xs gap-1">
            {bulkLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-7 text-xs ml-auto">
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          {(severity || status || owaspFilter || tagFilter || search) ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold">Keine Findings für diese Filter</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                {search && `„${search}"`}{severity && ` · ${severity}`}{status && ` · ${status}`} ergibt keine Treffer.
              </p>
              <div className="mt-4 flex gap-2 justify-center flex-wrap">
                {search && (
                  <Button size="sm" variant="outline" onClick={() => setSearch('')}>
                    Nur Text „{search}" (alle Filter)
                  </Button>
                )}
                {(severity || status) && (
                  <Button size="sm" variant="outline" onClick={() => { setSeverity(''); setStatus(''); }}>
                    Nur Severity/Status zurücksetzen
                  </Button>
                )}
                <Button size="sm" onClick={() => { setSeverity(''); setStatus(''); setOwaspFilter(''); setTagFilter(''); setSearch(''); }}>
                  Alle Filter zurücksetzen
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No findings yet.</p>
          )}
        </div>
      ) : (
        <>
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{statusMessage}</p>
        <div className="rounded-xl border overflow-hidden">
          <table
            className="w-full text-sm"
            aria-label={`Findings — ${filtered.length} Einträge`}
          >
            <thead className="bg-muted/40 border-b">
              <tr>
                <th scope="col" className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Alle Findings auswählen"
                    className="rounded border-muted"
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Finding</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground w-28">Severity</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground w-32">Status</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground w-16">Risk</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground w-20">OWASP</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground w-16">FP%</th>
                <th scope="col" className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((f) => (
                <tr key={f.id} className={`hover:bg-muted/30 transition-colors ${selected.has(f.id) ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggleSelect(f.id)}
                      aria-label={`${f.title} auswählen`}
                      className="rounded border-muted"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium leading-tight line-clamp-1">{f.title}</p>
                      {f.cveIds.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {f.cveIds.slice(0, 2).join(', ')}
                          {f.cveIds.length > 2 && ` +${f.cveIds.length - 2}`}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${SEV_COLOR[f.severity] ?? 'bg-muted text-muted-foreground'}`}>
                        {f.severity}
                      </span>
                      {f.kevListed && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-red-600 text-white">KEV</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`status-${f.id}`}>Status für {f.title}</label>
                    <select
                      id={`status-${f.id}`}
                      value={f.status}
                      onChange={(e) => handleInlineStatusChange(f.id, e.target.value)}
                      className="text-xs rounded border border-input bg-background px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {f.aiRiskScore != null ? (
                      <span className={`text-sm font-semibold ${f.aiRiskScore >= 75 ? 'text-red-600' : f.aiRiskScore >= 50 ? 'text-orange-600' : 'text-yellow-600'}`}>
                        {Math.round(f.aiRiskScore)}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {f.owasp ? f.owasp.split('–')[0]?.trim() : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {f.aiFpScore != null ? (
                      <span className={f.aiFpScore >= 50 ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                        {Math.round(f.aiFpScore)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${projectId}/findings/${f.id}`}
                      className="p-1 rounded hover:bg-muted inline-flex"
                      aria-label={`${f.title} öffnen`}
                    >
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Manual Finding Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Add Manual Finding</h2>
              <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Title *</label>
                <input
                  value={manualForm.title}
                  onChange={(e) => setManualForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="e.g. Stored XSS in comment field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Severity *</label>
                <select
                  value={manualForm.severity}
                  onChange={(e) => setManualForm((f) => ({ ...f, severity: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                >
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Description</label>
                <textarea
                  value={manualForm.description}
                  onChange={(e) => setManualForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                  placeholder="Describe the vulnerability…"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Recommendation / Fix</label>
                <textarea
                  value={manualForm.recommendation}
                  onChange={(e) => setManualForm((f) => ({ ...f, recommendation: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                  placeholder="Recommended remediation steps…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">CVSS Score</label>
                  <input
                    type="number" min="0" max="10" step="0.1"
                    value={manualForm.cvssScore}
                    onChange={(e) => setManualForm((f) => ({ ...f, cvssScore: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                    placeholder="e.g. 8.1"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">OWASP Category</label>
                  <select
                    value={manualForm.owasp}
                    onChange={(e) => setManualForm((f) => ({ ...f, owasp: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="">— None —</option>
                    {['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10'].map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">CWE IDs (comma-separated)</label>
                <input
                  value={manualForm.cweIds}
                  onChange={(e) => setManualForm((f) => ({ ...f, cweIds: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="e.g. CWE-79, CWE-89"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowManualModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveManualFinding}
                disabled={!manualForm.title.trim() || manualSaving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {manualSaving ? 'Saving…' : 'Create Finding'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FindingsPage() {
  return (
    <Suspense fallback={null}>
      <FindingsPageContent />
    </Suspense>
  );
}
