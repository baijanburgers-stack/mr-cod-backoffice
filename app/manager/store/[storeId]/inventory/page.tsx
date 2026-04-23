'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, PackageOpen, CheckCircle2, Clock, AlertTriangle, Layers, Power, History } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';

const getSnoozeTime = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  isAvailable: boolean;
  type: 'menu' | 'combo';
  price: number;
  collectionName: string;
};

export default function ManagerInventoryPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'instock' | 'outstock'>('all');

  useEffect(() => {
    if (!storeId) return;

    let allItems: InventoryItem[] = [];

    // Watch Menu Items
    const qMenu = query(collection(db, 'menuItems'), where('storeId', '==', storeId));
    const unsubMenu = onSnapshot(qMenu, (snapshot) => {
      const parsed = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || 'Unknown',
          category: data.category || 'General',
          isAvailable: data.isAvailable !== false,
          type: 'menu' as const,
          price: data.price || 0,
          collectionName: 'menuItems'
        };
      });
      
      allItems = [...parsed, ...allItems.filter(i => i.type === 'combo')];
      setItems(allItems.sort((a,b) => a.name.localeCompare(b.name)));
      setIsLoading(false);
    });

    // Watch Combos
    const qCombos = query(collection(db, 'combos'), where('storeId', '==', storeId));
    const unsubCombos = onSnapshot(qCombos, (snapshot) => {
      const parsed = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || 'Unknown Combo',
          category: data.category || 'Combos',
          isAvailable: data.isActive !== false,
          type: 'combo' as const,
          price: data.price || 0,
          collectionName: 'combos'
        };
      });
      
      allItems = [...allItems.filter(i => i.type === 'menu'), ...parsed];
      setItems(allItems.sort((a,b) => a.name.localeCompare(b.name)));
    });

    return () => {
      unsubMenu();
      unsubCombos();
    };
  }, [storeId]);

  const toggleAvailability = async (item: InventoryItem) => {
    try {
      const ref = doc(db, item.collectionName, item.id);
      const newStatus = !item.isAvailable;
      
      if (item.type === 'combo') {
        await updateDoc(ref, { isActive: newStatus });
      } else {
        await updateDoc(ref, { isAvailable: newStatus });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, item.collectionName);
    }
  };

  const setSnooze = async (item: InventoryItem, hours: number) => {
    // For a future more complex implementation, we can save a `snoozedUntil` timestamp.
    // For now, it simply turns it off immediately for the kitchen to survive the rush.
    try {
      const ref = doc(db, item.collectionName, item.id);
      if (item.type === 'combo') {
        await updateDoc(ref, { isActive: false, snoozedUntil: getSnoozeTime(hours) });
      } else {
        await updateDoc(ref, { isAvailable: false, snoozedUntil: getSnoozeTime(hours) });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, item.collectionName);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' ? true : filter === 'instock' ? item.isAvailable : !item.isAvailable;
    return matchesSearch && matchesFilter;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-black text-slate-900">Live Inventory Management</h1>
        <p className="mt-2 text-slate-500 font-medium max-w-xl">
          Instantly toggle menu items and combos Out Of Stock to protect your kitchen during heavy rushes. Changes appear on the storefront immediately.
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mb-8">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 bg-slate-50">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search items to snooze..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 bg-white transition-colors font-medium sm:w-48"
          >
            <option value="all">All Items</option>
            <option value="instock">In Stock Only</option>
            <option value="outstock">Snoozed / Out of Stock</option>
          </select>
        </div>

        <div className="divide-y divide-slate-100">
          <AnimatePresence>
            {filteredItems.length === 0 ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                <PackageOpen className="w-12 h-12 mb-4 text-slate-300" />
                <h3 className="text-lg font-bold text-slate-900">No items match your filter.</h3>
              </div>
            ) : (
              filteredItems.map(item => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    !item.isAvailable ? 'bg-rose-50/30 grayscale-[0.3]' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                      item.isAvailable ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-rose-100 text-rose-600 border-rose-200'
                    }`}>
                      {item.type === 'combo' ? <Layers className="w-6 h-6" /> : <PackageOpen className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className={`text-lg font-bold ${!item.isAvailable ? 'text-rose-900 line-through opacity-70' : 'text-slate-900'}`}>
                        {item.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {item.category}
                        </span>
                        <span className="text-sm font-bold text-slate-400">€{item.price.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-2 sm:mt-0">
                    {/* Snooze Options */}
                    {item.isAvailable ? (
                      <>
                        <button
                          onClick={() => setSnooze(item, 4)}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors border border-amber-200/50"
                          title="Snooze for 4 Hours"
                        >
                          <History className="w-3.5 h-3.5" />
                          Snooze (4H)
                        </button>
                        <button
                          onClick={() => setSnooze(item, 24)}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors border border-orange-200/50"
                          title="Snooze for 24 Hours / Until Tomorrow"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          Tomorrow
                        </button>
                        <button
                          onClick={() => toggleAvailability(item)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors"
                        >
                          <Power className="w-4 h-4" />
                          Mark Out of Stock
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => toggleAvailability(item)}
                        className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-sm shadow-emerald-500/20"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Reactivate Item
                      </button>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
