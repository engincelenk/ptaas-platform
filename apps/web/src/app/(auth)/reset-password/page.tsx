'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: 'Sehr schwach', color: 'bg-red-500' },
    { label: 'Schwach',      color: 'bg-orange-500' },
    { label: 'Mittel',       color: 'bg-yellow-500' },
    { label: 'Stark',        color: 'bg-lime-500' },
    { label: 'Sehr stark',   color: 'bg-green-500' },
  ];
  return { score, ...(levels[Math.max(0, score - 1)] ?? levels[0]) };
}

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { score, label, color } = passwordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwörter stimmen nicht überein'); return; }
    if (score < 3) { setError('Bitte wähle ein stärkeres Passwort'); return; }
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/reset-password', { token, password });
      router.replace('/login?reset=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-4">
        <p className="text-sm text-destructive">Ungültiger oder abgelaufener Reset-Link.</p>
        <Link href="/forgot-password" className="text-sm font-medium underline hover:text-foreground">
          Neuen Link anfordern
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-xl font-semibold mb-1">Neues Passwort setzen</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Wähle ein sicheres Passwort für dein Konto.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="password">Neues Passwort</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1" role="presentation">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? color : 'bg-muted'}`} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Passwortstärke: <span className="font-medium">{label}</span>
              </p>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Min. 12 Zeichen — Groß, Klein, Zahl, Sonderzeichen
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="confirm">Passwort bestätigen</label>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {confirm.length > 0 && password !== confirm && (
            <p className="mt-1 text-xs text-destructive">Passwörter stimmen nicht überein</p>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || score < 3 || password !== confirm}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Wird gespeichert…' : 'Passwort speichern'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
