'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import {
  Globe, Server, Network, Building2,
  Plus, Trash2, Download, ShieldCheck, ShieldOff,
  ChevronDown, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

type ScopeType = 'URL' | 'IP' | 'CIDR' | 'DOMAIN';

interface ScopeEntry {
  id: string;
  type: ScopeType;
  value: string;
  inScope: boolean;
  note: string | null;
  addedBy: { name: string; email: string } | null;
  createdAt: string;
}

interface ScopeData {
  inScope: ScopeEntry[];
  outOfScope: ScopeEntry[];
  total: number;
}

const TYPE_ICON: Record<ScopeType, React.ReactNode> = {
  URL:    <Globe className="h-3.5 w-3.5" />,
  IP:     <Server className="h-3.5 w-3.5" />,
  CIDR:   <Network className="h-3.5 w-3.5" />,
  DOMAIN: <Building2 className="h-3.5 w-3.5" />,
};

const TYPE_COLOR: Record<ScopeType, string> = {
  URL:    'bg-indigo-100 text-indigo-700',
  IP:     'bg-blue-100 text-blue-700',
  CIDR:   'bg-purple-100 text-purple-700',
  DOMAIN: 'bg-teal-100 text-teal-700',
};

const TYPES: ScopeType[] = ['URL', 'IP', 'CIDR', 'DOMAIN'];

function EntryRow({
  entry,
  onDelete,
}: {
  entry: ScopeEntry;
  onDelete: (id: string) => void;
}) {
  const [showNote, setShowNote] = useState(false);

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm hover:border-gray-200 transition-colors">
      <span className={`mt-0.5 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${TYPE_COLOR[entry.type]}`}>
        {TYPE_ICON[entry.type]}
        {entry.type}
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-mono font-medium text-gray-800">{entry.value}</p>
        {entry.note && (
          <p className="mt-0.5 text-xs text-gray-400 italic">{entry.note}</p>
        )}
        <p className="mt-0.5 text-[10px] text-gray-300">
          Added by {entry.addedBy?.name ?? '—'} · {new Date(entry.createdAt).toLocaleDateString('en-GB')}
        </p>
      </div>
      <button
        onClick={() => onDelete(entry.id)}
        className="shrink-0 mt-0.5 rounded p-1 text-gray-200 hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        title="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddForm({
  defaultInScope,
  onAdd,
}: {
  defaultInScope: boolean;
  onAdd: (dto: { type: string; value: string; inScope: boolean; note?: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ScopeType>('URL');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onAdd({ type, value: value.trim(), inScope: defaultInScope, note: note.trim() || undefined });
      setValue('');
      setNote('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 w-full rounded-xl border-2 border-dashed px-4 py-3 text-sm transition-colors ${
          defaultInScope
            ? 'border-green-200 text-green-600 hover:border-green-400 hover:bg-green-50'
            : 'border-red-200 text-red-500 hover:border-red-400 hover:bg-red-50'
        }`}
      >
        <Plus className="h-4 w-4" />
        Add {defaultInScope ? 'in-scope' : 'out-of-scope'} entry
      </button>
    );
  }

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${defaultInScope ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/30'}`}>
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ScopeType)}
          className="w-28 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        >
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={type === 'URL' ? 'https://example.com/api' : type === 'IP' ? '192.168.1.100' : type === 'CIDR' ? '10.0.0.0/24' : 'example.com'}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:outline-none"
        />
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note…"
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!value.trim() || saving}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
            defaultInScope ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
          }`}
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ScopePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<ScopeData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiClient.get<ScopeData>(`/projects/${projectId}/scope`);
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function addEntry(dto: { type: string; value: string; inScope: boolean; note?: string }) {
    await apiClient.post(`/projects/${projectId}/scope`, dto);
    await load();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Remove this scope entry?')) return;
    try {
      await apiClient.delete(`/projects/${projectId}/scope/${id}`);
      setData((prev) => prev ? {
        ...prev,
        inScope: prev.inScope.filter((e) => e.id !== id),
        outOfScope: prev.outOfScope.filter((e) => e.id !== id),
        total: prev.total - 1,
      } : prev);
      toast.success('Entry removed');
    } catch {
      toast.error('Failed to remove entry');
    }
  }

  function downloadExport() {
    const token = typeof window !== 'undefined' ? (localStorage.getItem('ptaas_access_token') ?? '') : '';
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/projects/${projectId}/scope/export?token=${encodeURIComponent(token)}`,
      '_blank',
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-gray-100" />
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2].map((i) => <div key={i} className="h-64 rounded-xl bg-gray-100" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scope Manager</h1>
            <p className="text-sm text-gray-500">
              {data.inScope.length} in-scope · {data.outOfScope.length} out-of-scope
            </p>
          </div>
        </div>
        <button
          onClick={downloadExport}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export Markdown
        </button>
      </div>

      {data.total === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-100 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No scope defined yet. Add in-scope entries below to define what should be tested.
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* In-Scope */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            <h2 className="text-sm font-semibold text-gray-900">In-Scope</h2>
            <span className="ml-auto rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              {data.inScope.length}
            </span>
          </div>
          <div className="space-y-2">
            {data.inScope.map((e) => (
              <EntryRow key={e.id} entry={e} onDelete={deleteEntry} />
            ))}
            <AddForm defaultInScope={true} onAdd={addEntry} />
          </div>
        </div>

        {/* Out-of-Scope */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-gray-900">Out-of-Scope</h2>
            <span className="ml-auto rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
              {data.outOfScope.length}
            </span>
          </div>
          <div className="space-y-2">
            {data.outOfScope.map((e) => (
              <EntryRow key={e.id} entry={e} onDelete={deleteEntry} />
            ))}
            <AddForm defaultInScope={false} onAdd={addEntry} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Entry types</p>
        <div className="flex flex-wrap gap-3">
          {TYPES.map((t) => (
            <span key={t} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_COLOR[t]}`}>
              {TYPE_ICON[t]} {t}
            </span>
          ))}
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-gray-400">
          <li><strong>URL</strong> — Full URL or path prefix (e.g. https://api.example.com/v1)</li>
          <li><strong>IP</strong> — Single IPv4/IPv6 address (e.g. 192.168.1.1)</li>
          <li><strong>CIDR</strong> — IP range in CIDR notation (e.g. 10.0.0.0/24)</li>
          <li><strong>DOMAIN</strong> — Hostname or wildcard (e.g. *.example.com)</li>
        </ul>
      </div>
    </div>
  );
}
