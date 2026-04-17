'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n/I18nContext';

export function Footer() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [brand, setBrand] = useState({ name: 'MR COD', subtitle: '', logo: '' });

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBrand({ 
          name: data.appName || 'MR COD', 
          subtitle: data.appSubtitle || '', 
          logo: data.appLogo || '' 
        });
      }
    });

    return () => unsubscribe();
  }, []);
  
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-4">
              {brand.logo && (
                <div className="relative w-16 h-16 bg-white rounded-xl p-2 shadow-lg shrink-0 flex items-center justify-center">
                  <Image src={brand.logo} alt={`${brand.name} Logo`} fill className="object-contain p-1.5" />
                </div>
              )}
              <div className="flex flex-col justify-center">
                <span className="font-brand font-black text-3xl tracking-tight text-white uppercase leading-none">
                  {brand.name}
                </span>
                {brand.subtitle && (
                  <span className="font-heading font-bold text-sm tracking-widest text-amber-500 uppercase mt-2 leading-none">
                    {brand.subtitle}
                  </span>
                )}
              </div>
            </div>
            <p className="mt-4 text-slate-400 text-base max-w-md leading-relaxed">
              The best fish and chips in Belgium. Fresh, delicious, and delivered to you with a smile. Experience the premium taste of the sea.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Links</h3>
            <ul className="space-y-4">
              <li>
                <Link href="/" className="text-slate-400 hover:text-amber-500 transition-colors">
                  {t('home')}
                </Link>
              </li>
              <li>
                <Link href="/stores" className="text-slate-400 hover:text-amber-500 transition-colors">
                  {t('stores')}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-slate-400 hover:text-amber-500 transition-colors">
                  {t('contact')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Staff Access</h3>
            <ul className="space-y-4">
              <li>
                <Link href="/login" className="text-slate-400 hover:text-amber-500 transition-colors">
                  Employee Portals
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-16 border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} MR COD Belgium. All rights reserved.
          </p>
          <div className="flex space-x-6 text-sm text-slate-500">
            <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
