'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Lock, ShieldAlert, ShieldCheck, Info } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  INFO: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-red-600 dark:text-red-400',
  IN_PROGRESS: 'text-yellow-600 dark:text-yellow-400',
  FIXED: 'text-green-600 dark:text-green-400',
  VERIFIED: 'text-green-700 dark:text-green-300',
};

interface Finding {
  id: string;
  title: string;
  severity: string;
  status: string;
  owaspCategory: string | null;
  cvssScore: number | null;
  description: string | null;
  remediation: string | null;
}

interface Report {
  project: { id: string; name: string; description: string | null; organization: string; generatedAt: string; expiresAt: string };
  summary: { total: number; riskScore: number; CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; INFO: number };
  findings: Finding[];
  passwordProtected: boolean;
}

function RiskGauge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-red-600' : score >= 40 ? 'text-orange-500' : 'text-green-600';
  const label = score >= 70 ? 'High Risk' : score >= 40 ? 'Medium Risk' : 'Low Risk';
  return (
    <div className="text-center">
      <div className={`text-5xl font-bold tabular-nums ${color}`}>{score}</div>
      <div className={`text-sm font-medium mt-1 ${color}`}>{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">Risk Score</div>
    </div>
  );
}

export default function ShareReportPage() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async (pw?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = `${API}/public/share/${token}${pw ? `?password=${encodeURIComponent(pw)}` : ''}`;
      const res = await fetch(url);
      if (res.status === 401) { setNeedsPassword(true); setLoading(false); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Report not found or expired');
        setLoading(false);
        return;
      }
      const data: Report = await res.json();
      setReport(data);
      setNeedsPassword(false);
    } catch {
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading report…</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 max-w-sm w-full text-center space-y-4 shadow-lg">
          <Lock className="h-10 w-10 text-gray-400 mx-auto" />
          <h1 className="text-lg font-semibold">Password Protected</h1>
          <p className="text-sm text-gray-500">Enter the password to view this report.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(password)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={() => load(password)}
            className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            View Report
          </button>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <ShieldAlert className="h-12 w-12 text-red-400 mx-auto" />
          <h1 className="text-lg font-semibold">Report Unavailable</h1>
          <p className="text-sm text-gray-500">{error ?? 'This report link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const { project, summary, findings } = report;
  const sevOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <div>
              <p className="text-xs text-gray-500">Security Report</p>
              <h1 className="font-semibold text-sm leading-none">{project.name}</h1>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{project.organization}</p>
            <p className="text-xs text-gray-400">Generated {new Date(project.generatedAt).toLocaleDateString()}</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 col-span-2 sm:col-span-1 flex flex-col items-center justify-center">
            <RiskGauge score={summary.riskScore} />
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 col-span-2 sm:col-span-3">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Finding Distribution</p>
            <div className="grid grid-cols-5 gap-2">
              {sevOrder.map((sev) => (
                <div key={sev} className="text-center">
                  <div className={`text-2xl font-bold ${sev === 'CRITICAL' ? 'text-red-600' : sev === 'HIGH' ? 'text-orange-500' : sev === 'MEDIUM' ? 'text-yellow-600' : sev === 'LOW' ? 'text-blue-600' : 'text-gray-500'}`}>
                    {summary[sev as keyof typeof summary]}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{sev[0] + sev.slice(1).toLowerCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Findings table */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-sm">Findings ({summary.total})</h2>
            <Info className="h-4 w-4 text-gray-400" />
          </div>

          {findings.length === 0 ? (
            <div className="p-12 text-center">
              <ShieldCheck className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p className="font-medium text-green-700 dark:text-green-400">No findings</p>
              <p className="text-xs text-gray-500 mt-1">No open issues were found in this assessment.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {findings.map((f) => (
                <div key={f.id}>
                  <button
                    className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                  >
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${SEV_COLORS[f.severity] ?? ''}`}>
                      {f.severity[0] + f.severity.slice(1).toLowerCase()}
                    </span>
                    <span className="flex-1 text-sm font-medium truncate">{f.title}</span>
                    {f.cvssScore != null && (
                      <span className="text-xs text-gray-400 shrink-0">CVSS {f.cvssScore.toFixed(1)}</span>
                    )}
                    <span className={`text-xs font-medium shrink-0 ${STATUS_COLORS[f.status] ?? 'text-gray-500'}`}>
                      {f.status.replace('_', ' ')}
                    </span>
                    <svg className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${expanded === f.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expanded === f.id && (
                    <div className="px-6 pb-4 pt-1 space-y-3 bg-gray-50 dark:bg-gray-800/30">
                      {f.owaspCategory && (
                        <p className="text-xs text-gray-500"><span className="font-medium">OWASP:</span> {f.owaspCategory}</p>
                      )}
                      {f.description && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{f.description}</p>
                        </div>
                      )}
                      {f.remediation && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Remediation</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{f.remediation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-4">
          <p>This report is confidential. Link expires {new Date(project.expiresAt).toLocaleDateString()}.</p>
          <p className="mt-1">Generated by PTaaS Platform</p>
        </div>
      </main>
    </div>
  );
}
