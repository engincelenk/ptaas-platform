'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { BookOpen, Plus, Trash2, ChevronRight, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';

interface Methodology {
  id: string;
  name: string;
  description: string | null;
  preset: string;
  createdAt: string;
  _count: { checks: number; assignments: number };
}

const PRESET_LABEL: Record<string, string> = {
  OWASP_TG_V42: 'OWASP TG v4.2',
  PTES:         'PTES',
  CUSTOM:       'Custom',
};

const PRESET_COLOR: Record<string, string> = {
  OWASP_TG_V42: 'bg-blue-100 text-blue-700',
  PTES:         'bg-purple-100 text-purple-700',
  CUSTOM:       'bg-gray-100 text-gray-600',
};

export default function MethodologyPage() {
  const [methodologies, setMethodologies] = useState<Methodology[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', preset: 'OWASP_TG_V42' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<Methodology[]>('/methodology');
      setMethodologies(data);
    } catch {
      toast.error('Failed to load methodologies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await apiClient.post('/methodology', {
        name: form.name,
        description: form.description || undefined,
        preset: form.preset,
      });
      toast.success(`Methodology created with ${form.preset === 'CUSTOM' ? 0 : form.preset === 'OWASP_TG_V42' ? 20 : 15} checks`);
      setShowForm(false);
      setForm({ name: '', description: '', preset: 'OWASP_TG_V42' });
      await load();
    } catch {
      toast.error('Failed to create methodology');
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/methodology/${id}`);
      toast.success('Methodology deleted');
      setMethodologies((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast.error('Failed to delete methodology');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Methodology Templates</h1>
            <p className="text-sm text-gray-500 mt-0.5">Standardized pentest checklists (OWASP TG, PTES, Custom)</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Methodology
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Create Methodology</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                placeholder="e.g. Q3 Web App Pentest"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Preset</label>
              <select
                value={form.preset}
                onChange={(e) => setForm((f) => ({ ...f, preset: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="OWASP_TG_V42">OWASP Testing Guide v4.2 (20 checks)</option>
                <option value="PTES">PTES — Penetration Testing Execution Standard (15 checks)</option>
                <option value="CUSTOM">Custom (empty — add checks manually)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-gray-100" />)}
        </div>
      ) : methodologies.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <CheckSquare className="h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-700">No methodology templates yet</p>
          <p className="text-sm text-gray-400">Create an OWASP TG or PTES template to start tracking test coverage.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {methodologies.map((m) => (
            <div key={m.id} className="group flex flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate">{m.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRESET_COLOR[m.preset] ?? 'bg-gray-100 text-gray-600'}`}>
                      {PRESET_LABEL[m.preset] ?? m.preset}
                    </span>
                  </div>
                  {m.description && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{m.description}</p>
                  )}
                </div>
                <button
                  onClick={() => remove(m.id, m.name)}
                  title="Delete"
                  className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                <span>{m._count.checks} check{m._count.checks !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{m._count.assignments} project{m._count.assignments !== 1 ? 's' : ''}</span>
              </div>

              <a
                href={`/methodology/${m.id}`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                View checks <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
