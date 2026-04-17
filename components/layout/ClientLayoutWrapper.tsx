'use client';

import NetworkStatusBanner from '@/components/ui/NetworkStatusBanner';

export function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NetworkStatusBanner />
      <main className="flex-grow flex flex-col">
        {children}
      </main>
    </>
  );
}
