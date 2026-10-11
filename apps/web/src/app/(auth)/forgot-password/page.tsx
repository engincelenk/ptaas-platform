'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/forgot-password', { email });
    } catch {
      // Same response regardless — don't leak whether email exists (UX-DECISIONS 7.2)
    } finally {
      setSent(true);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-4">
        <div className="text-4xl">📬</div>
        <h1 className="text-xl font-semibold">Schau in dein Postfach</h1>
        <p className="text-sm text-muted-foreground">
          Falls ein Konto mit dieser E-Mail existiert, haben wir einen Reset-Link gesendet.
          Der Link ist 30 Minuten gültig.
        </p>
        <Link
          href="/login"
          className="block w-full rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          Zurück zum Login
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-xl font-semibold mb-1">Passwort zurücksetzen</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Gib deine E-Mail ein — wir senden dir einen Reset-Link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="du@firma.de"
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Wird gesendet…' : 'Reset-Link senden'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Zurück zum Login
        </Link>
      </p>
    </div>
  );
}
