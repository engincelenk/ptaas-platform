'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, ShieldOff, Clock, Trash2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

type Decision = 'ACCEPTED' | 'DEFERRED' | 'FALSE_POSITIVE';

interface RiskAcceptance {
  id: string;
  decision: Decision;
  justification: string;
  expiresAt: string | null;
  reviewedAt: string;
  revokedAt: string | null;
  approvedBy: { id: string; name: string; email: string } | null;
}

const DECISION_LABEL: Record<Decision, string> = {
  ACCEPTED:       'Risk Accepted',
  DEFERRED:       'Risk Deferred',
  FALSE_POSITIVE: 'False Positive',
};

const DECISION_STYLE: Record<Decision, { bg: string; text: string; icon: React.ReactNode }> = {
  ACCEPTED:       { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-800', icon: <ShieldAlert className="h-4 w-4 text-yellow-500" /> },
  DEFERRED:       { bg: 'bg-blue-50 border-blue-200',   text: 'text-blue-800',   icon: <Clock className="h-4 w-4 text-blue-500" /> },
  FALSE_POSITIVE: { bg: 'bg-gray-50 border-gray-200',   text: 'text-gray-700',   icon: <ShieldOff className="h-4 w-4 text-gray-400" /> },
};

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export function RiskAcceptancePanel({
  findingId,
  isAdmin,
}: {
  findingId: string;
  isAdmin: boolean;
}) {
  const [acceptance, setAcceptance] = useState<RiskAcceptance | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [decision, setDecision] = useState<Decision>('ACCEPTED');
  const [justification, setJustification] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<RiskAcceptance | null>(`/findings/${findingId}/risk-acceptance`)
      .then((r) => setAcceptance(r ?? null))
      .catch(() => setAcceptance(null));
  }, [findingId]);

  async function save() {
    if (!justification.trim()) { toast.error('Justification is required'); return; }
    setSaving(true);
    try {
      const result = await apiClient.post<RiskAcceptance>(`/findings/${findingId}/risk-acceptance`, {
        decision,
        justification: justification.trim(),
        expiresAt: expiresAt || undefined,
      });
      setAcceptance(result);
      setShowForm(false);
      setJustification('');
      setExpiresAt('');
      toast.success(`Risk decision recorded: ${DECISION_LABEL[decision]}`);
    } catch {
      /* apiClient shows toast */
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!confirm('Revoke this risk acceptance? The finding will return to OPEN status.')) return;
    try {
      await apiClient.delete(`/findings/${findingId}/risk-acceptance`);
      setAcceptance(null);
      toast.success('Risk acceptance revoked');
    } catch {
      /* apiClient shows toast */
    }
  }

  if (acceptance === undefined) return null; // still loading

  const active = acceptance && !acceptance.revokedAt;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Risk Decision</h2>
        {isAdmin && !active && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-1 text-xs text-indigo-600 hover:underline"
          >
            <Plus className="h-3 w-3" /> Add decision
          </button>
        )}
      </div>

      {/* Active acceptance banner */}
      {active && (
        <div className={`rounded-xl border px-4 py-3 ${DECISION_STYLE[acceptance.decision].bg}`}>
          <div className="flex items-start gap-3">
            {DECISION_STYLE[acceptance.decision].icon}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-semibold ${DECISION_STYLE[acceptance.decision].text}`}>
                  {DECISION_LABEL[acceptance.decision]}
                </span>
                {acceptance.expiresAt && (() => {
                  const d = daysUntil(acceptance.expiresAt);
                  return (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${d !== null && d <= 7 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {d !== null && d < 0 ? 'Expired' : d !== null ? `Expires in ${d}d` : ''}
                    </span>
                  );
                })()}
              </div>
              <p className={`mt-1 text-xs ${DECISION_STYLE[acceptance.decision].text}`}>{acceptance.justification}</p>
              <p className="mt-1 text-[10px] text-gray-400">
                Approved by {acceptance.approvedBy?.name ?? '—'} on {new Date(acceptance.reviewedAt).toLocaleDateString('en-GB')}
                {acceptance.expiresAt && ` · Expires ${new Date(acceptance.expiresAt).toLocaleDateString('en-GB')}`}
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={revoke}
                className="shrink-0 rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Revoke"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* No active decision */}
      {!active && !showForm && (
        <p className="text-sm text-muted-foreground">No risk decision recorded.</p>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Decision</label>
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as Decision)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="ACCEPTED">Risk Accepted — acknowledged, no immediate fix required</option>
              <option value="DEFERRED">Risk Deferred — fix scheduled for later</option>
              <option value="FALSE_POSITIVE">False Positive — not a real vulnerability</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Justification *</label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Explain why this risk decision is appropriate…"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Expires at (optional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-gray-400">If set, the finding reopens automatically when expired.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!justification.trim() || saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Record Decision'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
