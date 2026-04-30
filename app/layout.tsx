import type {Metadata} from 'next';
import { Inter, Outfit, Montserrat } from 'next/font/google';
import './globals.css';

import { ClientLayoutWrapper } from '@/components/layout/ClientLayoutWrapper';
import { AuthProvider } from '@/lib/AuthContext';

export const dynamic = 'force-dynamic';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-heading',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-brand',
});

import { headers } from 'next/headers';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('host') || '';

  let title = 'MR COD Back Office';
  let appName = 'MR COD';

  if (hostname.includes('manager')) {
    title = 'MR COD Manager';
    appName = 'MR COD Manager';
  } else if (hostname.includes('admin') || hostname.includes('super')) {
    title = 'MR COD Admin';
    appName = 'MR COD Admin';
  }

  return {
    title,
    description: 'MR COD — Smart POS & ordering ecosystem for restaurants',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: appName,
    },
  };
}

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${montserrat.variable}`}>
      <body className="flex flex-col min-h-screen bg-[#FAFAFA] text-slate-900 font-sans antialiased selection:bg-amber-200 selection:text-amber-900" suppressHydrationWarning>
        <AuthProvider>
          <ClientLayoutWrapper>
            {children}
          </ClientLayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
