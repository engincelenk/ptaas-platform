'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Download, Image, FileText, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function authToken() {
  return typeof window !== 'undefined' ? (localStorage.getItem('ptaas_access_token') ?? '') : '';
}

interface EvidenceItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  caption: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string; email: string } | null;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(mime: string) {
  return mime.startsWith('image/');
}

function EvidenceIcon({ mime }: { mime: string }) {
  if (isImage(mime)) return <Image className="h-5 w-5 text-indigo-400" />;
  if (mime === 'application/pdf') return <FileText className="h-5 w-5 text-red-400" />;
  return <Paperclip className="h-5 w-5 text-gray-400" />;
}

export function EvidenceSection({ findingId }: { findingId: string; projectId: string }) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [caption, setCaption] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/findings/${findingId}/evidence`, {
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [findingId]);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    if (caption.trim()) form.append('caption', caption.trim());

    try {
      const res = await fetch(`${API_URL}/api/v1/findings/${findingId}/evidence`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken()}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Upload failed');
      }
      toast.success('Evidence uploaded');
      setPendingFile(null);
      setCaption('');
      await load();
    } catch (e: any) {
      toast.error(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function deleteEvidence(id: string, name: string) {
    if (!confirm(`Delete evidence "${name}"?`)) return;
    const res = await fetch(`${API_URL}/api/v1/evidence/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    if (res.ok || res.status === 204) {
      toast.success('Deleted');
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      toast.error('Delete failed');
    }
  }

  function downloadUrl(id: string) {
    return `${API_URL}/api/v1/evidence/${id}/download?token=${encodeURIComponent(authToken())}`;
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setPendingFile(file);
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Paperclip className="h-4 w-4" />
        Evidence ({items.length})
      </h2>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !pendingFile && fileRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 cursor-pointer transition-colors ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,text/plain,text/html,application/json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); }}
        />
        {pendingFile ? (
          <div className="flex w-full max-w-sm flex-col gap-3 px-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <EvidenceIcon mime={pendingFile.type} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{pendingFile.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(pendingFile.size)}</p>
              </div>
              <button onClick={() => setPendingFile(null)} className="text-gray-300 hover:text-gray-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Optional caption…"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
            <button
              onClick={() => upload(pendingFile)}
              disabled={uploading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading…' : 'Upload Evidence'}
            </button>
          </div>
        ) : (
          <>
            <Upload className="h-7 w-7 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Drop a file or <span className="text-indigo-600">click to browse</span></p>
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, PDF, TXT · max 10 MB</p>
          </>
        )}
      </div>

      {/* Evidence grid */}
      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">No evidence attached yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              {isImage(item.mimeType) ? (
                <a href={downloadUrl(item.id)} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={downloadUrl(item.id)}
                    alt={item.originalName}
                    className="h-14 w-14 rounded-lg object-cover border border-gray-100"
                  />
                </a>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-50 border border-gray-100">
                  <EvidenceIcon mime={item.mimeType} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{item.originalName}</p>
                {item.caption && <p className="text-xs text-gray-500 italic">{item.caption}</p>}
                <p className="text-xs text-gray-400">
                  {formatBytes(item.size)} · {item.uploadedBy?.name ?? 'Unknown'} · {new Date(item.createdAt).toLocaleDateString('en-GB')}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <a
                  href={downloadUrl(item.id)}
                  download={item.originalName}
                  className="rounded p-1.5 text-gray-300 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={() => deleteEvidence(item.id, item.originalName)}
                  className="rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
