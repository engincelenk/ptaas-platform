'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Clock, Save } from 'lucide-react';
import { toast } from 'sonner';

interface SlaPolicy {
  criticalDays: number;
  highDays: number;
  mediumDays: number;
  lowDays: number;
  infoDays: number;
}

const SEVERITIES: { key: keyof SlaPolicy; label: string; color: string; bg: string }[] = [
  { key: 'criticalDays', label: 'Critical', color: 'text-red-700',    bg: 'bg-red-100' },
  { key: 'highDays',     label: 'High',     color: 'text-orange-700', bg: 'bg-orange-100' },
  { key: 'mediumDays',   label: 'Medium',   color: 'text-yellow-700', bg: 'bg-yellow-100' },
  { key: 'lowDays',      label: 'Low',      color: 'text-blue-700',   bg: 'bg-blue-100' },
  { key: 'infoDays',     label: 'Info',     color: 'text-gray-600',   bg: 'bg-gray-100' },
];

export default function SlaSettingsPage() {
  const [policy, setPolicy] = useState<SlaPolicy>({
    criticalDays: 7, highDays: 30, mediumDays: 90, lowDays: 180, infoDays: 365,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const p = await apiClient.get<SlaPolicy>('/org/sla-policy');
    setPolicy(p);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const updated = await apiClient.put<SlaPolicy>('/org/sla-policy', policy);
      setPolicy(updated);
      toast.success('SLA policy saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="h-6 w-6 text-indigo-500" /> SLA Policy
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Define the maximum number of days allowed to remediate findings per severity level.
          Findings that exceed these limits are marked as <strong>Breached</strong>.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
        {SEVERITIES.map(({ key, label, color, bg }) => (
          <div key={key} className="flex items-center gap-4 px-5 py-4">
            <span className={`inline-flex w-20 shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold ${bg} ${color}`}>
              {label}
            </span>
            <div className="flex-1">
              <p className="text-xs text-gray-400">Max remediation time</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={policy[key]}
                onChange={(e) => setPolicy((p) => ({ ...p, [key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-20 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-right focus:border-indigo-400 focus:outline-none"
              />
              <span className="text-xs text-gray-400 w-8">days</span>
            </div>
          </div>
        ))}
      </div>

      {/* Visual timeline */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
        <p className="mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Timeline Preview</p>
        <div className="space-y-2">
          {SEVERITIES.map(({ key, label, color, bg }) => {
            const max = Math.max(...SEVERITIES.map((s) => policy[s.key]));
            const pct = Math.round((policy[key] / max) * 100);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className={`w-16 text-right text-xs font-medium ${color}`}>{label}</span>
                <div className="flex-1 rounded-full bg-gray-200 h-2">
                  <div className={`h-2 rounded-full ${bg.replace('bg-', 'bg-').replace('-100', '-400')}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-gray-400 w-14">{policy[key]}d</span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Policy'}
      </button>
    </div>
  );
}
