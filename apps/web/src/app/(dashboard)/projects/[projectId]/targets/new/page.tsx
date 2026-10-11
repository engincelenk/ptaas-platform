'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

type TargetType = 'DOMAIN' | 'SUBDOMAIN' | 'IP' | 'IP_RANGE' | 'URL';

const TYPE_PLACEHOLDERS: Record<TargetType, string> = {
  DOMAIN:    'example.com',
  SUBDOMAIN: 'app.example.com',
  IP:        '93.184.216.34',
  IP_RANGE:  '93.184.216.0/24',
  URL:       'https://example.com/api',
};

const TYPE_HINTS: Record<TargetType, string> = {
  DOMAIN:    'Root domain — verification required',
  SUBDOMAIN: 'Subdomain of a domain you control',
  IP:        'Public IP address only',
  IP_RANGE:  'CIDR notation — public ranges only',
  URL:       'Specific URL path to test',
};

export default function NewTargetPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [type, setType] = useState<TargetType>('DOMAIN');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const target = await apiClient.post<{ id: string }>(
        `/projects/${projectId}/targets`,
        { type, value },
      );
      router.push(`/projects/${projectId}/targets/${target.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add target');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Project
        </Link>
        <h1 className="text-2xl font-semibold mt-4">Add Target</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Domains and subdomains require ownership verification before scanning.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div>
          <label className="block text-sm font-medium mb-2">Target type</label>
          <div className="grid grid-cols-3 gap-2">
            {(['DOMAIN', 'SUBDOMAIN', 'IP', 'IP_RANGE', 'URL'] as TargetType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setValue(''); }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  type === t
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{TYPE_HINTS[type]}</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="value">
            Value
          </label>
          <input
            id="value"
            type="text"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={TYPE_PLACEHOLDERS[type]}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Adding…' : 'Add target'}
          </button>
          <Link
            href={`/projects/${projectId}`}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
