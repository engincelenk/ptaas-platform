'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Tag, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface FindingTag {
  id: string;
  name: string;
  color: string;
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
];

function ColorDot({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${selected ? 'border-gray-900 scale-110' : 'border-transparent'}`}
      style={{ backgroundColor: color }}
    />
  );
}

function TagRow({ tag, onSaved, onDeleted }: { tag: FindingTag; onSaved: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(tag.name);
  const [color, setColor]     = useState(tag.color);
  const [saving, setSaving]   = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiClient.patch(`/org/tags/${tag.id}`, { name, color });
      toast.success('Tag updated');
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm(`Delete tag "${tag.name}"? It will be removed from all findings.`)) return;
    await apiClient.delete(`/org/tags/${tag.id}`);
    toast.success('Tag deleted');
    onDeleted();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        />
        <div className="flex gap-1.5">
          {PRESET_COLORS.map((c) => (
            <ColorDot key={c} color={c} selected={color === c} onClick={() => setColor(c)} />
          ))}
        </div>
        <button onClick={save} disabled={!name.trim() || saving}
          className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={() => setEditing(false)}
          className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm hover:border-gray-200 transition-colors">
      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: tag.color + '22', color: tag.color, border: `1px solid ${tag.color}44` }}
      >
        {tag.name}
      </span>
      <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={del}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function TagsSettingsPage() {
  const [tags, setTags]       = useState<FindingTag[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    const t = await apiClient.get<FindingTag[]>('/org/tags');
    setTags(t);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiClient.post('/org/tags', { name: newName.trim(), color: newColor });
      toast.success('Tag created');
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="h-6 w-6 text-indigo-500" /> Finding Tags
          </h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage custom tags to categorize findings across your projects.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Tag
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-indigo-700">New Tag</h2>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Tag Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. needs-developer, compliance-blocker"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false); }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Color</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <ColorDot key={c} color={c} selected={newColor === c} onClick={() => setNewColor(c)} />
              ))}
            </div>
          </div>

          {/* Preview */}
          {newName && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Preview</label>
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: newColor + '22', color: newColor, border: `1px solid ${newColor}44` }}
              >
                {newName}
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={create} disabled={!newName.trim() || saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create Tag'}
            </button>
            <button onClick={() => setCreating(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tag list */}
      {tags.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
            <Tag className="h-7 w-7 text-gray-400" />
          </div>
          <div>
            <p className="font-medium text-gray-700">No tags yet</p>
            <p className="mt-1 text-sm text-gray-400">Tags let you categorize findings by custom criteria like "regression", "needs-developer", or "compliance-blocker".</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {tags.map((t) => (
            <TagRow key={t.id} tag={t} onSaved={load} onDeleted={load} />
          ))}
        </div>
      )}
    </div>
  );
}
