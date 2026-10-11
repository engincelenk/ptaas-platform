'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

interface InvitePreview {
  valid: boolean;
  expired?: boolean;
  email?: string;
  role?: string;
  orgName?: string;
  inviterName?: string;
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient
      .get<InvitePreview>(`/invitations/${token}`)
      .then(setPreview)
      .catch(() => setPreview({ valid: false }))
      .finally(() => setLoading(false));
  }, [token]);

  const accept = async () => {
    const storedToken = localStorage.getItem('ptaas_access_token');
    if (!storedToken) {
      // Redirect to login, then back here
      router.push(`/login?redirect=/invite/${token}`);
      return;
    }

    setAccepting(true);
    try {
      await apiClient.post(`/invitations/${token}/accept`, {});
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading invitation…</p>
      </div>
    );
  }

  if (!preview?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-4xl">🔗</div>
          <h1 className="text-xl font-semibold">
            {preview?.expired ? 'Invitation Expired' : 'Invalid Invitation'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {preview?.expired
              ? 'This invitation link has expired. Ask your admin to send a new one.'
              : 'This invitation link is invalid or has already been used.'}
          </p>
          <Button variant="outline" onClick={() => router.push('/login')}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-bold text-xl">P</span>
          </div>
          <h1 className="text-xl font-semibold">You've been invited</h1>
          <p className="text-muted-foreground text-sm">
            <strong>{preview.inviterName}</strong> invited you to join{' '}
            <strong>{preview.orgName}</strong> as a <strong>{preview.role?.replace('_', ' ')}</strong>.
          </p>
        </div>

        <div className="rounded-xl border p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Organization</span>
            <span className="font-medium">{preview.orgName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium">{preview.role?.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{preview.email}</span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button className="w-full" onClick={accept} disabled={accepting}>
          {accepting ? 'Accepting…' : 'Accept Invitation'}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          You must be logged in with the invited email address to accept.
        </p>
      </div>
    </div>
  );
}
