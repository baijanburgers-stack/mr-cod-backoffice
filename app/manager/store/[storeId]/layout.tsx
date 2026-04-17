'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Clock, History, PackageOpen, Settings, LogOut, Menu, X, Tablet } from 'lucide-react';
import { useState, use, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/lib/AuthContext';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function ManagerLayout({ children, params }: { children: React.ReactNode, params: Promise<{ storeId: string }> }) {
  const pathname = usePathname();
  const router = useRouter();
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [storeName, setStoreName] = useState('');
  const { user, loading } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkRoleAndFetchStore = async () => {
      if (!user) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          const isAssignedToThisStore = 
            userData.storeId === storeId || 
            (Array.isArray(userData.storeIds) && userData.storeIds.includes(storeId));

          // Admins can see all stores. Store Admins and Managers must be assigned.
          if (userData.role === 'admin' || 
             (['manager', 'store_admin'].includes(userData.role) && isAssignedToThisStore)) {
            setIsAuthorized(true);
          } else {
             router.push('/login');
             return;
          }
        }
        
        const storeDoc = await getDoc(doc(db, 'stores', storeId));
        if (storeDoc.exists()) {
          setStoreName(storeDoc.data().name);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        router.push('/login');
      }
    };
    
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else {
        checkRoleAndFetchStore();
      }
    }
  }, [user, loading, router, storeId]);

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
    { name: 'Live Orders', href: `/manager/store/${storeId}/orders`, icon: Clock },
    { name: 'History', href: `/manager/store/${storeId}/history`, icon: History },
    { name: 'Inventory', href: `/manager/store/${storeId}/inventory`, icon: PackageOpen },
    { name: 'Live Settings', href: `/manager/store/${storeId}/settings`, icon: Settings },
    { name: 'Kiosks', href: `/manager/store/${storeId}/kiosks`, icon: Tablet },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={`fixed top-0 left-0 z-50 h-screen w-72 bg-emerald-950 text-white flex flex-col transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 flex items-center justify-between">
          <Link href={`/manager/store/${storeId}/orders`} className="flex items-center gap-2">
            <span className="font-heading font-black text-2xl tracking-tight text-white">
              MR<span className="text-amber-500">COD</span>
            </span>
            <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-1 rounded-md uppercase tracking-wider ml-1">
              Manager Portal
            </span>
          </Link>
          <button onClick={() => setIsSidebarOpen(false)} className="text-emerald-300 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 mb-4 mt-2">
          <div className="bg-emerald-900/50 rounded-xl p-3 flex items-center gap-3 border border-emerald-800">
            <div className="w-10 h-10 rounded-lg bg-emerald-800 flex items-center justify-center font-bold text-amber-500 uppercase shrink-0">
              {(storeName || storeId).substring(0, 2)}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white truncate">{storeName || storeId.replace('-', ' ')}</p>
              <p className="text-[10px] text-emerald-400 font-bold tracking-wider uppercase flex items-center mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" /> Shift Manager
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-4">
          <div className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-emerald-200 hover:bg-emerald-900 hover:text-white'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-emerald-300'}`} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-emerald-900">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl font-medium text-emerald-200 hover:bg-emerald-900 hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout Shift Dashboard
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 max-h-screen overflow-hidden bg-slate-50">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 sm:px-6 justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100/80 rounded-lg transition-colors border border-slate-200 shadow-sm"
              title="Open Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-heading font-black text-xl tracking-tight text-slate-900 border-l border-slate-200 pl-4">
              MR<span className="text-amber-500">COD</span>
            </span>
          </div>
          <div></div>
        </header>

        {/* The children area */}
        <div className="flex-1 overflow-auto w-full relative">
          {children}
        </div>
      </main>
    </div>
  );
}
