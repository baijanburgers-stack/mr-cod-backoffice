'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart, Menu as MenuIcon, X, Globe, User as UserIcon, LogOut, Package, Settings, ChevronRight } from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n/I18nContext';
import { useCartStore } from '@/lib/store/useCartStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { Language } from '@/lib/i18n/translations';
import { motion, AnimatePresence, Variants } from 'motion/react';
import { useAuth } from '@/lib/AuthContext';
import { auth } from '@/lib/firebase';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { t, language, setLanguage } = useI18n();
  const cartItems = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const selectedStoreId = useAppStore((state) => state.selectedStoreId);
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const cartCount = cartItems.reduce((acc, item) => {
    if (item.isComboElement && item.comboParentId) {
      if (!acc.comboIds.has(item.comboParentId)) {
        acc.comboIds.add(item.comboParentId);
        acc.count += 1;
      }
    } else {
      acc.count += item.quantity;
    }
    return acc;
  }, { count: 0, comboIds: new Set<string>() }).count;

  const [brand, setBrand] = useState({ name: 'MR COD', subtitle: 'Belgium', logo: '' });

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

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prevent scrolling when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const currentStoreId = useMemo(() => {
    const match = pathname.match(/\/stores\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // Global listener: Clear cart instantly if navigating to a different store's URL
  useEffect(() => {
    if (currentStoreId) {
      const items = useCartStore.getState().items;
      if (items.length > 0 && items[0].storeId !== currentStoreId) {
        clearCart();
      }
    }
  }, [currentStoreId, clearCart]);

  const navLinks = [
    { href: '/', label: t('home') },
    { href: '/stores', label: t('stores') },
    ...(currentStoreId ? [
      { href: `/stores/${currentStoreId}/menu`, label: t('menu') },
      { href: `/stores/${currentStoreId}/contact`, label: t('contact') }
    ] : [
      { href: '/contact', label: t('contact') }
    ]),
  ];

  const toggleLanguage = () => {
    const langs: Language[] = ['en', 'fr', 'nl'];
    const currentIndex = langs.indexOf(language);
    setLanguage(langs[(currentIndex + 1) % langs.length]);
  };

  const menuVars: Variants = {
    initial: { scaleY: 0 },
    animate: {
      scaleY: 1,
      transition: {
        duration: 0.5,
        ease: [0.12, 0, 0.39, 0] as [number, number, number, number],
      },
    },
    exit: {
      scaleY: 0,
      transition: {
        delay: 0.5,
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    },
  };

  const containerVars: Variants = {
    initial: { transition: { staggerChildren: 0.09, staggerDirection: -1 } },
    open: { transition: { delayChildren: 0.3, staggerChildren: 0.09, staggerDirection: 1 } },
  };

  const mobileLinkVars: Variants = {
    initial: { y: "30vh", transition: { duration: 0.5, ease: [0.37, 0, 0.63, 1] as [number, number, number, number] } },
    open: { y: 0, transition: { duration: 0.7, ease: [0, 0.55, 0.45, 1] as [number, number, number, number] } },
  };

  return (
    <>
      <nav className={`sticky top-0 z-50 transition-all duration-500 will-change-transform ${
        scrolled 
          ? 'pt-3 md:pt-4 px-3 md:px-4 lg:px-6 bg-transparent pointer-events-none' 
          : 'bg-white border-b border-slate-100 shadow-none'
      }`}>
        <div className={`max-w-7xl mx-auto transition-all duration-500 ${
          scrolled 
            ? 'bg-white/85 backdrop-blur-3xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-3xl px-4 sm:px-6 pointer-events-auto' 
            : 'bg-transparent px-4 sm:px-6 rounded-none border-transparent'
        }`}>
          <div className="flex justify-between items-center h-20">
            {/* Logo Section */}
            <div className="flex items-center">
              <Link href="/" className="flex-shrink-0 flex items-center gap-3 group">
                {brand.logo && (
                  <div className="relative w-12 h-12 md:w-14 md:h-14 flex items-center transition-transform group-hover:scale-105 duration-300">
                    <Image src={brand.logo} alt={`${brand.name} Logo`} fill className="object-contain object-left drop-shadow-sm" />
                  </div>
                )}
                <div className="flex flex-col justify-center">
                  <span className="font-brand font-black text-2xl tracking-tight text-slate-900 group-hover:text-amber-600 transition-colors uppercase leading-none">
                    {brand.name}
                  </span>
                  {brand.subtitle && (
                    <span className="font-heading font-bold text-[10px] tracking-widest text-amber-500 uppercase mt-1.5 leading-none group-hover:text-amber-600 transition-colors">
                      {brand.subtitle}
                    </span>
                  )}
                </div>
              </Link>
            </div>

            {/* Desktop Navigation Links */}
            <div className="hidden lg:flex flex-1 justify-center items-center space-x-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="relative px-5 py-2 text-sm font-bold rounded-full group transition-colors duration-300 z-10"
                  >
                    <span className={`relative z-10 flex items-center gap-2 transition-colors ${isActive ? 'text-amber-900' : 'text-slate-600 group-hover:text-amber-800'}`}>
                      {link.label}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 bg-amber-100/80 rounded-full -z-10"
                        transition={{ type: 'spring', bounce: 0.25, stiffness: 130, damping: 15 }}
                      />
                    )}
                    {!isActive && (
                      <div className="absolute inset-0 bg-amber-50 rounded-full scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 -z-10" />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Desktop Right Section (Language & Auth) */}
            <div className="hidden lg:flex items-center space-x-4">
              <button
                onClick={toggleLanguage}
                className="flex items-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all font-bold text-sm bg-slate-50/80 px-4 py-2 rounded-full border border-slate-200 shadow-sm"
                title={t('language')}
              >
                <Globe className="h-4 w-4 mr-1.5 text-slate-400" />
                <span className="uppercase tracking-wider">{language}</span>
              </button>

              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-amber-200 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 text-white flex items-center justify-center overflow-hidden shadow-inner flex-shrink-0">
                      {user.photoURL ? (
                        <Image src={user.photoURL} alt={user.displayName || 'User'} width={32} height={32} />
                      ) : (
                        <UserIcon className="w-4 h-4" />
                      )}
                    </div>
                    <span className="text-sm font-bold text-slate-700">
                      {user.displayName?.split(' ')[0] || 'Profile'}
                    </span>
                  </button>

                  <AnimatePresence>
                    {profileOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 15, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                          className="absolute right-0 mt-3 w-64 bg-white/95 backdrop-blur-3xl rounded-[24px] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-100 py-3 z-50 overflow-hidden"
                        >
                          <div className="px-5 py-4 border-b border-slate-100/60 mb-2 bg-slate-50/50">
                            <p className="text-sm font-bold text-slate-900 truncate">{user.displayName || 'Customer'}</p>
                            <p className="text-xs text-slate-500 truncate mt-1">{user.email}</p>
                          </div>
                          <div className="px-2 space-y-1">
                            <Link
                              href="/customer/profile"
                              onClick={() => setProfileOpen(false)}
                              className="w-full text-left px-4 py-2.5 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-100/80 hover:text-amber-600 transition-all flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3">
                                <Settings className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                                Profile Settings
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                            </Link>
                            <Link
                              href="/customer/orders"
                              onClick={() => setProfileOpen(false)}
                              className="w-full text-left px-4 py-2.5 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-100/80 hover:text-amber-600 transition-all flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3">
                                <Package className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                                My Orders
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                            </Link>
                          </div>
                          <div className="px-2 mt-2 pt-2 border-t border-slate-100/60">
                            <button
                              onClick={() => {
                                auth.signOut();
                                setProfileOpen(false);
                              }}
                              className="w-full text-left px-4 py-2.5 rounded-2xl text-sm font-bold text-rose-600 hover:bg-rose-50 transition-all flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3">
                                <LogOut className="w-4 h-4 text-rose-400 group-hover:text-rose-600 transition-colors" />
                                Logout
                              </div>
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <Link 
                  href="/customer/login"
                  className="text-sm font-bold bg-slate-900 text-white px-6 py-2.5 rounded-full hover:bg-amber-500 hover:text-slate-900 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-0.5 transition-all duration-300"
                >
                  Sign In
                </Link>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center lg:hidden gap-3 z-50 pointer-events-auto">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative z-50 inline-flex items-center justify-center p-2.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:shadow-sm focus:outline-none transition-all duration-300"
              >
                <span className="sr-only">Toggle menu</span>
                <AnimatePresence mode="wait">
                  {isOpen ? (
                    <motion.div
                      key="close"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.2 }}
                    >
                      <X className="block h-5 w-5" aria-hidden="true" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      initial={{ opacity: 0, rotate: 90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: -90 }}
                      transition={{ duration: 0.2 }}
                    >
                      <MenuIcon className="block h-5 w-5" aria-hidden="true" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Modern Fullscreen Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={menuVars}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-40 bg-white origin-top flex flex-col pt-24 px-6 lg:hidden overflow-y-auto"
          >
            {/* Background decorative ambient elements */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-amber-400 rounded-full mix-blend-multiply filter blur-[80px] opacity-20 pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-[80px] opacity-15 pointer-events-none" />

            <div className="flex flex-col h-full relative z-10 w-full max-w-md mx-auto">
              <motion.div 
                variants={containerVars}
                initial="initial"
                animate="open"
                exit="initial"
                className="flex flex-col gap-6 pt-8"
              >
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <div key={link.href} className="overflow-hidden">
                      <motion.div variants={mobileLinkVars}>
                        <Link
                          href={link.href}
                          className={`text-4xl sm:text-5xl font-black tracking-tight block transition-colors ${
                            isActive
                              ? 'text-amber-500' 
                              : 'text-slate-900 hover:text-slate-600'
                          }`}
                          onClick={() => setIsOpen(false)}
                        >
                          {link.label}
                        </Link>
                      </motion.div>
                    </div>
                  );
                })}

                <div className="overflow-hidden mt-8">
                  <motion.div variants={mobileLinkVars} className="flex gap-4 items-center">
                    <button
                      onClick={toggleLanguage}
                      className="flex items-center justify-center gap-3 px-6 py-4 rounded-3xl bg-slate-50 border border-slate-100 text-lg font-bold text-slate-800 w-full hover:bg-slate-100 transition-colors shadow-sm"
                    >
                      <Globe className="h-6 w-6 text-slate-400" />
                      {t('language')}: <span className="uppercase text-amber-600">{language}</span>
                    </button>
                  </motion.div>
                </div>
              </motion.div>

              {/* Mobile Auth / Profile Section */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="mt-auto mb-10 pt-10"
              >
                {user ? (
                  <div className="bg-white rounded-[32px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100">
                    <div className="flex items-center gap-4 mb-6 px-2">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 text-white flex items-center justify-center overflow-hidden shadow-md flex-shrink-0">
                        {user.photoURL ? (
                          <Image src={user.photoURL} alt={user.displayName || 'User'} width={56} height={56} />
                        ) : (
                          <UserIcon className="w-7 h-7" />
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xl font-bold text-slate-900 truncate">{user.displayName || 'Customer'}</p>
                        <p className="text-sm font-medium text-slate-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Link
                        href="/customer/orders"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 hover:bg-amber-50 text-slate-800 font-bold hover:text-amber-900 transition-colors group"
                      >
                        <div className="bg-white p-2.5 rounded-xl shadow-sm group-hover:text-amber-600 transition-colors">
                          <Package className="w-5 h-5" />
                        </div>
                        My Orders
                        <ChevronRight className="w-5 h-5 ml-auto text-slate-300 group-hover:text-amber-500 transition-colors" />
                      </Link>
                      <Link
                        href="/customer/profile"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold transition-colors group"
                      >
                        <div className="bg-white p-2.5 rounded-xl shadow-sm group-hover:text-slate-600 transition-colors">
                          <Settings className="w-5 h-5 text-slate-500" />
                        </div>
                        Profile Settings
                        <ChevronRight className="w-5 h-5 ml-auto text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </Link>
                      <button
                        onClick={() => {
                          auth.signOut();
                          setIsOpen(false);
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-colors group"
                      >
                        <div className="bg-white p-2.5 rounded-xl shadow-sm text-rose-500 group-hover:text-rose-600 transition-colors">
                          <LogOut className="w-5 h-5" />
                        </div>
                        Logout
                      </button>
                    </div>
                  </div>
                ) : (
                  <Link
                    href="/customer/login"
                    onClick={() => setIsOpen(false)}
                    className="w-full text-center py-5 rounded-[24px] text-lg font-black text-slate-900 bg-amber-400 hover:bg-amber-500 shadow-xl shadow-amber-400/30 active:scale-[0.98] transition-all block ring-1 ring-amber-500/50"
                  >
                    Sign In to Order
                  </Link>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
