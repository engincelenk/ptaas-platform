'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

const SEVERITY_TEXT: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-50 border-red-200',
  HIGH: 'text-orange-700 bg-orange-50 border-orange-200',
  MEDIUM: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  LOW: 'text-blue-700 bg-blue-50 border-blue-200',
  INFO: 'text-gray-600 bg-gray-50 border-gray-200',
};

interface Finding {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  cvssScore: number | null;
  cveIds: string[];
  epssScore: number | null;
  kevListed: boolean;
  recommendation: string | null;
  retestStatus: string | null;
  createdAt: string;
  updatedAt: string;
  target: { value: string; type: string } | null;
}

export default function PortalFindingPage() {
  const { token, findingId } = useParams<{ token: string; findingId: string }>();
  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/portal/${token}/findings/${findingId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json()) as { message?: string }).message ?? 'Not found');
        return r.json() as Promise<Finding>;
      })
      .then(setFinding)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token, findingId]);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-48" />
      <div className="h-8 bg-gray-200 rounded w-96" />
    </div>
  );

  if (error || !finding) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">{error || 'Finding not found'}</p>
      <Link href={`/portal/${token}`} className="text-sm text-primary mt-2 inline-block hover:underline">← Back</Link>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={`/portal/${token}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← All findings
        </Link>
      </div>

      {/* Title + severity */}
      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold leading-snug">{finding.title}</h1>
          <span className={`shrink-0 text-sm font-semibold px-3 py-1 rounded-full border ${SEVERITY_TEXT[finding.severity] ?? ''}`}>
            {finding.severity}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground border-t pt-4">
          <div>
            <span className="text-xs uppercase tracking-wide font-medium text-gray-500">Status</span>
            <p className="mt-0.5 font-medium text-gray-800">{finding.status.replace('_', ' ')}</p>
          </div>
          {finding.target && (
            <div>
              <span className="text-xs uppercase tracking-wide font-medium text-gray-500">Target</span>
              <p className="mt-0.5 font-mono text-gray-800">{finding.target.value}</p>
            </div>
          )}
          {finding.cvssScore != null && (
            <div>
              <span className="text-xs uppercase tracking-wide font-medium text-gray-500">CVSS Score</span>
              <p className="mt-0.5 font-semibold text-gray-800">{finding.cvssScore.toFixed(1)}</p>
            </div>
          )}
          {finding.epssScore != null && (
            <div>
              <span className="text-xs uppercase tracking-wide font-medium text-gray-500">EPSS</span>
              <p className="mt-0.5 text-gray-800">{(finding.epssScore * 100).toFixed(2)}%</p>
            </div>
          )}
          {finding.retestStatus && (
            <div>
              <span className="text-xs uppercase tracking-wide font-medium text-gray-500">Retest</span>
              <p className="mt-0.5 text-gray-800">{finding.retestStatus}</p>
            </div>
          )}
          {finding.kevListed && (
            <div>
              <span className="text-xs uppercase tracking-wide font-medium text-gray-500">CISA KEV</span>
              <p className="mt-0.5 font-semibold text-red-600">Listed</p>
            </div>
          )}
        </div>

        {/* CVE IDs */}
        {finding.cveIds.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-xs uppercase tracking-wide font-medium text-gray-500 mb-2">CVE References</p>
            <div className="flex flex-wrap gap-2">
              {finding.cveIds.map((cve) => (
                <a
                  key={cve}
                  href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-blue-600 hover:underline border border-blue-200 rounded px-2 py-0.5 bg-blue-50"
                >
                  {cve} ↗
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      {finding.description && (
        <div className="rounded-xl border bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Description</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{finding.description}</p>
        </div>
      )}

      {/* Recommendation */}
      {finding.recommendation && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-green-700 mb-3">Recommendation</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{finding.recommendation}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Reported {new Date(finding.createdAt).toLocaleDateString()} · Last updated {new Date(finding.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
