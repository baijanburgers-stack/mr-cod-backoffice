'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { Shield, Store, ShoppingBag, ArrowRight, Clock } from 'lucide-react';
import Image from 'next/image';

import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function UnifiedLoginPortal() {

  const [brand, setBrand] = useState({ name: 'MR COD', subtitle: '' });

  useEffect(() => {
    const fetchBrand = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'global'));
        if (snap.exists()) {
          const data = snap.data();
          setBrand({ name: data.appName || 'MR COD', subtitle: data.appSubtitle || '' });
        }
      } catch (e) {
        console.error('Error fetching brand', e);
      }
    };
    fetchBrand();
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: any = {
    hidden: { opacity: 0, scale: 0.9, y: 20 },
    show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  const portals = [
    {
      id: 'store_admin',
      title: 'Store Admin',
      description: 'Manage your kitchen, menu, and incoming orders.',
      icon: Store,
      href: '/admin/login?portal=store_admin',
    },
    {
      id: 'manager',
      title: 'Shift Manager',
      description: 'Access live orders, inventory, and operational controls.',
      icon: Clock,
      href: '/admin/login?portal=manager',
    },
    {
      id: 'super_admin',
      title: 'Super Admin',
      description: 'System-wide configuration and multi-store management.',
      icon: Shield,
      href: '/admin/login?portal=super_admin',
    }
  ];

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#0A0A0A] overflow-hidden text-white">
      {/* Background — subtle red glow */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[#FF2800] opacity-[0.04] blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#FF2800] opacity-[0.03] blur-[120px]" />
        {/* Subtle grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="1"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex flex-col items-center gap-1 mb-6"
          >
            <span className="font-heading font-black text-4xl sm:text-5xl tracking-tight text-white uppercase leading-none">
              {brand.name}
            </span>
            {brand.subtitle && (
              <span className="font-heading font-bold text-sm sm:text-base tracking-[0.2em] text-[#FF2800] uppercase leading-none">
                {brand.subtitle}
              </span>
            )}
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-black font-heading mb-4 tracking-tight"
          >
            Choose your portal
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/40 text-lg sm:text-xl font-medium max-w-2xl mx-auto"
          >
            Select how you would like to proceed into the system today.
          </motion.p>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-3 gap-6"
        >
          {portals.map((portal) => (
            <Link key={portal.id} href={portal.href} className="block group h-full">
              <motion.div 
                variants={itemVariants}
                className="relative h-full p-8 rounded-3xl bg-[#141414] border border-[#2A2A2A] transition-all duration-300 transform group-hover:-translate-y-2 group-hover:bg-[#1A1A1A] group-hover:border-[#FF2800]/40 group-hover:shadow-[0_20px_60px_rgba(255,40,0,0.1)] flex flex-col"
              >
                {/* Red glow behind icon on hover */}
                <div className="absolute top-8 left-8 w-16 h-16 rounded-full bg-[#FF2800] opacity-0 group-hover:opacity-10 blur-2xl transition-opacity duration-500" />
                
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-[#FF2800]/10 border border-[#FF2800]/20 flex items-center justify-center group-hover:bg-[#FF2800]/20 transition-colors duration-300">
                    <portal.icon className="w-8 h-8 text-[#FF2800]" />
                  </div>
                </div>

                <div className="flex-1">
                  <span className="inline-block px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full mb-4 bg-[#FF2800]/10 text-[#FF2800] border border-[#FF2800]/20">
                    Access
                  </span>
                  <h3 className="text-2xl font-black font-heading tracking-tight mb-3 text-white group-hover:text-[#FF2800] transition-colors">
                    {portal.title}
                  </h3>
                  <p className="text-white/40 font-medium leading-relaxed text-sm">
                    {portal.description}
                  </p>
                </div>

                <div className="mt-8 flex items-center text-sm font-bold text-white/30 group-hover:text-white transition-colors">
                  Enter Portal 
                  <ArrowRight className="ml-2 w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>
            </Link>
          ))}
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-16 text-center"
        >
          <p className="text-white/20 text-sm font-medium">
            Protected by securely-bound internal networks.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
