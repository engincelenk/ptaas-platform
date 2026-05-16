'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateScan, type ScanType } from '@/hooks/use-scans';

const SCAN_TYPES: { value: ScanType; label: string; description: string }[] = [
  { value: 'FULL', label: 'Full Scan', description: 'Web Security + SSL/TLS + Ports (empfohlen)' },
  { value: 'WEB_ONLY', label: 'Web Security Scan', description: 'HTTP Headers, XSS, Injection, CSRF...' },
  { value: 'SSL_ONLY', label: 'SSL/TLS Analyse', description: 'Zertifikate, Protokolle, Cipher Suites' },
  { value: 'PORTS_ONLY', label: 'Port Scan', description: 'Offene Ports und laufende Dienste' },
];

interface StartScanDialogProps {
  projectId: string;
  onClose: () => void;
}

export function StartScanDialog({ projectId, onClose }: StartScanDialogProps) {
  const [selected, setSelected] = useState<ScanType>('FULL');
  const { mutateAsync, isPending } = useCreateScan(projectId);

  async function handleStart() {
    await mutateAsync({ type: selected });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Scan starten</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {SCAN_TYPES.map((type) => (
            <label
              key={type.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                selected === type.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <input
                type="radio"
                name="scanType"
                value={type.value}
                checked={selected === type.value}
                onChange={() => setSelected(type.value)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="text-sm font-medium">{type.label}</p>
                <p className="text-xs text-muted-foreground">{type.description}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Abbrechen
          </button>
          <button
            onClick={handleStart}
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Startet...' : 'Scan starten'}
          </button>
        </div>
      </div>
    </div>
  );
}
