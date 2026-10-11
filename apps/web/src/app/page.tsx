export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">P</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">PTaaS Platform</h1>
        </div>

        <p className="text-muted-foreground text-lg">
          AI-native Penetration Testing as a Service
        </p>

        <div className="grid grid-cols-3 gap-4 pt-4">
          {[
            { label: 'API Status', href: 'http://localhost:3001/health' },
            { label: 'API Docs', href: 'http://localhost:3001/api/docs' },
            { label: 'MinIO Console', href: 'http://localhost:9001' },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border bg-card p-4 text-sm font-medium hover:bg-accent transition-colors"
            >
              {label} →
            </a>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Sprint 1 — M1 Foundation · {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
