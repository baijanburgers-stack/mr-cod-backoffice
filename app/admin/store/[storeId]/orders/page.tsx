'use client';

import { useState, use, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Clock, CheckCircle2, AlertCircle, ChefHat, X, ShoppingBag, User, Phone, MapPin, Printer, Timer, ArrowRight, Check, Bike, Car, Key } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy, getDocs, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import { LiveTrackingMap } from '@/components/ui/LiveTrackingMap';
import { VatReceipt } from '@/components/ui/VatReceipt';
import FullscreenOrderAlert from '@/components/ui/FullscreenOrderAlert';

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
  total: number;
  subtotal?: number;
  discount?: number;
  vatBreakdown?: any;
  items: any[];
  notes: string;
  driver?: Driver | null;
  createdAt?: string;
  liveLocation?: { lat: number; lng: number; updatedAt?: any } | null;
  driverAssignmentStatus?: 'pending' | 'accepted' | 'rejected' | null;
  assignedDriverId?: string | null;
  orderReadyTime?: string | null;
  deliveryPin?: string;
};

const STATUS_TABS = ['Pending', 'Preparing', 'Ready', 'Out for Delivery'];

export default function StoreOrdersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [orders, setOrders] = useState<OrderType[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('New');
  const [searchQuery, setSearchQuery] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);
  const [incomingAlertOrder, setIncomingAlertOrder] = useState<OrderType | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [printMode, setPrintMode] = useState<'kds'|'vat'>('kds');
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [isDragging, setIsDragging] = useState(false);
  const [driverSelectModal, setDriverSelectModal] = useState<{orderId: string, driver: Driver} | null>(null);
  const isFirstSnapshot = useRef(true);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      let newWidth = e.clientX;
      if (newWidth < 320) newWidth = 320; // Min width for sidebar
      if (newWidth > 800) newWidth = 800; // Max reasonable width
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.body.classList.add('cursor-col-resize'); // Extra fallback
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('cursor-col-resize');
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!user) return;

    // Fetch store name and settings
    const fetchStore = async () => {
      try {
        const storeDoc = await getDoc(doc(db, 'stores', storeId));
        if (storeDoc.exists()) {
          setStoreName(storeDoc.data().name);
          setStoreSettings(storeDoc.data());
        }
      } catch (error) {
        console.error("Error fetching store name:", error);
      }
    };
    fetchStore();

    // Fetch drivers from users collection
    const fetchDrivers = async () => {
      try {
        const q1 = query(collection(db, 'users'), where('storeId', '==', storeId), where('role', '==', 'delivery'));
        const q2 = query(collection(db, 'users'), where('storeIds', 'array-contains', storeId), where('role', '==', 'delivery'));
        
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const map = new Map<string, Driver>();
        
        const processDoc = (doc: any) => {
          const data = doc.data();
          map.set(doc.id, { 
            id: doc.id, 
            name: data.name || 'Unnamed Driver',
            phone: data.phone || 'N/A',
            vehicle: data.vehicle || 'Bike',
            eta: '15 mins'
          });
        };

        snap1.forEach(processDoc);
        snap2.forEach(processDoc);
        
        setDrivers(Array.from(map.values()));
      } catch (error) {
        console.error("Error fetching drivers:", error);
      }
    };
    fetchDrivers();

    const q = query(
      collection(db, 'orders'), 
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let hasNewOrder = false;
      let newestAddedData: OrderType | null = null;
      
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if ((data.status === 'Pending' || data.status === 'New') && !isFirstSnapshot.current) {
            hasNewOrder = true;
            newestAddedData = {
              id: change.doc.id,
              orderNumber: data.orderNumber || change.doc.id.substring(0, 6).toUpperCase(),
              customerName: data.customerName || 'Unknown Customer',
              ...data
            } as OrderType;
          }
        }
      });
      
      if (hasNewOrder && newestAddedData) {
        setIncomingAlertOrder(newestAddedData);
      }

      const fetchedOrders: OrderType[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        // Strict client-side filter: Ignore historical/archived statuses on the Live Screen
        if (['Completed', 'Cancelled', 'Rejected'].includes(data.status)) return;
        
        // Format time from createdAt
        let timeString = 'Just now';
        if (data.createdAt?.toDate) {
          timeString = data.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (data.createdAt) {
          const date = new Date(data.createdAt);
          if (!isNaN(date.getTime())) {
            timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        }

        fetchedOrders.push({
          id: docSnap.id,
          orderNumber: data.orderNumber || docSnap.id.substring(0, 6).toUpperCase(),
          customerName: data.customerName || 'Unknown Customer',
          phone: data.phone || '',
          type: data.type || 'Pickup',
          address: data.address || '',
          status: data.status || 'New',
          time: timeString,
          total: data.total || 0,
          subtotal: data.subtotal || 0,
          discount: data.discount || 0,
          vatBreakdown: data.vatBreakdown || null,
          items: (data.items || []).map((item: any) => ({
            ...item,
            name: item.name || 'Unknown Item',
            qty: item.quantity || 1,
            price: item.price || 0
          })),
          notes: data.notes || '',
          driver: data.driver || null,
          createdAt: data.createdAt,
          liveLocation: data.liveLocation || null,
          driverAssignmentStatus: data.driverAssignmentStatus || null,
          assignedDriverId: data.assignedDriverId || null,
          orderReadyTime: data.orderReadyTime || null,
          deliveryPin: data.deliveryPin || null
        });
      });
      
      isFirstSnapshot.current = false;
      setOrders(fetchedOrders);
      
      // Update selected order if it exists
      setSelectedOrder(prev => {
        if (prev) {
          const updatedSelected = fetchedOrders.find(o => o.id === prev.id);
          if (updatedSelected) {
            return updatedSelected;
          }
        } else if (fetchedOrders.length > 0) {
          // Auto-select first Pending order if none selected
          const firstPending = fetchedOrders.find(o => o.status === 'Pending' || o.status === 'New');
          if (firstPending) return firstPending;
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
    // If we're looking for Pending, also show New for backward compatibility
    const matchesTab = (activeTab === 'Pending' && (order.status === 'Pending' || order.status === 'New')) || order.status === activeTab;
    const matchesSearch = order.orderNumber?.includes(searchQuery.toUpperCase()) || 
                          order.id.includes(searchQuery) || 
                          order.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const orderToUpdate = orders.find(o => o.id === orderId);
      const updates: any = { status: newStatus };

      // Auto-generate Handover PIN
      if (newStatus === 'Preparing' && orderToUpdate?.type === 'Delivery') {
        updates.deliveryPin = Math.floor(1000 + Math.random() * 9000).toString();
      }

      await updateDoc(doc(db, 'orders', orderId), updates);
      if (selectedOrder && selectedOrder.id === orderId) {
        setIsMobileDetailOpen(false);
        if (STATUS_TABS.includes(newStatus)) {
          setActiveTab(newStatus); // Follow the order to the next tab
        } else {
          setSelectedOrder(null); // Drop order from Live View
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const assignDriverWithTime = async (orderId: string, driver: Driver, readyTime: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { 
        driver, 
        assignedDriverId: driver.id,
        driverAssignmentStatus: 'pending',
        orderReadyTime: readyTime 
      });
      setDriverSelectModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const clearDriverAssignment = async (orderId: string) => {
     try {
       await updateDoc(doc(db, 'orders', orderId), { 
          driver: null, 
          assignedDriverId: null,
          driverAssignmentStatus: null,
          orderReadyTime: null 
       });
     } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
     }
  };

  const handleOrderClick = (order: OrderType) => {
    setSelectedOrder(order);
    setIsMobileDetailOpen(true);
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
    
    // Header
    txt += center(store.toUpperCase(), width) + '\n';
    txt += divider;
    txt += `Order:     #${order.orderNumber}\n`;
    txt += `Type:      ${order.type.toUpperCase()}\n`;
    txt += `Time:      ${order.time}\n`;
    txt += subDivider;
    
    // Customer
    txt += `Customer:  ${order.customerName}\n`;
    txt += `Phone:     ${order.phone}\n`;
    if (order.type === 'Delivery' && order.address) {
      txt += `Address:   ${order.address}\n`;
    }
    txt += subDivider;

    // Items Header
    txt += pad('QTY', 4) + pad('ITEM', 28) + pad('PRICE', 10) + '\n';
    txt += subDivider;

    // Items
    order.items.forEach(item => {
      const qtyStr = `${item.qty}x`;
      let nameStr = item.name;
      const priceStr = `€${(item.price * item.qty).toFixed(2)}`;
      
      // Truncate name if too long
      if (nameStr.length > 26) {
        nameStr = nameStr.substring(0, 26);
      }
      
      txt += pad(qtyStr, 4) + pad(nameStr, 28) + pad(priceStr, 10) + '\n';
    });
    txt += subDivider;

    // Total
    txt += pad('TOTAL', 32) + pad(`€${order.total.toFixed(2)}`, 10) + '\n';
    txt += divider;

    // Notes
    if (order.notes) {
      txt += `Notes:\n${order.notes}\n`;
      txt += divider;
    }

    txt += '\n';
    txt += center('END OF RECEIPT', width) + '\n';
    txt += '\n\n';

    // Download Blob
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${order.orderNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] lg:h-screen w-full bg-slate-100 items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const getActionConfig = (order: OrderType) => {
    switch (order.status) {
      case 'Pending':
      case 'New':
        return { 
          label: 'Accept Order', 
          color: 'bg-emerald-500 hover:bg-emerald-400 text-white', 
          icon: CheckCircle2, 
          next: 'Preparing', 
          disabled: false,
          secondary: {
            label: 'Reject',
            color: 'bg-rose-50 text-rose-500 hover:bg-rose-100',
            next: 'Rejected'
          }
        };
      case 'Preparing':
        return { label: 'Mark as Ready', color: 'bg-blue-500 hover:bg-blue-400 text-white', icon: CheckCircle2, next: 'Ready', disabled: false };
      case 'Ready':
        if (order.type === 'Delivery') {
          if (!order.driver) {
            return { label: 'Assign Driver Required', color: 'bg-slate-300 text-slate-500 cursor-not-allowed', icon: Bike, next: 'Ready', disabled: true };
          }
          return { label: 'Dispatch to Driver', color: 'bg-amber-500 hover:bg-amber-400 text-slate-900', icon: Bike, next: 'Out for Delivery', disabled: false };
        }
        return { label: 'Complete Order', color: 'bg-slate-900 hover:bg-slate-800 text-white', icon: Check, next: 'Completed', disabled: false };
      case 'Out for Delivery':
        return { label: 'Mark Delivered', color: 'bg-slate-900 hover:bg-slate-800 text-white', icon: Check, next: 'Completed', disabled: false };
      default:
        return null;
    }
  };

  const renderOrderDetails = (order: OrderType) => {
    const action = getActionConfig(order);

    return (
      <div className="flex flex-col h-full bg-slate-50 font-sans">
        {/* Detail Header / Metadata Block */}
        <div className="relative p-6 lg:p-10 pb-8 bg-white border-b border-slate-200 flex-shrink-0 z-10 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                <h2 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 leading-none">#{order.orderNumber}</h2>
                <div className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 ${order.type === 'Delivery' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {order.type === 'Delivery' ? <Bike className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                  {order.type.toUpperCase()}
                </div>
              </div>
              <p className="text-slate-500 font-bold flex items-center gap-2">
                <Timer className="w-4 h-4 text-slate-400" />
                {order.time}
              </p>
            </div>
            <div className="text-right flex items-center justify-end gap-2 shrink-0">
              <button 
                onClick={() => { setPrintMode('kds'); setTimeout(() => window.print(), 100); }}
                className="w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all shadow-sm print:hidden"
                title="Print Kitchen Ticket"
              >
                <Printer className="w-5 h-5" />
              </button>
              <button 
                onClick={() => { setPrintMode('vat'); setTimeout(() => window.print(), 100); }}
                className="px-4 h-12 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs uppercase tracking-widest flex items-center justify-center transition-all shadow-sm print:hidden"
                title="Download Legal VAT Receipt"
              >
                VAT
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">{order.customerName}</div>
                <div className="text-xs font-bold text-slate-500">{order.phone}</div>
              </div>
            </div>
            {order.type === 'Delivery' && order.address && (
              <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">Delivery Address</div>
                  <div className="text-xs font-medium text-slate-500 truncate">{order.address}</div>
                </div>
              </div>
            )}
            
            {order.type === 'Delivery' && order.deliveryPin && (
              <div className="md:col-span-2 flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200 shadow-sm mt-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                    <Key className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-amber-900 truncate">Delivery PIN</div>
                    <div className="text-xs font-bold text-amber-700/80 truncate">Provide to driver/customer if lost</div>
                  </div>
                </div>
                <div className="font-mono text-2xl font-black text-amber-600 tracking-[0.2em] bg-white px-5 py-2 rounded-lg border border-amber-200 shadow-sm">
                  {order.deliveryPin}
                </div>
              </div>
            )}
          </div>

          {/* Delivery Assignment Module inside Header context */}
          {order.type === 'Delivery' && (order.status === 'Ready' || order.status === 'Preparing' || order.status === 'New' || order.status === 'Out for Delivery') && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Driver Assignment</h3>
                {order.driver && (
                  <button 
                    onClick={() => clearDriverAssignment(order.id)} 
                    className="text-xs font-bold text-indigo-500 hover:text-indigo-600 transition-colors"
                  >
                    REASSIGN
                  </button>
                )}
              </div>
              
              {order.driver ? (
                <div className={`flex items-center justify-between p-3.5 border rounded-2xl shadow-inner ${
                  order.driverAssignmentStatus === 'rejected' ? 'bg-rose-50 border-rose-200' : 'bg-indigo-50 border-indigo-100'
                }`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full shadow-sm flex items-center justify-center bg-white ${
                      order.driverAssignmentStatus === 'rejected' ? 'text-rose-600' : 'text-indigo-600'
                    }`}>
                      {order.driver.vehicle === 'Car' ? <Car className="w-6 h-6" /> : <Bike className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className={`font-black ${order.driverAssignmentStatus === 'rejected' ? 'text-rose-900' : 'text-indigo-900'}`}>{order.driver.name}</div>
                      <div className={`text-xs font-bold uppercase tracking-wide ${order.driverAssignmentStatus === 'rejected' ? 'text-rose-700/80' : 'text-indigo-700/80'}`}>
                        {order.driverAssignmentStatus === 'pending' ? '⏳ Awaiting Response...' :
                         order.driverAssignmentStatus === 'rejected' ? '❌ REJECTED!' :
                         order.driverAssignmentStatus === 'accepted' ? '✅ Accepted' :
                         `${order.driver.vehicle} • ${order.driver.eta}`}
                      </div>
                    </div>
                  </div>
                  {order.driverAssignmentStatus === 'accepted' || !order.driverAssignmentStatus ? (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
                      <Check className="w-5 h-5" />
                    </div>
                  ) : order.driverAssignmentStatus === 'rejected' ? (
                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-500">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100/50 flex items-center justify-center text-indigo-400">
                      <Timer className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                </div>
              ) : driverSelectModal?.orderId === order.id ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-sm font-black text-amber-900 uppercase tracking-widest">
                      Ready Time for {driverSelectModal.driver.name}
                    </div>
                    <button onClick={() => setDriverSelectModal(null)} className="text-amber-500 hover:text-amber-700">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['Now', '5 mins', '10 mins', '15 mins', '20 mins', '30 mins'].map(time => (
                      <button
                        key={time}
                        onClick={() => assignDriverWithTime(order.id, driverSelectModal.driver, time)}
                        className="py-2.5 font-bold text-sm bg-white border border-amber-200 text-amber-900 rounded-xl hover:bg-amber-100 hover:border-amber-400 transition-all active:scale-95 shadow-sm"
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
                  {drivers.map(driver => {
                    const activeCount = orders.filter(o => o.driver?.id === driver.id && o.status !== 'Completed').length;
                    return (
                      <button
                        key={driver.id}
                        onClick={() => setDriverSelectModal({orderId: order.id, driver})}
                        className="flex-shrink-0 w-[140px] flex flex-col items-center p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-400 hover:shadow-lg transition-all group"
                      >
                        <div className="relative mb-2">
                          <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-200 text-slate-400 group-hover:text-indigo-500 flex items-center justify-center transition-colors">
                            {driver.vehicle === 'Car' ? <Car className="w-6 h-6" /> : <Bike className="w-6 h-6" />}
                          </div>
                          {activeCount > 0 && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-sm">
                              {activeCount}
                            </div>
                          )}
                        </div>
                        <div className="font-bold text-slate-900 text-sm truncate w-full text-center">{driver.name}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Map Injection */}
          {order.status === 'Out for Delivery' && order.liveLocation && (
            <div className="px-6 lg:px-10 pb-6">
              <div className="w-full h-64 rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-4">
                <LiveTrackingMap location={order.liveLocation} />
              </div>
            </div>
          )}
        </div>

        {/* Detail Body (Receipt Items) */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 relative">
          <div className="bg-white mx-auto max-w-2xl rounded-sm border border-slate-200 shadow-sm relative before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSI4Ij48cGF0aCBkPSJNMCAwdjhsNS01IDUgNSA1LTUgNSA1VjB6IiBmaWxsPSIjZmZmZmZmIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=')] before:bg-repeat-x after:absolute after:-bottom-2 after:left-0 after:right-0 after:h-2 after:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSI4Ij48cGF0aCBkPSJNMCA4VjBsNSA1IDUtNSA1IDUgNS01djh6IiBmaWxsPSIjZmZmZmZmIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=')] after:bg-repeat-x z-0">
            <div className="px-6 py-8 relative shadow-[inset_0_0_40px_rgba(0,0,0,0.02)]">
              {order.notes && (
                <div className="mb-8 p-4 bg-rose-50 border border-red-200/50 rounded-xl flex gap-3 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-400"></div>
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-black text-red-900 text-xs uppercase tracking-widest mb-1">Customer Note</h4>
                    <p className="text-red-800 font-bold text-sm italic">{order.notes}</p>
                  </div>
                </div>
              )}

              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-dashed border-slate-200 text-slate-400 text-xs font-black uppercase tracking-widest">
                    <th className="pb-3 w-12 text-center">Qty</th>
                    <th className="pb-3 w-full">Item</th>
                    <th className="pb-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="text-slate-900 font-medium text-lg leading-relaxed">
                  {order.items.map((item, i) => (
                    <tr key={i} className="border-b border-dashed border-slate-100 last:border-b-0">
                      <td className="py-4 align-top text-center">
                        <span className="font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md inline-block">{item.qty}</span>
                      </td>
                      <td className="py-4 align-top pr-4">
                        <div className="font-bold text-slate-800">{item.name}</div>
                        {item.price > 0 && <div className="text-sm font-bold text-slate-400 mt-1">€{item.price.toFixed(2)} / ea</div>}
                      </td>
                      <td className="py-4 align-top text-right font-black whitespace-nowrap">
                        €{(item.price * item.qty).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-8 pt-6 border-t-[3px] border-double border-slate-200 flex flex-wrap justify-between items-end gap-2">
                <span className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest">Total Amount</span>
                <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter leading-none">€{order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Detail Footer (Massive Edge-to-Edge Action) */}
        <div className="p-4 sm:p-6 lg:p-8 border-t border-slate-200 bg-white flex-shrink-0 z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
          {action ? (
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              {action.secondary && (
                <button
                  onClick={() => updateOrderStatus(order.id, action.secondary!.next)}
                  className={`w-full sm:flex-1 py-4 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-lg sm:text-xl tracking-tight transition-all flex items-center justify-center gap-3 sm:gap-4 ${action.secondary.color}`}
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  {action.secondary.label}
                </button>
              )}
              <button
                disabled={action.disabled}
                onClick={() => {
                  if (!action.disabled) {
                    updateOrderStatus(order.id, action.next);
                  }
                }}
                className={`w-full ${action.secondary ? 'sm:flex-[2]' : ''} py-4 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-xl sm:text-2xl tracking-tight shadow-xl transition-all flex items-center justify-center gap-3 sm:gap-4 ${action.color} ${!action.disabled ? 'hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98]' : ''} ${action.color.includes('amber') ? 'shadow-amber-500/30' : action.color.includes('emerald') ? 'shadow-emerald-500/30' : action.color.includes('blue') ? 'shadow-blue-500/30' : 'shadow-slate-900/20'}`}
              >
                <action.icon className="w-6 h-6 sm:w-8 sm:h-8" />
                {action.label}
              </button>
            </div>
          ) : (
            <div className="w-full py-6 rounded-3xl font-black text-2xl tracking-tight bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center gap-3">
              <CheckCircle2 className="w-7 h-7" />
              Order Completed
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div 
      className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] lg:h-screen w-full bg-slate-100 overflow-hidden font-sans"
      style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
    >
      
      {/* Left Panel: Order Queue */}
      <div className="w-full lg:w-[var(--sidebar-width)] bg-white border-r border-slate-200 flex flex-col h-full flex-shrink-0 z-20 shadow-2xl lg:shadow-none transition-[width] duration-0">
        {/* Header */}
        <div className="pt-8 pb-4 px-6 border-b border-slate-100 bg-white shadow-sm z-10">
          <h1 className="text-3xl font-heading font-black text-slate-900 mb-1 tracking-tight">Active Orders</h1>
          <p className="text-sm text-slate-400 font-bold mb-6 tracking-widest uppercase">{storeName || 'Queue'}</p>
          
          {/* iOS Segmented Control styled tabs */}
          <div className="flex p-1 bg-slate-100/80 rounded-2xl overflow-x-auto scrollbar-hide">
            {STATUS_TABS.map((tab) => {
              const count = orders.filter(o => o.status === tab).length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-shrink-0 flex-1 px-4 py-2.5 rounded-xl font-bold transition-all relative ${
                    isActive ? 'text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="activeQueueTabSegment"
                      className="absolute inset-0 bg-white rounded-xl shadow-sm border border-slate-200/50"
                      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center gap-2 whitespace-nowrap text-sm">
                    {tab}
                    {count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tracking-wider ${
                        isActive && (tab === 'Pending' || tab === 'New') ? 'bg-amber-500 text-white animate-pulse' : 
                        isActive ? 'bg-slate-200 text-slate-700' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Order List */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F8FAFC] space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredOrders.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-slate-50 shadow-sm">
                  <CheckCircle2 className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-black text-slate-400 font-heading">Queue Clear</h3>
                <p className="text-slate-400 font-medium text-sm mt-1">No {activeTab.toLowerCase()} orders right now</p>
              </motion.div>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                const isNew = order.status === 'New';
                
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -10 }}
                    key={order.id}
                    onClick={() => handleOrderClick(order)}
                    className={`relative p-5 rounded-3xl cursor-pointer transition-all border-2 overflow-hidden bg-white ${
                      isSelected 
                        ? 'border-amber-400 shadow-xl shadow-amber-500/10 transform scale-[1.02]' 
                        : (order.status === 'Pending' || order.status === 'New')
                          ? 'border-transparent hover:border-amber-300 shadow-lg shadow-slate-200/50' 
                          : 'border-transparent hover:border-slate-300 hover:shadow-lg shadow-md shadow-slate-200/50'
                    }`}
                  >
                    {(order.status === 'Pending' || order.status === 'New') && !isSelected && (
                      <div className="absolute top-0 right-0 w-2 h-full bg-amber-400" />
                    )}
                    
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="font-black text-2xl tracking-tighter text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">#{order.orderNumber}</span>
                      </div>
                      <span className="text-slate-400 font-bold flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md text-sm">
                        <Timer className="w-4 h-4 text-slate-400" />
                        {order.time}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <p className="font-bold text-slate-800 text-lg truncate pr-4">{order.customerName}</p>
                      
                      <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-md ${order.type === 'Delivery' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {order.type === 'Delivery' ? <Bike className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                          </div>
                          <span className="text-sm font-bold text-slate-600">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                        </div>
                        <span className="text-base font-black text-slate-900">€{order.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Draggable Resizer Handle (Desktop Only) */}
      <div 
        className={`hidden lg:block w-1.5 z-30 transition-colors flex-shrink-0 relative group cursor-col-resize select-none ${isDragging ? 'bg-amber-400' : 'bg-slate-200 hover:bg-amber-300'}`}
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
      >
        {/* Subtle grab indicator */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-0.5 rounded-full pointer-events-none transition-colors ${isDragging ? 'bg-amber-700/50' : 'bg-slate-400/50 group-hover:bg-amber-700/50'}`} />
      </div>

      {/* Right Panel: Order Details (Desktop) */}
      <div className="hidden lg:flex flex-1 h-screen overflow-hidden bg-slate-50 relative">
        <div className="absolute inset-0 bg-[#F8FAFC] z-0" />
        <div className="relative z-10 flex-1 w-full flex flex-col">
          {selectedOrder ? (
            renderOrderDetails(selectedOrder)
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <div className="w-32 h-32 rounded-full bg-white shadow-xl shadow-slate-200/50 flex items-center justify-center mb-8 border border-slate-100">
                <ShoppingBag className="w-12 h-12 text-slate-300" />
              </div>
              <p className="font-heading font-black text-4xl tracking-tight text-slate-400">Ready for Orders</p>
              <p className="font-bold text-slate-400 mt-3 text-lg">Select an order from the queue to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Details Modal (Slide Up) */}
      <AnimatePresence>
        {isMobileDetailOpen && selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end"
          >
            <div className="absolute inset-0" onClick={() => setIsMobileDetailOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full h-[90vh] bg-white rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="absolute top-4 right-4 z-10">
                <button 
                  onClick={() => setIsMobileDetailOpen(false)}
                  className="p-2 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              {renderOrderDetails(selectedOrder)}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Thermal Printer Receipt View */}
      {selectedOrder && printMode === 'kds' && (
        <div className="hidden print:block thermal-receipt">
          <div className="text-center font-bold text-xl mb-2">{storeName ? storeName.toUpperCase() : 'STORE'}</div>
          <div className="text-center border-b-2 border-black border-dashed pb-2 mb-2">
            <div>Order: #{selectedOrder.orderNumber}</div>
            <div className="font-bold text-lg">{selectedOrder.type.toUpperCase()}</div>
            <div>Time: {selectedOrder.time}</div>
          </div>
          
          <div className="border-b-2 border-black border-dashed pb-2 mb-2 break-words">
            <div>Customer: {selectedOrder.customerName}</div>
            <div>Phone: {selectedOrder.phone}</div>
            {selectedOrder.type === 'Delivery' && selectedOrder.address && (
              <div>Address: {selectedOrder.address}</div>
            )}
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
              {selectedOrder.items.map((item, idx) => (
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
            <div className="flex justify-between font-bold text-lg">
              <span>TOTAL</span>
              <span>€{selectedOrder.total.toFixed(2)}</span>
            </div>
          </div>

          {selectedOrder.notes && (
            <div className="border border-black p-1 mb-4 italic text-sm">
              <span className="font-bold border-b border-black block mb-1">NOTES:</span>
              {selectedOrder.notes}
            </div>
          )}
          
          <div className="text-center mt-4">
            *** END OF RECEIPT ***
          </div>
        </div>
      )}
      {/* VAT Print Layout */}
      {selectedOrder && printMode === 'vat' && storeSettings && (
        <VatReceipt order={selectedOrder} store={storeSettings} />
      )}
      <audio id="order-sound" preload="auto" />

      {incomingAlertOrder && (
        <FullscreenOrderAlert 
          orderNumber={incomingAlertOrder.orderNumber}
          customerName={incomingAlertOrder.customerName}
          title="New Order Received"
          subtitle="A customer just placed a new order."
          type="restaurant"
          buttonText="Show Order"
          onAccept={() => {
            setIncomingAlertOrder(null);
            setSelectedOrder(incomingAlertOrder);
            setActiveTab('Pending');
            setIsMobileDetailOpen(true);
          }}
        />
      )}
    </div>
  );
}
