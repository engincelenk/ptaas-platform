import { Providers } from '@/lib/providers';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </Providers>
  );
}
