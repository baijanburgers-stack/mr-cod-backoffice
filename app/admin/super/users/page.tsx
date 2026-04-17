'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Mail, Shield, Edit, Trash2, X, AlertTriangle, User } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';

type UserType = {
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

export default function SuperAdminUsers() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [stores, setStores] = useState<{id: string, name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  // Modal States
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '', email: '', role: 'customer', status: 'Active', storeId: '', phone: '', vehicle: 'Bike', isDeliveryDriver: false
  });

  useEffect(() => {
    const unsubscribeStores = onSnapshot(collection(db, 'stores'), (snapshot) => {
      const fetchedStores: {id: string, name: string}[] = [];
      snapshot.forEach((doc) => {
        fetchedStores.push({ id: doc.id, name: doc.data().name || doc.id });
      });
      setStores(fetchedStores);
    });

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const fetchedUsers: UserType[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedUsers.push({
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'customer',
          status: data.status || 'Active',
          lastLogin: data.lastLogin || 'Never',
          storeId: data.storeId,
          phone: data.phone,
          vehicle: data.vehicle,
          isDeliveryDriver: data.isDeliveryDriver || false
        });
      });
      setUsers(fetchedUsers);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      unsubscribeStores();
    };
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'All' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({ name: '', email: '', role: 'customer', status: 'Active', storeId: '', phone: '', vehicle: 'Bike', isDeliveryDriver: false });
    setIsUserModalOpen(true);
  };

  const openEditModal = (user: UserType) => {
    setEditingUser(user);
    setFormData({ name: user.name, email: user.email, role: user.role, status: user.status, storeId: user.storeId || '', phone: user.phone || '', vehicle: user.vehicle || 'Bike', isDeliveryDriver: user.isDeliveryDriver || false });
    setIsUserModalOpen(true);
  };

  const openDeleteModal = (user: UserType) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const [error, setError] = useState('');

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Explicit Validation
    if (!formData.name || !formData.email) {
      setError('Name and Email are required.');
      return;
    }
    
    const requiresStore = ['store_admin', 'delivery'].includes(formData.role) || formData.isDeliveryDriver;
    if (requiresStore && !formData.storeId) {
      setError('Please select an Assigned Store.');
      return;
    }
    
    const requiresPhone = formData.role === 'delivery' || formData.isDeliveryDriver;
    if (requiresPhone && !formData.phone) {
      setError('Please enter a Driver Phone number.');
      return;
    }

    try {
      const dataToSave = { ...formData };
      if (!['store_admin', 'delivery'].includes(dataToSave.role) && !dataToSave.isDeliveryDriver) {
        delete (dataToSave as any).storeId;
      }
      if (dataToSave.role !== 'delivery' && !dataToSave.isDeliveryDriver) {
        delete (dataToSave as any).phone;
        delete (dataToSave as any).vehicle;
      }

      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.id), dataToSave);
      } else {
        // Use email as document ID for new users to allow easy lookup before they first login
        await setDoc(doc(db, 'users', formData.email), {
          ...dataToSave,
          createdAt: serverTimestamp(),
          lastLogin: 'Never'
        });
      }
      setIsUserModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save user.');
      handleFirestoreError(err, editingUser ? OperationType.UPDATE : OperationType.CREATE, 'users');
    }
  };

  const handleDeleteConfirm = async () => {
    if (userToDelete) {
      try {
        await deleteDoc(doc(db, 'users', userToDelete.id));
        setIsDeleteModalOpen(false);
        setUserToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${userToDelete.id}`);
      }
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'store_admin': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'delivery': return 'bg-amber-100 text-amber-900 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const formatRoleName = (role: string) => {
    switch (role) {
      case 'admin': return 'Super Admin';
      case 'store_admin': return 'Store Admin';
      case 'delivery': return 'Delivery Person';
      case 'customer': return 'Customer';
      default: return role;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">User Management</h1>
          <p className="mt-2 text-slate-500 font-medium">Manage administrators, staff, and customer accounts.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="inline-flex items-center justify-center px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add New User
        </button>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-11 pr-4 py-3 rounded-xl border-slate-200 shadow-sm focus:border-amber-500 focus:ring-amber-500 bg-white transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'All', value: 'All' },
            { label: 'Super Admin', value: 'admin' },
            { label: 'Store Admin', value: 'store_admin' },
            { label: 'Delivery', value: 'delivery' },
            { label: 'Customer', value: 'customer' }
          ].map((role) => (
            <button
              key={role.value}
              onClick={() => setRoleFilter(role.value)}
              className={`px-4 py-2.5 rounded-xl font-bold transition-colors ${
                roleFilter === role.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>

      {/* User List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-sm bg-slate-50/50">
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">User Details</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold mr-4">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-base mb-0.5">{user.name}</div>
                          <div className="flex items-center text-sm text-slate-500">
                            <Mail className="w-3.5 h-3.5 mr-1 text-slate-400" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getRoleBadgeColor(user.role)}`}>
                        <Shield className="w-3 h-3 mr-1" />
                        {formatRoleName(user.role)}
                      </span>
                      {user.isDeliveryDriver && user.role !== 'delivery' && (
                        <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                          + Driver
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        user.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {user.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                      {user.lastLogin}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openEditModal(user)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                          title="Edit User"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => openDeleteModal(user)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                          title="Delete User"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Search className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-lg font-medium text-slate-900">No users found</p>
                      <p className="text-sm">Try adjusting your search or filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Add/Edit User Modal */}
      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-heading font-black text-slate-900">
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
                <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSaveUser} className="p-6 space-y-4">
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
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="e.g. jane@example.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Role</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white"
                    >
                      <option value="customer">Customer</option>
                      <option value="delivery">Delivery Person</option>
                      <option value="store_admin">Store Admin</option>
                      <option value="admin">Super Admin</option>
                    </select>
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
                </div>

                {formData.role !== 'delivery' && (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                    <input
                      type="checkbox"
                      id="isDeliveryDriver"
                      checked={formData.isDeliveryDriver}
                      onChange={(e) => setFormData({ ...formData, isDeliveryDriver: e.target.checked })}
                      className="w-5 h-5 rounded border-amber-300 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="isDeliveryDriver" className="text-sm font-bold text-amber-900 cursor-pointer">
                      Grant Delivery Dashboard Access (Dual-Role)
                    </label>
                  </div>
                )}
                
                {(['store_admin', 'delivery'].includes(formData.role) || formData.isDeliveryDriver) && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Assigned Store</label>
                    <select
                      value={formData.storeId}
                      onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white"
                    >
                      <option value="">Select a store</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(formData.role === 'delivery' || formData.isDeliveryDriver) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Driver Phone (Required)</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                        placeholder="e.g. +32 412 345 678"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Vehicle Type</label>
                      <select
                        value={formData.vehicle}
                        onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white"
                      >
                        <option value="Bike">Bicycle</option>
                        <option value="Car">Car / Scooter</option>
                      </select>
                    </div>
                  </div>
                )}
                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsUserModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
                  >
                    {editingUser ? 'Save Changes' : 'Create User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-rose-600" />
              </div>
              <h2 className="text-xl font-heading font-black text-slate-900 mb-2">Delete User?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete <span className="font-bold text-slate-900">{userToDelete?.name}</span>? This action cannot be undone.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
