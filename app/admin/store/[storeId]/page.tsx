'use client';

import { use, useState, useEffect, useCallback } from 'react';
import {
  Package, ShoppingBag, Edit,
  Map, MapPin, Plus, Trash2, X,
  ArrowUpRight, Activity, DollarSign,
  Store, Users, ExternalLink, Clock, CheckCircle2, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

// ── Types & Constants ────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type Day = typeof DAYS[number];

interface DayHours { isOpen: boolean; open: string; close: string; }
type WeekSchedule = Record<Day, DayHours>;

const DEFAULT_SCHEDULE: WeekSchedule = {
  Monday:    { isOpen: true,  open: '11:00', close: '22:00' },
  Tuesday:   { isOpen: true,  open: '11:00', close: '22:00' },
  Wednesday: { isOpen: true,  open: '11:00', close: '22:00' },
  Thursday:  { isOpen: true,  open: '11:00', close: '22:00' },
  Friday:    { isOpen: true,  open: '11:00', close: '23:00' },
  Saturday:  { isOpen: true,  open: '11:00', close: '23:00' },
  Sunday:    { isOpen: false, open: '12:00', close: '21:00' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseOrderDate(data: any): Date {
  if (data.createdAt?.toDate) return data.createdAt.toDate();
  if (data.createdAt) { const d = new Date(data.createdAt); if (!isNaN(d.getTime())) return d; }
  return new Date();
}

function getPlatform(data: any): string {
  const raw = (data.platform || data.source || 'online').toLowerCase();
  return raw === 'pos' ? 'POS' : raw === 'kiosk' ? 'Kiosk' : 'Online';
}

function dayLabel(date: Date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xl border border-slate-700">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="text-white">{p.name === 'Revenue' ? `€${Number(p.value).toFixed(2)}` : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Component ────────────────────────────────────────────────────────────────

export default function StoreAdminDashboard({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [storeName, setStoreName] = useState('');
  const [activeMenuCount, setActiveMenuCount] = useState(0);
  const [orders, setOrders] = useState<any[]>([]);
  const [successMessage, setSuccessMessage] = useState('');

  // Weekly schedules
  const [schedule, setSchedule] = useState<WeekSchedule>(DEFAULT_SCHEDULE);
  const [onlineSchedule, setOnlineSchedule] = useState<WeekSchedule>(DEFAULT_SCHEDULE);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleTab, setScheduleTab] = useState<'store' | 'online'>('store');

  // Delivery zones
  const [deliveryZones, setDeliveryZones] = useState<any[]>([]);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<any>(null);
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3500);
  };

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return; // wait for auth before opening Firestore listeners
    const storeUnsub = onSnapshot(
      doc(db, 'stores', storeId),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setStoreName(d.name || '');
          if (!schedulesLoaded) {
            if (d.weeklySchedule) setSchedule({ ...DEFAULT_SCHEDULE, ...d.weeklySchedule });
            if (d.onlineOrderingSchedule) setOnlineSchedule({ ...DEFAULT_SCHEDULE, ...d.onlineOrderingSchedule });
            setSchedulesLoaded(true);
          }
        }
      },
      (err) => console.error('Store snapshot error:', err.code, err.message)
    );
    const menuUnsub = onSnapshot(
      query(collection(db, 'menuItems'), where('storeId', '==', storeId)),
      (snap) => setActiveMenuCount(snap.size),
      (err) => console.error('Menu snapshot error:', err.code)
    );
    return () => { storeUnsub(); menuUnsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const date = parseOrderDate(data);
        list.push({ id: d.id, status: data.status || 'New', platform: getPlatform(data), timestamp: date.getTime(), total: data.total || 0 });
      });
      setOrders(list);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'orders'));
    return () => unsub();
  }, [storeId, user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'deliveryZones'), where('storeId', '==', storeId)),
      (snap) => setDeliveryZones(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (e) => handleFirestoreError(e, OperationType.GET, 'deliveryZones')
    );
    return () => unsub();
  }, [storeId, user]);

  // ── Schedule helpers ───────────────────────────────────────────────────────

  const updateDay = useCallback((day: Day, field: keyof DayHours, value: string | boolean) => {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }, []);

  const updateOnlineDay = useCallback((day: Day, field: keyof DayHours, value: string | boolean) => {
    setOnlineSchedule(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }, []);

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const field = scheduleTab === 'store' ? 'weeklySchedule' : 'onlineOrderingSchedule';
      const data = scheduleTab === 'store' ? schedule : onlineSchedule;
      await updateDoc(doc(db, 'stores', storeId), { [field]: data });
      showSuccess(scheduleTab === 'store' ? 'Store hours saved!' : 'Online ordering hours saved!');
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, `stores/${storeId}`); }
    finally { setSavingSchedule(false); }
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayOrders = orders.filter(o => o.timestamp >= todayStart.getTime());
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const pendingCount = orders.filter(o => ['New', 'Pending', 'Preparing'].includes(o.status)).length;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStart); d.setDate(d.getDate() - (6 - i));
    const end = new Date(d); end.setHours(23, 59, 59, 999);
    const dayOrders = orders.filter(o => o.timestamp >= d.getTime() && o.timestamp <= end.getTime());
    return { day: dayLabel(d), Orders: dayOrders.length, Revenue: parseFloat(dayOrders.reduce((s, o) => s + o.total, 0).toFixed(2)) };
  });

  const statusData = [
    { name: 'Pending',   value: orders.filter(o => ['New','Pending'].includes(o.status)).length,           color: '#F59E0B' },
    { name: 'Preparing', value: orders.filter(o => o.status === 'Preparing').length,                       color: '#3B82F6' },
    { name: 'Ready',     value: orders.filter(o => o.status === 'Ready').length,                           color: '#10B981' },
    { name: 'Completed', value: orders.filter(o => o.status === 'Completed').length,                       color: '#64748B' },
    { name: 'Cancelled', value: orders.filter(o => ['Cancelled','Rejected'].includes(o.status)).length,    color: '#F43F5E' },
  ].filter(s => s.value > 0);

  const platformData = [
    { name: 'Online', value: orders.filter(o => o.platform === 'Online').length, revenue: orders.filter(o => o.platform === 'Online').reduce((s, o) => s + o.total, 0), color: '#0EA5E9' },
    { name: 'Kiosk',  value: orders.filter(o => o.platform === 'Kiosk').length,  revenue: orders.filter(o => o.platform === 'Kiosk').reduce((s, o) => s + o.total, 0),  color: '#F59E0B' },
    { name: 'POS',    value: orders.filter(o => o.platform === 'POS').length,    revenue: orders.filter(o => o.platform === 'POS').reduce((s, o) => s + o.total, 0),    color: '#8B5CF6' },
  ];

  const stats = [
    { label: "Today's Orders",  value: todayOrders.length,          icon: ShoppingBag, iconBg: 'bg-violet-100', iconColor: 'text-violet-600', href: `/admin/store/${storeId}/orders/history` },
    { label: "Today's Revenue", value: `€${todayRevenue.toFixed(2)}`, icon: DollarSign,  iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', href: `/admin/store/${storeId}/orders/history` },
    { label: 'Menu Items',      value: activeMenuCount,              icon: Package,     iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   href: `/admin/store/${storeId}/menu` },
    { label: 'In Progress',     value: pendingCount,                 icon: Activity,    iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  href: `/admin/store/${storeId}/orders/history` },
  ];

  // ── Zone Actions ───────────────────────────────────────────────────────────

  const handleSaveZone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = { name: fd.get('name'), radius: fd.get('radius'), fee: fd.get('fee'), minOrder: fd.get('minOrder'), status: fd.get('status') };
    try {
      if (editingZone) await updateDoc(doc(db, 'deliveryZones', editingZone.id), payload);
      else await addDoc(collection(db, 'deliveryZones'), { storeId, ...payload });
      setIsZoneModalOpen(false);
    } catch (e) { handleFirestoreError(e, editingZone ? OperationType.UPDATE : OperationType.CREATE, 'deliveryZones'); }
  };

  const confirmDeleteZone = async () => {
    if (!zoneToDelete) return;
    try { await deleteDoc(doc(db, 'deliveryZones', zoneToDelete)); setZoneToDelete(null); }
    catch (e) { handleFirestoreError(e, OperationType.DELETE, `deliveryZones/${zoneToDelete}`); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-1 w-full bg-gradient-to-r from-red-600 via-rose-500 to-orange-500" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Toast */}
        <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.95 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl font-bold flex items-center gap-3 border border-slate-700"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              {successMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/30">
                <Store className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                {storeName || storeId}
              </h1>
            </div>
            <p className="text-sm font-medium text-slate-500 ml-[52px]">Store management — real-time analytics</p>
          </div>
          <Link href={`/admin/store/${storeId}/settings`}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl font-bold text-sm transition-all shadow-sm hover:shadow-md">
            <Edit className="w-4 h-4 text-slate-500" />
            Store Settings
          </Link>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Link href={s.href} className="block bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.iconBg}`}>
                    <s.icon className={`w-5 h-5 ${s.iconColor}`} />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
                <div className="text-2xl font-black text-slate-900 mb-1">{s.value}</div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{s.label}</div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* ── Row 1: Area Chart + Donut ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-black text-slate-900">Orders &amp; Revenue</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Last 7 days</p>
              </div>
              <Link href={`/admin/store/${storeId}/orders/history`}
                className="text-xs font-black text-slate-400 hover:text-red-600 flex items-center gap-1 transition-colors">
                Full Log <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={last7Days} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fontWeight: 700, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="orders" tick={{ fontSize: 11, fontWeight: 700, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="revenue" orientation="right" tick={{ fontSize: 11, fontWeight: 700, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Area yAxisId="orders" type="monotone" dataKey="Orders" stroke="#EF4444" strokeWidth={2.5} fill="url(#gradOrders)" dot={{ r: 3, fill: '#EF4444', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                <Area yAxisId="revenue" type="monotone" dataKey="Revenue" stroke="#8B5CF6" strokeWidth={2.5} fill="url(#gradRevenue)" dot={{ r: 3, fill: '#8B5CF6', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                <Legend formatter={(v) => <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>{v}</span>} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
            <div className="mb-4">
              <h3 className="font-black text-slate-900">Order Status</h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">All time distribution</p>
            </div>
            {statusData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-medium">No orders yet.</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3} dataKey="value" stroke="none">
                      {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-2">
                  {statusData.map(s => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="font-bold text-slate-600">{s.name}</span>
                      </div>
                      <span className="font-black text-slate-900">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </div>

        {/* ── Row 2: Platform Bar + Weekly Schedule ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* Platform bar 2/3 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-black text-slate-900">Platform Breakdown</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Orders &amp; revenue by source</p>
              </div>
              <Users className="w-4 h-4 text-slate-300" />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={platformData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={6} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 700, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="orders" tick={{ fontSize: 11, fontWeight: 700, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="revenue" orientation="right" tick={{ fontSize: 11, fontWeight: 700, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar yAxisId="orders" dataKey="value" name="Orders" radius={[6, 6, 0, 0]}>
                  {platformData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
                </Bar>
                <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
                  {platformData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.35} />)}
                </Bar>
                <Legend formatter={(v) => <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>{v}</span>} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* ── Weekly Schedule (tabbed) 1/3 ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">

            {/* Card header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-600 flex-shrink-0" />
                <h3 className="font-black text-slate-900 text-sm">Opening Hours</h3>
              </div>
              <button
                onClick={saveSchedule}
                disabled={savingSchedule}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg font-black text-xs transition-colors shadow-md shadow-red-600/20"
              >
                <Save className="w-3 h-3" />
                {savingSchedule ? 'Saving…' : 'Save'}
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              {([
                { key: 'store',  label: 'Store Hours',    desc: 'Physical opening' },
                { key: 'online', label: 'Online Orders',  desc: 'Order acceptance' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setScheduleTab(tab.key)}
                  className={`flex-1 px-3 py-2.5 text-left transition-colors border-b-2 -mb-px ${
                    scheduleTab === tab.key
                      ? 'border-red-600 bg-red-50/50'
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className={`text-[11px] font-black ${scheduleTab === tab.key ? 'text-red-600' : 'text-slate-600'}`}>{tab.label}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{tab.desc}</div>
                </button>
              ))}
            </div>

            {/* Schedule rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {DAYS.map(day => {
                const h = scheduleTab === 'store' ? schedule[day] : onlineSchedule[day];
                const onToggle = () => scheduleTab === 'store'
                  ? updateDay(day, 'isOpen', !h.isOpen)
                  : updateOnlineDay(day, 'isOpen', !h.isOpen);
                const onTimeChange = (field: 'open' | 'close', val: string) =>
                  scheduleTab === 'store' ? updateDay(day, field, val) : updateOnlineDay(day, field, val);
                return (
                  <div key={day} className={`px-4 py-2.5 flex items-center gap-3 ${h.isOpen ? '' : 'bg-slate-50/60'}`}>
                    <button
                      onClick={onToggle}
                      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${h.isOpen ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${h.isOpen ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <span className={`text-xs font-black w-8 flex-shrink-0 ${h.isOpen ? 'text-slate-700' : 'text-slate-400'}`}>{day.slice(0, 3)}</span>
                    {h.isOpen ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input type="time" value={h.open} onChange={e => onTimeChange('open', e.target.value)}
                          className="flex-1 min-w-0 text-xs font-bold text-slate-800 border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:bg-white focus:border-slate-400 outline-none" />
                        <span className="text-slate-300 text-xs font-bold flex-shrink-0">–</span>
                        <input type="time" value={h.close} onChange={e => onTimeChange('close', e.target.value)}
                          className="flex-1 min-w-0 text-xs font-bold text-slate-800 border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:bg-white focus:border-slate-400 outline-none" />
                      </div>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50">
              <p className="text-[10px] text-slate-400 font-medium">
                {scheduleTab === 'store'
                  ? 'Physical store hours shown on your profile.'
                  : 'Cut-off times for accepting new online orders.'}
              </p>
            </div>
          </motion.div>

        </div>

        {/* ── Delivery Zones ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Map className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900">Delivery Zones</h3>
                <p className="text-xs text-slate-400 font-medium">{deliveryZones.length} zone{deliveryZones.length !== 1 ? 's' : ''} configured</p>
              </div>
            </div>
            <button onClick={() => { setEditingZone(null); setIsZoneModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-sm transition-colors shadow-lg shadow-red-600/20">
              <Plus className="w-4 h-4" /> Add Zone
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-6 py-3">Zone Name</th>
                  <th className="px-6 py-3">Radius</th>
                  <th className="px-6 py-3">Fee</th>
                  <th className="px-6 py-3">Min. Order</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {deliveryZones.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400 font-medium text-sm">No delivery zones yet. Add one above.</td></tr>
                ) : deliveryZones.map(zone => (
                  <tr key={zone.id} className="hover:bg-slate-50/70 transition-colors group">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2 font-bold text-slate-900">
                        <MapPin className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                        {zone.name}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600 font-medium">{zone.radius}</td>
                    <td className="px-6 py-3.5 font-black text-red-600">€{parseFloat(zone.fee || 0).toFixed(2)}</td>
                    <td className="px-6 py-3.5 font-black text-slate-900">€{parseFloat(zone.minOrder || 0).toFixed(2)}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                        zone.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${zone.status === 'Active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {zone.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingZone(zone); setIsZoneModalOpen(true); }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => setZoneToDelete(zone.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* ── Zone Modal ── */}
      <AnimatePresence>
        {isZoneModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsZoneModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-black text-xl text-slate-900">{editingZone ? 'Edit Zone' : 'Add Zone'}</h2>
                <button onClick={() => setIsZoneModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form id="zone-form" onSubmit={handleSaveZone} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                {[
                  { label: 'Zone Name', name: 'name', type: 'text', placeholder: 'e.g. Zone 1 – City Centre', defaultValue: editingZone?.name },
                  { label: 'Radius / Area', name: 'radius', type: 'text', placeholder: 'e.g. 0–3 km or postal codes', defaultValue: editingZone?.radius },
                ].map(f => (
                  <div key={f.name}>
                    <label className="block text-xs font-black text-slate-500 mb-1.5 uppercase tracking-wider">{f.label}</label>
                    <input type={f.type} name={f.name} required placeholder={f.placeholder} defaultValue={f.defaultValue}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 bg-slate-50 focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition-all font-medium text-sm" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Delivery Fee (€)', name: 'fee', defaultValue: editingZone?.fee },
                    { label: 'Min. Order (€)', name: 'minOrder', defaultValue: editingZone?.minOrder },
                  ].map(f => (
                    <div key={f.name}>
                      <label className="block text-xs font-black text-slate-500 mb-1.5 uppercase tracking-wider">{f.label}</label>
                      <input type="number" name={f.name} required step="0.01" min="0" placeholder="0.00" defaultValue={f.defaultValue}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 bg-slate-50 focus:bg-white focus:border-slate-400 outline-none transition-all font-bold text-sm" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 mb-1.5 uppercase tracking-wider">Status</label>
                  <select name="status" required defaultValue={editingZone?.status || 'Active'}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 bg-slate-50 focus:bg-white focus:border-slate-400 outline-none font-bold text-sm cursor-pointer">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </form>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsZoneModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors">Cancel</button>
                <button type="submit" form="zone-form"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-sm transition-colors shadow-lg shadow-red-600/20">
                  {editingZone ? 'Save Changes' : 'Add Zone'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirm ── */}
      <AnimatePresence>
        {zoneToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setZoneToDelete(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 text-center">
              <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-200">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h2 className="text-xl font-black text-slate-900 mb-2">Delete Zone?</h2>
              <p className="text-sm text-slate-500 font-medium mb-6">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setZoneToDelete(null)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors">Cancel</button>
                <button onClick={confirmDeleteZone} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-sm transition-colors shadow-lg shadow-rose-600/20">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
