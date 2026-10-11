'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

type Step = 'welcome' | 'project' | 'target' | 'verify' | 'done';

const STEPS: Step[] = ['welcome', 'project', 'target', 'verify', 'done'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [projectId, setProjectId] = useState('');
  const [targetId, setTargetId] = useState('');

  const progress = ((STEPS.indexOf(step)) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Onboarding</span>
            <span>Step {STEPS.indexOf(step) + 1} of {STEPS.length}</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Onboarding-Fortschritt"
            className="h-1.5 bg-muted rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {step === 'welcome' && (
          <WelcomeStep onNext={() => setStep('project')} />
        )}
        {step === 'project' && (
          <ProjectStep
            onNext={(id) => { setProjectId(id); setStep('target'); }}
          />
        )}
        {step === 'target' && (
          <TargetStep
            projectId={projectId}
            onNext={(id) => { setTargetId(id); setStep('verify'); }}
            onSkip={() => router.replace('/dashboard')}
          />
        )}
        {step === 'verify' && (
          <VerifyStep
            projectId={projectId}
            targetId={targetId}
            onNext={() => setStep('done')}
            onSkip={() => router.replace('/dashboard')}
          />
        )}
        {step === 'done' && (
          <DoneStep onGo={() => router.replace('/dashboard')} />
        )}
      </div>
    </div>
  );
}

// ── Steps ────────────────────────────────────────────────────────────

const COMPANY_SIZES = ['1–10', '11–50', '51–200', '201–500', '500+'];
const INDUSTRIES = ['Finance / Banking', 'Healthcare', 'E-Commerce / Retail', 'SaaS / Software', 'Government', 'Manufacturing', 'Other'];

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [industry, setIndustry] = useState('');

  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-2xl">P</span>
          </div>
        </div>
        <h1 className="text-2xl font-semibold">Workspace einrichten</h1>
        <p className="text-sm text-muted-foreground mt-2">
          In unter 5 Minuten startklar. Zuerst ein paar Infos zur Organisation.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="workspace-name" className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Workspace Name *
          </label>
          <input
            id="workspace-name"
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="z.B. ACME Security"
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="company-size" className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Unternehmensgröße
          </label>
          <select
            id="company-size"
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Bitte wählen…</option>
            {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} Mitarbeiter</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="industry" className="block text-xs font-semibold text-muted-foreground mb-1.5">
            Branche
          </label>
          <select
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Bitte wählen…</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!workspaceName.trim()}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        Weiter →
      </button>
    </div>
  );
}

function ProjectStep({ onNext }: { onNext: (id: string) => void }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const p = await apiClient.post<{ id: string }>('/projects', { name });
      onNext(p.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Create your first project</h2>
        <p className="text-sm text-muted-foreground mt-1">
          A project groups the assets you want to test.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Web App"
          autoFocus
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create project →'}
        </button>
      </form>
    </div>
  );
}

function TargetStep({
  projectId,
  onNext,
  onSkip,
}: {
  projectId: string;
  onNext: (id: string) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const t = await apiClient.post<{ id: string }>(
        `/projects/${projectId}/targets`,
        { type: 'DOMAIN', value },
      );
      onNext(t.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Add your first domain</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the domain you want to test. You'll verify ownership next.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="example.com"
          autoFocus
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Adding…' : 'Add domain →'}
        </button>
      </form>
      <button onClick={onSkip} className="w-full text-sm text-muted-foreground hover:text-foreground">
        Skip for now
      </button>
    </div>
  );
}

function VerifyStep({
  projectId,
  targetId,
  onNext,
  onSkip,
}: {
  projectId: string;
  targetId: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Verify ownership</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Before scanning, we need to confirm you own this domain.
          You can complete verification now or from the project page later.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <a
          href={`/projects/${projectId}/targets/${targetId}`}
          className="w-full text-center rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Verify now →
        </a>
        <button onClick={onNext} className="w-full text-sm text-muted-foreground hover:text-foreground">
          I'll verify later
        </button>
      </div>
    </div>
  );
}

function DoneStep({ onGo }: { onGo: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-6 text-center">
      <div className="text-5xl">🎉</div>
      <div>
        <h2 className="text-xl font-semibold">You're all set!</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Your project and first target are ready. Once your domain is verified,
          you can start your first security scan.
        </p>
      </div>
      <button
        onClick={onGo}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Go to Dashboard →
      </button>
    </div>
  );
}
