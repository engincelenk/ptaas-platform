'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Link2, Plus, Copy, CheckCheck, Trash2, Lock, Calendar,
  ExternalLink, ShieldCheck, AlertTriangle, Eye, EyeOff,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

interface ShareToken {
  id: string;
  token: string;
  label: string | null;
  expiresAt: string;
  createdAt: string;
  createdBy: { name: string } | null;
}

function authHeaders() {
  const t = typeof window !== 'undefined' ? (localStorage.getItem('ptaas_access_token') ?? '') : '';
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}

function daysLeft(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default function ShareManagePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Copy state per token
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/share`, {
        headers: authHeaders(),
      });
      if (res.ok) setTokens(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/share`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          label: label.trim() || undefined,
          expiresInDays,
          password: password || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      setLabel('');
      setPassword('');
      setExpiresInDays(7);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(tokenId: string) {
    if (!confirm('Revoke this share link? It will stop working immediately.')) return;
    await fetch(`${API_URL}/api/v1/projects/${projectId}/share/${tokenId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    setTokens((prev) => prev.filter((t) => t.id !== tokenId));
  }

  async function copyLink(token: ShareToken) {
    const url = `${APP_URL}/share/${token.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(token.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const shareUrl = (token: string) => `${APP_URL}/share/${token}`;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Share Report</h1>
            <p className="text-sm text-gray-500">Generate read-only links for clients and stakeholders</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Link
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Share links give <strong>read-only</strong> access to findings. No login required.
          Sensitive data (internal notes, HTTP evidence, IP addresses) is never included.
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Create Share Link</h2>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Label <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Q2 Review — Acme Inc."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Expires in</label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Password <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for no password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-9 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={create}
              disabled={creating}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {creating ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {creating ? 'Creating…' : 'Create Link'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      <div className="space-y-3">
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100" />)}
          </div>
        )}

        {!loading && tokens.length === 0 && !showForm && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-14 text-center">
            <Link2 className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-400">No share links yet</p>
            <p className="mt-1 text-xs text-gray-300">Create a link to share findings with clients.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Link
            </button>
          </div>
        )}

        {!loading && tokens.map((t) => {
          const days = daysLeft(t.expiresAt);
          const expiringSoon = days <= 2;
          const url = shareUrl(t.token);

          return (
            <div
              key={t.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.label && (
                      <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                    )}
                    {!t.label && (
                      <span className="text-sm text-gray-400">Untitled link</span>
                    )}
                    {t.token.length > 0 && (
                      <span title="Token exists"><Lock className="h-3.5 w-3.5 text-gray-300" /></span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span className={expiringSoon ? 'font-semibold text-orange-500' : ''}>
                        {expiringSoon
                          ? `Expires in ${days} day${days === 1 ? '' : 's'}`
                          : `Expires ${new Date(t.expiresAt).toLocaleDateString('en-GB')}`}
                      </span>
                    </span>
                    {t.createdBy && (
                      <span>by {t.createdBy.name}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => revoke(t.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Revoke link"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* URL row */}
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                  {url}
                </code>
                <button
                  onClick={() => copyLink(t)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    copiedId === t.id
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  {copiedId === t.id ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedId === t.id ? 'Copied!' : 'Copy'}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
