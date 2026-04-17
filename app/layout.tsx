import type {Metadata} from 'next';
import { Inter, Outfit, Montserrat } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '@/lib/i18n/I18nContext';
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

  let title = 'MR COD Belgium';
  let appName = 'Mr. Cod';

  if (hostname.includes('manager')) {
    title = 'Mr. Cod Manager';
    appName = 'Manager';
  } else if (hostname.includes('admin') || hostname.includes('super')) {
    title = 'Mr. Cod Admin';
    appName = 'Admin';
  }

  return {
    title,
    description: 'Modern online food ordering web app for MR COD Belgium',
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
          <I18nProvider>
            <ClientLayoutWrapper>
              {children}
            </ClientLayoutWrapper>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
