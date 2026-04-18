'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Clock, ShoppingBag, User, Phone, MapPin, Printer, X, Bike, Car, AlertCircle, CalendarDays } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

type Driver = {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  eta: string;
};

type OrderType = {
  id: string;
  orderNumber?: string;
  customerName: string;
  phone: string;
  type: 'Delivery' | 'Pickup';
  address?: string;
  status: string;
  time: string;
  subtotal?: number;
  discount?: number;
  total: number;
  vatBreakdown?: { [rate: string]: { net: number; vatAmount: number; gross: number } };
  items: { name: string; qty: number; price: number }[];
  platform: string;
  notes: string;
  driver?: Driver | null;
  createdAt?: string;
};

export default function OrderHistoryDashboard({ storeId }: { storeId: string }) {
  const { user } = useAuth();
  
  const [orders, setOrders] = useState<OrderType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('Today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [platformFilter, setPlatformFilter] = useState('All Platforms');
  const [storeName, setStoreName] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchStore = async () => {
      try {
        const storeDoc = await getDoc(doc(db, 'stores', storeId));
        if (storeDoc.exists()) {
          setStoreName(storeDoc.data().name);
        }
      } catch (error) {
        console.error("Error fetching store name:", error);
      }
    };
    fetchStore();

    const q = query(
      collection(db, 'orders'), 
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc') // Fetch newest first
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders: OrderType[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        let timeString = 'Just now';
        let parsedDate = new Date();
        if (data.createdAt?.toDate) {
          parsedDate = data.createdAt.toDate();
        } else if (data.createdAt) {
          const d = new Date(data.createdAt);
          if (!isNaN(d.getTime())) {
            parsedDate = d;
          }
        }
        
        const today = new Date();
        const isToday = parsedDate.getDate() === today.getDate() && 
                        parsedDate.getMonth() === today.getMonth() && 
                        parsedDate.getFullYear() === today.getFullYear();
        
        timeString = (isToday ? 'Today, ' : parsedDate.toLocaleDateString() + ' ') + 
                     parsedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        let rawPlatform = (data.platform || data.source || 'online').toLowerCase();
        // Normalise: 'web' and 'online' both map to 'Online'
        let platformStr: string;
        if (rawPlatform === 'pos') {
          platformStr = 'POS';
        } else if (rawPlatform === 'kiosk') {
          platformStr = 'Kiosk';
        } else {
          platformStr = 'Online'; // 'online', 'web', or anything else
        }

        fetchedOrders.push({
          id: doc.id,
          orderNumber: data.orderNumber || doc.id.substring(0, 6).toUpperCase(),
          customerName: data.customerName || 'Unknown Customer',
          phone: data.phone || '',
          type: data.type || 'Pickup',
          platform: platformStr,
          address: data.address || '',
          status: data.status || 'New',
          time: timeString,
          subtotal: data.subtotal,
          discount: data.discount,
          total: data.total || 0,
          vatBreakdown: data.vatBreakdown,
          items: (data.items || []).map((item: any) => ({
            name: item.name || 'Unknown Item',
            qty: item.quantity || 1,
            price: item.price || 0
          })),
          notes: data.notes || '',
          driver: data.driver || null,
          createdAt: data.createdAt
        });
      });
      setOrders(fetchedOrders);
      
      setSelectedOrder(prev => {
        if (prev) {
          const updatedSelected = fetchedOrders.find(o => o.id === prev.id);
          if (updatedSelected) return updatedSelected;
        }
        return prev;
      });
      
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [storeId, user]);

  const filteredOrders = orders.filter(order => {
    // Search
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = order.orderNumber?.toLowerCase().includes(searchLower) || 
                          order.customerName.toLowerCase().includes(searchLower);

    // Platform
    const matchesPlatform = platformFilter === 'All Platforms' || order.platform === platformFilter;

    // Date filtering
    let matchesDate = true;
    let orderDate = new Date();
    if (order.createdAt && (order.createdAt as any).toDate) {
      orderDate = (order.createdAt as any).toDate();
    } else if (order.createdAt) {
      const parsed = new Date(order.createdAt);
      if (!isNaN(parsed.getTime())) orderDate = parsed;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateFilter === 'Custom Range') {
      const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
      const to   = dateTo   ? new Date(dateTo   + 'T23:59:59') : null;
      if (from) matchesDate = orderDate >= from;
      if (to)   matchesDate = matchesDate && orderDate <= to;
    } else if (dateFilter === 'Today') {
      matchesDate = orderDate >= today;
    } else if (dateFilter === 'Yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      matchesDate = orderDate >= yesterday && orderDate < today;
    } else if (dateFilter === 'Last 7 Days') {
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 7);
      matchesDate = orderDate >= last7;
    } else if (dateFilter === 'This Month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      matchesDate = orderDate >= startOfMonth;
    } // 'All Time' → matchesDate stays true

    return matchesSearch && matchesPlatform && matchesDate;
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Pending': case 'New': return 'bg-amber-100 text-amber-800';
      case 'Preparing': return 'bg-blue-100 text-blue-800';
      case 'Ready': return 'bg-emerald-100 text-emerald-800';
      case 'Out for Delivery': return 'bg-purple-100 text-purple-800';
      case 'Completed': return 'bg-slate-100 text-slate-800';
      case 'Cancelled': case 'Rejected': return 'bg-rose-100 text-rose-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const downloadTxtReceipt = (order: OrderType, store: string) => {
    const pad = (str: string, len: number, char = ' ') => str.padEnd(len, char);
    const center = (str: string, len: number) => {
      if (str.length >= len) return str;
      const left = Math.floor((len - str.length) / 2);
      const right = len - str.length - left;
      return ' '.repeat(left) + str + ' '.repeat(right);
    };

    const width = 42;
    const divider = '='.repeat(width) + '\n';
    const subDivider = '-'.repeat(width) + '\n';

    let txt = '';
    txt += center(store.toUpperCase(), width) + '\n';
    txt += divider;
    txt += `Order:     #${order.orderNumber}\n`;
    txt += `Type:      ${order.type.toUpperCase()}\n`;
    txt += `Time:      ${order.time}\n`;
    txt += `Status:    ${order.status.toUpperCase()}\n`;
    txt += subDivider;
    txt += `Customer:  ${order.customerName}\n`;
    txt += `Phone:     ${order.phone}\n`;
    if (order.type === 'Delivery' && order.address) {
      txt += `Address:   ${order.address}\n`;
    }
    txt += subDivider;
    txt += pad('QTY', 4) + pad('ITEM', 28) + pad('PRICE', 10) + '\n';
    txt += subDivider;
    order.items.forEach(item => {
      const qtyStr = `${item.qty}x`;
      let nameStr = item.name;
      const priceStr = `€${(item.price * item.qty).toFixed(2)}`;
      if (nameStr.length > 26) nameStr = nameStr.substring(0, 26);
      txt += pad(qtyStr, 4) + pad(nameStr, 28) + pad(priceStr, 10) + '\n';
    });
    txt += subDivider;
    txt += pad('TOTAL', 32) + pad(`€${order.total.toFixed(2)}`, 10) + '\n';
    txt += divider;
    if (order.notes) {
      txt += `Notes:\n${order.notes}\n`;
      txt += divider;
    }
    txt += '\n';
    txt += center('END OF RECEIPT', width) + '\n';
    txt += '\n\n';

    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order_${order.orderNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full bg-slate-50 items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      {/* Header Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-6 max-w-7xl mx-auto overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Log</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">Full historical log of all online and kiosk orders.</p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Platform */}
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-bold text-slate-700 outline-none focus:border-slate-400 cursor-pointer transition-colors"
              >
                <option value="All Platforms">All Platforms</option>
                <option value="Online">Online</option>
                <option value="Kiosk">Kiosk</option>
                <option value="POS">POS</option>
              </select>

              {/* Date preset */}
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  if (e.target.value !== 'Custom Range') { setDateFrom(''); setDateTo(''); }
                }}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-bold text-slate-700 outline-none focus:border-slate-400 cursor-pointer transition-colors"
              >
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="This Month">This Month</option>
                <option value="All Time">All Time</option>
                <option value="Custom Range">Custom Range…</option>
              </select>

              {/* Custom date range — only shown when Custom Range is selected */}
              {dateFilter === 'Custom Range' && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white shadow-sm">
                    <CalendarDays className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest">From</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="border-0 outline-none text-sm font-bold text-slate-800 bg-transparent cursor-pointer"
                    />
                  </div>
                  <span className="text-slate-400 font-bold">→</span>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white shadow-sm">
                    <CalendarDays className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest">To</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="border-0 outline-none text-sm font-bold text-slate-800 bg-transparent cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search order # or customer…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-none bg-white text-sm font-medium"
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* DATA TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Order #</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Customer Name</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4 hidden md:table-cell">Time</th>
                <th className="px-6 py-4 hidden sm:table-cell">Source / Type</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 font-medium">
                    No orders found matching your search.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const displayStatus = order.status === 'New' ? 'Pending' : order.status;
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4 font-black text-slate-900 group-hover:text-red-600 transition-colors">
                        #{order.orderNumber}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider ${getStatusStyle(displayStatus)}`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{order.customerName}</div>
                      </td>
                      <td className="px-6 py-4 font-black text-slate-900">
                        €{order.total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell text-sm font-bold text-slate-500">
                        {order.time}
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <div className="flex items-center gap-1 text-sm font-bold text-slate-700">
                          {order.platform}
                          <span className="text-slate-400 font-medium ml-1 flex items-center gap-1 text-xs uppercase tracking-widest">
                            • {order.type === 'Delivery' ? <Bike className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />} {order.type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-slate-400 group-hover:text-red-600 transition-colors">
                          View Details &rarr;
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL (Slide-over) */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end"
          >
            <div className="absolute inset-0" onClick={() => setSelectedOrder(null)} />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
                <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                  #{selectedOrder.orderNumber}
                  <span className={`px-2 py-0.5 text-xs uppercase tracking-wider rounded-md font-black ${getStatusStyle(selectedOrder.status === 'New' ? 'Pending' : selectedOrder.status)}`}>
                    {selectedOrder.status === 'New' ? 'Pending' : selectedOrder.status}
                  </span>
                </h2>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-white">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2">Customer Info</div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                       <User className="w-4 h-4 text-slate-400" /> {selectedOrder.customerName}
                    </div>
                    <div className="font-medium text-slate-600 text-sm flex items-center gap-2 mt-1">
                       <Phone className="w-4 h-4 text-slate-400" /> {selectedOrder.phone}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2">Order Info</div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                       {selectedOrder.type === 'Delivery' ? <Bike className="w-4 h-4 text-slate-400" /> : <ShoppingBag className="w-4 h-4 text-slate-400" />} {selectedOrder.type}
                    </div>
                    <div className="font-medium text-slate-600 text-sm flex items-center gap-2 mt-1">
                       <Clock className="w-4 h-4 text-slate-400" /> {selectedOrder.time}
                    </div>
                  </div>
                </div>

                {selectedOrder.type === 'Delivery' && selectedOrder.address && (
                  <div className="mb-6 p-4 rounded-xl border border-indigo-100 bg-indigo-50/50">
                    <div className="text-xs font-black uppercase text-indigo-400 tracking-wider mb-1">Delivery Address</div>
                    <div className="font-medium text-indigo-900 flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                      {selectedOrder.address}
                    </div>
                  </div>
                )}

                {selectedOrder.notes && (
                  <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50">
                    <div className="text-xs font-black uppercase text-amber-500 tracking-wider mb-1 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" /> Customer Note
                    </div>
                    <div className="font-medium text-amber-900 italic">
                      "{selectedOrder.notes}"
                    </div>
                  </div>
                )}

                <div className="mb-4 text-xs font-black uppercase text-slate-400 tracking-wider">Order Items</div>
                <div className="space-y-3 mb-8">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                      <div>
                        <div className="font-bold text-slate-900 text-base">
                          <span className="text-slate-400 mr-2">{item.qty}x</span>{item.name}
                        </div>
                        <div className="text-sm font-medium text-slate-500">€{item.price.toFixed(2)} each</div>
                      </div>
                      <div className="font-black text-slate-900">
                        €{(item.price * item.qty).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
                  {selectedOrder.subtotal && (
                     <div className="flex justify-between mb-2 text-sm font-bold text-slate-500">
                       <span>Subtotal</span>
                       <span>€{selectedOrder.subtotal.toFixed(2)}</span>
                     </div>
                  )}
                  {selectedOrder.discount ? (
                     <div className="flex justify-between mb-3 pb-3 border-b border-slate-200 text-sm font-bold text-emerald-600">
                       <span>Discount</span>
                       <span>-€{selectedOrder.discount.toFixed(2)}</span>
                     </div>
                  ) : <div className="border-b border-slate-200 pb-2 mb-2" />}
                  
                  <div className="flex justify-between items-center mt-3">
                    <span className="font-black text-slate-900 uppercase tracking-widest text-sm">Total Paid</span>
                    <span className="font-black text-slate-900 text-2xl">€{selectedOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50">
                <button 
                  onClick={() => downloadTxtReceipt(selectedOrder, storeName || storeId)}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-lg rounded-xl flex justify-center items-center gap-2 transition-colors"
                >
                  <Printer className="w-5 h-5" /> Download TXT Receipt
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
