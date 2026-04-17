'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Mail, Shield, Edit, Trash2, X, AlertTriangle, User, Bike } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, query, where, arrayUnion, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

type DriverType = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
  storeId?: string;
  phone?: string;
  vehicle?: string;
  isDeliveryDriver?: boolean;
};

export default function StoreDriversPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();
  
  const [drivers, setDrivers] = useState<DriverType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modal States
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverType | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<DriverType | null>(null);
  const [error, setError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '', email: '', status: 'Active', phone: '', vehicle: 'Bike'
  });

  useEffect(() => {
    if (!storeId || !user) return;

    // Fetch users dedicated to this store who are delivery drivers
    const q1 = query(collection(db, 'users'), where('storeId', '==', storeId), where('role', '==', 'delivery'));
    const q2 = query(collection(db, 'users'), where('storeIds', 'array-contains', storeId), where('role', '==', 'delivery'));

    const handleSnapshots = () => {
      // We will merge docs from both snapshots
      let map = new Map<string, DriverType>();
      
      const processDoc = (docSnap: any) => {
        const data = docSnap.data();
        map.set(docSnap.id, {
          id: docSnap.id,
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'delivery',
          status: data.status || 'Active',
          lastLogin: data.lastLogin || 'Never',
          storeId: data.storeId,
          phone: data.phone || '',
          vehicle: data.vehicle || 'Bike',
          isDeliveryDriver: data.isDeliveryDriver || true,
        });
      };

      return [
        onSnapshot(q1, (snap) => { snap.forEach(processDoc); setDrivers(Array.from(map.values())); setIsLoading(false); }),
        onSnapshot(q2, (snap) => { snap.forEach(processDoc); setDrivers(Array.from(map.values())); setIsLoading(false); })
      ];
    };

    const unsubs = handleSnapshots();

    return () => {
      unsubs.forEach(u => u());
    };
  }, [storeId, user]);

  const filteredDrivers = drivers.filter(driver => {
    const matchesSearch = driver.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          driver.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || driver.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openAddModal = () => {
    setEditingDriver(null);
    setFormData({ name: '', email: '', status: 'Active', phone: '', vehicle: 'Bike' });
    setError('');
    setIsDriverModalOpen(true);
  };

  const openEditModal = (driver: DriverType) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name,
      email: driver.email,
      status: driver.status,
      phone: driver.phone || '',
      vehicle: driver.vehicle || 'Bike'
    });
    setError('');
    setIsDriverModalOpen(true);
  };

  const openDeleteModal = (driver: DriverType) => {
    setDriverToDelete(driver);
    setIsDeleteModalOpen(true);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Explicit Validation
    if (!formData.name || !formData.email) {
      setError('Name and Email are required.');
      return;
    }
    
    if (!formData.phone) {
      setError('Please enter a Driver Phone number.');
      return;
    }

    try {
      const dataToSave = {
        ...formData,
        role: 'delivery',
        isDeliveryDriver: true,
        storeId: storeId, // Force lock to this store
      };

      if (editingDriver) {
        await updateDoc(doc(db, 'users', editingDriver.id), dataToSave);
      } else {
        const userRef = doc(db, 'users', formData.email.toLowerCase());
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
          // If the driver already exists, append this storeId to their portfolio
          await updateDoc(userRef, {
            ...dataToSave,
            storeIds: arrayUnion(storeId)
          });
        } else {
          // Fresh creation
          await setDoc(userRef, {
            ...dataToSave,
            storeIds: [storeId],
            createdAt: serverTimestamp(),
            lastLogin: 'Never'
          });
        }
      }
      setIsDriverModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save driver.');
      handleFirestoreError(err, editingDriver ? OperationType.UPDATE : OperationType.CREATE, 'users');
    }
  };

  const handleDeleteConfirm = async () => {
    if (driverToDelete) {
      try {
        await deleteDoc(doc(db, 'users', driverToDelete.id));
        setIsDeleteModalOpen(false);
        setDriverToDelete(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${driverToDelete.id}`);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Drivers & Staff</h1>
          <p className="mt-2 text-slate-500 font-medium">Manage delivery personnel assigned to your store.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Driver
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-8">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search delivery personnel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 bg-slate-50 transition-colors font-medium sm:w-48"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-4 sm:p-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Driver Details</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vehicle</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="p-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      No drivers found in this store.
                    </td>
                  </tr>
                ) : (
                  filteredDrivers.map((driver) => (
                    <motion.tr 
                      key={driver.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="p-4 sm:p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{driver.name}</p>
                            <div className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                              <span>{driver.role}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="flex items-center text-sm text-slate-600 gap-1.5">
                            <Mail className="w-4 h-4 text-slate-400" />
                            {driver.email}
                          </div>
                          {driver.phone && (
                            <div className="text-sm font-medium text-slate-700">
                              {driver.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-100 flex-none px-3 py-1.5 rounded-lg w-max">
                          <Bike className="w-4 h-4 text-slate-500"/>
                          {driver.vehicle || 'Unknown'}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          driver.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {driver.status}
                        </span>
                      </td>
                      <td className="p-4 sm:p-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openEditModal(driver)}
                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit Driver"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => openDeleteModal(driver)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Driver"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isDriverModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDriverModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-heading font-black text-slate-900">
                  {editingDriver ? 'Edit Driver' : 'Add New Driver'}
                </h2>
                <button onClick={() => setIsDriverModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSaveDriver} className="p-6 space-y-4 overflow-y-auto">
                {error && (
                  <div className="p-4 bg-rose-50 text-rose-600 rounded-xl font-bold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="e.g. Jane Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="e.g. jane@example.com"
                  />
                  <p className="text-xs text-slate-500 mt-1">This email will be used by the driver to log in.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="+32..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Vehicle</label>
                    <select
                      value={formData.vehicle}
                      onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white"
                    >
                      <option value="Bike">Bike</option>
                      <option value="Scooter">Scooter</option>
                      <option value="Car">Car</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDriverModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
                  >
                    {editingDriver ? 'Save Changes' : 'Create Driver'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteModalOpen && driverToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-heading font-black text-slate-900 mb-2">Delete Driver?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete <strong>{driverToDelete.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-5 py-3 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 px-5 py-3 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                >
                  Delete Driver
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
