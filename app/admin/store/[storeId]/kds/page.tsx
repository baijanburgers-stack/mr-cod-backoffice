'use client';

import { useState, use, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, getDoc } from 'firebase/firestore';
import { CheckCircle2, Clock, Info, ShoppingBag, Bike, Maximize, X, ChefHat } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';

type OrderType = {
  id: string;
  orderNumber: string;
  customerName: string;
  type: string;
  status: string;
  items: { name: string; qty: number; notes?: string }[];
  notes: string;
  createdAt?: any;
};

// Hook for live ticket age calculation
function useTicketAge(createdAt: any) {
  const [age, setAge] = useState({ minutes: 0, seconds: 0, totalSeconds: 0 });

  useEffect(() => {
    if (!createdAt) return;
    
    // Parse timestamp (firebase or string)
    let startTime = 0;
    if (createdAt.toMillis) startTime = createdAt.toMillis();
    else if (createdAt.seconds) startTime = createdAt.seconds * 1000;
    else startTime = new Date(createdAt).getTime();

    if (!startTime || isNaN(startTime)) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - startTime) / 1000));
      setAge({
        minutes: Math.floor(diff / 60),
        seconds: diff % 60,
        totalSeconds: diff
      });
    };

    updateTimer(); // Initial call
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [createdAt]);

  return age;
}

const Ticket = ({ order, onBump }: { order: OrderType, onBump: (id: string, nextStatus: string) => void }) => {
  const age = useTicketAge(order.createdAt);
  
  // Logic for color coding ticket headers based on wait time!
  const isLate = age.minutes >= 15;
  const isWarning = age.minutes >= 10 && age.minutes < 15;
  
  let headerColor = "bg-emerald-500 text-white"; // Normal
  let timerColor = "text-emerald-100";
  if (isWarning) {
    headerColor = "bg-amber-500 text-amber-950";
    timerColor = "text-amber-100";
  }
  if (isLate) {
    headerColor = "bg-rose-600 text-white animate-pulse";
    timerColor = "text-rose-100";
  }

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(5px)' }}
      className="flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden w-[320px] flex-shrink-0 border-2 border-slate-200"
    >
      {/* Header */}
      <div className={`p-4 ${headerColor} flex justify-between items-center transition-colors duration-1000`}>
        <div>
          <h2 className="font-black text-3xl tracking-tighter leading-none">#{order.orderNumber}</h2>
          <div className="flex items-center gap-2 mt-1 opacity-90 font-bold text-sm tracking-widest uppercase">
            {order.type === 'Delivery' ? <Bike className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
            {order.type}
          </div>
        </div>
        <div className={`text-right font-mono font-black text-2xl tracking-tighter ${timerColor}`}>
          {age.minutes.toString().padStart(2, '0')}:{age.seconds.toString().padStart(2, '0')}
        </div>
      </div>
      
      {/* Items List */}
      <div className="p-4 flex-1 overflow-y-auto bg-slate-50 space-y-3">
        {order.items.map((item, idx) => (
          <div key={idx} className="pb-3 border-b border-slate-200 last:border-0">
            <div className="flex gap-3 items-start">
              <span className="font-black text-xl text-slate-800 bg-slate-200 px-2 py-0.5 rounded-md leading-none">{item.qty}</span>
              <div className="flex-1">
                <span className="font-bold text-xl text-slate-900 leading-tight block">{item.name}</span>
                {item.notes && (
                  <div className="text-rose-600 font-bold text-sm mt-1 bg-rose-50 px-2 py-1 rounded border border-rose-100 uppercase tracking-widest">
                    ** {item.notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {order.notes && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-black text-amber-800 uppercase mb-1">Kitchen Note</p>
            <p className="text-base font-bold text-amber-900 leading-snug">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Bump Button */}
      <button 
        onClick={() => onBump(order.id, 'Ready')}
        className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-white font-black text-2xl tracking-tight uppercase flex items-center justify-center gap-3 transition-colors"
      >
        <CheckCircle2 className="w-7 h-7" />
        BUMP
      </button>
    </motion.div>
  );
}

export default function StoreKDSPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;

  const [orders, setOrders] = useState<OrderType[]>([]);
  const [storeName, setStoreName] = useState('KDS');
  const [storeSettings, setStoreSettings] = useState<any>(null);

  useEffect(() => {
    // Fetch store name and settings for sounds
    const fetchStore = async () => {
      try {
        const storeDoc = await getDoc(doc(db, 'stores', storeId));
        if (storeDoc.exists()) {
          setStoreName(storeDoc.data().name);
          setStoreSettings(storeDoc.data());
        }
      } catch (error) {
        console.error("Error fetching store:", error);
      }
    };
    fetchStore();

    const q = query(
      collection(db, 'orders'), 
      where('storeId', '==', storeId),
      where('status', '==', 'Preparing')
    );

    let isFirstSnapshot = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let hasNewOrder = false;

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !isFirstSnapshot) {
          hasNewOrder = true;
        }
      });
      
      isFirstSnapshot = false;

      // Play sound on new incoming tickets
      if (hasNewOrder && storeSettings?.notificationSound !== 'none') {
        const val = storeSettings?.notificationSound || 'default';
        let url = '/sounds/bell.mp3';
        if (val === 'default') url = '/sounds/bell.mp3';
        if (val === 'chime') url = '/sounds/chime.mp3';
        if (val === 'register') url = '/sounds/register.mp3';
        if (val === 'custom' && storeSettings?.customNotificationSound) {
          url = storeSettings.customNotificationSound;
        }
        
        try {
          const audio = new Audio(url);
          audio.play().catch(e => console.log('Autoplay blocked:', e));
        } catch(e) {}
      }

      const fetchedOrders: OrderType[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedOrders.push({
          id: doc.id,
          orderNumber: data.orderNumber || doc.id.substring(0, 6).toUpperCase(),
          customerName: data.customerName || 'Customer',
          type: data.type || 'Pickup',
          status: data.status,
          items: (data.items || []).map((item: any) => ({
            name: item.name || 'Unknown',
            qty: item.quantity || 1,
            notes: item.notes || item.modifiers?.join(', ') || ''
          })),
          notes: data.notes || '',
          createdAt: data.createdAt
        });
      });
      
      // Sort oldest first client-side to avoid Firestore composite index requirements
      fetchedOrders.sort((a, b) => {
        const getMs = (date: any) => {
          if (!date) return 0;
          if (date.toMillis) return date.toMillis();
          if (date.seconds) return date.seconds * 1000;
          return new Date(date).getTime();
        };
        return getMs(a.createdAt) - getMs(b.createdAt);
      });
      
      setOrders(fetchedOrders);
    });

    return () => unsubscribe();
  }, [storeId, storeSettings]);

  const handleBump = async (orderId: string, nextStatus: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: nextStatus });
    } catch (error) {
      console.error("Failed to bump order:", error);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col font-sans overflow-hidden">
      {/* Top Navbar */}
      <header className="h-16 flex-shrink-0 bg-slate-950 border-b border-white/10 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link 
            href={`/admin/store/${storeId}/orders`}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </Link>
          <h1 className="text-2xl font-black text-white tracking-widest uppercase">
            <span className="text-amber-500 mr-2">{storeName}</span> 
            KDS
          </h1>
          <div className="ml-4 px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-bold tracking-widest uppercase">
            {orders.length} Active Tickets
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-slate-400 font-mono font-bold tracking-widest flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5 text-amber-500" />
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button 
            onClick={toggleFullscreen}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-white/10"
            title="Toggle Fullscreen Monitor"
          >
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main KDS Board (Horizontal Scroll grid) */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden bg-[#0F172A] scrollbar-hide py-6 px-6">
        <div className="h-full flex gap-6 items-stretch w-max pb-4">
          <AnimatePresence>
            {orders.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="w-screen h-full flex items-center justify-center -ml-6"
              >
                <div className="text-center text-slate-600">
                  <ChefHat className="w-24 h-24 mx-auto mb-6 opacity-30" />
                  <h2 className="text-4xl font-black tracking-tight text-white/30">KITCHEN CLEAR</h2>
                  <p className="text-xl font-bold mt-2">Waiting for incoming orders...</p>
                </div>
              </motion.div>
            )}

            {orders.map((order) => (
              <Ticket key={order.id} order={order} onBump={handleBump} />
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
