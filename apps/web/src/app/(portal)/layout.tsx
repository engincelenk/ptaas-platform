import type { ReactNode } from 'react';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">P</span>
            </div>
            <span className="font-semibold text-sm">PTaaS Client Portal</span>
          </div>
          <span className="text-xs text-muted-foreground">Read-only view</span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      <footer className="text-center text-xs text-muted-foreground py-8 border-t">
        This report is confidential and intended solely for the named recipient.
      </footer>
    </div>
  );
}
