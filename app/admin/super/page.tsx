'use client';

import { useState, useEffect } from 'react';
import { Users, Store, TrendingUp, Settings, ArrowUpRight, ArrowDownRight, MoreVertical } from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';

export default function SuperAdminDashboard() {
  const [stores, setStores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState([
    { name: 'Total Stores', value: '0', icon: Store, change: '', changeType: 'neutral' },
    { name: 'Total Revenue (Today)', value: '€0', icon: TrendingUp, change: '', changeType: 'neutral' },
    { name: 'Active Customers', value: '0', icon: Users, change: '', changeType: 'neutral' },
  ]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Stores
        const storesSnapshot = await getDocs(collection(db, 'stores'));
        const fetchedStores: any[] = [];
        storesSnapshot.forEach((doc) => {
          fetchedStores.push({
            id: doc.id,
            name: doc.data().name || 'Unnamed Store',
            manager: doc.data().manager || 'Unassigned',
            status: doc.data().isOpen ? 'Active' : 'Inactive',
            revenue: '€0' // This would require aggregating orders per store
          });
        });
        setStores(fetchedStores);

        // Fetch Orders for today's revenue
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Note: In a real app, you'd want a more efficient way to query today's revenue across all stores,
        // possibly using a cloud function to aggregate data. For now, we'll just fetch recent orders.
        const ordersSnapshot = await getDocs(collection(db, 'orders'));
        let todayRevenue = 0;
        ordersSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.createdAt) {
            const orderDate = new Date(data.createdAt);
            if (orderDate >= today) {
              todayRevenue += data.total || 0;
            }
          }
        });

        // Fetch Users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const activeCustomers = usersSnapshot.size;

        setStats([
          { name: 'Total Stores', value: fetchedStores.length.toString(), icon: Store, change: '', changeType: 'neutral' },
          { name: 'Total Revenue (Today)', value: `€${todayRevenue.toFixed(2)}`, icon: TrendingUp, change: '', changeType: 'neutral' },
          { name: 'Total Users', value: activeCustomers.toString(), icon: Users, change: '', changeType: 'neutral' },
        ]);

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
      <div className="flex items-center justify-center h-screen bg-[#FAF9F6]">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Dashboard Overview</h1>
          <p className="mt-2 text-slate-500 font-medium">Welcome back, Super Admin. Here&apos;s what&apos;s happening today.</p>
        </div>
        <button className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition-colors shadow-sm shadow-red-600/20">
          Add Store
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-10">
        {stats.map((stat, idx) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600">
                <stat.icon className="w-6 h-6" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-bold px-2.5 py-1 rounded-full ${
                stat.changeType === 'positive' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                {stat.changeType === 'positive' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {stat.change}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 mb-1">{stat.name}</p>
              <h3 className="text-3xl font-heading font-black text-slate-900">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Store List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-heading font-bold text-slate-900">Recent Store Activity</h3>
          <button className="text-sm font-bold text-red-600 hover:text-red-500">View All</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-sm">
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Store Name</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Manager</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Today&apos;s Revenue</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stores.map((store) => (
                <tr key={store.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{store.name}</div>
                    <div className="text-sm text-slate-500">ID: #{store.id}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{store.manager}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      store.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {store.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />}
                      {store.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900">{store.revenue}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                      <Settings className="w-5 h-5" />
                    </button>
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
