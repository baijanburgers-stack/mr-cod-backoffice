'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import {
  Search, Plus, Edit2, Trash2, X, AlertCircle, PlusCircle,
  Layers, GripVertical, Image as ImageIcon, ChevronDown, ChevronUp,
  Check, Tag, Info
} from 'lucide-react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import CurrencyInput from '@/components/ui/CurrencyInput';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, onSnapshot
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import { computeSavingsRange } from '@/lib/combo-pricing';
import { onInputCap } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

type SlotOption = {
  menuItemId: string;
  name: string | LocalizedString;
  priceAdjustment: number; // extra charge vs combo base price (0 most of the time)
};

/**
 * A "slot" in the combo — represents one required component.
 * If options.length === 1 it is a fixed item.
 * If options.length > 1 the customer chooses.
 */
type ComboSlot = {
  id: string;            // local UUID for UI keying
  label: string | LocalizedString;         // e.g. "Main", "Side", "Drink"
  quantity: number;      // how many of this slot (e.g. 2 drinks)
  options: SlotOption[]; // the menu items the customer can choose from
};

type MenuItem = {
  id: string;
  name: string | LocalizedString;
  price: number;
  itemType?: 'food' | 'soft_drink' | 'alcohol';
  category: string;
};

const getItemName = (name: string | LocalizedString | undefined): string => {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.en || '';
};

type Combo = {
  id: string;
  storeId: string;
  name: string | LocalizedString;
  category?: string;
  description: string | LocalizedString;
  price: number;
  isActive: boolean;
  displaySavings: boolean;  // show 🎉 savings badge on kiosk
  image?: string | null;
  slots: ComboSlot[];
  // Legacy compat: keep "items" for the menu page reader
  // price + itemType are now required for GKS proportional VAT split
  items: { id: string; name: string; quantity: number; price: number; itemType: string }[];
};



type LocalizedString = {
  en: string;
  fr: string;
  nl: string;
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function StoreCombosPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [combos, setCombos] = useState<Combo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [comboToDelete, setComboToDelete] = useState<string | null>(null);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const getCategoryName = (name: string | LocalizedString | undefined) => {
    if (!name) return '';
    if (typeof name === 'string') return name;
    return name.en || '';
  };

  const getComboName = (name: Combo['name'] | undefined) => {
    if (!name) return '';
    if (typeof name === 'string') return name;
    return name.en || '';
  };

  const getComboDesc = (desc: Combo['description'] | undefined) => {
    if (!desc) return '';
    if (typeof desc === 'string') return desc;
    return desc.en || '';
  };

  const getSlotLabel = (label: ComboSlot['label'] | undefined) => {
    if (!label) return '';
    if (typeof label === 'string') return label;
    return label.en || '';
  };

  const emptyForm = (): Partial<Combo> => ({
    name: { en: '', fr: '', nl: '' },
    category: '',
    description: { en: '', fr: '', nl: '' },
    price: 0,
    isActive: true,
    displaySavings: true,
    image: '',
    slots: [newSlot()],
  });

  const [formData, setFormData] = useState<Partial<Combo>>(emptyForm());
  const [modalLang, setModalLang] = useState<'en' | 'fr' | 'nl'>('en');

  // ── Data Fetching ──────────────────────────────────────────────────────

  // Prevent browser from opening files when dropped outside the drop zone
  useEffect(() => {
    const preventDefault = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const qCombos = query(collection(db, 'combos'), where('storeId', '==', storeId));
    const unsubCombos = onSnapshot(qCombos, (snap) => {
      const rows: Combo[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() } as Combo));
      setCombos(rows);
      setIsLoading(false);
    }, (err) => { handleFirestoreError(err, OperationType.GET, 'combos'); setIsLoading(false); });

    const qMenu = query(collection(db, 'menuItems'), where('storeId', '==', storeId));
    const unsubMenu = onSnapshot(qMenu, (snap) => {
      const rows: MenuItem[] = [];
      snap.forEach((d) => rows.push({ id: d.id, name: d.data().name, price: d.data().price || 0, itemType: d.data().itemType, category: d.data().category || '' }));
      rows.sort((a, b) => getItemName(a.name).localeCompare(getItemName(b.name)));
      setMenuItems(rows);
    });

    const qCats = query(collection(db, 'categories'), where('storeId', '==', storeId));
    const unsubCats = onSnapshot(qCats, (snap) => {
      const rows: { id: string; name: string }[] = [];
      snap.forEach((d) => rows.push({ id: d.id, name: getCategoryName(d.data().name) }));
      setCategories(rows);
    });

    return () => { unsubCombos(); unsubMenu(); unsubCats(); };
  }, [storeId, user]);

  // ── Image ──────────────────────────────────────────────────────────────

  const compressImage = (b64: string, mw = 800, mh = 800, q = 0.7): Promise<string> =>
    new Promise((resolve) => {
      const img = new window.Image();
      img.src = b64;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h) { if (w > mw) { h = Math.round((h * mw) / w); w = mw; } }
        else { if (h > mh) { w = Math.round((w * mh) / h); h = mh; } }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d')?.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/webp', q));
      };
    });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be less than 5MB'); return; }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result as string);
      setImagePreview(compressed);
    };
    reader.readAsDataURL(file);
  };

  // ── Slot helpers ───────────────────────────────────────────────────────

  function newSlot(): ComboSlot {
    return { id: crypto.randomUUID(), label: { en: '', fr: '', nl: '' }, quantity: 1, options: [] };
  }

  const addSlot = () =>
    setFormData(p => ({ ...p, slots: [...(p.slots || []), newSlot()] }));

  const removeSlot = (id: string) =>
    setFormData(p => ({ ...p, slots: (p.slots || []).filter(s => s.id !== id) }));

  const updateSlot = (id: string, field: keyof ComboSlot, value: any) =>
    setFormData(p => ({ ...p, slots: (p.slots || []).map(s => s.id === id ? { ...s, [field]: value } : s) }));

  const addOptionToSlot = (slotId: string, menuItemId: string) => {
    const mi = menuItems.find(m => m.id === menuItemId);
    if (!mi) return;
    setFormData(p => ({
      ...p,
      slots: (p.slots || []).map(s => s.id === slotId
        ? { ...s, options: s.options.find(o => o.menuItemId === menuItemId) ? s.options : [...s.options, { menuItemId: mi.id, name: mi.name, priceAdjustment: 0 }] }
        : s
      )
    }));
  };

  const removeOptionFromSlot = (slotId: string, menuItemId: string) =>
    setFormData(p => ({
      ...p,
      slots: (p.slots || []).map(s => s.id === slotId
        ? { ...s, options: s.options.filter(o => o.menuItemId !== menuItemId) }
        : s
      )
    }));

  const updateOptionAdj = (slotId: string, menuItemId: string, adj: number) =>
    setFormData(p => ({
      ...p,
      slots: (p.slots || []).map(s => s.id === slotId
        ? { ...s, options: s.options.map(o => o.menuItemId === menuItemId ? { ...o, priceAdjustment: adj } : o) }
        : s
      )
    }));

  // ── CRUD ───────────────────────────────────────────────────────────────

  const toggleStatus = async (id: string, cur: boolean) => {
    try { await updateDoc(doc(db, 'combos', id), { isActive: !cur }); }
    catch (e) { handleFirestoreError(e, OperationType.UPDATE, `combos/${id}`); }
  };

  const confirmDelete = async () => {
    if (!comboToDelete) return;
    try { await deleteDoc(doc(db, 'combos', comboToDelete)); setComboToDelete(null); }
    catch (e) { handleFirestoreError(e, OperationType.DELETE, `combos/${comboToDelete}`); }
  };

  const openEditModal = (combo: Combo) => {
    setEditingCombo(combo);
    setImagePreview(combo.image || null);
    // Migrate legacy combos that don't have slots yet
    const slots: ComboSlot[] = combo.slots?.length
      ? combo.slots
      : (combo.items || []).map(it => ({
          id: crypto.randomUUID(),
          label: { en: it.name, fr: it.name, nl: it.name },
          quantity: it.quantity,
          options: [{ menuItemId: it.id, name: it.name, priceAdjustment: 0 }]
        }));
    setFormData({ 
      ...combo, 
      slots,
      name: typeof combo.name === 'string' ? { en: combo.name, fr: combo.name, nl: combo.name } : combo.name,
      description: typeof combo.description === 'string' ? { en: combo.description, fr: combo.description, nl: combo.description } : combo.description
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingCombo(null);
    setImagePreview(null);
    setFormData({
      ...emptyForm(),
      category: categories[0]?.name || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const slots = (formData.slots || []).filter(s => s.options.length > 0);
    const safeName = formData.name as LocalizedString;
    if (!safeName?.en?.trim() && typeof formData.name !== 'string') { alert('Please provide a combo name in English.'); return; }
    if (typeof formData.name === 'string' && !formData.name.trim()) { alert('Please provide a combo name.'); return; }
    if (!formData.price || formData.price <= 0) { alert('Please set a combo price.'); return; }
    if (slots.length === 0) { alert('Please add at least one slot with at least one item option.'); return; }

    // Build legacy "items" field for backward compat with POS receipt engine.
    // IMPORTANT: price + itemType are required for Belgian GKS proportional VAT split.
    const legacyItems = slots.flatMap(s =>
      s.options.slice(0, 1).map(o => {
        const mi = menuItems.find(m => m.id === o.menuItemId);
        return {
          id:       o.menuItemId,
          name:     o.name,
          quantity: s.quantity,
          price:    mi?.price ?? 0,          // catalogue price — needed for GKS discount split
          itemType: mi?.itemType ?? 'food',  // VAT category — needed for GKS band assignment
        };
      })
    );

    const payload = {
      storeId,
      name: formData.name,
      category: formData.category || '',
      description: formData.description || { en: '', fr: '', nl: '' },
      price: Number(formData.price),
      isActive: formData.isActive ?? true,
      displaySavings: formData.displaySavings ?? true,
      image: imagePreview || null,
      slots,
      items: legacyItems,
    };


    try {
      if (editingCombo) await updateDoc(doc(db, 'combos', editingCombo.id), payload);
      else await addDoc(collection(db, 'combos'), payload);
      setIsModalOpen(false);
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'combos'); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────

  const filteredCombos = combos.filter(c =>
    getComboName(c.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
    getComboDesc(c.description).toLowerCase().includes(searchQuery.toLowerCase())
  );



  // ── Slot Editor component (inline) ─────────────────────────────────────

  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [slotPicker, setSlotPicker] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  // ── Live savings preview ───────────────────────────────────────────────
  // Derives min / max basket totals from all slot options currently in formData.
  const savingsPreview = (() => {
    const slots = formData.slots || [];
    const price = Number(formData.price) || 0;
    if (price <= 0 || slots.length === 0) return null;

    let minBasket = 0;
    let maxBasket = 0;
    let allHavePrices = true;

    for (const slot of slots) {
      if (slot.options.length === 0) { allHavePrices = false; break; }
      const prices = slot.options.map(opt => {
        const mi = menuItems.find(m => m.id === opt.menuItemId);
        return mi ? mi.price : 0;
      });
      if (prices.some(p => p === 0)) { allHavePrices = false; break; }
      const slotMin = Math.min(...prices) * slot.quantity;
      const slotMax = Math.max(...prices) * slot.quantity;
      minBasket += slotMin;
      maxBasket += slotMax;
    }

    if (!allHavePrices || minBasket <= 0) return null;
    return { ...computeSavingsRange(minBasket, maxBasket, price), minBasket, maxBasket };
  })();



  // ── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Menu Combos</h1>
          <p className="mt-2 text-slate-500 font-medium">Create meal deals where customers choose components from options.</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Combo
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 font-medium">
          Each combo is made of <strong>slots</strong> (e.g. &quot;Main&quot;, &quot;Side&quot;, &quot;Drink&quot;). Each slot can have <strong>multiple options</strong> the customer chooses from. If a slot has only one option it&apos;s fixed.
        </p>
      </div>

      {/* Search */}
      <div className="mb-8 relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Search combos..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="block w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 shadow-sm focus:border-amber-500 focus:ring-amber-500 bg-white transition-colors"
        />
      </div>

      {/* Combos List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">All Combos</h3>
          <span className="text-sm font-medium text-slate-500">{combos.length} total</span>
        </div>

        {filteredCombos.length === 0 ? (
          <div className="text-center py-16">
            <Layers className="mx-auto h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No combos yet</h3>
            <p className="text-slate-500 mt-1">Create your first combo meal deal.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <AnimatePresence mode="popLayout">
              {filteredCombos.map((combo, idx) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.04 }}
                  key={combo.id}
                  className={`p-4 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-4 hover:bg-slate-50 transition-colors group ${!combo.isActive ? 'opacity-60 grayscale-[0.4]' : ''}`}
                >
                  {/* Image */}
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 bg-amber-50 text-amber-500 border border-amber-100 overflow-hidden relative">
                    {combo.image
                      ? <Image src={combo.image} alt={getComboName(combo.name)} fill className="object-cover" />
                      : <Layers className="w-8 h-8" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="text-lg font-heading font-black text-slate-900 truncate">{getComboName(combo.name)}</h4>
                      <span className="font-black text-lg text-slate-900">€{combo.price.toFixed(2)}</span>
                    </div>
                    {getComboDesc(combo.description) && (
                      <p className="text-sm text-slate-500 mb-2 line-clamp-1">{getComboDesc(combo.description)}</p>
                    )}
                    {/* Slots summary */}
                    <div className="flex flex-wrap gap-2">
                      {(combo.slots || []).map(s => (
                        <div key={s.id} className="flex items-center gap-1">
                          {getSlotLabel(s.label) && (
                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">{s.quantity > 1 ? `${s.quantity}×` : ''}{getSlotLabel(s.label)}:</span>
                          )}
                          <span className="text-[11px] text-slate-600 font-medium">
                            {s.options.length === 1
                              ? getItemName(s.options[0].name)
                              : `${s.options.length} choices`}
                          </span>
                        </div>
                      ))}
                      {/* Legacy fallback */}
                      {(!combo.slots || combo.slots.length === 0) && (combo.items || []).map(it => (
                        <span key={it.id} className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                          {it.quantity}× {it.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                    <label className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" className="sr-only" checked={combo.isActive} onChange={() => toggleStatus(combo.id, combo.isActive)} />
                        <div className={`block w-10 h-6 rounded-full transition-colors ${combo.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${combo.isActive ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className={`ml-2 text-xs font-bold ${combo.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {combo.isActive ? 'Active' : 'Hidden'}
                      </span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(combo)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setComboToDelete(combo.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              className="relative w-full max-w-2xl lg:max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0">
                <h2 className="text-xl font-heading font-black text-slate-900">
                  {editingCombo ? 'Edit Combo' : 'Create Combo'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto flex-1">
                <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-slate-100">

                  {/* ── Left: Details ── */}
                  <div className="flex-1 p-6 space-y-5">

                {/* ─ Basic Info ─ */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Basic Info</p>
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                      {([['en', '🇬🇧'], ['fr', '🇫🇷'], ['nl', '🇳🇱']] as const).map(([lang, flag]) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => setModalLang(lang as 'en' | 'fr' | 'nl')}
                          className={`px-2 py-1 rounded-md text-xs font-bold transition-all ${
                            modalLang === lang ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {flag} {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(['en', 'fr', 'nl'] as const).map(lang => (
                      <div key={lang} className={modalLang === lang ? 'block' : 'hidden'}>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Combo Name ({lang.toUpperCase()}) <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          value={(formData.name as any)?.[lang] || ''}
                          onChange={e => {
                            const newName = { ...(formData.name as any), [lang]: e.target.value };
                            setFormData({ ...formData, name: newName });
                          }}
                          onInput={onInputCap}
                          placeholder={lang === 'en' ? "e.g. Family Burger Deal" : ""}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:outline-none transition-colors"
                        />
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Category</label>
                        <select
                          value={formData.category || ''}
                          onChange={e => setFormData({ ...formData, category: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:outline-none bg-white font-medium text-slate-700"
                        >
                          <option value="">Select category</option>
                          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Combo Price (€) <span className="text-rose-500">*</span></label>
                        <CurrencyInput
                          defaultValue={formData.price}
                          onChange={val => setFormData({ ...formData, price: val })}
                          className="w-full py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    {(['en', 'fr', 'nl'] as const).map(lang => (
                      <div key={lang} className={modalLang === lang ? 'block' : 'hidden'}>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Description ({lang.toUpperCase()})</label>
                        <textarea
                          rows={2}
                          value={(formData.description as any)?.[lang] || ''}
                          onChange={e => {
                            const newDesc = { ...(formData.description as any), [lang]: e.target.value };
                            setFormData({ ...formData, description: newDesc });
                          }}
                          onInput={onInputCap}
                          placeholder={lang === 'en' ? "Describe the combo deal..." : ""}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:outline-none resize-none"
                        />
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Image (Optional)</label>
                        <div className="relative h-[46px] w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-amber-400 transition-colors cursor-pointer overflow-hidden flex items-center justify-center">
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                          {imagePreview ? (
                            <div className="relative w-full h-full flex items-center justify-between px-3">
                              <span className="text-xs font-bold text-emerald-600 truncate mr-2">✓ Image Uploaded</span>
                              <div className="relative w-8 h-8 rounded overflow-hidden border border-slate-200">
                                <Image src={imagePreview} alt="Preview" fill className="object-cover" />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-500">
                              <ImageIcon className="w-4 h-4" />
                              <span className="text-sm font-bold">Upload Image</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center h-[46px] px-4 rounded-xl border border-slate-200 bg-white mt-auto">
                        <label className="flex items-center cursor-pointer w-full justify-between">
                          <span className="text-sm font-bold text-slate-700">Active on Menu</span>
                          <div className="relative">
                            <input type="checkbox" className="sr-only" checked={formData.isActive ?? true}
                              onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${formData.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${formData.isActive ? 'translate-x-4' : ''}`} />
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                  </div>{/* end left column */}

                  {/* ── Right: Slots ── */}
                  <div className="lg:w-96 flex-shrink-0 p-6 space-y-4 bg-slate-50/50">

                {/* ─ Combo Slots ─ */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Combo Slots</p>
                      <p className="text-xs text-slate-500 mt-0.5">Each slot = one component the customer picks. Add multiple options to let them choose.</p>
                    </div>
                    <button
                      onClick={addSlot}
                      className="flex items-center gap-1 text-sm font-bold text-amber-600 hover:text-amber-700 transition-colors"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Add Slot
                    </button>
                  </div>

                  {menuItems.length === 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 font-medium mb-3">
                      ⚠ No menu items found. Please add items to your menu first before creating combos.
                    </div>
                  )}

                  <Reorder.Group
                    axis="y"
                    values={formData.slots || []}
                    onReorder={newOrder => setFormData({ ...formData, slots: newOrder })}
                    className="space-y-3"
                  >
                    {(formData.slots || []).map(slot => {
                      const isExpanded = expandedSlot === slot.id;
                      const isPickerOpen = slotPicker === slot.id;

                      return (
                        <Reorder.Item key={slot.id} value={slot}>
                          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                            {/* Slot Header */}
                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                              <div className="flex items-center justify-center cursor-grab text-slate-300 hover:text-slate-500">
                                <GripVertical className="w-5 h-5" />
                              </div>
                              <div className="flex-1 flex flex-col gap-1">
                                <input
                                  type="text"
                                  placeholder={`Slot label (e.g. Main, Drink) - ${modalLang.toUpperCase()}`}
                                  value={typeof slot.label === 'string' ? (modalLang === 'en' ? slot.label : '') : ((slot.label as any)?.[modalLang] || '')}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const currentLabel = typeof slot.label === 'string' 
                                      ? { en: slot.label, fr: slot.label, nl: slot.label } 
                                      : { ...(slot.label as LocalizedString) };
                                      
                                    currentLabel[modalLang] = val;
                                    
                                    // Auto-fill FR and NL if typing in EN to save time
                                    if (modalLang === 'en') {
                                      currentLabel.fr = val;
                                      currentLabel.nl = val;
                                    }
                                    
                                    updateSlot(slot.id, 'label', currentLabel);
                                  }}
                                  onInput={onInputCap}
                                  className="w-full text-sm font-bold bg-transparent border-none focus:outline-none text-slate-700 placeholder:text-slate-400"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">Qty:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={slot.quantity}
                                  onChange={e => updateSlot(slot.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-12 text-center text-sm font-bold border border-slate-200 rounded-lg px-1 py-0.5 focus:border-amber-500 focus:outline-none"
                                />
                              </div>
                              <button
                                onClick={() => setExpandedSlot(isExpanded ? null : slot.id)}
                                className="p-1.5 text-slate-400 hover:text-amber-600 transition-colors"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => removeSlot(slot.id)}
                                disabled={(formData.slots?.length || 0) <= 1}
                                className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-30"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Options chips */}
                            <div className="px-4 py-3 flex flex-wrap gap-2 min-h-[52px] items-center">
                              {slot.options.length === 0 && (
                                <span className="text-xs text-slate-400 italic">No items added — click + to add options</span>
                              )}
                              {slot.options.map(opt => (
                                <div
                                  key={opt.menuItemId}
                                  className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold px-3 py-1.5 rounded-full"
                                >
                                  <span>{getItemName(opt.name)}</span>
                                  {opt.priceAdjustment !== 0 && (
                                    <span className="text-amber-600 font-mono">
                                      {opt.priceAdjustment > 0 ? `+€${opt.priceAdjustment.toFixed(2)}` : `-€${Math.abs(opt.priceAdjustment).toFixed(2)}`}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => removeOptionFromSlot(slot.id, opt.menuItemId)}
                                    className="text-amber-500 hover:text-rose-500 transition-colors ml-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              {/* Add option button */}
                              <button
                                onClick={() => { setSlotPicker(isPickerOpen ? null : slot.id); setPickerSearch(''); }}
                                className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1.5 rounded-full border border-dashed border-amber-300 transition-all"
                              >
                                <Plus className="w-3 h-3" />
                                Add
                              </button>
                            </div>

                            {/* Item picker dropdown */}
                            {isPickerOpen && (
                              <div className="border-t border-slate-100 bg-white px-4 py-3">
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="Search menu items..."
                                  value={pickerSearch}
                                  onChange={e => setPickerSearch(e.target.value)}
                                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 mb-2 focus:border-amber-500 focus:outline-none"
                                />
                                <div className="max-h-44 overflow-y-auto space-y-1">
                                  {menuItems
                                    .filter(m => getItemName(m.name).toLowerCase().includes(pickerSearch.toLowerCase()))
                                    .map(mi => {
                                      const alreadyAdded = slot.options.some(o => o.menuItemId === mi.id);
                                      return (
                                        <button
                                          key={mi.id}
                                          onClick={() => { addOptionToSlot(slot.id, mi.id); setSlotPicker(null); }}
                                          disabled={alreadyAdded}
                                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-amber-50'}`}
                                        >
                                          <span className="font-bold text-slate-800 text-left">{getItemName(mi.name)}</span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-slate-500 font-mono text-xs">€{mi.price.toFixed(2)}</span>
                                            {alreadyAdded && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  {menuItems.filter(m => getItemName(m.name).toLowerCase().includes(pickerSearch.toLowerCase())).length === 0 && (
                                    <p className="text-xs text-slate-400 text-center py-4">No menu items match your search</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Expanded: price adjustment per option */}
                            {isExpanded && slot.options.length > 0 && (
                              <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Price Adjustments (vs combo base price)</p>
                                {slot.options.map(opt => (
                                  <div key={opt.menuItemId} className="flex items-center justify-between gap-4">
                                    <span className="text-sm font-bold text-slate-700 truncate flex-1">{getItemName(opt.name)}</span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-xs text-slate-500">+/- €</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={opt.priceAdjustment}
                                        onChange={e => updateOptionAdj(slot.id, opt.menuItemId, parseFloat(e.target.value) || 0)}
                                        className="w-20 text-sm font-mono border border-slate-200 rounded-lg px-2 py-1 focus:border-amber-500 focus:outline-none text-center"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </Reorder.Item>
                      );
                    })}
                  </Reorder.Group>

                  {(formData.slots || []).length === 0 && (
                    <button
                      onClick={addSlot}
                      className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold text-sm hover:border-amber-400 hover:text-amber-500 transition-all"
                    >
                      + Add First Slot
                    </button>
                  )}
                </div>

                  </div>{/* end right column */}

                  {/* ── Bottom: Savings Preview (full width) ── */}
                  </div>{/* end flex row */}

                  {/* Savings Preview Panel */}
                  <div className="px-6 pb-6">

                    {/* displaySavings toggle */}
                    <div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-200 bg-white mb-3">
                      <div>
                        <p className="text-sm font-bold text-slate-700">Show savings badge on kiosk</p>
                        <p className="text-xs text-slate-400">Displays 🎉 &quot;You save €X&quot; when customer builds this combo</p>
                      </div>
                      <label className="flex items-center cursor-pointer ml-4">
                        <div className="relative">
                          <input type="checkbox" className="sr-only"
                            checked={formData.displaySavings ?? true}
                            onChange={e => setFormData({ ...formData, displaySavings: e.target.checked })} />
                          <div className={`block w-10 h-6 rounded-full transition-colors ${formData.displaySavings ?? true ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${formData.displaySavings ?? true ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>

                    {/* Live savings calculator */}
                    {savingsPreview ? (
                      <div className={`rounded-2xl border-2 p-4 ${
                        savingsPreview.isPriceTooHigh
                          ? 'border-rose-300 bg-rose-50'
                          : savingsPreview.isGoodDeal
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-amber-300 bg-amber-50'
                      }`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base">
                            {savingsPreview.isPriceTooHigh ? '⚠️' : savingsPreview.isGoodDeal ? '✅' : '💡'}
                          </span>
                          <p className={`text-xs font-black uppercase tracking-widest ${
                            savingsPreview.isPriceTooHigh ? 'text-rose-700' : savingsPreview.isGoodDeal ? 'text-emerald-700' : 'text-amber-700'
                          }`}>
                            {savingsPreview.isPriceTooHigh
                              ? 'Warning: Combo price exceeds basket!'
                              : 'Automatic Savings Preview'}
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          {/* Min basket row */}
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 font-medium">Cheapest combination</span>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-slate-500">€{savingsPreview.minBasket.toFixed(2)}</span>
                              <span className="text-slate-400">→</span>
                              {savingsPreview.minSavings > 0 ? (
                                <span className="font-black text-emerald-700">
                                  save €{savingsPreview.minSavings.toFixed(2)}
                                  <span className="font-normal text-slate-500 ml-1">({savingsPreview.minSavingsPct.toFixed(0)}%)</span>
                                </span>
                              ) : (
                                <span className="text-rose-600 font-bold">no saving</span>
                              )}
                            </div>
                          </div>

                          {/* Max basket row — only show if different from min */}
                          {savingsPreview.maxBasket !== savingsPreview.minBasket && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600 font-medium">Most expensive combination</span>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-slate-500">€{savingsPreview.maxBasket.toFixed(2)}</span>
                                <span className="text-slate-400">→</span>
                                <span className="font-black text-emerald-700">
                                  save €{savingsPreview.maxSavings.toFixed(2)}
                                  <span className="font-normal text-slate-500 ml-1">({savingsPreview.maxSavingsPct.toFixed(0)}%)</span>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Advice text */}
                        <p className={`text-[11px] mt-3 leading-relaxed ${
                          savingsPreview.isPriceTooHigh
                            ? 'text-rose-600'
                            : savingsPreview.isGoodDeal
                              ? 'text-emerald-600'
                              : 'text-amber-700'
                        }`}>
                          {savingsPreview.isPriceTooHigh
                            ? 'Lower the combo price below the cheapest basket to create a real saving.'
                            : savingsPreview.isGoodDeal
                              ? 'Great deal! Customers save 10%+ — recommend enabling the savings badge.'
                              : 'Savings under 10%. Consider reducing the combo price for a stronger deal.'}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
                        <p className="text-xs text-slate-400">
                          💡 Add items to all slots and set a combo price to see automatic savings preview
                        </p>
                      </div>
                    )}
                  </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0">
                <div className="text-xs font-bold text-slate-500">
                  {(formData.slots || []).reduce((sum, s) => sum + s.options.length, 0)} item options across {(formData.slots || []).length} slot(s)
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} className="px-5 py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors shadow-sm">
                    {editingCombo ? 'Save Changes' : 'Create Combo'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation ────────────────────────────────────────────── */}
      <AnimatePresence>
        {comboToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setComboToDelete(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-heading font-black text-slate-900 mb-2">Delete Combo?</h2>
              <p className="text-slate-500 mb-6 text-sm">This action cannot be undone. The combo will be removed from the menu immediately.</p>
              <div className="flex gap-3">
                <button onClick={() => setComboToDelete(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                <button onClick={confirmDelete} className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-500 transition-colors">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
