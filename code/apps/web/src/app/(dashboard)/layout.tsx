import { Providers } from '@/lib/providers';
import { Sidebar } from '@/components/layout/sidebar';
import { SocketProvider } from '@/components/layout/socket-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <SocketProvider />
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </Providers>
  );
}
