'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { CheckCircle2, ChevronRight, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Step {
  id: number;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  { id: 1, title: 'Create your first project', description: 'A project groups related targets and their findings.' },
  { id: 2, title: 'Add a target', description: 'Enter the URL you want to scan.' },
  { id: 3, title: 'Run your first scan', description: 'Choose a scan type and kick it off.' },
  { id: 4, title: "You're all set!", description: 'Results will appear as findings once the scan completes.' },
];

interface Props {
  onClose: () => void;
}

export function SetupWizard({ onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdTargetId, setCreatedTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStep() {
    setError(null);
    setLoading(true);
    try {
      if (step === 0) {
        if (!projectName.trim()) { setError('Project name is required'); return; }
        const proj = await apiClient.post<{ id: string }>('/projects', { name: projectName.trim(), status: 'ACTIVE' });
        setCreatedProjectId(proj.id);
        setStep(1);
      } else if (step === 1) {
        if (!targetUrl.trim()) { setError('Target URL is required'); return; }
        const tgt = await apiClient.post<{ id: string }>(`/projects/${createdProjectId}/targets`, {
          url: targetUrl.trim(),
          type: 'WEB',
        });
        setCreatedTargetId(tgt.id);
        setStep(2);
      } else if (step === 2) {
        await apiClient.post('/scans', {
          targetId: createdTargetId,
          type: 'QUICK',
        });
        setStep(3);
      } else {
        onClose();
        router.push(`/projects/${createdProjectId}`);
      }
    } catch (e: any) {
      setError(e?.message ?? 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border bg-background shadow-2xl p-8">
        <button onClick={onClose} className="absolute top-4 right-4 rounded-md p-1 hover:bg-muted">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full transition-colors ${
                i < step ? 'bg-green-500' : i === step ? 'bg-primary' : 'bg-muted'
              }`} />
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-8 transition-colors ${i < step ? 'bg-green-500' : 'bg-muted'}`} />
              )}
            </div>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
        </div>

        {/* Step content */}
        <div className="space-y-2 mb-6">
          <h2 className="text-xl font-semibold">{current.title}</h2>
          <p className="text-sm text-muted-foreground">{current.description}</p>
        </div>

        {step === 0 && (
          <div className="space-y-3 mb-6">
            <label className="text-sm font-medium">Project name</label>
            <input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStep()}
              placeholder="e.g. My Company Website"
              className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 mb-6">
            <label className="text-sm font-medium">Target URL</label>
            <input
              autoFocus
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStep()}
              placeholder="https://example.com"
              type="url"
              className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {step === 2 && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-sm"><span className="font-medium">Project:</span> {projectName}</p>
            <p className="text-sm"><span className="font-medium">Target:</span> {targetUrl}</p>
            <p className="text-sm"><span className="font-medium">Scan type:</span> Quick scan (~5 min)</p>
          </div>
        )}

        {step === 3 && (
          <div className="mb-6 flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-sm text-muted-foreground text-center">
              Your scan has been queued. You'll receive a notification when results are ready.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="flex justify-between">
          {step > 0 && step < 3 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : <div />}
          <Button onClick={handleStep} disabled={loading} className="gap-2 min-w-28">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === 3 ? 'Go to project' : step === 2 ? 'Start scan' : 'Continue'}
            {!loading && step < 3 && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
