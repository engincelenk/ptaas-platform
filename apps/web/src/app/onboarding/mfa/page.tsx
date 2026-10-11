'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { apiClient } from '@/lib/api-client';

type Step = 'qr' | 'backup-codes' | 'verify' | 'done';

interface MfaSetupData {
  qrCodeDataUrl: string;
  otpauthUrl: string;
  backupCodes: string[];
}

function MfaSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tempToken = searchParams.get('tempToken') ?? '';

  const [step, setStep] = useState<Step>('qr');
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codesConfirmed, setCodesConfirmed] = useState(false);

  useEffect(() => {
    async function fetchSetup() {
      try {
        // For the initial setup after registration, we use the temp token
        // For already-authenticated users, the bearer token is used automatically
        const data = await apiClient.get<MfaSetupData>('/auth/mfa/setup', tempToken || undefined);
        setSetupData(data);
      } catch {
        setError('Failed to load MFA setup. Please try again.');
      }
    }
    void fetchSetup();
  }, [tempToken]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiClient.post('/auth/mfa/setup/confirm', { totpCode }, tempToken || undefined);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  }

  if (!setupData && !error) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Loading MFA setup…</p>
      </div>
    );
  }

  if (error && !setupData) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-destructive mb-4">{error}</p>
        <button onClick={() => router.back()} className="text-sm underline">
          Go back
        </button>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <h1 className="text-xl font-semibold">MFA enabled</h1>
        <p className="text-sm text-muted-foreground">
          Your account is now protected with two-factor authentication.
        </p>
        <button
          onClick={() => router.replace('/login')}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Sign in to continue
        </button>
      </div>
    );
  }

  if (step === 'backup-codes') {
    return (
      <div className="rounded-xl border border-border bg-card p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold mb-1">Save your backup codes</h1>
          <p className="text-sm text-muted-foreground">
            Store these codes in a safe place. Each code can be used once if you lose access to
            your authenticator app.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4">
          {setupData!.backupCodes.map((code) => (
            <code key={code} className="font-mono text-sm text-center py-1">
              {code}
            </code>
          ))}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={codesConfirmed}
            onChange={(e) => setCodesConfirmed(e.target.checked)}
          />
          <span className="text-sm text-muted-foreground">
            I have saved these codes in a secure location. I understand they won&apos;t be shown again.
          </span>
        </label>

        <button
          onClick={() => setStep('verify')}
          disabled={!codesConfirmed}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          I&apos;ve saved my codes →
        </button>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="rounded-xl border border-border bg-card p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold mb-1">Confirm your authenticator</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your app to confirm setup is working.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || totpCode.length !== 6}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Enable MFA'}
          </button>
        </form>
      </div>
    );
  }

  // Step: qr
  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Set up two-factor authentication</h1>
        <p className="text-sm text-muted-foreground">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </p>
      </div>

      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={setupData!.qrCodeDataUrl}
          alt="MFA QR Code"
          width={200}
          height={200}
          className="rounded-lg border border-border"
        />
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Can&apos;t scan? Enter manually
        </summary>
        <code className="mt-2 block break-all rounded bg-muted px-3 py-2 text-xs">
          {setupData!.otpauthUrl}
        </code>
      </details>

      <button
        onClick={() => setStep('backup-codes')}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        I&apos;ve scanned the QR code →
      </button>
    </div>
  );
}

function MfaSetupPageContent() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">P</span>
          </div>
          <span className="font-semibold text-lg">PTaaS Platform</span>
        </div>
        <Suspense fallback={<div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading…</div>}>
          <MfaSetupContent />
        </Suspense>
      </div>
    </div>
  );
}

export default function MfaSetupPage() {
  return (
    <Suspense fallback={null}>
      <MfaSetupPageContent />
    </Suspense>
  );
}
