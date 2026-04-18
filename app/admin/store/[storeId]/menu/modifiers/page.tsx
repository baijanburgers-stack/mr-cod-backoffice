'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Edit2, Trash2, Settings2, X, AlertCircle, PlusCircle, GripVertical, Copy, Check } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import CurrencyInput from '@/components/ui/CurrencyInput';

type LocalizedString = {
  en: string;
  fr: string;
  nl: string;
};

type ModifierOption = {
  id: string;
  name: string | LocalizedString;
  price: number;
  vatRate?: number; // legacy
};

type MenuItem = {
  id: string;
  storeId: string;
  name: string;
  category: string;
  isAvailable: boolean;
};

type Modifier = {
  id: string;
  storeId: string;
  name: string | LocalizedString;
  isRequired: boolean;
  allowMultiple: boolean;
  maxSelections?: number | null;
  itemType?: 'food' | 'soft_drink' | 'alcohol';
  itemIds?: string[];
  options: ModifierOption[];
};

export default function StoreModifiersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const getModName = (name: string | LocalizedString | undefined) => {
    if (!name) return '';
    if (typeof name === 'string') return name;
    return name.en || '';
  };
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModifier, setEditingModifier] = useState<Modifier | null>(null);
  const [modifierToDelete, setModifierToDelete] = useState<string | null>(null);

  // Form state for the modal
  const [formData, setFormData] = useState<Partial<Modifier>>({
    name: { en: '', fr: '', nl: '' },
    isRequired: false,
    allowMultiple: false,
    itemType: 'food',
    options: []
  });

  // Assignment Modal State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [assigningModifier, setAssigningModifier] = useState<Modifier | null>(null);
  const [assignedItems, setAssignedItems] = useState<Set<string>>(new Set());
  const [assignSearchQuery, setAssignSearchQuery] = useState('');

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'modifiers'), where('storeId', '==', storeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedModifiers: Modifier[] = [];
      snapshot.forEach((doc) => {
        fetchedModifiers.push({ id: doc.id, ...doc.data() } as Modifier);
      });
      setModifiers(fetchedModifiers);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'modifiers');
      setIsLoading(false);
    });

    const qItems = query(collection(db, 'menuItems'), where('storeId', '==', storeId));
    const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
      const items: MenuItem[] = [];
      snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() } as MenuItem));
      items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      setMenuItems(items);
    });

    return () => {
      unsubscribe();
      unsubscribeItems();
    };
  }, [storeId, user]);

  const filteredModifiers = modifiers.filter(modifier => 
    getModName(modifier.name).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteClick = (id: string) => {
    setModifierToDelete(id);
  };

  const confirmDelete = async () => {
    if (modifierToDelete) {
      try {
        await deleteDoc(doc(db, 'modifiers', modifierToDelete));
        setModifierToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `modifiers/${modifierToDelete}`);
      }
    }
  };

  const handleDuplicate = async (modifier: Modifier) => {
    try {
      const { id, ...modifierData } = modifier;
      await addDoc(collection(db, 'modifiers'), {
        ...modifierData,
        name: typeof modifier.name === 'string' ? `${modifier.name} (Copy)` : { en: `${modifier.name.en} (Copy)`, fr: `${modifier.name.fr} (Copy)`, nl: `${modifier.name.nl} (Copy)` },
        options: modifier.options.map(opt => ({ ...opt, id: crypto.randomUUID() }))
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'modifiers');
    }
  };

  const openEditModal = (modifier: Modifier) => {
    setEditingModifier(modifier);
    
    // Ensure form data safely handles legacy string names
    setFormData({ 
      ...modifier,
      name: typeof modifier.name === 'string' ? { en: modifier.name, fr: modifier.name, nl: modifier.name } : modifier.name
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingModifier(null);
    setFormData({
      name: { en: '', fr: '', nl: '' },
      isRequired: false,
      allowMultiple: false,
      itemType: 'food',
      options: [{ id: crypto.randomUUID(), name: { en: '', fr: '', nl: '' }, price: 0 }]
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const safeName = formData.name as LocalizedString;
    if (!safeName?.en) return; // Basic validation
    
    const modifierData = {
      storeId,
      name: safeName,
      isRequired: formData.isRequired || false,
      allowMultiple: formData.allowMultiple || false,
      maxSelections: formData.allowMultiple && formData.maxSelections ? formData.maxSelections : null,
      itemType: formData.itemType || 'food',
      options: formData.options || []
    };

    try {
      if (editingModifier) {
        await updateDoc(doc(db, 'modifiers', editingModifier.id), modifierData);
      } else {
        await addDoc(collection(db, 'modifiers'), { ...modifierData, itemIds: [] });
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'modifiers');
    }
  };

  const openAssignModal = (modifier: Modifier) => {
    setAssigningModifier(modifier);
    setAssignedItems(new Set(modifier.itemIds || []));
    setAssignSearchQuery('');
  };

  const handleAssignToggle = (itemId: string) => {
    setAssignedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleAssignSave = async () => {
    if (!assigningModifier) return;
    try {
      await updateDoc(doc(db, 'modifiers', assigningModifier.id), {
        itemIds: Array.from(assignedItems)
      });
      setAssigningModifier(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `modifiers/${assigningModifier.id}`);
    }
  };

  const addOption = () => {
    setFormData(prev => ({
      ...prev,
      options: [...(prev.options || []), { id: crypto.randomUUID(), name: { en: '', fr: '', nl: '' }, price: 0 }]
    }));
  };

  const updateOptionName = (id: string, lang: 'en'|'fr'|'nl', value: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options?.map(opt => {
        if (opt.id === id) {
          const currentName = typeof opt.name === 'string' 
            ? { en: opt.name, fr: opt.name, nl: opt.name }
            : (opt.name || { en: '', fr: '', nl: '' });
          return { ...opt, name: { ...currentName, [lang]: value } };
        }
        return opt;
      })
    }));
  };

  const updateOption = (id: string, field: keyof ModifierOption, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options?.map(opt => opt.id === id ? { ...opt, [field]: value } : opt)
    }));
  };

  const removeOption = (id: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options?.filter(opt => opt.id !== id)
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Menu Modifiers</h1>
          <p className="mt-2 text-slate-500 font-medium">Customize your items with add-ons, sizes, and choices.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Modifier
        </button>
      </div>

      {/* Search */}
      <div className="mb-8 relative w-full">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Search modifiers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 shadow-sm focus:border-amber-500 focus:ring-amber-500 bg-white transition-colors"
        />
      </div>

      {/* Modifiers List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">All Modifiers</h3>
          <span className="text-sm font-medium text-slate-500">{modifiers.length} total</span>
        </div>
        
        {filteredModifiers.length === 0 ? (
          <div className="text-center py-16">
            <Settings2 className="mx-auto h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No modifiers found</h3>
            <p className="text-slate-500 mt-1">Try adjusting your search query or add a new one.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <AnimatePresence mode="popLayout">
              {filteredModifiers.map((modifier, idx) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  key={modifier.id}
                  className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-slate-50 transition-colors group bg-white"
                >
                  {/* Icon */}
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-blue-50 text-blue-500">
                      <Settings2 className="w-6 h-6" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-lg font-bold text-slate-900 truncate">{getModName(modifier.name)}</h4>
                      <div className="flex gap-2">
                        {modifier.isRequired ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 text-xs font-bold border border-rose-100">Required</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">Optional</span>
                        )}
                        {modifier.allowMultiple && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-xs font-bold border border-indigo-100">Multiple Choice</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-medium text-slate-400 capitalize mt-1 flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${modifier.itemType === 'alcohol' ? 'bg-purple-500' : modifier.itemType === 'soft_drink' ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
                      {modifier.itemType?.replace('_', ' ') || 'Food'} Category
                    </p>
                  </div>

                  {/* Stats & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 mt-4 sm:mt-0">
                    <div className="text-center">
                      <span className="block text-xl font-black text-slate-900">{modifier.options.length}</span>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Options</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => openAssignModal(modifier)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-sm font-bold transition-colors mr-2"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Assign Items
                        {modifier.itemIds && modifier.itemIds.length > 0 && (
                          <span className="bg-indigo-500 text-white px-1.5 py-0.5 rounded-md text-[10px]">{modifier.itemIds.length}</span>
                        )}
                      </button>
                      <button 
                        onClick={() => handleDuplicate(modifier)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                        title="Duplicate Modifier"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => openEditModal(modifier)}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                        title="Edit Modifier"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(modifier.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Delete Modifier"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-2xl lg:max-w-3xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
                <h2 className="text-2xl font-heading font-black text-slate-900">
                  {editingModifier ? 'Edit Modifier' : 'Add Modifier'}
                </h2>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <div className="flex flex-col lg:flex-row gap-6">

                  {/* ── Left column: identity & rules ── */}
                  <div className="flex-1 space-y-5">

                  {/* Basic Info (Multilingual Names) */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5 flex justify-between items-center">
                        <span>Modifier Name (English)</span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">Required</span>
                      </label>
                      <input 
                        type="text" 
                        value={(formData.name as LocalizedString)?.en || ''}
                        onChange={(e) => setFormData({...formData, name: { ...(formData.name as LocalizedString), en: e.target.value }})}
                        placeholder="e.g. Burger Add-ons"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Name (French)</label>
                        <input 
                          type="text" 
                          value={(formData.name as LocalizedString)?.fr || ''}
                          onChange={(e) => setFormData({...formData, name: { ...(formData.name as LocalizedString), fr: e.target.value }})}
                          placeholder="e.g. Suppléments Burger"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Name (Dutch)</label>
                        <input 
                          type="text" 
                          value={(formData.name as LocalizedString)?.nl || ''}
                          onChange={(e) => setFormData({...formData, name: { ...(formData.name as LocalizedString), nl: e.target.value }})}
                          placeholder="e.g. Burger Toevoegingen"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Category Type */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Item Tax / Category Type</label>
                    <select
                      value={formData.itemType || 'food'}
                      onChange={(e) => setFormData({...formData, itemType: e.target.value as 'food' | 'soft_drink' | 'alcohol'})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors bg-white"
                    >
                      <option value="food">Food</option>
                      <option value="soft_drink">Soft Drink</option>
                      <option value="alcohol">Alcoholic Drink</option>
                    </select>
                  </div>

                  {/* Rules */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                      <div className="mt-0.5">
                        <input 
                          type="checkbox" 
                          checked={formData.isRequired}
                          onChange={(e) => setFormData({...formData, isRequired: e.target.checked})}
                          className="w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <span className="block font-bold text-slate-900">Required</span>
                        <span className="block text-sm text-slate-500">Customer must select an option</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                      <div className="mt-0.5">
                        <input 
                          type="checkbox" 
                          checked={formData.allowMultiple}
                          onChange={(e) => setFormData({...formData, allowMultiple: e.target.checked})}
                          className="w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <span className="block font-bold text-slate-900">Multiple Choice</span>
                        <span className="block text-sm text-slate-500">Allow multiple selections</span>
                      </div>
                    </label>
                  </div>

                  </div>{/* end left column */}

                  {/* ── Right column: options ── */}
                  <div className="lg:w-72 flex-shrink-0">

                  {/* Options List */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-bold text-slate-700">Options</label>
                      <button 
                        onClick={addOption}
                        className="text-sm font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Add Option
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      <AnimatePresence mode="popLayout">
                        {formData.options?.map((option, index) => (
                          <motion.div 
                            key={option.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-3"
                          >
                            <div className="flex-1 space-y-1.5 min-w-[140px]">
                              <input 
                                type="text" 
                                value={typeof option.name === 'string' ? option.name : option.name?.en || ''}
                                onChange={(e) => updateOptionName(option.id, 'en', e.target.value)}
                                placeholder="Name (EN) e.g. Extra Cheese"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors text-sm"
                              />
                              <input 
                                type="text" 
                                value={typeof option.name === 'string' ? option.name : option.name?.fr || ''}
                                onChange={(e) => updateOptionName(option.id, 'fr', e.target.value)}
                                placeholder="Name (FR)"
                                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                              />
                              <input 
                                type="text" 
                                value={typeof option.name === 'string' ? option.name : option.name?.nl || ''}
                                onChange={(e) => updateOptionName(option.id, 'nl', e.target.value)}
                                placeholder="Name (NL)"
                                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                              />
                            </div>
                            <div className="w-24 shrink-0 flex flex-col items-end gap-2">
                              <CurrencyInput 
                                defaultValue={option.price}
                                onChange={(val) => updateOption(option.id, 'price', val)}
                                className="w-full py-2 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors text-sm"
                              />
                              <button 
                                onClick={() => removeOption(option.id)}
                                disabled={(formData.options?.length || 0) <= 1}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-400 w-full flex justify-center"
                                title="Remove Option"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>

                  </div>{/* end right column */}
                </div>{/* end flex row */}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="px-6 py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors shadow-sm"
                >
                  {editingModifier ? 'Save Changes' : 'Create Modifier'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {modifierToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModifierToDelete(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-heading font-black text-slate-900 mb-2">Delete Modifier?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete this modifier? It will be removed from all items using it.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setModifierToDelete(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-500 transition-colors shadow-sm"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Assign to Items Modal */}
      <AnimatePresence>
        {assigningModifier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAssigningModifier(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
                <h2 className="text-2xl font-heading font-black text-slate-900">
                  Assign to Items
                </h2>
                <button 
                  onClick={() => setAssigningModifier(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-4 border-b border-slate-100 bg-white flex-shrink-0">
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={assignSearchQuery}
                    onChange={(e) => setAssignSearchQuery(e.target.value)}
                    placeholder="Search menu items or categories..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {menuItems.filter(i => 
                  i.name.toLowerCase().includes(assignSearchQuery.toLowerCase()) || 
                  i.category.toLowerCase().includes(assignSearchQuery.toLowerCase())
                ).reduce((acc: React.ReactNode[], item, idx, arr) => {
                  const showHeader = idx === 0 || item.category !== arr[idx - 1].category;
                  
                  if (showHeader) {
                    acc.push(
                      <div key={`header-${item.category}`} className="px-4 py-2 bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10 border-y border-slate-100 first:border-t-0 mt-2 first:mt-0 flex items-center justify-between">
                        <span className="font-black text-slate-800 uppercase tracking-widest text-xs">{item.category}</span>
                        <button
                          onClick={() => {
                            const categoryItems = arr.filter(i => i.category === item.category).map(i => i.id);
                            const allSelected = categoryItems.every(id => assignedItems.has(id));
                            setAssignedItems(prev => {
                              const next = new Set(prev);
                              categoryItems.forEach(id => allSelected ? next.delete(id) : next.add(id));
                              return next;
                            });
                          }}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                        >
                          Select All
                        </button>
                      </div>
                    );
                  }
                  
                  acc.push(
                    <label key={item.id} className="flex items-center gap-3 p-3 mx-2 rounded-xl hover:bg-slate-50 cursor-pointer group transition-colors">
                      <input
                        type="checkbox"
                        checked={assignedItems.has(item.id)}
                        onChange={() => handleAssignToggle(item.id)}
                        className="w-5 h-5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                      />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className={`font-bold text-sm ${assignedItems.has(item.id) ? 'text-indigo-900' : 'text-slate-700'}`}>{item.name}</span>
                        {!item.isAvailable && <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-md">Hidden</span>}
                      </div>
                    </label>
                  );
                  
                  return acc;
                }, [])}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0">
                <span className="text-sm font-bold text-slate-500" key="assignedCount">
                  <span className="text-indigo-600 text-lg">{assignedItems.size}</span> items selected
                </span>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setAssigningModifier(null)}
                    className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleAssignSave}
                    className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-colors shadow-sm flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Save Assignment
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
