'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SamlCallbackPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const accessToken  = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const samlError    = params.get('samlError');

    if (samlError) {
      setError(decodeURIComponent(samlError));
      return;
    }

    if (!accessToken || !refreshToken) {
      setError('No tokens received from IdP. Please try again.');
      return;
    }

    // Store tokens identically to normal login flow
    localStorage.setItem('ptaas_access_token', accessToken);
    localStorage.setItem('ptaas_refresh_token', refreshToken);

    // Clean URL and redirect
    router.replace('/dashboard');
  }, [params, router]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-semibold text-red-700">SSO Login Failed</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
        <a href="/login" className="mt-4 inline-block text-sm text-indigo-600 underline">Back to login</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 p-8">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      <p className="text-sm text-gray-500">Completing SSO login…</p>
    </div>
  );
}

export default function SamlCallbackPage() {
  return (
    <Suspense fallback={null}>
      <SamlCallbackPageContent />
    </Suspense>
  );
}
