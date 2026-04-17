'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { FloatingCart } from '@/components/layout/FloatingCart';
import NetworkStatusBanner from '@/components/ui/NetworkStatusBanner';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Helper to darken hex
const adjustHexColor = (hex: string, amount: number) => {
  let usePound = false;
  if (hex[0] === '#') {
    hex = hex.slice(1);
    usePound = true;
  }
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  if (r > 255) r = 255;
  else if (r < 0) r = 0;
  let b = ((num >> 8) & 0x00FF) + amount;
  if (b > 255) b = 255;
  else if (b < 0) b = 0;
  let g = (num & 0x0000FF) + amount;
  if (g > 255) g = 255;
  else if (g < 0) g = 0;
  return (usePound ? '#' : '') + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
};

export function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState({
    primary: '#f59e0b',
    primaryHover: '#d97706',
    primaryActive: '#b45309',
    radius: 'var(--radius-xl)', // default
  });
  
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let currentRadius = '0.75rem'; // Standard rounded-xl
        if (data.radiusPreference === 'sharp') currentRadius = '0px';
        if (data.radiusPreference === 'soft') currentRadius = '9999px';
        
        setTheme(prev => ({
          ...prev,
          primary: data.primaryColor || '#f59e0b',
          primaryHover: adjustHexColor(data.primaryColor || '#f59e0b', -20),
          primaryActive: adjustHexColor(data.primaryColor || '#f59e0b', -40),
          radius: currentRadius
        }));
      }
    });
    return () => unsub();
  }, []);

  // Hide main navigation on all admin, manager, and login portals
  const isAppPortal = 
    pathname?.startsWith('/admin') || 
    pathname?.startsWith('/manager') || 
    pathname === '/login';

  return (
    <>
      <NetworkStatusBanner />
      <style suppressHydrationWarning>{`
        :root {
          /* Intercept Tailwind defaults representing active amber elements */
          --color-amber-400: ${adjustHexColor(theme.primary, +20)} !important;
          --color-amber-500: ${theme.primary} !important;
          --color-amber-600: ${theme.primaryHover} !important;
          --color-amber-700: ${theme.primaryActive} !important;
          
          /* Intercept Tailwind default radiuses */
          --radius-md: ${theme.radius} !important;
          --radius-lg: ${theme.radius} !important;
          --radius-xl: ${theme.radius} !important;
          --radius-2xl: ${theme.radius} !important;
          --radius-3xl: ${theme.radius} !important;
        }
      `}</style>
      
      {!isAppPortal && <Navbar />}
      <main className="flex-grow flex flex-col">
        {children}
      </main>
      <FloatingCart />
      {!isAppPortal && <Footer />}
    </>
  );
}
