'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Loader2, Rocket, Database, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SetupWizard } from './setup-wizard';

interface Props {
  onClose: () => void;
}

export function WelcomeModal({ onClose }: Props) {
  const router = useRouter();
  const [showWizard, setShowWizard] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSeedDemo() {
    setSeedingDemo(true);
    setError(null);
    try {
      const { projectId } = await apiClient.post<{ projectId: string }>('/onboarding/seed-demo', {});
      onClose();
      router.push(`/projects/${projectId}`);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to seed demo data');
      setSeedingDemo(false);
    }
  }

  if (showWizard) {
    return <SetupWizard onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border bg-background shadow-2xl p-8">
        <button onClick={onClose} className="absolute top-4 right-4 rounded-md p-1 hover:bg-muted">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <span className="text-primary-foreground font-bold text-xl">P</span>
          </div>
          <h1 className="text-2xl font-bold">Welcome to PTaaS</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your AI-native penetration testing platform. Let's get you started.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setShowWizard(true)}
            className="w-full flex items-start gap-4 rounded-xl border-2 border-primary/30 hover:border-primary bg-primary/5 p-4 text-left transition-colors"
          >
            <Rocket className="h-6 w-6 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Start setup wizard</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create a project, add your first target, and run a scan step by step.
              </p>
            </div>
          </button>

          <button
            onClick={handleSeedDemo}
            disabled={seedingDemo}
            className="w-full flex items-start gap-4 rounded-xl border hover:border-ring bg-muted/30 hover:bg-muted/50 p-4 text-left transition-colors disabled:opacity-60"
          >
            {seedingDemo ? (
              <Loader2 className="h-6 w-6 text-muted-foreground mt-0.5 shrink-0 animate-spin" />
            ) : (
              <Database className="h-6 w-6 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-semibold text-sm">Explore with demo data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Load a sample project with findings so you can explore the platform right away.
              </p>
            </div>
          </button>
        </div>

        {error && <p className="text-xs text-red-600 mt-3 text-center">{error}</p>}

        <button onClick={onClose} className="mt-6 w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
          Skip for now
        </button>
      </div>
    </div>
  );
}
