'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

type RegStep = 'form' | 'confirm-email';

export default function RegisterPage() {
  const router = useRouter();
  const [regStep, setRegStep] = useState<RegStep>('form');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    organizationName: '',
    organizationSlug: '',
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      // Auto-generate slug from org name
      ...(name === 'organizationName'
        ? { organizationSlug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
        : {}),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.passwordConfirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const data = await apiClient.post<{ tempToken: string }>('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        organizationName: form.organizationName,
        organizationSlug: form.organizationSlug,
      });

      setTempToken(data.tempToken);
      setRegisteredEmail(form.email);
      setRegStep('confirm-email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  if (regStep === 'confirm-email') {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-5">
        <div className="text-5xl">📧</div>
        <div>
          <h1 className="text-xl font-semibold">Bestätige deine E-Mail</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Wir haben eine Bestätigungs-E-Mail an{' '}
            <strong className="text-foreground">{registeredEmail}</strong> gesendet.
            Bitte klicke den Link in der E-Mail, um fortzufahren.
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 text-xs text-muted-foreground text-left space-y-1">
          <p>Kein Mail erhalten?</p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>Spam-Ordner prüfen</li>
            <li>Einige Minuten warten</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/onboarding/mfa?tempToken=${encodeURIComponent(tempToken)}`)}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          E-Mail bestätigt — MFA einrichten →
        </button>
        <p className="text-xs text-muted-foreground">
          Falsche E-Mail?{' '}
          <button type="button" onClick={() => setRegStep('form')} className="underline hover:text-foreground">
            Zurück
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-xl font-semibold mb-1">Create your account</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Set up your organization and start testing.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" name="name" type="text" value={form.name} onChange={handleChange}
          placeholder="Max Mustermann" autoComplete="name" required />

        <Field label="Work email" name="email" type="email" value={form.email} onChange={handleChange}
          placeholder="max@company.com" autoComplete="email" required />

        <hr className="border-border" />

        <Field label="Organization name" name="organizationName" type="text"
          value={form.organizationName} onChange={handleChange}
          placeholder="Acme Corp" required />

        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="organizationSlug">
            Organization URL slug
          </label>
          <div className="flex items-center rounded-lg border border-input bg-background overflow-hidden">
            <span className="px-3 py-2.5 text-sm text-muted-foreground bg-muted border-r border-input">
              ptaas.io/
            </span>
            <input
              id="organizationSlug"
              name="organizationSlug"
              type="text"
              required
              pattern="[a-z0-9-]+"
              value={form.organizationSlug}
              onChange={handleChange}
              placeholder="acme-corp"
              className="flex-1 px-3 py-2.5 text-sm bg-transparent focus:outline-none"
            />
          </div>
        </div>

        <hr className="border-border" />

        <PasswordField
          label="Password"
          name="password"
          value={form.password}
          onChange={handleChange}
          autoComplete="new-password"
          required
        />

        <Field label="Confirm password" name="passwordConfirm" type="password"
          value={form.passwordConfirm} onChange={handleChange}
          autoComplete="new-password" required />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Creating account…' : 'Create account & set up MFA →'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" htmlFor={props.name}>
        {label}
      </label>
      <input
        id={props.name}
        {...props}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: 'Sehr schwach', color: 'bg-red-500' },
    { label: 'Schwach', color: 'bg-orange-500' },
    { label: 'Mittel', color: 'bg-yellow-500' },
    { label: 'Stark', color: 'bg-lime-500' },
    { label: 'Sehr stark', color: 'bg-green-500' },
  ];
  return { score, ...(levels[Math.max(0, score - 1)] ?? levels[0]) };
}

function PasswordField(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, value = '', ...rest } = props;
  const pw = String(value);
  const { score, label: strengthLabel, color } = passwordStrength(pw);
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" htmlFor={rest.name}>
        {label}
      </label>
      <input
        id={rest.name}
        {...rest}
        value={value}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {pw.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex gap-1" role="presentation">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all ${i <= score ? color : 'bg-muted'}`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Passwortstärke: <span className="font-medium">{strengthLabel}</span>
          </p>
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Min. 12 Zeichen — Groß, Klein, Zahl, Sonderzeichen
      </p>
    </div>
  );
}
