'use client';

import { SignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

const DEV_MODE = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

export default function SignInPage() {
  const router = useRouter();

  if (DEV_MODE) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="rounded-lg border border-border bg-card p-8 w-80 space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              <span className="text-primary">PT</span>aaS Platform
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Entwicklungsmodus aktiv</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Als Dev-User einloggen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <SignIn
        appearance={{
          variables: {
            colorPrimary: 'hsl(var(--primary))',
            colorBackground: 'hsl(var(--card))',
            colorText: 'hsl(var(--foreground))',
            colorInputBackground: 'hsl(var(--background))',
            colorInputText: 'hsl(var(--foreground))',
          },
        }}
      />
    </div>
  );
}
