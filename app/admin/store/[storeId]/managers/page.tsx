'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Mail, Edit, Trash2, X, AlertTriangle, User, Shield } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

type ManagerType = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
  storeId?: string;
  phone?: string;
};

export default function StoreManagersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();
  
  const [managers, setManagers] = useState<ManagerType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modal States
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [editingManager, setEditingManager] = useState<ManagerType | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [managerToDelete, setManagerToDelete] = useState<ManagerType | null>(null);
  const [error, setError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '', email: '', status: 'Active', phone: ''
  });

  useEffect(() => {
    if (!storeId || !user) return;

    // Fetch users dedicated to this store who are managers
    const q = query(
      collection(db, 'users'),
      where('storeId', '==', storeId),
      where('role', '==', 'manager')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedManagers: ManagerType[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedManagers.push({
          id: docSnap.id,
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'manager',
          status: data.status || 'Active',
          lastLogin: data.lastLogin || 'Never',
          storeId: data.storeId,
          phone: data.phone || '',
        });
      });
      setManagers(fetchedManagers);
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [storeId, user]);

  const filteredManagers = managers.filter(manager => {
    const matchesSearch = manager.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          manager.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || manager.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openAddModal = () => {
    setEditingManager(null);
    setFormData({ name: '', email: '', status: 'Active', phone: '' });
    setError('');
    setIsManagerModalOpen(true);
  };

  const openEditModal = (manager: ManagerType) => {
    setEditingManager(manager);
    setFormData({
      name: manager.name,
      email: manager.email,
      status: manager.status,
      phone: manager.phone || ''
    });
    setError('');
    setIsManagerModalOpen(true);
  };

  const openDeleteModal = (manager: ManagerType) => {
    setManagerToDelete(manager);
    setIsDeleteModalOpen(true);
  };

  const handleSaveManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Explicit Validation
    if (!formData.name || !formData.email) {
      setError('Name and Email are required.');
      return;
    }

    try {
      const dataToSave = {
        ...formData,
        role: 'manager',
        storeId: storeId, // Force lock to this store
      };

      if (editingManager) {
        await updateDoc(doc(db, 'users', editingManager.id), dataToSave);
      } else {
        // Use email as document ID for new users to allow easy lookup before they first login
        await setDoc(doc(db, 'users', formData.email.toLowerCase()), {
          ...dataToSave,
          createdAt: serverTimestamp(),
          lastLogin: 'Never'
        });
      }
      setIsManagerModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save manager.');
      handleFirestoreError(err, editingManager ? OperationType.UPDATE : OperationType.CREATE, 'users');
    }
  };

  const handleDeleteConfirm = async () => {
    if (managerToDelete) {
      try {
        await deleteDoc(doc(db, 'users', managerToDelete.id));
        setIsDeleteModalOpen(false);
        setManagerToDelete(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${managerToDelete.id}`);
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
          <h1 className="text-3xl font-heading font-black text-slate-900">Shift Managers</h1>
          <p className="mt-2 text-slate-500 font-medium">Add and remove store managers. Managers receive full operational access to the backoffice but cannot modify store administrators.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Manager
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
              placeholder="Search managers..."
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
                <th className="p-4 sm:p-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Manager Details</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="p-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredManagers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      No managers found in this store.
                    </td>
                  </tr>
                ) : (
                  filteredManagers.map((manager) => (
                    <motion.tr 
                      key={manager.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="p-4 sm:p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                            <Shield className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{manager.name}</p>
                            <div className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                              <span>Manager</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="flex items-center text-sm text-slate-600 gap-1.5">
                            <Mail className="w-4 h-4 text-slate-400" />
                            {manager.email}
                          </div>
                          {manager.phone && (
                            <div className="text-sm font-medium text-slate-700">
                              {manager.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          manager.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {manager.status}
                        </span>
                      </td>
                      <td className="p-4 sm:p-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openEditModal(manager)}
                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit Manager"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => openDeleteModal(manager)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Manager"
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
        {isManagerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagerModalOpen(false)}
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
                  {editingManager ? 'Edit Manager' : 'Add New Manager'}
                </h2>
                <button onClick={() => setIsManagerModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSaveManager} className="p-6 space-y-4 overflow-y-auto">
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
                  <p className="text-xs text-slate-500 mt-1">This email will be used by the manager to log in.</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="+32..."
                  />
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
                    onClick={() => setIsManagerModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
                  >
                    {editingManager ? 'Save Changes' : 'Create Manager'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteModalOpen && managerToDelete && (
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
              <h2 className="text-2xl font-heading font-black text-slate-900 mb-2">Delete Manager?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete <strong>{managerToDelete.name}</strong>? This action cannot be undone.
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
                  Delete Manager
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
