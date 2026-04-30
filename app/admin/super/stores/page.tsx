'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, MapPin, Phone, Mail, Edit, Trash2, ExternalLink, X, AlertTriangle, Image as ImageIcon, Store, Loader2, CreditCard, MonitorSmartphone } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { resizeImage } from '@/lib/image-utils';
import { getDefaultVatCategories } from '@/lib/vat-rules';

// Address autocomplete removed.

type Store = {
  id: string;
  name: string;
  address: string;
  manager?: string; // Optional for legacy
  phone: string;
  email: string;
  companyName: string;
  vatNumber: string;
  status: string;
  image?: string;
  logo?: string;
  street?: string;
  streetNumber?: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
  isOpen?: boolean;
  allowPos?: boolean;
  allowKiosk?: boolean;
  allowOnlineOrdering?: boolean;
  maxPosTerminals?: number;
  maxKiosks?: number;
  fdmId?: string;
  vscId?: string;
  ccvApiKeyLive?: string;
  ccvApiKeyTest?: string;
  ccvEnvironment?: 'TEST' | 'LIVE';
  ccvManagementSystemId?: 'GrundmasterBE' | 'GrundmasterNL' | 'GrundmasterNL-ThirdPartyTest';
  stripeEnvironment?: 'TEST' | 'LIVE';
  stripePublishableKeyTest?: string;
  stripePublishableKeyLive?: string;
  stripeSecretKeyTest?: string;
  stripeSecretKeyLive?: string;
  mollieEnvironment?: 'TEST' | 'LIVE';
  mollieApiKeyTest?: string;
  mollieApiKeyLive?: string;
  allowKds?: boolean;
  maxKdsDevices?: number;
};

export default function SuperAdminStores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modal States
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [duplicateErrors, setDuplicateErrors] = useState<{ name?: string; email?: string; vatNumber?: string }>({});

  // Form State
  const [formData, setFormData] = useState({
    name: '', address: '', street: '', streetNumber: '', city: '', postalCode: '', countryCode: 'BE', phone: '', email: '', companyName: '', vatNumber: '', status: 'Active', image: '', logo: '',
    allowPos: true, allowKiosk: true, allowKds: true, allowOnlineOrdering: true, maxPosTerminals: 5, maxKiosks: 2, maxKdsDevices: 5, fdmId: '', vscId: '',
    ccvApiKeyLive: '', ccvApiKeyTest: '', ccvEnvironment: 'TEST' as 'TEST' | 'LIVE', ccvManagementSystemId: 'GrundmasterBE' as 'GrundmasterBE' | 'GrundmasterNL' | 'GrundmasterNL-ThirdPartyTest',
    stripeEnvironment: 'TEST' as 'TEST' | 'LIVE', stripePublishableKeyTest: '', stripePublishableKeyLive: '', stripeSecretKeyTest: '', stripeSecretKeyLive: '',
    mollieEnvironment: 'TEST' as 'TEST' | 'LIVE', mollieApiKeyTest: '', mollieApiKeyLive: ''
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'stores'), (snapshot) => {
      const fetchedStores: Store[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedStores.push({
          id: doc.id,
          name: data.name || '',
          address: data.address || '',
          street: data.street || '',
          streetNumber: data.streetNumber || '',
          city: data.city || '',
          postalCode: data.postalCode || '',
          countryCode: data.countryCode || 'BE',
          manager: data.manager || '',
          phone: data.phone || '',
          email: data.email || '',
          companyName: data.companyName || '',
          vatNumber: data.vatNumber || '',
          status: data.isOpen ? 'Active' : 'Inactive',
          image: data.image || '',
          logo: data.logo || '',
          isOpen: data.isOpen ?? false,
          allowPos: data.allowPos ?? true,
          allowKiosk: data.allowKiosk ?? true,
          allowKds: data.allowKds ?? true,
          allowOnlineOrdering: data.allowOnlineOrdering ?? true,
          maxPosTerminals: data.maxPosTerminals ?? 5,
          maxKiosks: data.maxKiosks ?? 2,
          maxKdsDevices: data.maxKdsDevices ?? 5,
          fdmId: data.fdmId || '',
          vscId: data.vscId || '',
          ccvApiKeyLive: data.ccvApiKeyLive || '',
          ccvApiKeyTest: data.ccvApiKeyTest || '',
          ccvEnvironment: data.ccvEnvironment || 'TEST',
          ccvManagementSystemId: data.ccvManagementSystemId || 'GrundmasterBE',
          stripeEnvironment: data.stripeEnvironment || 'TEST',
          stripePublishableKeyTest: data.stripePublishableKeyTest || data.stripePublishableKey || '',
          stripePublishableKeyLive: data.stripePublishableKeyLive || '',
          stripeSecretKeyTest: data.stripeSecretKeyTest || data.stripeSecretKey || '',
          stripeSecretKeyLive: data.stripeSecretKeyLive || '',
          mollieEnvironment: data.mollieEnvironment || 'TEST',
          mollieApiKeyTest: data.mollieApiKeyTest || data.mollieApiKey || '',
          mollieApiKeyLive: data.mollieApiKeyLive || '',
        });
      });
      setStores(fetchedStores);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'stores');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredStores = stores.filter(store => {
    const matchesSearch = store.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          store.address.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || store.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openAddModal = () => {
    setEditingStore(null);
    setDuplicateErrors({});
    setFormData({ name: '', address: '', street: '', streetNumber: '', city: '', postalCode: '', countryCode: 'BE', phone: '', email: '', companyName: '', vatNumber: '', status: 'Active', image: '', logo: '', allowPos: true, allowKiosk: true, allowKds: true, allowOnlineOrdering: true, maxPosTerminals: 5, maxKiosks: 2, maxKdsDevices: 5, fdmId: '', vscId: '', ccvApiKeyLive: '', ccvApiKeyTest: '', ccvEnvironment: 'TEST', ccvManagementSystemId: 'GrundmasterBE', stripeEnvironment: 'TEST', stripePublishableKeyTest: '', stripePublishableKeyLive: '', stripeSecretKeyTest: '', stripeSecretKeyLive: '', mollieEnvironment: 'TEST', mollieApiKeyTest: '', mollieApiKeyLive: '' });
    setIsStoreModalOpen(true);
  };

  const openEditModal = (store: Store) => {
    setEditingStore(store);
    setDuplicateErrors({});
    setFormData({ name: store.name || '', address: store.address || '', street: store.street || '', streetNumber: store.streetNumber || '', city: store.city || '', postalCode: store.postalCode || '', countryCode: store.countryCode || 'BE', phone: store.phone || '', email: store.email || '', companyName: store.companyName || '', vatNumber: store.vatNumber || '', status: store.status || 'Active', image: store.image || '', logo: store.logo || '', allowPos: store.allowPos ?? true, allowKiosk: store.allowKiosk ?? true, allowKds: store.allowKds ?? true, allowOnlineOrdering: store.allowOnlineOrdering ?? true, maxPosTerminals: store.maxPosTerminals || 5, maxKiosks: store.maxKiosks || 2, maxKdsDevices: store.maxKdsDevices || 5, fdmId: store.fdmId || '', vscId: store.vscId || '', ccvApiKeyLive: store.ccvApiKeyLive || '', ccvApiKeyTest: store.ccvApiKeyTest || '', ccvEnvironment: store.ccvEnvironment || 'TEST', ccvManagementSystemId: store.ccvManagementSystemId || 'GrundmasterBE', stripeEnvironment: store.stripeEnvironment || 'TEST', stripePublishableKeyTest: store.stripePublishableKeyTest || '', stripePublishableKeyLive: store.stripePublishableKeyLive || '', stripeSecretKeyTest: store.stripeSecretKeyTest || '', stripeSecretKeyLive: store.stripeSecretKeyLive || '', mollieEnvironment: store.mollieEnvironment || 'TEST', mollieApiKeyTest: store.mollieApiKeyTest || '', mollieApiKeyLive: store.mollieApiKeyLive || '' });
    setIsStoreModalOpen(true);
  };

  const openDeleteModal = (store: Store) => {
    setStoreToDelete(store);
    setIsDeleteModalOpen(true);
  };



  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = await resizeImage(reader.result as string, 400, 400);
          setFormData(prev => ({ ...prev, logo: base64 }));
        } catch (error) {
          console.error('Error resizing logo:', error);
          alert('Failed to process image. Please try another file.');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Failed to process image. Please try another file.');
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    // ── Duplicate check (uses already-loaded stores list) ─────────────────
    const otherStores = editingStore
      ? stores.filter(s => s.id !== editingStore.id)
      : stores;

    const errors: { name?: string; email?: string; vatNumber?: string } = {};

    const nameTaken = otherStores.some(
      s => s.name.trim().toLowerCase() === formData.name.trim().toLowerCase()
    );
    if (nameTaken) errors.name = `A store named "${formData.name}" already exists.`;

    const emailTaken = formData.email && otherStores.some(
      s => s.email.trim().toLowerCase() === formData.email.trim().toLowerCase()
    );
    if (emailTaken) errors.email = `This email is already used by another store.`;

    const vatTaken = formData.vatNumber && otherStores.some(
      s => s.vatNumber.trim().toLowerCase() === formData.vatNumber.trim().toLowerCase()
    );
    if (vatTaken) errors.vatNumber = `This VAT number is already registered to another store.`;

    if (Object.keys(errors).length > 0) {
      setDuplicateErrors(errors);
      return; // Stop — show errors inline, don't write to Firestore
    }

    setDuplicateErrors({});
    setIsSaving(true);
    try {
      const systemId = formData.countryCode === 'NL' 
        ? (formData.ccvEnvironment === 'TEST' ? 'GrundmasterNL-ThirdPartyTest' : 'GrundmasterNL') 
        : 'GrundmasterBE';

      const storeData: any = {
        ...formData,
        ccvManagementSystemId: systemId,
        address: `${formData.street} ${formData.streetNumber}, ${formData.postalCode} ${formData.city}, ${formData.countryCode}`.trim().replace(/^[\s,]+|[\s,]+$/g, ''),
        isOpen: formData.status === 'Active'
      };
      
      // Store Save Logic
      let storeId = '';
      if (editingStore) {
        storeId = editingStore.id;
        await updateDoc(doc(db, 'stores', storeId), storeData);
      } else {
        const docRef = await addDoc(collection(db, 'stores'), storeData);
        storeId = docRef.id;

        // Auto-seed VAT categories for new stores based on country
        const vatSeeds = getDefaultVatCategories(formData.countryCode);
        const vatBatch = writeBatch(db);
        vatSeeds.forEach(cat => {
          vatBatch.set(
            doc(db, 'stores', storeId, 'vatCategories', cat.id),
            cat
          );
        });
        await vatBatch.commit();
      }



      // ✅ Always close the modal after a successful save
      setIsStoreModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingStore ? OperationType.UPDATE : OperationType.CREATE, 'stores');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (storeToDelete) {
      try {
        await deleteDoc(doc(db, 'stores', storeToDelete.id));
        setIsDeleteModalOpen(false);
        setStoreToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `stores/${storeToDelete.id}`);
      }
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
          <h1 className="text-3xl font-heading font-black text-slate-900">Store Management</h1>
          <p className="mt-2 text-slate-500 font-medium">Manage all EazyOrder locations, managers, and statuses.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="inline-flex items-center justify-center px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add New Store
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
            placeholder="Search stores by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-11 pr-4 py-3 rounded-xl border-slate-200 shadow-sm focus:border-amber-500 focus:ring-amber-500 bg-white transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {['All', 'Active', 'Inactive'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2.5 rounded-xl font-bold transition-colors ${
                statusFilter === status
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Store List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-sm bg-slate-50/50">
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Store Details</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Contact Info</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStores.length > 0 ? (
                filteredStores.map((store) => (
                  <tr key={store.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex-shrink-0 relative overflow-hidden border border-slate-200 shadow-sm">
                          {(store.logo || store.image) ? (
                            <Image src={(store.logo || store.image) as string} alt={store.name} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <Store className="w-7 h-7" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-lg mb-0.5">{store.name}</div>
                          <div className="flex items-center text-sm text-slate-500">
                            <MapPin className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                            {store.address}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center text-sm text-slate-700 font-semibold">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mr-3 text-blue-600">
                            <Phone className="w-4 h-4" />
                          </div>
                          {store.phone}
                        </div>
                        <div className="flex items-center text-sm text-slate-500 font-medium">
                          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center mr-3 text-slate-400">
                            <Mail className="w-4 h-4" />
                          </div>
                          {store.email}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${
                        store.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {store.status === 'Active' && <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />}
                        {store.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/stores/${store.id}/menu`} className="p-2.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all duration-200" title="View Store Page">
                          <ExternalLink className="w-5 h-5" />
                        </Link>
                        <button 
                          onClick={() => openEditModal(store)}
                          className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200" 
                          title="Edit Store"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => openDeleteModal(store)}
                          className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all duration-200" 
                          title="Delete Store"
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
                      <p className="text-lg font-medium text-slate-900">No stores found</p>
                      <p className="text-sm">Try adjusting your search or filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Add/Edit Store Modal */}
      <AnimatePresence>
        {isStoreModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setIsStoreModalOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-4xl flex flex-col max-h-[92dvh] sm:max-h-[85vh]"
            >
              {/* Drag handle for mobile */}
              <div className="flex sm:hidden justify-center pt-3 pb-1">
                <div className="w-10 h-1.5 rounded-full bg-slate-200" />
              </div>
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl shrink-0">
                <h2 className="text-xl font-heading font-black text-slate-900">
                  {editingStore ? 'Edit Store' : 'Add New Store'}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsStoreModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveStore} className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1 relative">
                
                {/* 1. Basic Information */}
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200/50 pb-3">
                    <Store className="w-5 h-5 text-amber-500" />
                    <h3 className="text-base font-bold">Basic Information</h3>
                  </div>
                  
                  {/* Store Logo Upload */}
                  <div className="mb-6 flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative w-24 h-24 bg-white rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shrink-0 group">
                      {formData.logo ? (
                        <>
                          <Image src={formData.logo} alt="Store Logo" fill className="object-contain p-2" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center text-slate-400">
                          <ImageIcon className="w-6 h-6 mb-1" />
                          <span className="text-[10px] font-bold">Logo</span>
                        </div>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleLogoUpload}
                      />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Official Store Logo</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Used in the Store Admin header and POS application. Recommended: Square image with transparent background.</p>
                      {formData.logo && (
                        <button 
                          type="button" 
                          onClick={() => setFormData(prev => ({ ...prev, logo: '' }))}
                          className="mt-2 text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove Logo
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Store Name</label>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={(e) => {
                          setFormData({ ...formData, name: e.target.value });
                          if (duplicateErrors.name) setDuplicateErrors(prev => ({ ...prev, name: undefined }));
                        }}
                        className={`w-full px-4 py-2.5 rounded-xl border outline-none transition-colors ${
                          duplicateErrors.name ? 'border-rose-400 focus:border-rose-500 bg-rose-50' : 'border-slate-200 focus:border-amber-500 bg-white'
                        }`}
                        placeholder="e.g. Brussels Center"
                      />
                      {duplicateErrors.name && (
                        <p className="mt-1.5 text-xs font-semibold text-rose-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />{duplicateErrors.name}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Company Name</label>
                      <input
                        required
                        type="text"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors bg-white"
                        placeholder="e.g. EazyOrder Brussels BV"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors bg-white font-bold"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Contact & Fiscal */}
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200/50 pb-3">
                    <Mail className="w-5 h-5 text-amber-500" />
                    <h3 className="text-base font-bold">Contact & Fiscal</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                      <input
                        required
                        type="email"
                        value={formData.email}
                        onChange={(e) => {
                          setFormData({ ...formData, email: e.target.value });
                          if (duplicateErrors.email) setDuplicateErrors(prev => ({ ...prev, email: undefined }));
                        }}
                        className={`w-full px-4 py-2.5 rounded-xl border outline-none transition-colors ${
                          duplicateErrors.email ? 'border-rose-400 focus:border-rose-500 bg-rose-50' : 'border-slate-200 focus:border-amber-500 bg-white'
                        }`}
                        placeholder="e.g. store@mrcod.com"
                      />
                      {duplicateErrors.email && (
                        <p className="mt-1.5 text-xs font-semibold text-rose-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />{duplicateErrors.email}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Phone</label>
                      <input
                        required
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors bg-white"
                        placeholder="+32..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">VAT Number</label>
                      <input
                        required
                        type="text"
                        value={formData.vatNumber}
                        onChange={(e) => {
                          setFormData({ ...formData, vatNumber: e.target.value });
                          if (duplicateErrors.vatNumber) setDuplicateErrors(prev => ({ ...prev, vatNumber: undefined }));
                        }}
                        className={`w-full px-4 py-2.5 rounded-xl border outline-none transition-colors ${
                          duplicateErrors.vatNumber ? 'border-rose-400 focus:border-rose-500 bg-rose-50' : 'border-slate-200 focus:border-amber-500 bg-white'
                        }`}
                        placeholder="e.g. BE 0123.456.789"
                      />
                      {duplicateErrors.vatNumber && (
                        <p className="mt-1.5 text-xs font-semibold text-rose-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />{duplicateErrors.vatNumber}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Location */}
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200/50 pb-3">
                    <MapPin className="w-5 h-5 text-amber-500" />
                    <h3 className="text-base font-bold">Location</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div className="col-span-2 sm:col-span-2">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Street</label>
                      <input
                        required
                        type="text"
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors"
                        placeholder="e.g. Grand Place"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-1">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Number</label>
                      <input
                        required
                        type="text"
                        value={formData.streetNumber}
                        onChange={(e) => setFormData({ ...formData, streetNumber: e.target.value })}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors"
                        placeholder="e.g. 1"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Post Code</label>
                      <input
                        required
                        type="text"
                        value={formData.postalCode}
                        onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors"
                        placeholder="e.g. 1000"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <label className="block text-sm font-bold text-slate-700 mb-1">City</label>
                      <input
                        required
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors"
                        placeholder="e.g. Brussels"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Country</label>
                      <select
                        required
                        value={formData.countryCode}
                        onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                        className="w-full px-4 py-2.5 font-bold text-sm bg-white border border-slate-200 rounded-xl focus:border-amber-500 outline-none transition-colors cursor-pointer"
                      >
                        <option value="BE">🇧🇪 Belgium (BE)</option>
                        <option value="NL">🇳🇱 Netherlands (NL)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 4. Platform Licensing & Hardware */}
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-6 text-slate-800 border-b border-slate-200/50 pb-3">
                    <MonitorSmartphone className="w-5 h-5 text-amber-500" />
                    <h3 className="text-base font-bold">Platform Licensing & Hardware</h3>
                  </div>
                  
                  <div className="space-y-6">
                    {/* POS Platform */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
                      <div>
                        <h4 className="font-bold text-slate-800">Point of Sale (POS)</h4>
                        <p className="text-xs text-slate-500 mt-1">Allow store to use the POS cashier app.</p>
                      </div>
                      <div className="flex items-center gap-4 mt-3 sm:mt-0">
                        {formData.allowPos && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-600">Terminals limit:</label>
                            <input
                              type="number" min="0" max="100"
                              value={formData.maxPosTerminals}
                              onChange={(e) => setFormData({ ...formData, maxPosTerminals: parseInt(e.target.value) || 0 })}
                              className="w-20 px-3 py-1.5 rounded-lg border border-slate-200 focus:border-amber-500 outline-none text-sm font-bold text-center"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, allowPos: !formData.allowPos, maxPosTerminals: !formData.allowPos ? 5 : 0 })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.allowPos ? 'bg-amber-500' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.allowPos ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    {/* Kiosk Platform */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
                      <div>
                        <h4 className="font-bold text-slate-800">Self-Service Kiosk</h4>
                        <p className="text-xs text-slate-500 mt-1">Allow store to deploy ordering kiosks.</p>
                      </div>
                      <div className="flex items-center gap-4 mt-3 sm:mt-0">
                        {formData.allowKiosk && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-600">Kiosks limit:</label>
                            <input
                              type="number" min="0" max="100"
                              value={formData.maxKiosks}
                              onChange={(e) => setFormData({ ...formData, maxKiosks: parseInt(e.target.value) || 0 })}
                              className="w-20 px-3 py-1.5 rounded-lg border border-slate-200 focus:border-amber-500 outline-none text-sm font-bold text-center"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, allowKiosk: !formData.allowKiosk, maxKiosks: !formData.allowKiosk ? 2 : 0 })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.allowKiosk ? 'bg-amber-500' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.allowKiosk ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    {/* KDS Platform */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
                      <div>
                        <h4 className="font-bold text-slate-800">Kitchen Display (KDS)</h4>
                        <p className="text-xs text-slate-500 mt-1">Allow store to use Kitchen screens & Live Orders app.</p>
                      </div>
                      <div className="flex items-center gap-4 mt-3 sm:mt-0">
                        {formData.allowKds && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-600">KDS limit:</label>
                            <input
                              type="number" min="0" max="100"
                              value={formData.maxKdsDevices}
                              onChange={(e) => setFormData({ ...formData, maxKdsDevices: parseInt(e.target.value) || 0 })}
                              className="w-20 px-3 py-1.5 rounded-lg border border-slate-200 focus:border-amber-500 outline-none text-sm font-bold text-center"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, allowKds: !formData.allowKds, maxKdsDevices: !formData.allowKds ? 5 : 0 })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.allowKds ? 'bg-amber-500' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.allowKds ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    {/* Online Ordering Platform */}
                    <div className="flex flex-col p-4 bg-white rounded-xl border border-slate-200 transition-all duration-300">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                        <div>
                          <h4 className="font-bold text-slate-800">Online Ordering & Drivers</h4>
                          <p className="text-xs text-slate-500 mt-1">Makes store visible on web and allows driver assignment.</p>
                        </div>
                        <div className="mt-3 sm:mt-0">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, allowOnlineOrdering: !formData.allowOnlineOrdering })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.allowOnlineOrdering ? 'bg-amber-500' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.allowOnlineOrdering ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>

                      {formData.allowOnlineOrdering && (
                        <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
                          <h5 className="text-sm font-bold text-slate-700 mb-4">Online Payment Gateways</h5>
                          
                          {/* Stripe Configuration */}
                          <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between mb-4">
                              <h6 className="font-bold text-sm text-slate-800">Stripe Integration</h6>
                              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, stripeEnvironment: 'TEST' })}
                                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${formData.stripeEnvironment === 'TEST' ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                  TEST
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, stripeEnvironment: 'LIVE' })}
                                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${formData.stripeEnvironment === 'LIVE' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                  LIVE
                                </button>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Publishable Key ({formData.stripeEnvironment})</label>
                                <input
                                  type="text"
                                  value={formData.stripeEnvironment === 'TEST' ? formData.stripePublishableKeyTest : formData.stripePublishableKeyLive}
                                  onChange={(e) => setFormData(formData.stripeEnvironment === 'TEST' 
                                    ? { ...formData, stripePublishableKeyTest: e.target.value }
                                    : { ...formData, stripePublishableKeyLive: e.target.value }
                                  )}
                                  className={`w-full px-3 py-2 rounded-lg border outline-none text-sm font-mono ${formData.stripeEnvironment === 'TEST' ? 'border-amber-200 focus:border-amber-500 bg-amber-50/30' : 'border-emerald-200 focus:border-emerald-500 bg-emerald-50/30'}`}
                                  placeholder={formData.stripeEnvironment === 'TEST' ? "pk_test_..." : "pk_live_..."}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Secret Key ({formData.stripeEnvironment})</label>
                                <input
                                  type="password"
                                  value={formData.stripeEnvironment === 'TEST' ? formData.stripeSecretKeyTest : formData.stripeSecretKeyLive}
                                  onChange={(e) => setFormData(formData.stripeEnvironment === 'TEST' 
                                    ? { ...formData, stripeSecretKeyTest: e.target.value }
                                    : { ...formData, stripeSecretKeyLive: e.target.value }
                                  )}
                                  className={`w-full px-3 py-2 rounded-lg border outline-none text-sm font-mono ${formData.stripeEnvironment === 'TEST' ? 'border-amber-200 focus:border-amber-500 bg-amber-50/30' : 'border-emerald-200 focus:border-emerald-500 bg-emerald-50/30'}`}
                                  placeholder={formData.stripeEnvironment === 'TEST' ? "sk_test_..." : "sk_live_..."}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Mollie Configuration */}
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between mb-4">
                              <h6 className="font-bold text-sm text-slate-800">Mollie Integration (Optional)</h6>
                              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, mollieEnvironment: 'TEST' })}
                                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${formData.mollieEnvironment === 'TEST' ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                  TEST
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, mollieEnvironment: 'LIVE' })}
                                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${formData.mollieEnvironment === 'LIVE' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                  LIVE
                                </button>
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">API Key ({formData.mollieEnvironment})</label>
                              <input
                                type="password"
                                value={formData.mollieEnvironment === 'TEST' ? formData.mollieApiKeyTest : formData.mollieApiKeyLive}
                                onChange={(e) => setFormData(formData.mollieEnvironment === 'TEST' 
                                  ? { ...formData, mollieApiKeyTest: e.target.value }
                                  : { ...formData, mollieApiKeyLive: e.target.value }
                                )}
                                className={`w-full px-3 py-2 rounded-lg border outline-none text-sm font-mono ${formData.mollieEnvironment === 'TEST' ? 'border-amber-200 focus:border-amber-500 bg-amber-50/30' : 'border-emerald-200 focus:border-emerald-500 bg-emerald-50/30'}`}
                                placeholder={formData.mollieEnvironment === 'TEST' ? "test_..." : "live_..."}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Fiscal Integration */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200/50">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">FDM ID (Belgium only)</label>
                        <input
                          type="text"
                          value={formData.fdmId}
                          onChange={(e) => setFormData({ ...formData, fdmId: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors bg-white font-mono text-sm"
                          placeholder="FDM-..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">VSC ID (Belgium only)</label>
                        <input
                          type="text"
                          value={formData.vscId}
                          onChange={(e) => setFormData({ ...formData, vscId: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors bg-white font-mono text-sm"
                          placeholder="VSC-..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. CCV Terminal Configuration */}
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-4 text-slate-800 border-b border-slate-200/50 pb-3">
                    <CreditCard className="w-5 h-5 text-amber-500" />
                    <h3 className="text-base font-bold">CCV Terminal Configuration</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Environment</label>
                      <select
                        value={formData.ccvEnvironment}
                        onChange={(e) => setFormData({ ...formData, ccvEnvironment: e.target.value as 'TEST' | 'LIVE' })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors bg-white font-bold"
                      >
                        <option value="TEST">TEST Mode (Sandbox)</option>
                        <option value="LIVE">LIVE Mode (Production)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Test API Key</label>
                      <input
                        type="text"
                        value={formData.ccvApiKeyTest}
                        onChange={(e) => setFormData({ ...formData, ccvApiKeyTest: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors bg-white font-mono text-sm"
                        placeholder="t_..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Live API Key</label>
                      <input
                        type="text"
                        value={formData.ccvApiKeyLive}
                        onChange={(e) => setFormData({ ...formData, ccvApiKeyLive: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none transition-colors bg-white font-mono text-sm"
                        placeholder="l_..."
                      />
                    </div>
                  </div>
                </div>

                {/* Buttons - Sticky Footer */}
                <div className="sticky bottom-0 bg-white/95 backdrop-blur z-10 -mx-4 -mb-4 px-4 py-4 sm:-mx-6 sm:-mb-6 sm:px-6 sm:py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 rounded-b-3xl mt-4">
                  <button
                    type="button"
                    onClick={() => setIsStoreModalOpen(false)}
                    className="w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full sm:w-auto px-8 py-3 sm:py-2.5 rounded-xl font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving && (
                      <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                    )}
                    {isSaving ? 'Saving...' : (editingStore ? 'Save Changes' : 'Create Store')}
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
              <h2 className="text-xl font-heading font-black text-slate-900 mb-2">Delete Store?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete <span className="font-bold text-slate-900">{storeToDelete?.name}</span>? This action cannot be undone.
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
