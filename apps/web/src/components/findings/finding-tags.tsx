'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { X, Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface FindingTag {
  id: string;
  name: string;
  color: string;
}

interface Assignment {
  tagId: string;
  tag: FindingTag;
}

function TagChip({ tag, onRemove }: { tag: FindingTag; onRemove?: () => void }) {
  const textColor = contrastColor(tag.color);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: tag.color + '22', color: tag.color, border: `1px solid ${tag.color}44` }}
    >
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors">
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#1e293b' : hex;
}

export { TagChip };

export function FindingTagsInline({ findingId }: { findingId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [orgTags, setOrgTags] = useState<FindingTag[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([
      apiClient.get<Assignment[]>(`/findings/${findingId}/tags`),
      apiClient.get<FindingTag[]>('/org/tags'),
    ]);
    setAssignments(a);
    setOrgTags(t);
  }, [findingId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const assigned = new Set(assignments.map((a) => a.tagId));
  const available = orgTags.filter((t) => !assigned.has(t.id));

  async function assign(tagId: string) {
    await apiClient.post(`/findings/${findingId}/tags/${tagId}`, {});
    await load();
    setOpen(false);
  }

  async function remove(tagId: string) {
    await apiClient.delete(`/findings/${findingId}/tags/${tagId}`);
    await load();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" ref={ref}>
      {assignments.map((a) => (
        <TagChip key={a.tagId} tag={a.tag} onRemove={() => remove(a.tagId)} />
      ))}

      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
        >
          <Plus className="h-3 w-3" /> Tag
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-gray-200 bg-white shadow-lg">
            {available.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">
                {orgTags.length === 0 ? 'No tags yet — create some in Settings → Tags' : 'All tags assigned'}
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto py-1">
                {available.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => assign(t.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="text-xs text-gray-700">{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
