'use client';

import { useState, useEffect } from 'react';
import { Users, Store, TrendingUp, ShieldCheck, ShieldAlert, UserCheck, Truck, UserX, ExternalLink, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';

type RoleStats = {
  superAdmins:  number;
  storeAdmins:  number;
  delivery:     number;
  customers:    number;
  noRole:       number;
  total:        number;
};

type StoreRow = {
  id:      string;
  name:    string;
  manager: string;
  status:  string;
};

export default function SuperAdminDashboard() {
  const [stores,       setStores]       = useState<StoreRow[]>([]);
  const [roleStats,    setRoleStats]    = useState<RoleStats>({ superAdmins: 0, storeAdmins: 0, delivery: 0, customers: 0, noRole: 0, total: 0 });
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [isLoading,    setIsLoading]    = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // ── Stores ──────────────────────────────────────────────────────
        const storesSnap = await getDocs(collection(db, 'stores'));
        const fetchedStores: StoreRow[] = [];
        storesSnap.forEach(d => {
          fetchedStores.push({
            id:      d.id,
            name:    d.data().name    || 'Unnamed Store',
            manager: d.data().manager || 'Unassigned',
            status:  d.data().isOpen  ? 'Active' : 'Inactive',
          });
        });
        setStores(fetchedStores);

        // ── Today's revenue ─────────────────────────────────────────────
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const ordersSnap = await getDocs(collection(db, 'orders'));
        let revenue = 0;
        ordersSnap.forEach(d => {
          const data = d.data();
          if (data.createdAt) {
            const orderDate = new Date(data.createdAt);
            if (orderDate >= today) revenue += data.total || 0;
          }
        });
        setTodayRevenue(revenue);

        // ── Users — role breakdown ───────────────────────────────────────
        const usersSnap = await getDocs(collection(db, 'users'));
        const rs: RoleStats = { superAdmins: 0, storeAdmins: 0, delivery: 0, customers: 0, noRole: 0, total: 0 };
        usersSnap.forEach(d => {
          const role = d.data().role || '';
          rs.total++;
          if (role === 'super_admin' || role === 'admin') rs.superAdmins++;
          else if (role === 'store_admin')                rs.storeAdmins++;
          else if (role === 'delivery')                   rs.delivery++;
          else if (role === 'customer')                   rs.customers++;
          else                                            rs.noRole++;   // no role = problem to fix
        });
        setRoleStats(rs);

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'super_admin_data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Top-level KPI cards ────────────────────────────────────────────────────
  const kpiCards = [
    {
      label:   'Total Stores',
      value:   stores.length,
      icon:    Store,
      color:   'bg-blue-50 text-blue-600',
      border:  'border-blue-100',
    },
    {
      label:   "Today's Revenue",
      value:   `€${todayRevenue.toFixed(2)}`,
      icon:    TrendingUp,
      color:   'bg-emerald-50 text-emerald-600',
      border:  'border-emerald-100',
    },
    {
      label:   'Total Users',
      value:   roleStats.total,
      icon:    Users,
      color:   'bg-slate-100 text-slate-600',
      border:  'border-slate-200',
    },
  ];

  // ── Role breakdown cards ───────────────────────────────────────────────────
  const roleCards = [
    {
      label:  'Super Admins',
      value:  roleStats.superAdmins,
      icon:   ShieldCheck,
      color:  'bg-purple-50 text-purple-600',
      border: 'border-purple-100',
      badge:  roleStats.superAdmins === 0 ? 'danger' : roleStats.superAdmins > 3 ? 'warn' : 'ok',
      hint:   roleStats.superAdmins === 0
        ? '⚠ No super admins! Add one immediately.'
        : roleStats.superAdmins > 3
          ? 'More than 3 — review if all are needed'
          : 'Good',
    },
    {
      label:  'Store Admins',
      value:  roleStats.storeAdmins,
      icon:   UserCheck,
      color:  'bg-blue-50 text-blue-600',
      border: 'border-blue-100',
      badge:  'ok',
      hint:   `Managing ${stores.length} store${stores.length !== 1 ? 's' : ''}`,
    },
    {
      label:  'Delivery Drivers',
      value:  roleStats.delivery,
      icon:   Truck,
      color:  'bg-amber-50 text-amber-700',
      border: 'border-amber-100',
      badge:  'ok',
      hint:   'Active delivery accounts',
    },
    {
      label:  'No Role Assigned',
      value:  roleStats.noRole,
      icon:   ShieldAlert,
      color:  roleStats.noRole > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400',
      border: roleStats.noRole > 0 ? 'border-rose-200' : 'border-slate-100',
      badge:  roleStats.noRole > 0 ? 'danger' : 'ok',
      hint:   roleStats.noRole > 0
        ? `${roleStats.noRole} user${roleStats.noRole > 1 ? 's' : ''} locked out — fix now`
        : 'All users have roles ✓',
    },
  ];

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Dashboard Overview</h1>
          <p className="mt-2 text-slate-500 font-medium">Welcome back, Super Admin. Here&apos;s what&apos;s happening today.</p>
        </div>
        <Link
          href="/admin/super/users"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition-colors shadow-sm shadow-red-600/20"
        >
          <Users className="w-4 h-4" />
          Manage Users
        </Link>
      </div>

      {/* ⚠ No-role alert banner */}
      {roleStats.noRole > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl"
        >
          <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-black text-rose-700">
              {roleStats.noRole} user{roleStats.noRole > 1 ? 's have' : ' has'} no role — they cannot access any admin area.
            </p>
            <p className="text-sm text-rose-600 mt-0.5">Fix immediately to prevent lockout.</p>
          </div>
          <Link
            href="/admin/super/users"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-sm font-bold rounded-lg hover:bg-rose-700 transition-colors"
          >
            Fix Now <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
        {kpiCards.map((card, idx) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.07 }}
            className={`bg-white p-6 rounded-3xl border ${card.border} shadow-sm`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-sm font-bold text-slate-500 mb-1">{card.label}</p>
            <h3 className="text-3xl font-heading font-black text-slate-900">{card.value}</h3>
          </motion.div>
        ))}
      </div>

      {/* ── User Role Breakdown ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-black text-slate-900">User Role Breakdown</h2>
          <Link href="/admin/super/users" className="text-sm font-bold text-red-600 hover:text-red-500 flex items-center gap-1">
            View All <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {roleCards.map((card, idx) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.07 }}
              className={`bg-white p-5 rounded-2xl border ${card.border} shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
                {/* Badge */}
                {card.badge === 'danger' && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 uppercase tracking-wider">
                    Action
                  </span>
                )}
                {card.badge === 'warn' && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">
                    Review
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-heading font-black text-slate-900 mb-0.5">{card.value}</h3>
              <p className="text-xs font-bold text-slate-500">{card.label}</p>
              <p className={`text-[11px] mt-1.5 font-medium ${
                card.badge === 'danger' ? 'text-rose-500' :
                card.badge === 'warn'   ? 'text-amber-600' :
                'text-slate-400'
              }`}>
                {card.hint}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Inline role bar chart */}
        {roleStats.total > 0 && (
          <div className="mt-4 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Role Distribution</p>
            <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
              {roleStats.superAdmins > 0 && (
                <div
                  title={`Super Admins: ${roleStats.superAdmins}`}
                  className="bg-purple-500 transition-all"
                  style={{ width: `${(roleStats.superAdmins / roleStats.total) * 100}%` }}
                />
              )}
              {roleStats.storeAdmins > 0 && (
                <div
                  title={`Store Admins: ${roleStats.storeAdmins}`}
                  className="bg-blue-500 transition-all"
                  style={{ width: `${(roleStats.storeAdmins / roleStats.total) * 100}%` }}
                />
              )}
              {roleStats.delivery > 0 && (
                <div
                  title={`Delivery: ${roleStats.delivery}`}
                  className="bg-amber-500 transition-all"
                  style={{ width: `${(roleStats.delivery / roleStats.total) * 100}%` }}
                />
              )}
              {roleStats.customers > 0 && (
                <div
                  title={`Customers: ${roleStats.customers}`}
                  className="bg-slate-300 transition-all"
                  style={{ width: `${(roleStats.customers / roleStats.total) * 100}%` }}
                />
              )}
              {roleStats.noRole > 0 && (
                <div
                  title={`No Role: ${roleStats.noRole}`}
                  className="bg-rose-400 transition-all"
                  style={{ width: `${(roleStats.noRole / roleStats.total) * 100}%` }}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {[
                { label: 'Super Admin', color: 'bg-purple-500', count: roleStats.superAdmins },
                { label: 'Store Admin', color: 'bg-blue-500',   count: roleStats.storeAdmins },
                { label: 'Delivery',    color: 'bg-amber-500',  count: roleStats.delivery },
                { label: 'Customer',    color: 'bg-slate-300',  count: roleStats.customers },
                { label: 'No Role',     color: 'bg-rose-400',   count: roleStats.noRole },
              ].filter(r => r.count > 0).map(r => (
                <div key={r.label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${r.color}`} />
                  <span className="text-xs font-bold text-slate-600">{r.label}</span>
                  <span className="text-xs text-slate-400">({r.count})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Store List ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-heading font-bold text-slate-900">Stores</h3>
          <span className="text-sm font-bold text-slate-400">{stores.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-sm">
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Store Name</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Manager</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-right">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400 font-medium">
                    No stores found.
                  </td>
                </tr>
              ) : stores.map(store => (
                <tr key={store.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{store.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">ID: {store.id}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{store.manager}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      store.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {store.status === 'Active' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                      )}
                      {store.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/store/${store.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

    </div>
  );
}
