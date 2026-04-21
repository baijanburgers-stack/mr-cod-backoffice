'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Package, ShoppingBag, Settings, LogOut, Menu, X, Clock, ChevronDown, Users, Monitor, Tablet, CreditCard, Palette } from 'lucide-react';
import { useState, use, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/lib/AuthContext';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function StoreAdminLayout({ children, params }: { children: React.ReactNode, params: Promise<{ storeId: string }> }) {
  const pathname = usePathname();
  const router = useRouter();
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(() => ({
    Menu: pathname.includes(`/admin/store/${storeId}/menu`),
  }));
  const [storeName, setStoreName] = useState('');
  const [storeLogo, setStoreLogo] = useState('');
  const { user, loading, isSuperAdmin, storeIds } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const fetchStoreAndCheckAuth = async () => {
      if (!user) return;

      try {
        // Super admins can access ALL stores — no storeId check needed
        if (isSuperAdmin) {
          setIsAuthorized(true);
        } else {
          // Store admin: must be assigned to this specific store
          const isAssignedToThisStore =
            storeIds.includes(storeId);

          if (isAssignedToThisStore) {
            setIsAuthorized(true);
          } else {
            router.push('/login');
            return;
          }
        }

        const storeDoc = await getDoc(doc(db, 'stores', storeId));
        if (storeDoc.exists()) {
          const d = storeDoc.data();
          setStoreName(d.name || '');
          // Fetch store's own logo from branding sub-object or legacy top-level field
          setStoreLogo(d.branding?.storeLogo || d.storeLogo || d.logo || '');
        }
      } catch (error) {
        console.error('Error fetching store data:', error);
        router.push('/login');
      }
    };

    if (!loading) {
      if (!user) {
        router.push('/login');
      } else {
        fetchStoreAndCheckAuth();
      }
    }
  }, [storeId, user, loading, isSuperAdmin, storeIds, router]);

  useEffect(() => {
    // Auto-expand active menus
    const newExpanded = { ...expandedMenus };
    let changed = false;
    
    if (pathname.includes(`/admin/store/${storeId}/menu`) && !expandedMenus['Menu']) {
      newExpanded['Menu'] = true;
      changed = true;
    }
    
    if (changed) {
      const timer = setTimeout(() => setExpandedMenus(newExpanded), 0);
      return () => clearTimeout(timer);
    }
  }, [pathname, storeId, expandedMenus]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/login');
  };

  if (loading || !user || !isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAF9F6]">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', href: `/admin/store/${storeId}`, icon: LayoutDashboard },
    { name: 'Order History', href: `/admin/store/${storeId}/orders/history`, icon: ShoppingBag },
    { 
      name: 'Menu', 
      icon: Package,
      subItems: [
        { name: 'Categories', href: `/admin/store/${storeId}/menu/categories` },
        { name: 'Items', href: `/admin/store/${storeId}/menu` },
        { name: 'Modifiers', href: `/admin/store/${storeId}/menu/modifiers` },
        { name: 'Combos', href: `/admin/store/${storeId}/menu/combos` },
      ]
    },
    { name: 'Store Settings', href: `/admin/store/${storeId}/settings`, icon: Settings },
    { name: 'Managers', href: `/admin/store/${storeId}/managers`, icon: Users },
    { name: 'POS Terminals', href: `/admin/store/${storeId}/terminals`, icon: Monitor },
    { name: 'Kiosks', href: `/admin/store/${storeId}/kiosks`, icon: Tablet },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile/Tablet Sidebar Overlay — hidden on lg+ */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar
          - On lg+: always visible, static in flow (no translate, no fixed stacking)
          - On < lg: fixed drawer that slides in/out */}
      <aside
        className={`
          fixed lg:static top-0 left-0 z-50 lg:z-auto
          h-screen lg:h-auto lg:min-h-screen
          w-72 flex-shrink-0
          bg-white border-r border-slate-200 text-slate-900
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo row — store logo + name, X button visible only on mobile */}
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <Link href={`/admin/store/${storeId}`} className="flex items-center gap-3 min-w-0">
            {storeLogo ? (
              <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-slate-100 bg-white">
                <Image src={storeLogo} alt={storeName} width={40} height={40} className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-sm flex-shrink-0">
                {storeName ? storeName.substring(0, 2).toUpperCase() : '··'}
              </div>
            )}
            <div className="min-w-0">
              {storeName ? (
                <p className="font-black text-slate-900 text-sm truncate leading-tight">{storeName}</p>
              ) : (
                <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              )}
              <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                Store Portal
              </span>
            </div>
          </Link>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Store Card */}
        <div className="px-6 mb-4">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-600 shadow-sm flex items-center justify-center font-black text-white uppercase text-sm flex-shrink-0">
              {storeName ? storeName.substring(0, 2) : '··'}
            </div>
            <div className="overflow-hidden flex-1">
              {storeName ? (
                <p className="text-sm font-black text-slate-900 truncate">{storeName}</p>
              ) : (
                <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
              )}
              <p className="text-xs text-emerald-500 font-bold flex items-center mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                Online
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2 px-4">
          <div className="space-y-1">
            <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Management</p>
            {navItems.map((item) => {
              if (item.subItems) {
                const isSubActive = item.subItems.some(sub => pathname === sub.href);
                const isExpanded = expandedMenus[item.name];

                return (
                  <div key={item.name} className="space-y-1">
                    <button
                      onClick={() => setExpandedMenus(prev => ({ ...prev, [item.name]: !prev[item.name] }))}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-colors ${
                        isSubActive || isExpanded
                          ? 'text-red-900 bg-red-50/50'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-red-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${isSubActive || isExpanded ? 'text-red-600' : 'text-slate-400'}`} />
                        {item.name}
                      </div>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-11 pr-4 py-2 space-y-1">
                            {item.subItems.map(sub => {
                              const isActive = pathname === sub.href;
                              return (
                                <Link
                                  key={sub.name}
                                  href={sub.href}
                                  onClick={() => setIsSidebarOpen(false)}
                                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    isActive
                                      ? 'bg-red-50 text-red-600 shadow-sm border border-red-100'
                                      : 'text-slate-500 hover:text-red-600 hover:bg-red-50/50'
                                  }`}
                                >
                                  {sub.name}
                                </Link>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                    isActive
                      ? 'bg-red-50 text-red-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-red-600'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-red-600' : 'text-slate-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

      </aside>

      {/* Main Content — on lg+ the sidebar occupies 72 (w-72) in the flex row */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header — hamburger only shown on mobile/tablet */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 sm:px-6 justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Hamburger: hidden on lg+ because sidebar is always visible */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100/80 rounded-lg transition-colors border border-slate-200 shadow-sm"
              title="Open Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 lg:border-l-0 border-l border-slate-200 pl-4 lg:pl-0">
              {storeLogo ? (
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 bg-white flex-shrink-0">
                  <Image src={storeLogo} alt={storeName} width={32} height={32} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-black text-white text-xs flex-shrink-0">
                  {storeName ? storeName.substring(0, 2).toUpperCase() : '··'}
                </div>
              )}
              {storeName ? (
                <span className="font-black text-base text-slate-900 truncate max-w-[200px]">{storeName}</span>
              ) : (
                <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors border border-transparent hover:border-red-100"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto relative bg-[#F8FAFC]">
          {children}
        </main>
      </div>
    </div>
  );
}
