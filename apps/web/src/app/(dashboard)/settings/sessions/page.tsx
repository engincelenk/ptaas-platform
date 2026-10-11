'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Monitor, Smartphone, Globe, Trash2, LogOut, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface Session {
  familyId: string;
  createdAt: string;
  lastUsedAt: string | null;
  ip: string | null;
  userAgent: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
}

function parseUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: 'Unknown device', browser: 'Unknown browser' };

  let device = 'Desktop';
  if (/Mobile|Android|iPhone|iPad/.test(ua)) device = 'Mobile';
  else if (/Tablet/.test(ua)) device = 'Tablet';

  let browser = 'Unknown';
  if (/Chrome\//.test(ua) && !/Chromium|Edge/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Edge\//.test(ua)) browser = 'Edge';
  else if (/curl/.test(ua)) browser = 'curl';
  else if (/axios|node-fetch|undici/.test(ua)) browser = 'API client';

  return { device, browser };
}

function DeviceIcon({ ua }: { ua: string | null }) {
  if (!ua) return <Globe className="h-5 w-5 text-gray-400" />;
  if (/Mobile|iPhone|Android/.test(ua)) return <Smartphone className="h-5 w-5 text-gray-400" />;
  return <Monitor className="h-5 w-5 text-gray-400" />;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<Session[]>('/auth/sessions');
      setSessions(data);
    } catch {
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revokeOne(familyId: string) {
    setRevoking(familyId);
    try {
      await apiClient.delete(`/auth/sessions/${familyId}`);
      toast.success('Session revoked');
      setSessions((prev) => prev.filter((s) => s.familyId !== familyId));
    } catch {
      toast.error('Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  }

  async function revokeAll() {
    setRevokingAll(true);
    try {
      await apiClient.delete('/auth/sessions');
      toast.success('All other sessions revoked');
      await load();
    } catch {
      toast.error('Failed to revoke sessions');
    } finally {
      setRevokingAll(false);
    }
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Active Sessions</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage where you are signed in</p>
          </div>
        </div>
        {otherSessions.length > 0 && (
          <button
            onClick={revokeAll}
            disabled={revokingAll}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {revokingAll ? 'Revoking…' : 'Sign out all other sessions'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-gray-100" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Monitor className="h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-700">No active sessions found</p>
          <p className="text-sm text-gray-400">Session data is only stored when you log in after this update.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const { device, browser } = parseUserAgent(session.userAgent);
            const createdDate = new Date(session.createdAt).toLocaleString('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
            });
            const lastUsed = session.lastUsedAt
              ? new Date(session.lastUsedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
              : null;

            return (
              <div
                key={session.familyId}
                className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                  session.isCurrent
                    ? 'border-indigo-200 bg-indigo-50/60'
                    : 'border-gray-100 bg-white hover:bg-gray-50/60'
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                  <DeviceIcon ua={session.userAgent} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {device} · {browser}
                    </p>
                    {session.isCurrent && (
                      <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    {session.ip && <span>IP: {session.ip}</span>}
                    <span>Signed in: {createdDate}</span>
                    {lastUsed && <span>Last active: {lastUsed}</span>}
                    {session.expiresAt && (
                      <span>Expires: {new Date(session.expiresAt).toLocaleDateString('en-GB')}</span>
                    )}
                  </div>
                </div>

                {!session.isCurrent && (
                  <button
                    onClick={() => revokeOne(session.familyId)}
                    disabled={revoking === session.familyId}
                    title="Revoke this session"
                    className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                  >
                    {revoking === session.familyId ? (
                      <span className="text-xs">…</span>
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">Security tip</p>
        <p>
          If you see a session you don&apos;t recognize, revoke it immediately and change your password.
          Revoking a session signs out that device — they will need to log in again.
        </p>
      </div>
    </div>
  );
}
