'use client';

import { use, useState, useEffect } from 'react';
import { Package, ShoppingBag, Clock, Edit, ArrowUpRight, TrendingUp, AlertCircle, CheckCircle2, ChevronRight, Map, MapPin, Plus, Trash2, X, Printer, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, addDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import { VatReceipt } from '@/components/ui/VatReceipt';

export default function StoreAdminDashboard({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();
  const [storeName, setStoreName] = useState('');
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [activeMenuCount, setActiveMenuCount] = useState(0);

  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [printingOrder, setPrintingOrder] = useState<any>(null);
  const [printMode, setPrintMode] = useState<'kds'|'vat'>('kds');
  const [storeSettings, setStoreSettings] = useState<any>(null);

  useEffect(() => {
    let storeUnsub = () => {};
    let menuUnsub = () => {};

    try {
      // 1. Listen to Store Document
      storeUnsub = onSnapshot(doc(db, 'stores', storeId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setStoreName(data.name || '');
          setIsStoreOpen(data.isOpen ?? true);
          setStoreSettings(data);
        }
      });

      // 2. Listen to Menu Items Count
      const menuQuery = query(collection(db, 'menuItems'), where('storeId', '==', storeId));
      menuUnsub = onSnapshot(menuQuery, (snapshot) => {
        setActiveMenuCount(snapshot.size);
      });
    } catch (e) {
      console.error("Dashboard mount error:", e);
    }

    return () => {
      storeUnsub();
      menuUnsub();
    };
  }, [storeId]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'orders'), 
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        let dateString = 'Today';
        let timeString = 'Just now';
        let timestamp = Date.now();
        
        if (data.createdAt) {
          let date;
          if (typeof data.createdAt.toDate === 'function') {
            date = data.createdAt.toDate();
          } else {
            date = new Date(data.createdAt);
          }
          
          if (!isNaN(date.getTime())) {
            dateString = date.toLocaleDateString();
            timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timestamp = date.getTime();
          }
        }

        fetchedOrders.push({
          id: doc.id,
          orderNumber: data.orderNumber || doc.id.slice(-6).toUpperCase(),
          customerName: data.customerName || 'Guest',
          phone: data.phone || 'N/A',
          notes: data.notes || '',
          address: data.address || '',
          date: dateString,
          time: timeString,
          items: data.items?.length || 0,
          rawItems: (data.items || []).map((item: any) => ({
            ...item,
            name: item.name || 'Unknown Item',
            qty: item.quantity || 1,
            price: item.price || 0
          })),
          total: `€${(data.total || 0).toFixed(2)}`,
          rawTotal: data.total || 0,
          subtotal: data.subtotal || 0,
          discount: data.discount || 0,
          vatBreakdown: data.vatBreakdown || null,
          status: data.status || 'New',
          type: data.type || 'Pickup',
          timestamp: timestamp,
          createdAt: data.createdAt
        });
      });
      setOrders(fetchedOrders);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [storeId, user]);

  const stats = [
    { name: "Today's Orders", value: orders.filter(o => o.date === new Date().toLocaleDateString()).length.toString(), icon: ShoppingBag, change: '', changeType: 'neutral' },
    { name: "Today's Revenue", value: `€${orders.filter(o => o.date === new Date().toLocaleDateString()).reduce((acc, o) => acc + (parseFloat(o.total.replace(/[^0-9.-]+/g, "")) || 0), 0).toFixed(2)}`, icon: TrendingUp, change: '', changeType: 'neutral' },
    { name: 'Active Menu Items', value: activeMenuCount.toString(), icon: Package, change: '', changeType: 'neutral' },
  ];

  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [orderTypeFilter, setOrderTypeFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const markOrderCompleted = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'Completed' });
      setSuccessMessage(`Order #${orderId} marked as completed!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesStatus = orderStatusFilter === 'All' || order.status === orderStatusFilter;
    const matchesType = orderTypeFilter === 'All' || order.type === orderTypeFilter;
    
    let matchesDate = true;
    if (dateFilter !== 'All') {
      const orderDate = new Date(order.timestamp || 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (dateFilter === 'Today') {
        matchesDate = orderDate.getTime() === today.getTime();
      } else if (dateFilter === 'Last 7 Days') {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        matchesDate = orderDate >= sevenDaysAgo && orderDate <= today;
      } else if (dateFilter === 'Custom') {
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          matchesDate = orderDate >= start && orderDate <= end;
        }
      }
    }

    return matchesStatus && matchesType && matchesDate;
  });

  const [deliveryZones, setDeliveryZones] = useState<any[]>([]);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<any>(null);
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'deliveryZones'), 
      where('storeId', '==', storeId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedZones: any[] = [];
      snapshot.forEach((doc) => {
        fetchedZones.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setDeliveryZones(fetchedZones);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'deliveryZones');
    });

    return () => unsubscribe();
  }, [storeId, user]);

  const openAddZoneModal = () => {
    setEditingZone(null);
    setIsZoneModalOpen(true);
  };

  const openEditZoneModal = (zone: any) => {
    setEditingZone(zone);
    setIsZoneModalOpen(true);
  };

  const handleSaveZone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const radius = formData.get('radius') as string;
    const fee = formData.get('fee') as string;
    const minOrder = formData.get('minOrder') as string;
    const status = formData.get('status') as string;

    try {
      if (editingZone) {
        await updateDoc(doc(db, 'deliveryZones', editingZone.id), {
          name, radius, fee, minOrder, status
        });
      } else {
        await addDoc(collection(db, 'deliveryZones'), {
          storeId,
          name,
          radius,
          fee,
          minOrder,
          status
        });
      }
      setIsZoneModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingZone ? OperationType.UPDATE : OperationType.CREATE, 'deliveryZones');
    }
  };

  const confirmDeleteZone = async () => {
    if (zoneToDelete) {
      try {
        await deleteDoc(doc(db, 'deliveryZones', zoneToDelete));
        setZoneToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `deliveryZones/${zoneToDelete}`);
      }
    }
  };

  return (
    <>
    <div className="min-h-[calc(100vh-4rem)] p-6 lg:p-10 relative bg-[#FAF9F6] font-sans text-slate-600 print:hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -right-[5%] w-[40%] h-[40%] bg-red-50 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-[40%] -left-[10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-500/90 backdrop-blur-md text-slate-900 px-6 py-3 rounded-2xl shadow-2xl shadow-emerald-500/20 font-bold flex items-center gap-3 border border-emerald-400"
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              {successMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-heading font-black text-slate-900 tracking-tight">
              {storeName || storeId.replace('-', ' ')} Dashboard
            </h1>
            <p className="mt-2 text-slate-500 font-medium">Real-time overview of your store&apos;s operations.</p>
          </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold border transition-colors ${isStoreOpen ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
            <span className={`w-2 h-2 rounded-full ${isStoreOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {isStoreOpen ? 'Store Open' : 'Store Paused'}
          </div>
          <button 
            onClick={async () => {
              try {
                await updateDoc(doc(db, 'stores', storeId), { isOpen: !isStoreOpen });
                setSuccessMessage(isStoreOpen ? 'Store orders paused.' : 'Store is now accepting orders!');
                setTimeout(() => setSuccessMessage(''), 3000);
              } catch (error) {
                handleFirestoreError(error, OperationType.UPDATE, `stores/${storeId}`);
              }
            }}
            className="px-4 py-2 bg-red-600 text-[#FAF9F6] rounded-xl font-bold transition-colors shadow-sm shadow-red-600/20 px-6"
          >
            {isStoreOpen ? 'Pause Orders' : 'Resume Orders'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-12">
        {stats.map((stat, idx) => {
          const isNeutral = stat.changeType === 'neutral';
          return (
            <motion.div
              key={stat.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="relative group rounded-3xl"
            >
              {/* Animated Glow Backdrop */}
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-indigo-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="relative h-full bg-white border border-slate-100 p-6 rounded-3xl shadow-xl overflow-hidden flex flex-col justify-between hover:bg-white/[0.07] transition-colors">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                  <stat.icon className="w-24 h-24" />
                </div>
                
                <div className="flex items-center justify-between mb-8 relative z-10">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-red-600 shadow-inner border border-slate-100">
                    <stat.icon className="w-7 h-7" />
                  </div>
                  {!isNeutral && (
                    <div className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full backdrop-blur-md border ${
                      stat.changeType === 'positive' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                    }`}>
                      <ArrowUpRight className="w-4 h-4" />
                      {stat.change}
                    </div>
                  )}
                </div>
                <div className="relative z-10">
                  <p className="text-sm font-bold text-slate-500 mb-2">{stat.name}</p>
                  <h3 className="text-4xl font-heading font-black text-slate-900 tracking-tighter">{stat.value}</h3>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Orders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
            <h3 className="text-xl font-heading font-black text-slate-900">Live Orders</h3>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-100 text-sm font-bold text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 outline-none transition-colors"
              >
                <option value="All">All Time</option>
                <option value="Today">Today</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="Custom">Custom Range</option>
              </select>
              {dateFilter === 'Custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-slate-100 text-sm font-bold text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 outline-none transition-colors "
                  />
                  <span className="text-slate-500 font-bold">-</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-slate-100 text-sm font-bold text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 outline-none transition-colors "
                  />
                </div>
              )}
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-100 text-sm font-bold text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 outline-none transition-colors"
              >
                <option value="All">All Statuses</option>
                <option value="New">New</option>
                <option value="Preparing">Preparing</option>
                <option value="Ready">Ready</option>
                <option value="Completed">Completed</option>
              </select>
              <select
                value={orderTypeFilter}
                onChange={(e) => setOrderTypeFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-100 text-sm font-bold text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 outline-none transition-colors"
              >
                <option value="All">All Types</option>
                <option value="Delivery">Delivery</option>
                <option value="Pickup">Pickup</option>
              </select>
              <Link href={`/admin/store/${storeId}/orders`} className="text-sm font-bold text-red-600 hover:text-red-600 flex items-center ml-2 bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-red-100">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 text-xs bg-white">
                  <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest pl-8">Order</th>
                  <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest">Type</th>
                  <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest">Date</th>
                  <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest">Details</th>
                  <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest text-right pr-8">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium bg-white/[0.02]">
                      No orders found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr 
                      key={order.id} 
                      onClick={() => order.status !== 'Completed' && markOrderCompleted(order.id)}
                      className={`transition-colors group ${order.status !== 'Completed' ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-white'}`}
                    >
                      <td className="px-6 py-5 pl-8">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner border border-slate-100 ${
                            order.status === 'Preparing' ? 'bg-red-50 text-red-600 border-red-200' :
                            order.status === 'Ready' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                            order.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                            'bg-slate-50 text-slate-600'
                          }`}>
                            {order.status === 'Preparing' ? <Clock className="w-6 h-6" /> :
                             order.status === 'Ready' ? <AlertCircle className="w-6 h-6" /> :
                             order.status === 'Completed' ? <CheckCircle2 className="w-6 h-6" /> :
                             <Package className="w-6 h-6" />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-heading font-black text-lg text-slate-900 truncate max-w-[12rem]">{order.customerName}</span>
                            <span className="text-xs font-bold text-slate-500 truncate max-w-[12rem]">Ord. #{order.orderNumber}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-sm font-bold text-slate-600">{order.type}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 mb-0.5">{order.date}</span>
                          <span className="text-xs font-bold text-slate-500">{order.time}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-600 font-bold">{order.items} items</span>
                          <span className="text-sm font-black text-red-600">{order.total}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black tracking-wide border ${
                          order.status === 'Preparing' ? 'bg-red-50 text-red-600 border-red-200' :
                          order.status === 'Ready' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                          order.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                          'bg-slate-50 text-slate-600 border-white/20'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right pr-8">
                        {order.status !== 'Completed' ? (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              markOrderCompleted(order.id);
                            }}
                            className="text-sm font-black tracking-wide text-emerald-600 hover:text-emerald-300 transition-all bg-emerald-50 hover:bg-emerald-500/30 px-4 py-2 rounded-xl border border-emerald-200"
                          >
                            Complete
                          </button>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPrintMode('kds');
                                setPrintingOrder(order);
                                setTimeout(() => window.print(), 100);
                              }}
                              className="text-sm font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors bg-white hover:bg-red-50 hover:text-red-600 px-3 py-2 rounded-xl border border-slate-100 hover:border-red-200"
                            >
                              <Printer className="w-4 h-4" /> KDS
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPrintMode('vat');
                                setPrintingOrder(order);
                                setTimeout(() => window.print(), 100);
                              }}
                              className="text-sm font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors bg-white hover:bg-blue-50 hover:text-blue-600 px-3 py-2 rounded-xl border border-slate-100 hover:border-blue-200"
                            >
                              <Receipt className="w-4 h-4" /> VAT
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col gap-6"
        >
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-white">
              <h3 className="text-xl font-heading font-black text-slate-900">Quick Actions</h3>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <Link href={`/admin/store/${storeId}/menu`} className="flex flex-col items-center justify-center p-5 bg-white border border-slate-100 rounded-3xl hover:bg-red-50 hover:border-red-300 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] transition-all group">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 shadow-inner group-hover:bg-red-100 transition-colors border border-slate-100 group-hover:border-red-300">
                  <Edit className="h-6 w-6 text-slate-600 group-hover:text-red-600" />
                </div>
                <span className="text-sm font-black tracking-wide text-slate-600 group-hover:text-red-600">Edit Menu</span>
              </Link>
              <Link href={`/admin/store/${storeId}/settings`} className="flex flex-col items-center justify-center p-5 bg-white border border-slate-100 rounded-3xl hover:bg-blue-50 hover:border-blue-500/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all group">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 shadow-inner group-hover:bg-blue-500/30 transition-colors border border-slate-100 group-hover:border-blue-500/50">
                  <Clock className="h-6 w-6 text-slate-600 group-hover:text-blue-600" />
                </div>
                <span className="text-sm font-black tracking-wide text-slate-600 group-hover:text-amber-white group-hover:text-blue-600">Store Hours</span>
              </Link>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-3xl p-8 text-slate-900 relative overflow-hidden shadow-xl shadow-amber-500/20 border border-amber-400">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/20 rounded-full blur-2xl" />
            <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-black/10 rounded-full blur-2xl" />
            <div className="relative z-10 text-center">
              <h3 className="text-2xl font-heading font-black mb-2 text-slate-900 drop-shadow-sm">Need Help?</h3>
              <p className="text-sm font-bold text-amber-100 mb-6 drop-shadow-sm">Contact Super Admin support for urgent issues and escalations.</p>
              <button className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black tracking-wide hover:bg-black transition-all hover:scale-[1.02] active:scale-95 shadow-xl">
                Contact Support
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Delivery Zones */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-8 bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-200">
              <Map className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-heading font-black text-slate-900">Delivery Zones</h3>
              <p className="text-sm text-slate-500 font-medium">Manage delivery areas, fees, and minimums.</p>
            </div>
          </div>
          <button onClick={openAddZoneModal} className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-slate-900 rounded-2xl font-black tracking-wide hover:bg-red-700 transition-all hover:scale-105 active:scale-95 shadow-md shadow-red-600/20 text-sm">
            <Plus className="w-5 h-5" />
            Add Zone
          </button>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-100 text-xs bg-white">
                <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest pl-8">Zone Name</th>
                <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest">Radius / Area</th>
                <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest">Delivery Fee</th>
                <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest">Min. Order</th>
                <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-widest text-right pr-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveryZones.map((zone) => (
                <tr key={zone.id} className="hover:bg-white transition-colors group">
                  <td className="px-6 py-5 pl-8">
                    <div className="font-heading font-black text-lg text-slate-900 flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-indigo-600" />
                      {zone.name}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-slate-600 font-bold">{zone.radius}</td>
                  <td className="px-6 py-5 font-black text-red-600">€{parseFloat(zone.fee).toFixed(2)}</td>
                  <td className="px-6 py-5 font-black text-red-600">€{parseFloat(zone.minOrder).toFixed(2)}</td>
                  <td className="px-6 py-5">
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black tracking-wide border ${
                      zone.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-600 border-white/20'
                    }`}>
                      {zone.status === 'Active' && <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                      {zone.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right pr-8">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => openEditZoneModal(zone)} className="p-2.5 text-slate-500 hover:text-red-600 bg-white hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-200">
                        <Edit className="w-5 h-5" />
                      </button>
                      <button onClick={() => setZoneToDelete(zone.id)} className="p-2.5 text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-200">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Add/Edit Zone Modal */}
      <AnimatePresence>
        {isZoneModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsZoneModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
                <h2 className="text-3xl font-heading font-black text-slate-900 tracking-tight">
                  {editingZone ? 'Edit Zone' : 'Add Zone'}
                </h2>
                <button 
                  onClick={() => setIsZoneModalOpen(false)}
                  className="p-3 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form id="zone-form" onSubmit={handleSaveZone} className="p-8 overflow-y-auto">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-black text-slate-600 mb-2 tracking-wide uppercase">Zone Name</label>
                    <input 
                      type="text" 
                      name="name"
                      required
                      defaultValue={editingZone?.name}
                      placeholder="e.g. Zone 1 - City Center"
                      className="w-full px-5 py-4 rounded-xl border border-slate-100 text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 transition-colors placeholder:text-slate-500 font-bold"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-black text-slate-600 mb-2 tracking-wide uppercase">Radius / Area</label>
                    <input 
                      type="text" 
                      name="radius"
                      required
                      defaultValue={editingZone?.radius}
                      placeholder="e.g. 0 - 3 km or specific postcodes"
                      className="w-full px-5 py-4 rounded-xl border border-slate-100 text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 transition-colors placeholder:text-slate-500 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-black text-slate-600 mb-2 tracking-wide uppercase">Delivery Fee (€)</label>
                      <input 
                        type="number" 
                        name="fee"
                        required
                        step="0.01"
                        min="0"
                        defaultValue={editingZone?.fee}
                        placeholder="0.00"
                        className="w-full px-5 py-4 rounded-xl border border-slate-100 text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 transition-colors font-bold text-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-black text-slate-600 mb-2 tracking-wide uppercase">Min. Order (€)</label>
                      <input 
                        type="number" 
                        name="minOrder"
                        required
                        step="0.01"
                        min="0"
                        defaultValue={editingZone?.minOrder}
                        placeholder="0.00"
                        className="w-full px-5 py-4 rounded-xl border border-slate-100 text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 transition-colors font-bold text-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-black text-slate-600 mb-2 tracking-wide uppercase">Status</label>
                    <select 
                      name="status"
                      required
                      defaultValue={editingZone?.status || 'Active'}
                      className="w-full px-5 py-4 rounded-xl border border-slate-100 text-slate-900 bg-white border border-slate-200 focus:border-red-600 focus:ring-red-600 transition-colors font-bold"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </form>

              <div className="p-8 border-t border-slate-100 bg-white flex justify-end gap-4">
                <button 
                  type="button"
                  onClick={() => setIsZoneModalOpen(false)}
                  className="px-8 py-3.5 bg-slate-50 border border-slate-100 text-slate-900 font-black rounded-xl hover:bg-white/20 transition-colors tracking-wide"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  form="zone-form"
                  className="px-8 py-3.5 bg-red-600 text-slate-900 font-black rounded-xl hover:bg-red-700 transition-colors shadow-md shadow-red-600/20 tracking-wide hover:scale-[1.02] active:scale-[0.98]"
                >
                  {editingZone ? 'Save Changes' : 'Add Zone'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {zoneToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoneToDelete(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col p-8 text-center"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-rose-200">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-heading font-black text-slate-900 mb-3">Delete Zone?</h2>
              <p className="text-slate-500 mb-8 font-medium">
                Are you sure you want to delete this delivery zone? This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setZoneToDelete(null)}
                  className="flex-1 py-4 bg-slate-50 text-slate-900 font-black rounded-xl hover:bg-white/20 transition-colors tracking-wide border border-slate-100"
                >
                  Cancel
                </button>

                <button 
                  onClick={confirmDeleteZone}
                  className="flex-1 py-4 bg-rose-500 text-slate-900 font-black tracking-wide rounded-xl hover:bg-rose-400 transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </div>

  {/* Hidden Thermal Printer Receipt View */}
  {printingOrder && printMode === 'kds' && (
    <div className="hidden print:block thermal-receipt p-4 text-black bg-white">
      <div className="text-center font-bold text-xl mb-2">{storeName ? storeName.toUpperCase() : 'STORE'}</div>
      <div className="text-center border-b-2 border-black border-dashed pb-2 mb-2">
        <div>Order: #{printingOrder.orderNumber}</div>
        <div className="font-bold text-lg">{printingOrder.type.toUpperCase()}</div>
        <div>Time: {printingOrder.time}</div>
      </div>
      
      <div className="border-b-2 border-black border-dashed pb-2 mb-2 break-words">
        <div>Customer: {printingOrder.customerName}</div>
        {printingOrder.phone && printingOrder.phone !== 'N/A' && <div>Phone: {printingOrder.phone}</div>}
        {printingOrder.type === 'Delivery' && printingOrder.address && <div>Address: {printingOrder.address}</div>}
      </div>

      <table className="w-full text-left mb-2">
        <thead>
          <tr className="border-b-2 border-black border-dashed">
            <th className="font-normal w-8">QTY</th>
            <th className="font-normal">ITEM</th>
            <th className="font-normal text-right w-16">PRICE</th>
          </tr>
        </thead>
        <tbody>
          {(printingOrder.rawItems || []).map((item: any, idx: number) => (
            <tr key={idx} className="align-top">
              <td className="pt-1">{item.qty}x</td>
              <td className="pt-1 pr-1 break-words">
                {item.name}
                {item.variants && item.variants.map((v: any, vIdx: number) => (
                  <div key={vIdx} className="text-[10px] pl-2 text-slate-600">- {v.name}</div>
                ))}
                {item.modifiers && item.modifiers.map((m: any, mIdx: number) => (
                  <div key={mIdx} className="text-[10px] pl-2 text-slate-600">+ {m.name}</div>
                ))}
                {item.comboSelections && item.comboSelections.map((sel: any, sIdx: number) => (
                  <div key={sIdx}>
                    {sel.items?.map((comboItem: any, cIdx: number) => (
                      <div key={cIdx} className="text-[10px] pl-2">
                        • {comboItem.quantity > 1 ? `${comboItem.quantity}x ` : ''}{comboItem.name}
                      </div>
                    ))}
                  </div>
                ))}
              </td>
              <td className="pt-1 text-right">€{(item.price * item.qty).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t-2 border-black border-dashed pt-2 mb-3">
        {printingOrder.notes && (
          <div className="mb-2 pb-2 border-b-2 border-black border-dashed">
            <div className="font-bold">NOTES:</div>
            <div>{printingOrder.notes}</div>
          </div>
        )}
        <div className="flex justify-between items-end font-bold text-xl mt-2">
          <span>TOTAL</span>
          <span>{printingOrder.total}</span>
        </div>
      </div>
    </div>
  )}

  {/* Hidden VAT Receipt View */}
  {printingOrder && printMode === 'vat' && storeSettings && (
    <div className="hidden print:block">
      <VatReceipt order={{...printingOrder, items: printingOrder.rawItems, total: printingOrder.rawTotal}} store={storeSettings} />
    </div>
  )}
  </>
  );
}
