'use client';

import { useState, use, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Clock, CheckCircle2, AlertCircle, ShoppingBag, User, Phone, MapPin, Printer, Timer, X, Bike, Car } from 'lucide-react';
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
  notes: string;
  driver?: Driver | null;
  createdAt?: string;
};

const STATUS_TABS = ['Completed', 'Cancelled', 'Rejected'];

export default function StoreOrderHistoryPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [orders, setOrders] = useState<OrderType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Completed');
  const [searchQuery, setSearchQuery] = useState('');
  const [storeName, setStoreName] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Fetch store name
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
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders: OrderType[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // Strict client-side filter: Only include historical archives
        if (!['Completed', 'Cancelled', 'Rejected'].includes(data.status)) return;
        
        // Format time from createdAt
        let timeString = 'Just now';
        if (data.createdAt?.toDate) {
          const d = data.createdAt.toDate();
          timeString = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (data.createdAt) {
          const date = new Date(data.createdAt);
          if (!isNaN(date.getTime())) {
            timeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        }

        fetchedOrders.push({
          id: doc.id,
          orderNumber: data.orderNumber || doc.id.substring(0, 6).toUpperCase(),
          customerName: data.customerName || 'Unknown Customer',
          phone: data.phone || '',
          type: data.type || 'Pickup',
          address: data.address || '',
          status: data.status || 'Completed',
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
    const matchesTab = order.status === activeTab;
    const matchesSearch = order.orderNumber?.includes(searchQuery.toUpperCase()) || 
                          order.id.includes(searchQuery) || 
                          order.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

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
    txt += `Status:    ${order.status.toUpperCase()}\n`;
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
    a.download = `archive_${order.orderNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] lg:h-screen w-full bg-slate-100 items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const renderOrderDetails = (order: OrderType) => {
    return (
      <div className="flex flex-col h-full bg-white">
        {/* Detail Header */}
        <div className="p-6 lg:p-8 border-b border-slate-100 flex-shrink-0 bg-slate-50/50">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-3xl font-heading font-black text-slate-900">#{order.orderNumber}</h2>
              <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
                {order.type === 'Delivery' ? <Bike className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                {order.type} • {order.time}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-slate-900">€{order.total.toFixed(2)}</div>
              <div className="text-sm font-bold text-slate-400 mb-2">{order.items.length} items</div>
              <button 
                onClick={() => downloadTxtReceipt(order, storeName || storeId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-bold transition-colors"
                title="Download Archive Receipt"
              >
                <Printer className="w-4 h-4" /> Export
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-6">
            <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-900">{order.customerName}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                  <Phone className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-slate-600">{order.phone}</span>
              </div>
            </div>
            {order.type === 'Delivery' && order.address && (
              <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium text-slate-700 leading-relaxed">{order.address}</span>
                </div>
              </div>
            )}
          </div>

          {order.driver && (
            <div className="mt-4 flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center">
                  {order.driver.vehicle === 'Car' ? <Car className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-bold text-slate-700">{order.driver.name}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Fulfilled By Driver</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detail Body (Items) */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          {order.notes && (
            <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded-2xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-slate-600 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Customer Note</h4>
                <p className="text-slate-700 font-medium">{order.notes}</p>
              </div>
            </div>
          )}

          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Archived Items</h3>
          <div className="space-y-4">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-start justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-lg text-slate-900 shadow-sm">
                    {item.qty}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">{item.name}</h4>
                    <p className="text-slate-500 font-medium">€{item.price.toFixed(2)} each</p>
                  </div>
                </div>
                <div className="font-bold text-slate-900 text-lg">
                  €{(item.price * item.qty).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {(order.subtotal || order.vatBreakdown) && (
            <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <h4 className="font-black text-slate-900 uppercase tracking-widest text-xs mb-4">Financials & VAT</h4>
              {order.subtotal && (
                <div className="flex justify-between text-sm font-medium text-slate-600">
                  <span>Subtotal</span>
                  <span>€{order.subtotal.toFixed(2)}</span>
                </div>
              )}
              {order.discount !== undefined && order.discount > 0 && (
                <div className="flex justify-between text-sm font-bold text-emerald-600 border-b border-slate-200 pb-3 mb-3">
                  <span>Discount Applied</span>
                  <span>-€{order.discount.toFixed(2)}</span>
                </div>
              )}
              {order.vatBreakdown && Object.keys(order.vatBreakdown).length > 0 && (
                <div className="pt-2">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">VAT Breakdown Matrix</h5>
                  {Object.entries(order.vatBreakdown).map(([rate, payload]: [string, any]) => (
                    <div key={rate} className="flex justify-between text-xs font-medium text-slate-500 mb-1 border-l-2 border-slate-300 pl-2">
                      <span>TVA {rate}% (on €{payload.net.toFixed(2)})</span>
                      <span>€{payload.vatAmount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 lg:p-8 border-t border-slate-100 flex flex-col justify-center gap-2 items-center bg-slate-50 font-bold text-slate-500">
          <Clock className="w-6 h-6 mb-2 text-slate-300" />
          This order is permanently archived in history.
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] lg:h-screen w-full bg-slate-100 overflow-hidden text-slate-800">
      <div className="w-full lg:w-[400px] xl:w-[450px] bg-white border-r border-slate-200 flex flex-col h-full flex-shrink-0 z-10 shadow-xl lg:shadow-none">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h1 className="text-2xl font-heading font-black text-slate-900 mb-1 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" /> Archive
          </h1>
          <p className="text-xs text-slate-500 font-bold mb-6 tracking-wider uppercase">Order History</p>
          
          <div className="flex space-x-2">
            {STATUS_TABS.map((tab) => {
              const count = orders.filter(o => o.status === tab).length;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                    activeTab === tab
                      ? 'text-slate-900 bg-white border border-slate-200 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200 border border-transparent'
                  }`}
                >
                  {tab}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    activeTab === tab ? 'bg-slate-200 text-slate-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 bg-white border-b border-slate-100">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search history by order, name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-400 focus:ring-slate-400 focus:outline-none transition-colors bg-slate-50 font-medium text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          <AnimatePresence>
            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center h-48">
                <Search className="w-8 h-8 mb-3 text-slate-300" />
                <p className="font-medium text-sm">No historical orders found matching your criteria.</p>
              </div>
            ) : (
              filteredOrders.map((order) => (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  key={order.id}
                  onClick={() => handleOrderClick(order)}
                  className={`border-b border-slate-200 p-4 cursor-pointer transition-colors relative overflow-hidden ${
                    selectedOrder?.id === order.id ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  {selectedOrder?.id === order.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-400" />
                  )}
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-heading font-black text-lg text-slate-900">
                      #{order.orderNumber}
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      order.status === 'Completed' ? 'bg-slate-200 text-slate-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {order.status}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-slate-700 mb-1">{order.customerName}</div>
                  <div className="flex justify-between items-center mt-3">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      {order.type === 'Delivery' ? <Bike className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                      {order.type} • {order.items.length} items
                    </div>
                    <div className="text-xs font-bold text-slate-400">
                      {order.time}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="hidden lg:block flex-1 h-screen overflow-hidden bg-slate-100">
        {selectedOrder ? (
          renderOrderDetails(selectedOrder)
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white border-l border-slate-200">
            <Clock className="w-16 h-16 mb-4 opacity-20 text-slate-600" />
            <p className="font-bold text-lg">Select a highly-archived order</p>
          </div>
        )}
      </div>

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
    </div>
  );
}
