'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, MapPin, Phone, Mail, Edit, Trash2, ExternalLink, X, AlertTriangle, Image as ImageIcon, Store } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { resizeImage } from '@/lib/image-utils';
import { useLoadScript } from '@react-google-maps/api';
import usePlacesAutocomplete, { getGeocode } from 'use-places-autocomplete';
import { getDefaultVatCategories } from '@/lib/vat-rules';

type AddressDetails = {
  street: string;
  streetNumber: string;
  city: string;
  postalCode: string;
  countryCode: string;
};

type AddressAutocompleteProps = {
  value: string;
  onChange: (val: string, details: AddressDetails | null) => void;
};

const libraries: any = ["places"];

function AddressAutocomplete({ value, onChange }: AddressAutocompleteProps) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    libraries,
  });

  const {
    ready,
    value: inputValue,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    initOnMount: false,
    requestOptions: {
      /* basic config */
    },
    debounce: 300,
  });

  useEffect(() => {
    if (isLoaded) {
      init();
    }
  }, [isLoaded, init]);

  // Sync external value when editing existing store
  useEffect(() => {
    if (value && inputValue === '') {
      setValue(value, false);
    }
  }, [value, inputValue, setValue]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onChange(e.target.value, null); // Default until they pick a suggestion
  };

  const handleSelect = async (address: string) => {
    setValue(address, false);
    clearSuggestions();
    try {
      const results = await getGeocode({ address });
      const components = results[0]?.address_components || [];
      
      let streetName = '';
      let streetNumber = '';
      let city = '';
      let postalCode = '';
      let countryCode = 'DEFAULT';

      components.forEach(c => {
        if (c.types.includes('route')) streetName = c.long_name;
        if (c.types.includes('street_number')) streetNumber = c.long_name;
        if (c.types.includes('locality')) city = c.long_name;
        if (c.types.includes('postal_code')) postalCode = c.long_name;
        if (c.types.includes('country')) countryCode = c.short_name;
      });

      onChange(address, { street: streetName, streetNumber, city, postalCode, countryCode });
    } catch (error) {
      console.error('Error getting geocode:', error);
      onChange(address, null);
    }
  };

  if (!isLoaded) {
    return (
      <input
        required
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value, null)}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
        placeholder="Loading Map Services..."
      />
    );
  }

  return (
    <div className="relative w-full">
      <input
        required
        type="text"
        value={inputValue}
        onChange={handleInput}
        disabled={!ready}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
        placeholder="Search for an address..."
      />
      {status === "OK" && (
        <ul className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {data.map(({ place_id, description }) => (
            <li
              key={place_id}
              onClick={() => handleSelect(description)}
              className="px-4 py-3 hover:bg-slate-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0"
            >
              {description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Store = {
  id: string;
  name: string;
  address: string;
  manager: string;
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
  maxPosTerminals?: number;
  maxKiosks?: number;
  fdmId?: string;
  vscId?: string;
  ccvApiKeyLive?: string;
  ccvApiKeyTest?: string;
  ccvEnvironment?: 'TEST' | 'LIVE';
  ccvManagementSystemId?: 'GrundmasterBE' | 'GrundmasterNL' | 'GrundmasterNL-ThirdPartyTest';
  ccvBackendUrl?: string;
};

export default function SuperAdminStores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modal States
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '', address: '', street: '', streetNumber: '', city: '', postalCode: '', countryCode: 'BE', manager: '', phone: '', email: '', companyName: '', vatNumber: '', status: 'Active', image: '', logo: '', maxPosTerminals: 5, maxKiosks: 2, fdmId: '', vscId: '',
    ccvApiKeyLive: '', ccvApiKeyTest: '', ccvEnvironment: 'TEST' as 'TEST' | 'LIVE', ccvManagementSystemId: 'GrundmasterBE' as 'GrundmasterBE' | 'GrundmasterNL' | 'GrundmasterNL-ThirdPartyTest', ccvBackendUrl: 'https://app.mrcod.be'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'stores'), (snapshot) => {
      const fetchedStores: Store[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedStores.push({
          id: doc.id,
          name: data.name || '',
          address: data.address || '',
          manager: data.manager || '',
          phone: data.phone || '',
          email: data.email || '',
          companyName: data.companyName || '',
          vatNumber: data.vatNumber || '',
          status: data.isOpen ? 'Active' : 'Inactive',
          image: data.image || '',
          logo: data.logo || '',
          isOpen: data.isOpen ?? false,
          maxPosTerminals: data.maxPosTerminals ?? 5,
          maxKiosks: data.maxKiosks ?? 2,
          fdmId: data.fdmId || '',
          vscId: data.vscId || '',
          ccvApiKeyLive: data.ccvApiKeyLive || '',
          ccvApiKeyTest: data.ccvApiKeyTest || '',
          ccvEnvironment: data.ccvEnvironment || 'TEST',
          ccvManagementSystemId: data.ccvManagementSystemId || 'GrundmasterBE',
          ccvBackendUrl: data.ccvBackendUrl || 'https://app.mrcod.be',
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
    setFormData({ name: '', address: '', street: '', streetNumber: '', city: '', postalCode: '', countryCode: 'BE', manager: '', phone: '', email: '', companyName: '', vatNumber: '', status: 'Active', image: '', logo: '', maxPosTerminals: 5, maxKiosks: 2, fdmId: '', vscId: '', ccvApiKeyLive: '', ccvApiKeyTest: '', ccvEnvironment: 'TEST', ccvManagementSystemId: 'GrundmasterBE', ccvBackendUrl: 'https://app.mrcod.be' });
    setIsStoreModalOpen(true);
  };

  const openEditModal = (store: Store) => {
    setEditingStore(store);
    setFormData({ name: store.name, address: store.address, street: store.street || '', streetNumber: store.streetNumber || '', city: store.city || '', postalCode: store.postalCode || '', countryCode: store.countryCode || 'DEFAULT', manager: store.manager, phone: store.phone, email: store.email, companyName: store.companyName, vatNumber: store.vatNumber, status: store.status, image: store.image || '', logo: store.logo || '', maxPosTerminals: store.maxPosTerminals || 5, maxKiosks: store.maxKiosks || 2, fdmId: store.fdmId || '', vscId: store.vscId || '', ccvApiKeyLive: store.ccvApiKeyLive || '', ccvApiKeyTest: store.ccvApiKeyTest || '', ccvEnvironment: store.ccvEnvironment || 'TEST', ccvManagementSystemId: store.ccvManagementSystemId || 'GrundmasterBE', ccvBackendUrl: store.ccvBackendUrl || 'https://app.mrcod.be' });
    setIsStoreModalOpen(true);
  };

  const openDeleteModal = (store: Store) => {
    setStoreToDelete(store);
    setIsDeleteModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('Please upload a PNG or JPG file.');
      return;
    }

    // We still check initial size, but we'll compress it anyway
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB.');
      return;
    }

    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        // Resize to max 1200x800 which is plenty for a store banner
        const resized = await resizeImage(base64, 1200, 800, 0.7);
        setFormData({ ...formData, image: resized });
      } catch (error) {
        console.error('Error processing image:', error);
        alert('Failed to process image. Please try another one.');
      } finally {
        setIsProcessingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('Please upload a PNG or JPG file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB.');
      return;
    }

    setIsProcessingLogo(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        // Resize to max 400x400 for a logo
        const resized = await resizeImage(base64, 400, 400, 0.8);
        setFormData({ ...formData, logo: resized });
      } catch (error) {
        console.error('Error processing logo:', error);
        alert('Failed to process logo. Please try another one.');
      } finally {
        setIsProcessingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const storeData: any = {
        ...formData,
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

      // Auto-provision Manager User Account
      if (formData.email) {
        const managerEmail = formData.email.toLowerCase();
        await setDoc(doc(db, 'users', managerEmail), {
          email: managerEmail,
          name: formData.manager,
          role: 'store_admin',
          storeId: storeId,
          status: 'Active',
          phone: formData.phone,
          updatedAt: new Date().toISOString(),
          ...(!editingStore && { createdAt: new Date().toISOString() }) // Only set createdAt on new Store creations
        }, { merge: true }); // Merge true ensures we don't accidentally wipe existing user history if they already exist
      }

      setIsStoreModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingStore ? OperationType.UPDATE : OperationType.CREATE, 'stores');
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
          <p className="mt-2 text-slate-500 font-medium">Manage all MR COD locations, managers, and statuses.</p>
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
                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider">Manager</th>
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
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mr-3 font-bold text-xs">
                          {store.manager.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-slate-700 font-semibold">{store.manager}</span>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-heading font-black text-slate-900">
                  {editingStore ? 'Edit Store' : 'Add New Store'}
                </h2>
                <button onClick={() => setIsStoreModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSaveStore} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Store Banner</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-amber-400 transition-colors cursor-pointer relative overflow-hidden h-[120px]"
                    >
                      {formData.image ? (
                        <div className="absolute inset-0 w-full h-full">
                          <Image src={formData.image} alt="Banner Preview" fill className="object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <span className="text-white font-bold text-xs bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">Change Banner</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <ImageIcon className="w-6 h-6 mb-1 text-slate-400" />
                          <span className="text-xs font-bold text-center">Click to upload banner</span>
                          <span className="text-[10px] mt-0.5 text-center">PNG, JPG up to 10MB</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImageUpload} 
                        accept="image/png, image/jpeg" 
                        className="hidden" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Store Logo</label>
                    <div 
                      onClick={() => logoInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-amber-400 transition-colors cursor-pointer relative overflow-hidden h-[120px]"
                    >
                      {formData.logo ? (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-50">
                          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white shadow-sm">
                            <Image src={formData.logo} alt="Logo Preview" fill className="object-cover" />
                          </div>
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <span className="text-white font-bold text-xs bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">Change Logo</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Store className="w-6 h-6 mb-1 text-slate-400" />
                          <span className="text-xs font-bold text-center">Click to upload logo</span>
                          <span className="text-[10px] mt-0.5 text-center">Square ratio recommended</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        ref={logoInputRef} 
                        onChange={handleLogoUpload} 
                        accept="image/png, image/jpeg" 
                        className="hidden" 
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Store Name</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="e.g. Brussels Center"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Company Name</label>
                  <input
                    required
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="e.g. MR COD Brussels BV"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">VAT Number</label>
                  <input
                    required
                    type="text"
                    value={formData.vatNumber}
                    onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="e.g. BE 0123.456.789"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Address Search</label>
                  <AddressAutocomplete 
                    value={formData.address} 
                    onChange={(val, details) => {
                      if (details) {
                        setFormData(f => ({ ...f, address: val, ...details }));
                      } else {
                        setFormData(f => ({ ...f, address: val }));
                      }
                    }} 
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4 pt-4 border-t border-slate-100">
                    <div className="col-span-2 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Street</label>
                      <input
                        type="text"
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white outline-none transition-colors"
                        placeholder="e.g. Grand Place"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Number</label>
                      <input
                        type="text"
                        value={formData.streetNumber}
                        onChange={(e) => setFormData({ ...formData, streetNumber: e.target.value })}
                        className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white outline-none transition-colors"
                        placeholder="e.g. 1"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Post Code</label>
                      <input
                        type="text"
                        value={formData.postalCode}
                        onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                        className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white outline-none transition-colors"
                        placeholder="e.g. 1000"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2 lg:col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white outline-none transition-colors"
                        placeholder="e.g. Brussels"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-2 lg:col-span-1 hidden">
                       {/* Hidden Country field because users shouldn't change the base code manually easily or at least it doesn't need to be huge, but maybe show it */}
                    </div>
                    <div className="col-span-2 sm:col-span-2 lg:col-span-full">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Country Code (For Tax Isolation)</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={formData.countryCode}
                        onChange={(e) => setFormData({ ...formData, countryCode: e.target.value.toUpperCase() })}
                        className="w-16 px-3 py-2.5 text-center font-bold text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white outline-none transition-colors"
                        placeholder="BE"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Manager Name</label>
                    <input
                      required
                      type="text"
                      value={formData.manager}
                      onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                    <input
                      required
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="e.g. store@mrcod.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Phone</label>
                    <input
                      required
                      type="text"
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
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Max POS Terminals</label>
                    <input
                      required
                      type="number"
                      min="0"
                      max="100"
                      value={formData.maxPosTerminals}
                      onChange={(e) => setFormData({ ...formData, maxPosTerminals: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="e.g. 5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Max Kiosks</label>
                    <input
                      required
                      type="number"
                      min="0"
                      max="100"
                      value={formData.maxKiosks}
                      onChange={(e) => setFormData({ ...formData, maxKiosks: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="e.g. 2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">FDM ID</label>
                    <input
                      type="text"
                      value={formData.fdmId}
                      onChange={(e) => setFormData({ ...formData, fdmId: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="e.g. FDM-SBE12345"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">VSC ID</label>
                    <input
                      type="text"
                      value={formData.vscId}
                      onChange={(e) => setFormData({ ...formData, vscId: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="e.g. VSC-999999991"
                    />
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">CCV Terminal Configuration</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Active Environment</label>
                      <select
                        value={formData.ccvEnvironment}
                        onChange={(e) => setFormData({ ...formData, ccvEnvironment: e.target.value as 'TEST' | 'LIVE' })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white font-bold"
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
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors font-mono text-sm"
                        placeholder="t_xxxxxxxxxxx"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Live API Key</label>
                      <input
                        type="text"
                        value={formData.ccvApiKeyLive}
                        onChange={(e) => setFormData({ ...formData, ccvApiKeyLive: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 outline-none transition-colors font-mono text-sm"
                        placeholder="l_xxxxxxxxxxx"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Management System ID</label>
                      <select
                        value={formData.ccvManagementSystemId}
                        onChange={(e) => setFormData({ ...formData, ccvManagementSystemId: e.target.value as any })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white"
                      >
                        <option value="GrundmasterBE">🇧🇪 GrundmasterBE</option>
                        <option value="GrundmasterNL">🇳🇱 GrundmasterNL</option>
                        <option value="GrundmasterNL-ThirdPartyTest">🧪 GrundmasterNL-ThirdPartyTest</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Backend Webhook URL</label>
                      <input
                        type="url"
                        value={formData.ccvBackendUrl}
                        onChange={(e) => setFormData({ ...formData, ccvBackendUrl: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors font-mono text-sm"
                        placeholder="https://app.mrcod.be"
                      />
                    </div>
                  </div>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsStoreModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessingImage || isProcessingLogo}
                    className="px-5 py-2.5 rounded-xl font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {(isProcessingImage || isProcessingLogo) ? 'Processing...' : (editingStore ? 'Save Changes' : 'Create Store')}
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
