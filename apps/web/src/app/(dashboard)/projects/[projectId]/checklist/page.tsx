'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ChevronDown, ChevronRight, Download, RotateCcw,
  CheckCircle2, Circle, FileText, ClipboardList,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ChecklistItemState {
  key: string;
  label: string;
  ref?: string;
  checked: boolean;
  note: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
}

interface ChecklistCategory {
  id: string;
  label: string;
  icon: string;
  items: ChecklistItemState[];
}

interface ChecklistData {
  progress: { total: number; checked: number; pct: number };
  categories: ChecklistCategory[];
}

function authHeaders() {
  const t = typeof window !== 'undefined' ? (localStorage.getItem('ptaas_access_token') ?? '') : '';
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}

function categoryProgress(cat: ChecklistCategory) {
  const total = cat.items.length;
  const done = cat.items.filter((i) => i.checked).length;
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export default function ChecklistPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['info_gathering', 'authn', 'input_validation']));
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/checklist`, { headers: authHeaders() });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function toggle(item: ChecklistItemState) {
    if (updating.has(item.key)) return;
    setUpdating((s) => new Set(s).add(item.key));

    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      const categories = prev.categories.map((cat) => ({
        ...cat,
        items: cat.items.map((i) => i.key === item.key ? { ...i, checked: !i.checked } : i),
      }));
      const checked = categories.flatMap((c) => c.items).filter((i) => i.checked).length;
      const total = categories.flatMap((c) => c.items).length;
      return { categories, progress: { total, checked, pct: Math.round((checked / total) * 100) } };
    });

    try {
      await fetch(`${API_URL}/api/v1/projects/${projectId}/checklist/${item.key}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ checked: !item.checked }),
      });
    } catch {
      // revert on error
      await load();
    } finally {
      setUpdating((s) => { const n = new Set(s); n.delete(item.key); return n; });
    }
  }

  async function saveNote(itemKey: string) {
    await fetch(`${API_URL}/api/v1/projects/${projectId}/checklist/${itemKey}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ checked: data?.categories.flatMap((c) => c.items).find((i) => i.key === itemKey)?.checked ?? false, note: noteValue }),
    });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        categories: prev.categories.map((cat) => ({
          ...cat,
          items: cat.items.map((i) => i.key === itemKey ? { ...i, note: noteValue || null } : i),
        })),
      };
    });
    setNoteEditing(null);
  }

  async function reset() {
    if (!confirm('Reset all checklist items for this project? This cannot be undone.')) return;
    await fetch(`${API_URL}/api/v1/projects/${projectId}/checklist/reset`, { method: 'DELETE', headers: authHeaders() });
    await load();
  }

  function downloadPdf() {
    const token = typeof window !== 'undefined' ? (localStorage.getItem('ptaas_access_token') ?? '') : '';
    window.open(`${API_URL}/api/v1/projects/${projectId}/checklist/export.pdf?token=${encodeURIComponent(token)}`, '_blank');
  }

  function toggleCategory(id: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded bg-gray-100" />
        <div className="h-4 w-full rounded bg-gray-100" />
        {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-gray-100" />)}
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
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pentest Checklist</h1>
            <p className="text-sm text-gray-500">OWASP Testing Guide · {data.progress.checked}/{data.progress.total} items</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg border border-red-100 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      {/* Overall progress */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-indigo-800">Overall Progress</span>
          <span className="font-bold text-indigo-700 tabular-nums">{data.progress.pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-indigo-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${data.progress.pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-indigo-500">
          {data.progress.checked} of {data.progress.total} items completed
        </p>
      </div>

      {/* Category accordion */}
      <div className="space-y-3">
        {data.categories.map((cat) => {
          const open = openCategories.has(cat.id);
          const { done, total, pct } = categoryProgress(cat);

          return (
            <div key={cat.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.id)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-lg shrink-0" role="img" aria-hidden>{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900 text-sm">{cat.label}</span>
                    <span className="text-xs text-gray-400 tabular-nums">{done}/{total}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                {pct === 100 && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />}
                {open
                  ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
              </button>

              {/* Items */}
              {open && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {cat.items.map((item) => {
                    const busy = updating.has(item.key);
                    const editingNote = noteEditing === item.key;

                    return (
                      <div key={item.key} className={`px-5 py-3 ${item.checked ? 'bg-green-50/30' : ''}`}>
                        <div className="flex items-start gap-3">
                          {/* Checkbox */}
                          <button
                            onClick={() => toggle(item)}
                            disabled={busy}
                            className={`mt-0.5 shrink-0 transition-all ${busy ? 'opacity-40' : ''}`}
                            aria-label={item.checked ? 'Uncheck' : 'Check'}
                          >
                            {item.checked
                              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                              : <Circle className="h-5 w-5 text-gray-300 hover:text-indigo-400 transition-colors" />}
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm ${item.checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {item.label}
                              </span>
                              {item.ref && (
                                <span className="rounded bg-gray-100 px-1.5 py-px text-[10px] font-mono text-gray-400">
                                  {item.ref}
                                </span>
                              )}
                            </div>

                            {/* Note */}
                            {item.checked && item.checkedBy && (
                              <p className="mt-0.5 text-[10px] text-gray-400">
                                Checked by {item.checkedBy}
                                {item.checkedAt && ` · ${new Date(item.checkedAt).toLocaleDateString('en-GB')}`}
                              </p>
                            )}

                            {editingNote ? (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  autoFocus
                                  value={noteValue}
                                  onChange={(e) => setNoteValue(e.target.value)}
                                  rows={2}
                                  placeholder="Add a note…"
                                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-indigo-400 focus:outline-none resize-none"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveNote(item.key)}
                                    className="rounded px-3 py-1 text-xs bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setNoteEditing(null)}
                                    className="rounded px-3 py-1 text-xs border border-gray-200 hover:bg-gray-50 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {item.note && (
                                  <p className="mt-1 text-xs text-gray-500 italic">{item.note}</p>
                                )}
                                <button
                                  onClick={() => { setNoteEditing(item.key); setNoteValue(item.note ?? ''); }}
                                  className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-500 transition-colors"
                                >
                                  <FileText className="h-3 w-3" />
                                  {item.note ? 'Edit note' : 'Add note'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
