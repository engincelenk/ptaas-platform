'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { apiUrl } from '@/lib/api-client';

type Step = 'credentials' | 'mfa' | 'mfa-setup' | 'locked';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('credentials');
  const [tempToken, setTempToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiClient.post<{
        requiresMfa: boolean;
        tempToken: string;
        mfaSetupRequired?: boolean;
      }>('/auth/login', { email, password });

      setAttemptsRemaining(null);
      setTempToken(data.tempToken);
      setStep(data.mfaSetupRequired ? 'mfa-setup' : 'mfa');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      // Detect lockout (429 / "locked" / "too many")
      if (/locked|too many|429|gesperrt/i.test(msg)) {
        setLockedUntil(new Date(Date.now() + 15 * 60 * 1000));
        setStep('locked');
        return;
      }
      setError(msg);
      const match = msg.match(/(\d+)\s*(attempt|versuche)/i);
      if (match) setAttemptsRemaining(parseInt(match[1], 10));
      else setAttemptsRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent, codeOverride?: string) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const code = codeOverride ?? totpCode;
    try {
      const data = await apiClient.post<{ accessToken: string }>('/auth/login/mfa', {
        tempToken,
        totpCode: code,
      });
      localStorage.setItem('ptaas_access_token', data.accessToken);
      router.replace('/arena');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid MFA code');
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'locked') {
    return <LockoutScreen until={lockedUntil!} onRetry={() => { setStep('credentials'); setError(''); setAttemptsRemaining(null); }} />;
  }

  if (step === 'mfa-setup') {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold mb-2">MFA Setup Required</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your account requires multi-factor authentication. Redirecting to setup…
        </p>
        <button
          onClick={() => router.push(`/onboarding/mfa?tempToken=${encodeURIComponent(tempToken)}`)}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Set up MFA now →
        </button>
      </div>
    );
  }

  if (step === 'mfa') {
    return <MfaStep
      error={error}
      loading={loading}
      onSubmit={(code) => { setTotpCode(code); handleMfa({ preventDefault: () => {} } as React.FormEvent, code); }}
    />;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-xl font-semibold mb-1">Sign in</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Enter your credentials to access the platform.
      </p>

      <form onSubmit={handleCredentials} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
            {attemptsRemaining !== null && attemptsRemaining > 0 && (
              <span className="block text-xs mt-0.5 font-medium">
                Noch {attemptsRemaining} Versuch{attemptsRemaining !== 1 ? 'e' : ''}
              </span>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-5">
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <SsoButton />
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <Link href="/forgot-password" className="hover:text-foreground hover:underline">
          Passwort vergessen?
        </Link>
        <span>
          No account?{' '}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            Create one
          </Link>
        </span>
      </div>
    </div>
  );
}

function LockoutScreen({ until, onRetry }: { until: Date; onRetry: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((until.getTime() - Date.now()) / 1000)));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const secs = Math.max(0, Math.floor((until.getTime() - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="rounded-xl border border-destructive/30 bg-card p-8 shadow-sm text-center space-y-4">
      <div className="text-4xl">🔒</div>
      <h1 className="text-xl font-semibold">Konto vorübergehend gesperrt</h1>
      <p className="text-sm text-muted-foreground">
        Zu viele fehlgeschlagene Anmeldeversuche. Bitte warte, bevor du es erneut versuchst.
      </p>
      {remaining > 0 ? (
        <div
          role="timer"
          aria-live="polite"
          aria-label={`Noch ${mins}:${String(secs).padStart(2, '0')} Minuten gesperrt`}
          className="inline-flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-5 py-3"
        >
          <span className="text-2xl font-mono font-bold tabular-nums text-destructive">
            {mins}:{String(secs).padStart(2, '0')}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

function MfaStep({
  error,
  loading,
  onSubmit,
}: {
  error: string;
  loading: boolean;
  onSubmit: (code: string) => void;
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const r0 = useRef<HTMLInputElement>(null);
  const r1 = useRef<HTMLInputElement>(null);
  const r2 = useRef<HTMLInputElement>(null);
  const r3 = useRef<HTMLInputElement>(null);
  const r4 = useRef<HTMLInputElement>(null);
  const r5 = useRef<HTMLInputElement>(null);
  const refs = [r0, r1, r2, r3, r4, r5];

  function handleInput(index: number, value: string) {
    const d = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = d;
    setDigits(next);
    if (d && index < 5) refs[index + 1]?.current?.focus();
    if (next.every((c) => c !== '')) {
      onSubmit(next.join(''));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs[index - 1]?.current?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split('');
      setDigits(next);
      refs[5]?.current?.focus();
      onSubmit(pasted);
    }
    e.preventDefault();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-xl font-semibold mb-1">Two-factor authentication</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Enter the 6-digit code from your authenticator app.
      </p>

      <fieldset>
        <legend className="block text-sm font-medium mb-3">Authenticator code</legend>
        <div className="flex gap-2 justify-center" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={d}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              aria-label={`Ziffer ${i + 1} von 6`}
              className="w-11 h-14 rounded-lg border border-input bg-background text-center text-2xl font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus={i === 0}
              disabled={loading}
            />
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive text-center">{error}</p>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Lost your device?{' '}
        <Link href="/login/backup-code" className="underline hover:text-foreground">
          Use a backup code
        </Link>
      </p>
    </div>
  );
}

function SsoButton() {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');

  function handleSso(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim()) return;
    window.location.href = apiUrl(`/auth/saml/${slug.trim()}/login`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
      >
        🔐 Sign in with SSO
      </button>
    );
  }

  return (
    <form onSubmit={handleSso} className="space-y-2">
      <input
        type="text"
        autoFocus
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="your-organization-slug"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!slug.trim()}
          className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
