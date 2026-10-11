'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { GitCompare, TrendingDown, TrendingUp, Minus, ChevronDown } from 'lucide-react';

interface ScanMeta {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  target: { value: string };
  _count: { findings: number };
}

interface FindingSnap {
  id: string;
  title: string;
  severity: string;
  status: string;
  owasp: string | null;
  aiRiskScore: number | null;
  prevStatus?: string;
}

interface DiffResult {
  scanA: { id: string; type: string; status: string; target: string; createdAt: string; findingCount: number };
  scanB: { id: string; type: string; status: string; target: string; createdAt: string; findingCount: number };
  summary: { newCount: number; fixedCount: number; recurringCount: number; riskDelta: number; avgRiskA: number; avgRiskB: number };
  new:       FindingSnap[];
  fixed:     FindingSnap[];
  recurring: FindingSnap[];
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  LOW:      'bg-blue-100 text-blue-700',
  INFO:     'bg-gray-100 text-gray-500',
};

type Tab = 'new' | 'fixed' | 'recurring';

function ScanSelect({
  label, scans, value, onChange,
}: { label: string; scans: ScanMeta[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-1 min-w-0">
      <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-8 text-sm focus:border-indigo-400 focus:outline-none"
        >
          <option value="">Select scan…</option>
          {scans.map((s) => (
            <option key={s.id} value={s.id}>
              {new Date(s.createdAt).toLocaleDateString('en-GB')} — {s.type} — {s.target.value} ({s._count.findings} findings)
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
}

function FindingRow({ f, projectId, variant }: { f: FindingSnap; projectId: string; variant: 'new' | 'fixed' | 'recurring' }) {
  const borderColor = variant === 'new' ? 'border-l-red-400' : variant === 'fixed' ? 'border-l-green-400' : 'border-l-gray-300';
  return (
    <div className={`flex items-center gap-3 border-l-4 ${borderColor} bg-white px-4 py-3 rounded-r-xl`}>
      <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SEV_COLOR[f.severity] ?? 'bg-gray-100 text-gray-500'}`}>
        {f.severity}
      </span>
      <div className="flex-1 min-w-0">
        <Link
          href={`/projects/${projectId}/findings/${f.id}`}
          className="block truncate text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors"
        >
          {f.title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
          {f.owasp && <span>{f.owasp}</span>}
          {variant === 'recurring' && f.prevStatus && f.prevStatus !== f.status && (
            <span className="text-yellow-600">{f.prevStatus} → {f.status}</span>
          )}
        </div>
      </div>
      {f.aiRiskScore !== null && (
        <span className="shrink-0 text-xs font-mono text-gray-400">{f.aiRiskScore}</span>
      )}
    </div>
  );
}

function ScanDiffPageContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams  = useSearchParams();
  const router        = useRouter();

  const [scans, setScans]     = useState<ScanMeta[]>([]);
  const [scanA, setScanA]     = useState(searchParams.get('scanA') ?? '');
  const [scanB, setScanB]     = useState(searchParams.get('scanB') ?? '');
  const [diff, setDiff]       = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState<Tab>('new');

  useEffect(() => {
    apiClient.get<ScanMeta[]>(`/projects/${projectId}/scans`).then(setScans);
  }, [projectId]);

  const runDiff = useCallback(async () => {
    if (!scanA || !scanB || scanA === scanB) return;
    setLoading(true);
    setDiff(null);
    try {
      const result = await apiClient.get<DiffResult>(`/projects/${projectId}/scans/diff?scanA=${scanA}&scanB=${scanB}`);
      setDiff(result);
      router.replace(`/projects/${projectId}/scans/diff?scanA=${scanA}&scanB=${scanB}`, { scroll: false });
    } finally {
      setLoading(false);
    }
  }, [scanA, scanB, projectId, router]);

  useEffect(() => {
    if (scanA && scanB && scanA !== scanB) runDiff();
  }, []);

  const completedScans = scans.filter((s) => s.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <GitCompare className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scan Comparison</h1>
          <p className="text-sm text-gray-400">Compare findings between two scan runs to track remediation progress.</p>
        </div>
      </div>

      {/* Scan selector */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex gap-4 flex-wrap items-end">
          <ScanSelect label="Baseline (Scan A)" scans={completedScans} value={scanA} onChange={setScanA} />
          <div className="flex h-10 items-end pb-1 text-gray-300 font-bold text-xl shrink-0">→</div>
          <ScanSelect label="Comparison (Scan B)" scans={completedScans} value={scanB} onChange={setScanB} />
          <button
            onClick={runDiff}
            disabled={!scanA || !scanB || scanA === scanB || loading}
            className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Comparing…' : 'Compare'}
          </button>
        </div>
        {scanA && scanB && scanA === scanB && (
          <p className="mt-2 text-xs text-yellow-600">Select two different scans to compare.</p>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-gray-100" />)}
          </div>
          <div className="h-64 rounded-2xl bg-gray-100" />
        </div>
      )}

      {/* Results */}
      {diff && !loading && (
        <div className="space-y-5">
          {/* Scan meta row */}
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
            {[
              { label: 'Scan A (Baseline)', scan: diff.scanA },
              { label: 'Scan B (Comparison)', scan: diff.scanB },
            ].map(({ label, scan }) => (
              <div key={scan.id} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                <p className="font-semibold text-gray-700 mb-1">{label}</p>
                <p>{scan.type} — {scan.target}</p>
                <p className="text-gray-400">{new Date(scan.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {scan.findingCount} findings</p>
              </div>
            ))}
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: 'New Findings',
                value: diff.summary.newCount,
                icon: <TrendingUp className="h-5 w-5" />,
                bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', tab: 'new' as Tab,
              },
              {
                label: 'Fixed',
                value: diff.summary.fixedCount,
                icon: <TrendingDown className="h-5 w-5" />,
                bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', tab: 'fixed' as Tab,
              },
              {
                label: 'Recurring',
                value: diff.summary.recurringCount,
                icon: <Minus className="h-5 w-5" />,
                bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', tab: 'recurring' as Tab,
              },
              {
                label: 'Risk Delta',
                value: diff.summary.riskDelta > 0 ? `+${diff.summary.riskDelta}` : String(diff.summary.riskDelta),
                icon: diff.summary.riskDelta > 0
                  ? <TrendingUp className="h-5 w-5" />
                  : <TrendingDown className="h-5 w-5" />,
                bg: diff.summary.riskDelta > 0 ? 'bg-red-50' : diff.summary.riskDelta < 0 ? 'bg-green-50' : 'bg-gray-50',
                border: diff.summary.riskDelta > 0 ? 'border-red-200' : diff.summary.riskDelta < 0 ? 'border-green-200' : 'border-gray-200',
                text: diff.summary.riskDelta > 0 ? 'text-red-700' : diff.summary.riskDelta < 0 ? 'text-green-700' : 'text-gray-600',
                tab: null,
              },
            ].map(({ label, value, icon, bg, border, text, tab: t }) => (
              <button
                key={label}
                onClick={() => t && setTab(t)}
                className={`rounded-xl border p-4 text-left transition-all ${bg} ${border} ${t ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'} ${tab === t ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}
              >
                <div className={`flex items-center gap-1.5 ${text} mb-1`}>{icon}<span className="text-xs font-medium">{label}</span></div>
                <p className={`text-3xl font-bold ${text}`}>{value}</p>
              </button>
            ))}
          </div>

          {/* Interpretation banner */}
          {diff.summary.newCount === 0 && diff.summary.fixedCount > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              ✅ Great progress — {diff.summary.fixedCount} finding{diff.summary.fixedCount !== 1 ? 's' : ''} fixed with no new issues introduced.
            </div>
          )}
          {diff.summary.newCount > diff.summary.fixedCount && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              ⚠️ Regression detected — more new findings than fixed ones. Review the attack surface changes.
            </div>
          )}

          {/* Tab strip */}
          <div className="flex gap-1 border-b border-gray-100">
            {([
              { key: 'new',       label: `New (${diff.summary.newCount})`,             color: 'text-red-600'   },
              { key: 'fixed',     label: `Fixed (${diff.summary.fixedCount})`,          color: 'text-green-600' },
              { key: 'recurring', label: `Recurring (${diff.summary.recurringCount})`,  color: 'text-gray-600'  },
            ] as const).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? `border-indigo-500 ${color}`
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Finding list */}
          <div className="space-y-2">
            {tab === 'new' && (
              diff.new.length === 0
                ? <p className="py-8 text-center text-sm text-gray-400">No new findings — clean diff!</p>
                : diff.new.map((f) => <FindingRow key={f.id} f={f} projectId={projectId} variant="new" />)
            )}
            {tab === 'fixed' && (
              diff.fixed.length === 0
                ? <p className="py-8 text-center text-sm text-gray-400">No fixed findings in this comparison.</p>
                : diff.fixed.map((f) => <FindingRow key={f.id} f={f} projectId={projectId} variant="fixed" />)
            )}
            {tab === 'recurring' && (
              diff.recurring.length === 0
                ? <p className="py-8 text-center text-sm text-gray-400">No recurring findings.</p>
                : diff.recurring.map((f) => <FindingRow key={f.id} f={f} projectId={projectId} variant="recurring" />)
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!diff && !loading && (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
            <GitCompare className="h-8 w-8" />
          </div>
          <div>
            <p className="font-semibold text-gray-700">Select two completed scans to compare</p>
            <p className="mt-1 text-sm text-gray-400">
              The diff shows which findings are new, fixed, or recurring between the two runs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScanDiffPage() {
  return (
    <Suspense fallback={null}>
      <ScanDiffPageContent />
    </Suspense>
  );
}
