'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Edit2, Trash2, Settings2, X, AlertCircle, PlusCircle, Copy, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

type LocalizedString = { en: string; fr: string; nl: string };

type ModifierOption = {
  id: string;
  name: string | LocalizedString;
  price: number;
  imageUrl?: string;
  imagePath?: string;
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
  identityName?: string;
  isRequired: boolean;
  allowMultiple: boolean;
  minSelections?: number | null;
  maxSelections?: number | null;
  allowQuantityPerOption?: boolean;
  freeSelections?: number | null;
  itemType?: 'food' | 'non-alcoholic' | 'alcoholic';
  itemIds?: string[];
  options: ModifierOption[];
};

export default function StoreModifiersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const getModName = (name: string | LocalizedString | undefined) => {
    if (!name) return '';
    if (typeof name === 'string') return name;
    return name.en || '';
  };

  const autoCapWords = (val: string) => val.replace(/\b\w/g, (c) => c.toUpperCase());

  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Group modal state ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModifier, setEditingModifier] = useState<Modifier | null>(null);
  const [modifierToDelete, setModifierToDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<Modifier>>({
    name: { en: '', fr: '', nl: '' },
    minSelections: 0,
    maxSelections: null,
    allowQuantityPerOption: false,
    freeSelections: null,
    itemType: 'food',
  });

  // ── Assign modal state ──
  const [assigningModifier, setAssigningModifier] = useState<Modifier | null>(null);
  const [assignedItems, setAssignedItems] = useState<Set<string>>(new Set());
  const [assignSearchQuery, setAssignSearchQuery] = useState('');

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'modifiers'), where('storeId', '==', storeId));
    const unsub = onSnapshot(q, (snap) => {
      const list: Modifier[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Modifier));
      setModifiers(list);
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'modifiers');
      setIsLoading(false);
    });

    const qItems = query(collection(db, 'menuItems'), where('storeId', '==', storeId));
    const unsubItems = onSnapshot(qItems, (snap) => {
      const items: MenuItem[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MenuItem));
      items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      setMenuItems(items);
    });

    return () => { unsub(); unsubItems(); };
  }, [storeId, user]);

  const filtered = modifiers.filter(m =>
    getModName(m.name).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── CRUD ──
  const openAddModal = () => {
    setEditingModifier(null);
    setFormData({ name: { en: '', fr: '', nl: '' }, identityName: '', minSelections: 0, maxSelections: null, allowQuantityPerOption: false, freeSelections: null, itemType: 'food' });
    setIsModalOpen(true);
  };

  const openEditModal = (m: Modifier) => {
    setEditingModifier(m);
    setFormData({
      name: typeof m.name === 'string' ? { en: m.name, fr: m.name, nl: m.name } : m.name,
      identityName: m.identityName || '',
      minSelections: m.minSelections ?? (m.isRequired ? 1 : 0),
      maxSelections: m.maxSelections ?? (m.allowMultiple ? null : 1),
      allowQuantityPerOption: m.allowQuantityPerOption || false,
      freeSelections: m.freeSelections ?? null,
      itemType: m.itemType || 'food',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const safeName = formData.name as LocalizedString;
    if (!safeName?.en?.trim()) return;
    setIsSaving(true);
    try {
      const data = {
        storeId,
        name: safeName,
        identityName: formData.identityName?.trim() || '',
        minSelections: formData.minSelections || 0,
        maxSelections: (formData.maxSelections && formData.maxSelections > 0) ? formData.maxSelections : null,
        allowQuantityPerOption: formData.allowQuantityPerOption || false,
        freeSelections: (formData.freeSelections && formData.freeSelections > 0) ? formData.freeSelections : null,
        isRequired: (formData.minSelections || 0) > 0,
        allowMultiple: !formData.maxSelections || formData.maxSelections > 1,
        itemType: formData.itemType || 'food',
      };
      if (editingModifier) {
        await updateDoc(doc(db, 'modifiers', editingModifier.id), data);
      } else {
        await addDoc(collection(db, 'modifiers'), { ...data, options: [], itemIds: [] });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'modifiers');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!modifierToDelete) return;
    try {
      await deleteDoc(doc(db, 'modifiers', modifierToDelete));
      setModifierToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `modifiers/${modifierToDelete}`);
    }
  };

  const handleDuplicate = async (m: Modifier) => {
    try {
      const { id, ...data } = m;
      await addDoc(collection(db, 'modifiers'), {
        ...data,
        itemIds: [], // Clear assigned items on duplicate
        name: typeof m.name === 'string'
          ? `${m.name} (Copy)`
          : { en: `${m.name.en} (Copy)`, fr: `${m.name.fr} (Copy)`, nl: `${m.name.nl} (Copy)` },
        options: m.options.map(o => ({ ...o, id: crypto.randomUUID(), imageUrl: '', imagePath: '' })),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'modifiers');
    }
  };

  // ── Assign ──
  const openAssignModal = (m: Modifier) => {
    setAssigningModifier(m);
    setAssignedItems(new Set(m.itemIds || []));
    setAssignSearchQuery('');
  };

  const handleAssignSave = async () => {
    if (!assigningModifier) return;
    try {
      await updateDoc(doc(db, 'modifiers', assigningModifier.id), { itemIds: Array.from(assignedItems) });
      setAssigningModifier(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `modifiers/${assigningModifier.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const itemTypeDot: Record<string, string> = {
    food: 'bg-emerald-500',
    'non-alcoholic': 'bg-blue-500',
    alcoholic: 'bg-purple-500',
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Menu Modifiers</h1>
          <p className="mt-2 text-slate-500 font-medium">
            Create modifier groups, then add options with images on the next step.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Modifier Group
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

      {/* List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">All Modifier Groups</h3>
          <span className="text-sm font-medium text-slate-500">{modifiers.length} total</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Settings2 className="mx-auto h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No modifiers found</h3>
            <p className="text-slate-500 mt-1">Create your first modifier group to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <AnimatePresence mode="popLayout">
              {filtered.map((modifier, idx) => {
                const withImages = modifier.options.filter(o => o.imageUrl).length;
                const totalOpts = modifier.options.length;
                return (
                  <motion.div
                    layout
                    key={modifier.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    className="p-4 sm:p-5 flex flex-col gap-3 hover:bg-slate-50/70 transition-colors group bg-white"
                  >
                    {/* Info + Actions row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="text-base font-bold text-slate-900 truncate">{getModName(modifier.name)}</h4>
                          {modifier.identityName && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-black border border-amber-200 uppercase tracking-widest flex-shrink-0" title="Internal Office Name">
                              {modifier.identityName}
                            </span>
                          )}
                          {modifier.isRequired
                            ? <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 text-xs font-bold border border-rose-100">Required</span>
                            : <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">Optional</span>
                          }
                          {modifier.allowMultiple && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-xs font-bold border border-indigo-100">Multiple</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-medium">
                          <span className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${itemTypeDot[modifier.itemType || 'food']}`} />
                            {modifier.itemType?.replace('_', ' ') || 'food'}
                          </span>
                          <span>·</span>
                          <span>{totalOpts} option{totalOpts !== 1 ? 's' : ''}</span>
                          {withImages > 0 && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1 text-amber-600">
                                <ImageIcon className="w-3.5 h-3.5" />
                                {withImages} with image{withImages !== 1 ? 's' : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Icon + controls on right */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => handleDuplicate(modifier)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="Duplicate">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEditModal(modifier)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors" title="Edit group">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setModifierToDelete(modifier.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom action row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => openAssignModal(modifier)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-bold transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Assign Items
                        {(modifier.itemIds?.length || 0) > 0 && (
                          <span className="bg-indigo-500 text-white px-1.5 py-0.5 rounded text-[10px]">{modifier.itemIds!.length}</span>
                        )}
                      </button>
                      <button
                        onClick={() => router.push(`/admin/store/${storeId}/menu/modifiers/${modifier.id}`)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg text-xs font-bold transition-colors"
                      >
                        Manage Options
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Create/Edit Group Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative w-full sm:max-w-3xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal header */}
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="text-xl font-heading font-black text-slate-900">
                    {editingModifier ? 'Edit Modifier Group' : 'New Modifier Group'}
                  </h2>
                  {!editingModifier && (
                    <p className="text-xs text-slate-400 mt-0.5">You can add options with images after saving.</p>
                  )}
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column: General Info */}
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">General Details</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5 flex justify-between">
                            <span>Group Name (English)</span>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">Required</span>
                          </label>
                          <input
                            type="text"
                            value={(formData.name as LocalizedString)?.en || ''}
                            onChange={(e) => setFormData({ ...formData, name: { ...(formData.name as LocalizedString), en: autoCapWords(e.target.value) } })}
                            placeholder="e.g. Burger Add-ons"
                            autoCapitalize="words"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                            autoFocus
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5">Name (FR)</label>
                            <input
                              type="text"
                              value={(formData.name as LocalizedString)?.fr || ''}
                              onChange={(e) => setFormData({ ...formData, name: { ...(formData.name as LocalizedString), fr: autoCapWords(e.target.value) } })}
                              placeholder="e.g. Suppléments"
                              autoCapitalize="words"
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5">Name (NL)</label>
                            <input
                              type="text"
                              value={(formData.name as LocalizedString)?.nl || ''}
                              onChange={(e) => setFormData({ ...formData, name: { ...(formData.name as LocalizedString), nl: autoCapWords(e.target.value) } })}
                              placeholder="e.g. Toevoegingen"
                              autoCapitalize="words"
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                            />
                          </div>
                        </div>

                        <div className="pt-2">
                          <label className="block text-sm font-bold text-slate-700 mb-1.5 flex justify-between">
                            <span>Identity Name (Office Only)</span>
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">Hidden from Kiosk</span>
                          </label>
                          <input
                            type="text"
                            value={formData.identityName || ''}
                            onChange={(e) => setFormData({ ...formData, identityName: e.target.value })}
                            placeholder="e.g. Burger Sauces (Store 1)"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors bg-slate-50"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">Tax / Category Type</label>
                          <select
                            value={formData.itemType || 'food'}
                            onChange={(e) => setFormData({ ...formData, itemType: e.target.value as 'food' | 'non-alcoholic' | 'alcoholic' })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors bg-white"
                          >
                            <option value="food">🍔 Food (prepared meal)</option>
                            <option value="non-alcoholic">🥤 Non-Alcoholic Drink</option>
                            <option value="alcoholic">🍺 Alcoholic Drink</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Rules & Logic */}
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Selection Rules</h3>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5 flex justify-between">
                              <span>Min Selections</span>
                              <span className="text-xs text-slate-400 font-medium">0 = Optional</span>
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={formData.minSelections ?? 0}
                              onChange={(e) => setFormData({ ...formData, minSelections: parseInt(e.target.value) || 0 })}
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors bg-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5 flex justify-between">
                              <span>Max Selections</span>
                              <span className="text-xs text-slate-400 font-medium">Empty = Unlimited</span>
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={formData.maxSelections ?? ''}
                              onChange={(e) => setFormData({ ...formData, maxSelections: e.target.value ? parseInt(e.target.value) : null })}
                              placeholder="Unlimited"
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors bg-white text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5 flex justify-between">
                            <span>Free Included</span>
                            <span className="text-xs text-slate-400 font-medium">0 = All Paid</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={formData.freeSelections ?? ''}
                            onChange={(e) => setFormData({ ...formData, freeSelections: e.target.value ? parseInt(e.target.value) : null })}
                            placeholder="e.g. 2 options are free"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors bg-white text-sm"
                          />
                        </div>

                        {(!formData.maxSelections || formData.maxSelections > 1) && (
                          <label className="flex items-start gap-3 p-4 mt-1 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={formData.allowQuantityPerOption || false}
                              onChange={(e) => setFormData({ ...formData, allowQuantityPerOption: e.target.checked })}
                              className="mt-0.5 w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                            />
                            <div>
                              <span className="block font-bold text-slate-900 text-sm">Allow Quantity Stepper</span>
                              <span className="block text-xs text-slate-500 mt-0.5">Customers can pick multiple of the exact same option (e.g. 3x Ketchup)</span>
                            </div>
                          </label>
                        )}

                        {/* Rule summary text */}
                        <div className="mt-4 p-3 bg-amber-50/80 rounded-xl border border-amber-100/50 flex gap-3">
                          <span className="text-amber-500 text-lg">💡</span>
                          <p className="text-xs font-medium text-amber-700/80 leading-relaxed">
                            {
                              (formData.minSelections || 0) === 0 && !formData.maxSelections ? "Customer can select any number of options, or none at all." :
                              (formData.minSelections || 0) > 0 && !formData.maxSelections ? `Customer must select at least ${formData.minSelections} option${formData.minSelections! > 1 ? 's' : ''}.` :
                              (formData.minSelections || 0) === 0 && formData.maxSelections ? `Customer can select up to ${formData.maxSelections} option${formData.maxSelections > 1 ? 's' : ''} (optional).` :
                              (formData.minSelections === formData.maxSelections) ? `Customer must select exactly ${formData.minSelections} option${formData.minSelections! > 1 ? 's' : ''}.` :
                              `Customer must select between ${formData.minSelections} and ${formData.maxSelections} options.`
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-2 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-white">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !(formData.name as LocalizedString)?.en?.trim()}
                  className="px-6 py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? 'Saving…' : editingModifier ? 'Save Changes' : 'Create & Add Options →'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {modifierToDelete && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setModifierToDelete(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-heading font-black text-slate-900 mb-2">Delete Modifier Group?</h2>
              <p className="text-slate-500 text-sm mb-6">
                This will permanently delete the group and all its options (including images).
              </p>
              <div className="flex gap-3">
                <button onClick={() => setModifierToDelete(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button onClick={confirmDelete}
                  className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-500 transition-colors">
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Assign to Items Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {assigningModifier && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setAssigningModifier(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative w-full sm:max-w-lg max-h-[90vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
                <div>
                  <h2 className="text-xl font-heading font-black text-slate-900">Assign to Menu Items</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{getModName(assigningModifier.name)}</p>
                </div>
                <button onClick={() => setAssigningModifier(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 border-b border-slate-100 flex-shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={assignSearchQuery}
                    onChange={(e) => setAssignSearchQuery(e.target.value)}
                    placeholder="Search items or categories..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 transition-colors text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {menuItems
                  .filter(i =>
                    i.name.toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
                    i.category.toLowerCase().includes(assignSearchQuery.toLowerCase())
                  )
                  .reduce((acc: React.ReactNode[], item, idx, arr) => {
                    const showHeader = idx === 0 || item.category !== arr[idx - 1].category;
                    if (showHeader) {
                      const catItems = arr.filter(i => i.category === item.category).map(i => i.id);
                      const allSel = catItems.every(id => assignedItems.has(id));
                      acc.push(
                        <div key={`cat-${item.category}`} className="px-4 py-2 bg-slate-50 sticky top-0 z-10 border-y border-slate-100 mt-2 first:mt-0 flex justify-between items-center">
                          <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{item.category}</span>
                          <button
                            onClick={() => setAssignedItems(prev => {
                              const next = new Set(prev);
                              catItems.forEach(id => allSel ? next.delete(id) : next.add(id));
                              return next;
                            })}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                          >
                            {allSel ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                      );
                    }
                    acc.push(
                      <label key={item.id} className="flex items-center gap-3 p-3 mx-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={assignedItems.has(item.id)}
                          onChange={() => setAssignedItems(prev => {
                            const next = new Set(prev);
                            next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                            return next;
                          })}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                        />
                        <span className={`text-sm font-bold ${assignedItems.has(item.id) ? 'text-indigo-900' : 'text-slate-700'}`}>{item.name}</span>
                        {!item.isAvailable && <span className="text-[10px] font-black uppercase text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-md">Hidden</span>}
                      </label>
                    );
                    return acc;
                  }, [])}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0">
                <span className="text-sm font-bold text-slate-500">
                  <span className="text-indigo-600 text-base">{assignedItems.size}</span> selected
                </span>
                <div className="flex gap-3">
                  <button onClick={() => setAssigningModifier(null)} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors text-sm">Cancel</button>
                  <button onClick={handleAssignSave} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-colors text-sm flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Save
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
