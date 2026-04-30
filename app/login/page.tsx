'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { Shield, Store, Clock, ArrowRight, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/mr-cod-online-ordering.firebasestorage.app/o/logo%20mr%20cod.png?alt=media&token=9ecf39cd-567f-437a-b395-6ffd949f7f1e';

const portals = [
  {
    id: 'super_admin',
    title: 'Super Admin',
    description: 'System-wide configuration and multi-store management.',
    icon: Shield,
    href: '/admin/login?portal=super_admin',
    badge: 'Full Access',
  },
  {
    id: 'store_admin',
    title: 'Store Admin',
    description: 'Manage your kitchen, menu, and incoming orders.',
    icon: Store,
    href: '/admin/login?portal=store_admin',
    badge: 'Store Level',
  },
  {
    id: 'manager',
    title: 'Shift Manager',
    description: 'Access live orders, inventory, and operational controls.',
    icon: Clock,
    href: '/admin/login?portal=manager',
    badge: 'Operations',
  },
];

export default function UnifiedLoginPortal() {
  const [brand, setBrand] = useState({ name: 'EazyOrder', subtitle: 'Belgium' });

  useEffect(() => {
    const fetchBrand = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'global'));
        if (snap.exists()) {
          const data = snap.data();
          setBrand({ name: data.appName || 'EazyOrder', subtitle: data.appSubtitle || 'Belgium' });
        }
      } catch (e) {
        console.error('Error fetching brand', e);
      }
    };
    fetchBrand();
  }, []);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">

      {/* ── Left brand panel ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative lg:w-[420px] xl:w-[480px] flex-shrink-0 bg-[#CC0000] flex flex-col justify-between px-10 py-12 overflow-hidden"
      >
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute top-1/2 -translate-y-1/2 right-[-60px] w-40 h-40 rounded-full bg-white/10" />

        {/* Logo + brand name */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-16">
            <div className="w-14 h-14 rounded-2xl bg-white/15 p-1.5 flex items-center justify-center backdrop-blur-sm flex-shrink-0 overflow-hidden">
              <Image
                src={LOGO_URL}
                alt="EazyOrder Logo"
                width={44}
                height={44}
                className="object-contain"
              />
            </div>
            <div>
              <p className="font-black text-white text-2xl leading-none tracking-tight">{brand.name}</p>
              {brand.subtitle && (
                <p className="text-white/60 text-xs font-bold uppercase tracking-[0.2em] mt-1">{brand.subtitle}</p>
              )}
            </div>
          </div>

          <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.05] tracking-tight mb-5">
            Choose<br />your portal
          </h1>
          <p className="text-white/60 text-base font-medium leading-relaxed max-w-xs">
            Select your access level to enter the EazyOrder management system.
          </p>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10">
          <div className="w-10 h-[2px] bg-white/30 mb-4" />
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest">
            Secure Management Platform
          </p>
        </div>
      </motion.div>

      {/* ── Right portal cards ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-20 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-lg w-full mx-auto lg:mx-0"
        >
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CC0000] mb-3">Select Portal</p>
          <h2 className="text-2xl font-black text-slate-900 mb-8 tracking-tight">
            How would you like to sign in?
          </h2>

          <div className="space-y-3">
            {portals.map((portal, idx) => (
              <motion.div
                key={portal.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.08, type: 'spring', stiffness: 280, damping: 24 }}
              >
                <Link href={portal.href} className="group block">
                  <div className="relative flex items-center gap-5 p-5 rounded-2xl border-2 border-slate-100 bg-white hover:border-[#CC0000] hover:bg-red-50/30 transition-all duration-200 hover:shadow-[0_4px_24px_rgba(204,0,0,0.08)]">

                    {/* Icon */}
                    <div className="w-14 h-14 flex-shrink-0 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-[#CC0000] group-hover:border-[#CC0000] flex items-center justify-center transition-all duration-200">
                      <portal.icon className="w-6 h-6 text-slate-400 group-hover:text-white transition-colors duration-200" />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-black text-slate-900 text-base group-hover:text-[#CC0000] transition-colors">
                          {portal.title}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full bg-slate-100 text-slate-500 group-hover:bg-red-100 group-hover:text-[#CC0000] transition-colors">
                          {portal.badge}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 font-medium leading-snug">
                        {portal.description}
                      </p>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#CC0000] group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Footer note */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-10 text-center text-xs text-slate-300 font-medium"
          >
            Protected by securely-bound internal networks.
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
