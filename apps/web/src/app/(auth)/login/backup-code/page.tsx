'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-client';

function BackupCodeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tempToken = searchParams.get('tempToken') ?? '';

  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempToken) {
      setError('Session expired — please log in again.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/auth/login/backup-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, backupCode: backupCode.toUpperCase().trim() }),
        credentials: 'include',
      });
      const data = await res.json() as { accessToken?: string; message?: string };
      if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Invalid backup code');

      if (data.accessToken) {
        document.cookie = `ptaas_access=${data.accessToken}; path=/; max-age=900; SameSite=Strict`;
      }
      router.push('/arena');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid backup code');
      setBackupCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="backupCode" className="block text-sm font-medium mb-1.5">
          Backup code
        </label>
        <input
          id="backupCode"
          type="text"
          autoComplete="off"
          autoFocus
          value={backupCode}
          onChange={(e) => setBackupCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))}
          maxLength={8}
          placeholder="XXXXXXXX"
          className="w-full rounded-xl border px-3 py-3 text-center text-xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-ring bg-background"
        />
        <p className="text-xs text-muted-foreground mt-1.5">8-character hex code (e.g. A1B2C3D4)</p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || backupCode.length !== 8 || !tempToken}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? 'Verifying…' : 'Sign in with backup code'}
      </button>

      <div className="text-center space-y-2">
        {tempToken && (
          <Link
            href={`/login/mfa?tempToken=${encodeURIComponent(tempToken)}`}
            className="block text-sm text-muted-foreground hover:text-foreground"
          >
            ← Use authenticator app instead
          </Link>
        )}
        <Link href="/login" className="block text-sm text-muted-foreground hover:text-foreground">
          Start over
        </Link>
      </div>
    </form>
  );
}

function BackupCodePageContent() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Use a backup code</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lost access to your authenticator? Enter one of your saved backup codes.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
            <BackupCodeForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Each backup code can only be used once. If you've used all your codes, contact your organization admin.
        </p>
      </div>
    </div>
  );
}

export default function BackupCodePage() {
  return (
    <Suspense fallback={null}>
      <BackupCodePageContent />
    </Suspense>
  );
}
