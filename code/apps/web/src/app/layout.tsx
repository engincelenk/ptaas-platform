import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PTaaS Platform',
  description: 'AI-native Penetration Testing as a Service',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="de" className="dark">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
