'use client';

import { useCartStore } from '@/lib/store/useCartStore';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { usePathname } from 'next/navigation';

export function FloatingCart() {
  const items = useCartStore((state) => state.items);
  const getTotal = useCartStore((state) => state.getTotal);
  const pathname = usePathname();
  
  const cartCount = items.reduce((acc, item) => {
    if (item.isComboElement && item.comboParentId) {
      if (!acc.comboIds.has(item.comboParentId)) {
        acc.comboIds.add(item.comboParentId);
        acc.count += 1; // Since a combo instance UUID is unique, quantity is technically always 1
      }
    } else {
      acc.count += item.quantity;
    }
    return acc;
  }, { count: 0, comboIds: new Set<string>() }).count;
  
  // Hide the floating cart on the cart checkout pages where it's redundant
  // or on app portals and the landing page.
  const isHiddenPage = pathname === '/' || pathname === '/cart' || pathname === '/checkout' || pathname?.startsWith('/admin') || pathname?.startsWith('/manager') || pathname === '/login';

  return (
    <AnimatePresence>
      {!isHiddenPage && cartCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-4 left-4 right-4 z-50 md:bottom-10 md:left-auto md:right-10 flex"
        >
          <Link
            href="/cart"
            className="flex-1 md:flex-none flex items-center justify-between md:justify-start gap-4 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-[2rem] md:rounded-full py-4 px-6 shadow-[0_10px_40px_-10px_rgba(245,158,11,0.6)] hover:shadow-[0_20px_50px_-10px_rgba(245,158,11,0.8)] transition-all font-bold group"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 group-hover:scale-110 transition-transform" />
                <span className="absolute -top-2 -right-3 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-black text-white bg-rose-500 rounded-full shadow-sm border-2 border-amber-500">
                  {cartCount}
                </span>
              </div>
              
              <div className="flex flex-col border-l border-slate-900/10 pl-3 ml-1 text-left">
                <span className="text-[10px] uppercase tracking-wider font-bold opacity-80 leading-none mb-0.5">View Order</span>
                <span className="font-black text-lg leading-none">Checkout</span>
              </div>
            </div>
            
            <div className="font-black text-xl leading-none">€{getTotal().toFixed(2)}</div>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
