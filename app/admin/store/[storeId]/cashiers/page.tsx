'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Edit, Trash2, X, AlertTriangle, Shield, KeyRound, UserSquare2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, query, where, addDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

type CashierType = {
  id: string;
  name: string;
  pin: string;
  role: string;
  emoji: string;
  storeId: string;
};

const EMOJI_LIST = ['👨‍🍳', '👩‍🍳', '🚀', '🌟', '🍔', '🍟', '🍕', '🎉', '🔥', '💎', '👑', '😎'];

export default function StoreCashiersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();
  
  const [cashiers, setCashiers] = useState<CashierType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [isCashierModalOpen, setIsCashierModalOpen] = useState(false);
  const [editingCashier, setEditingCashier] = useState<CashierType | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [cashierToDelete, setCashierToDelete] = useState<CashierType | null>(null);
  const [error, setError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '', pin: '', role: 'Cashier', emoji: '👨‍🍳'
  });

  useEffect(() => {
    if (!storeId || !user) return;

    // Fetch cashiers for this store
    const q = query(
      collection(db, 'cashiers'),
      where('storeId', '==', storeId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedCashiers: CashierType[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedCashiers.push({
          id: docSnap.id,
          name: data.name || '',
          pin: data.pin || '',
          role: data.role || 'Cashier',
          emoji: data.emoji || '👨‍🍳',
          storeId: data.storeId,
        });
      });
      setCashiers(fetchedCashiers);
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'cashiers');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [storeId, user]);

  const filteredCashiers = cashiers.filter(cashier => {
    return cashier.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           cashier.role.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const openAddModal = () => {
    setEditingCashier(null);
    setFormData({ name: '', pin: '', role: 'Cashier', emoji: '👨‍🍳' });
    setError('');
    setIsCashierModalOpen(true);
  };

  const openEditModal = (cashier: CashierType) => {
    setEditingCashier(cashier);
    setFormData({
      name: cashier.name,
      pin: cashier.pin,
      role: cashier.role,
      emoji: cashier.emoji || '👨‍🍳'
    });
    setError('');
    setIsCashierModalOpen(true);
  };

  const openDeleteModal = (cashier: CashierType) => {
    setCashierToDelete(cashier);
    setIsDeleteModalOpen(true);
  };

  const handleSaveCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.name || !formData.pin) {
      setError('Name and PIN are required.');
      return;
    }

    if (formData.pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }

    // Ensure PIN is unique within this store
    const isDuplicatePin = cashiers.some(
      c => c.pin === formData.pin && c.id !== editingCashier?.id
    );
    if (isDuplicatePin) {
      setError('This PIN is already in use by another cashier.');
      return;
    }

    try {
      const dataToSave = {
        ...formData,
        storeId: storeId,
        updatedAt: serverTimestamp(),
      };

      if (editingCashier) {
        await updateDoc(doc(db, 'cashiers', editingCashier.id), dataToSave);
      } else {
        await addDoc(collection(db, 'cashiers'), {
          ...dataToSave,
          createdAt: serverTimestamp(),
        });
      }
      setIsCashierModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save cashier.');
      handleFirestoreError(err, editingCashier ? OperationType.UPDATE : OperationType.CREATE, 'cashiers');
    }
  };

  const handleDeleteConfirm = async () => {
    if (cashierToDelete) {
      try {
        await deleteDoc(doc(db, 'cashiers', cashierToDelete.id));
        setIsDeleteModalOpen(false);
        setCashierToDelete(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `cashiers/${cashierToDelete.id}`);
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
          <h1 className="text-3xl font-heading font-black text-slate-900">POS Cashiers</h1>
          <p className="mt-2 text-slate-500 font-medium">Manage cashiers and staff PIN codes for the Point of Sale terminal.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Cashier
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-8">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search cashiers by name or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-4 sm:p-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Cashier Details</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">PIN Code</th>
                <th className="p-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredCashiers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      No cashiers found. Add one to get started.
                    </td>
                  </tr>
                ) : (
                  filteredCashiers.map((cashier) => (
                    <motion.tr 
                      key={cashier.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="p-4 sm:p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-2xl shrink-0 border border-slate-200 shadow-sm">
                            {cashier.emoji}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{cashier.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          cashier.role === 'Manager' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {cashier.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-slate-400" />
                          <span className="font-mono font-bold tracking-widest text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                            {cashier.pin}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 sm:p-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openEditModal(cashier)}
                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit Cashier"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => openDeleteModal(cashier)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Cashier"
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

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isCashierModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCashierModalOpen(false)}
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
                  {editingCashier ? 'Edit Cashier' : 'Add New Cashier'}
                </h2>
                <button onClick={() => setIsCashierModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSaveCashier} className="p-6 space-y-5 overflow-y-auto">
                {error && (
                  <div className="p-4 bg-rose-50 text-rose-600 rounded-xl font-bold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}
                
                {/* Emoji Selector */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Avatar Emoji</label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJI_LIST.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setFormData({ ...formData, emoji })}
                        className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                          formData.emoji === emoji 
                            ? 'bg-amber-100 border-2 border-amber-500 scale-110 shadow-sm' 
                            : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="e.g. Alex"
                  />
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Login PIN</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={formData.pin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setFormData({ ...formData, pin: val });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors font-mono tracking-widest text-lg"
                      placeholder="1234"
                    />
                    <p className="text-xs text-slate-500 mt-1">4 to 6 numeric digits.</p>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Role</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white h-[46px]"
                    >
                      <option value="Cashier">Cashier</option>
                      <option value="Manager">Manager</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCashierModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
                  >
                    {editingCashier ? 'Save Changes' : 'Create Cashier'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteModalOpen && cashierToDelete && (
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
              <h2 className="text-2xl font-heading font-black text-slate-900 mb-2">Delete Cashier?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete <strong>{cashierToDelete.name}</strong>? They will immediately lose access to the POS terminal.
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
                  Delete Cashier
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
