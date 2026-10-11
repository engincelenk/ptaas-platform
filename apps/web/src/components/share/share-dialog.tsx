'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, Trash2, Link as LinkIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

interface ShareToken {
  id: string;
  token: string;
  label: string | null;
  expiresAt: string;
  createdAt: string;
  createdBy: { name: string };
}

interface Props {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : '';

export function ShareDialog({ projectId, projectName, open, onOpenChange }: Props) {
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [days, setDays] = useState('7');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await apiClient.get<ShareToken[]>(`/projects/${projectId}/share`);
      setTokens(data);
    } catch {
      // no tokens yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open, projectId]);

  const create = async () => {
    setCreating(true);
    try {
      const result = await apiClient.post<ShareToken>(`/projects/${projectId}/share`, {
        label: label || undefined,
        password: password || undefined,
        expiresInDays: parseInt(days, 10) || 7,
      });
      setTokens((prev) => [result, ...prev]);
      setShowCreate(false);
      setLabel(''); setPassword(''); setDays('7');
      toast.success('Share link created');
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this share link? It will stop working immediately.')) return;
    try {
      await apiClient.delete(`/projects/${projectId}/share/${id}`);
      setTokens((prev) => prev.filter((t) => t.id !== id));
      toast.success('Share link revoked');
    } catch {
      toast.error('Failed to revoke');
    }
  };

  const copy = async (token: string) => {
    const url = `${BASE_URL}/share/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareUrl = (token: string) => `${BASE_URL}/share/${token}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Share Report — {projectName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Existing tokens */}
          {!loading && tokens.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Links</p>
              {tokens.map((t) => (
                <div key={t.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t.label ?? 'Share Link'}</p>
                      <p className="text-xs text-muted-foreground">
                        Created by {t.createdBy.name} · Expires {new Date(t.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(t.token)} title="Copy link">
                        {copied === t.token ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => revoke(t.id)} title="Revoke">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded truncate flex-1">
                      {shareUrl(t.token)}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading && <div className="h-20 bg-muted animate-pulse rounded-lg" />}

          {!loading && tokens.length === 0 && !showCreate && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <LinkIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No active share links</p>
              <p className="text-xs text-muted-foreground mt-1">Create a link to share this report with clients.</p>
            </div>
          )}

          {/* Create form */}
          {showCreate && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium">New Share Link</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Label (optional)</Label>
                <Input placeholder="e.g. Client Q2 Review" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Expires in (days)</Label>
                  <Input type="number" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Password (optional)</Label>
                  <Input type="password" placeholder="Leave blank for open" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button size="sm" onClick={create} disabled={creating}>
                  {creating ? 'Creating…' : 'Create Link'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {!showCreate && (
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Share Link
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
