'use client';

import { useState, use, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { Search, Plus, Edit2, Trash2, Image as ImageIcon, MoreVertical, Check, X, Tag, GripVertical, Settings2, Copy } from 'lucide-react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { onInputCap, autoCapWords } from '@/lib/utils';
import { type VatCategory, type ItemType, ITEM_TYPE_LABELS } from '@/lib/vat-rules';

type LocalizedString = {
  en: string;
  fr: string;
  nl: string;
};

type Variation = {
  id: string;
  name: string;
  priceAdjustment: number;
};

type MenuItem = {
  id: string;
  storeId: string;
  name: string;
  description: LocalizedString;
  price: number;
  itemType?: ItemType;           // nature of item — drives VAT auto-resolution
  vatCategoryDineIn?: string;   // legacy — kept for old data compatibility
  vatCategoryTakeaway?: string; // legacy — kept for old data compatibility
  vatRate?: number;             // legacy — kept for old data compatibility
  category: string;
  isAvailable: boolean;
  image: string | null;
  variations: Variation[];
  comboUpsellId?: string;       // combo to suggest when ordered standalone
};

type ComboOption = {
  id: string;
  name: string;
  price: number;
};

type Category = {
  id: string;
  name: string | LocalizedString;
  order: number;
};

type ModifierOption = {
  id: string;
  name: string | { en: string; fr: string; nl: string };
  price: number;
};

type Modifier = {
  id: string;
  storeId: string;
  name: string | { en: string; fr: string; nl: string };
  isRequired: boolean;
  allowMultiple: boolean;
  itemIds?: string[];
  options: ModifierOption[];
};

function getModName(name: Modifier['name']): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.en || '';
}

function getCategoryName(name: Category['name']): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.en || '';
}

/** Capitalize the first letter of each word in a string */
// Exported to utils

/** onInput handler for uncontrolled inputs — capitalizes words in-place */
// Exported to utils

function MenuItemRow({ 
  item, 
  idx, 
  searchQuery, 
  toggleAvailability, 
  openEditModal, 
  handleDelete,
  handleDuplicate
}: { 
  item: MenuItem, 
  idx: number, 
  searchQuery: string,
  toggleAvailability: (id: string, currentStatus: boolean) => void,
  openEditModal: (item: MenuItem) => void,
  handleDelete: (id: string) => void,
  handleDuplicate: (item: MenuItem) => void
}) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: idx * 0.05 }}
      dragListener={false}
      dragControls={dragControls}
      className={`p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-6 hover:bg-slate-50/80 transition-all group bg-white border-b border-slate-100 last:border-0 ${
        !item.isAvailable ? 'opacity-75 grayscale-[0.3]' : ''
      }`}
    >
      {/* Drag Handle */}
      {!searchQuery && (
        <div 
          onPointerDown={(e) => dragControls.start(e)}
          className="hidden sm:flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors p-2 -ml-4 touch-none"
        >
          <GripVertical className="w-5 h-5" />
        </div>
      )}

      {/* Image Container */}
      <div className="w-24 h-24 sm:w-28 sm:h-28 bg-slate-100 rounded-2xl relative flex items-center justify-center flex-shrink-0 border border-slate-200/60 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow duration-300">
        {item.image ? (
          <Image src={item.image} alt={item.name} fill className="object-contain p-2 pointer-events-none group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <ImageIcon className="w-10 h-10 text-slate-300 opacity-40" />
        )}
        {!item.isAvailable && (
          <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center backdrop-blur-[2px]">
            <span className="px-3 py-1.5 bg-slate-900 text-white font-black rounded-xl text-[10px] shadow-xl uppercase tracking-widest">
              Hidden
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h3 className="font-heading font-bold text-lg text-slate-900 truncate group-hover:text-amber-600 transition-colors">{item.name}</h3>
          <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-500 text-[9px] font-black border border-slate-200 uppercase tracking-widest">
            {item.category}
          </span>
          {item.variations && item.variations.length > 0 && (
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[9px] font-black border border-amber-200 uppercase tracking-widest">
              {item.variations.length} Variations
            </span>
          )}
        </div>
        <p className="text-slate-500 text-xs font-medium mb-3 line-clamp-2 max-w-2xl leading-relaxed">
          {item.description.en}
        </p>
        <div className="flex items-center gap-4">
          <span className="font-black text-xl text-slate-900">€{item.price.toFixed(2)}</span>
          {item.itemType ? (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 uppercase tracking-wider">
              {ITEM_TYPE_LABELS[item.itemType]?.emoji} {ITEM_TYPE_LABELS[item.itemType]?.label}
            </span>
          ) : item.vatCategoryDineIn || item.vatCategoryTakeaway ? (
            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 uppercase tracking-wider">
              VAT (legacy)
            </span>
          ) : (
            <span className="text-[10px] font-bold text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-2 py-0.5 uppercase tracking-wider">
              No type set
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center justify-between sm:justify-end gap-8 sm:gap-10 mt-6 sm:mt-0">
        {/* Toggle Switch */}
        <div className="flex flex-col items-center gap-2">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={item.isAvailable}
                onChange={() => toggleAvailability(item.id, item.isAvailable)}
              />
              <div className={`block w-11 h-6 rounded-full transition-colors ${item.isAvailable ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${item.isAvailable ? 'transform translate-x-5' : ''}`}></div>
            </div>
          </label>
          <span className={`text-[9px] font-black uppercase tracking-widest ${item.isAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
            {item.isAvailable ? 'Visible' : 'Hidden'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleDuplicate(item)}
            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 shadow-sm hover:shadow-md"
            title="Duplicate Item"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button 
            onClick={() => openEditModal(item)}
            className="p-2.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all border border-transparent hover:border-amber-100 shadow-sm hover:shadow-md"
            title="Edit Item"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => handleDelete(item.id)}
            className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100 shadow-sm hover:shadow-md"
            title="Delete Item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}

export default function StoreMenuPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [storeName, setStoreName] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [modalLang, setModalLang] = useState<'en' | 'fr' | 'nl'>('en');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [editingVariations, setEditingVariations] = useState<Variation[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState<Set<string>>(new Set());
  const [vatCategories, setVatCategories] = useState<VatCategory[]>([]);
  const [selectedItemType, setSelectedItemType] = useState<ItemType>('food');
  const [combos, setCombos] = useState<ComboOption[]>([]);
  const [selectedComboUpsellId, setSelectedComboUpsellId] = useState<string>('');

  useEffect(() => {
    if (!user) return;

    // Fetch store name
    const fetchStore = async () => {
      try {
        const storeDoc = await getDoc(doc(db, 'stores', storeId));
        if (storeDoc.exists()) {
          setStoreName(storeDoc.data().name);
        }
      } catch (error) {
        console.error("Error fetching store name:", error);
      }
    };
    fetchStore();

    // Fetch categories with onSnapshot
    const catQuery = query(collection(db, 'categories'), where('storeId', '==', storeId));
    const unsubscribeCategories = onSnapshot(catQuery, (snapshot) => {
      const fetchedCategories: Category[] = [];
      snapshot.forEach((doc) => {
        fetchedCategories.push({ id: doc.id, ...doc.data() } as Category);
      });
      // Sort by order if available, otherwise by name
      fetchedCategories.sort((a, b) => (a.order || 0) - (b.order || 0) || getCategoryName(a.name).localeCompare(getCategoryName(b.name)));
      setCategories(fetchedCategories);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
    });

    const q = query(collection(db, 'menuItems'), where('storeId', '==', storeId));
    const unsubscribeItems = onSnapshot(q, (snapshot) => {
      const menuItemsData: MenuItem[] = [];
      snapshot.forEach((doc) => {
        menuItemsData.push({ id: doc.id, ...doc.data() } as MenuItem);
      });
      setItems(menuItemsData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'menuItems');
      setIsLoading(false);
    });

    // Fetch modifiers
    const modQuery = query(collection(db, 'modifiers'), where('storeId', '==', storeId));
    const unsubscribeModifiers = onSnapshot(modQuery, (snapshot) => {
      const mods: Modifier[] = [];
      snapshot.forEach((doc) => mods.push({ id: doc.id, ...doc.data() } as Modifier));
      mods.sort((a, b) => getModName(a.name).localeCompare(getModName(b.name)));
      setModifiers(mods);
    });

    // Fetch VAT categories for this store
    getDocs(collection(db, 'stores', storeId, 'vatCategories')).then(snap => {
      const cats: VatCategory[] = [];
      snap.forEach(d => cats.push({ id: d.id, ...d.data() } as VatCategory));
      cats.sort((a, b) => b.rate - a.rate);
      setVatCategories(cats);
    }).catch(console.error);

    // Fetch active combos for upsell selector
    const comboQuery = query(collection(db, 'combos'), where('storeId', '==', storeId), where('isActive', '==', true));
    const unsubCombos = onSnapshot(comboQuery, snap => {
      const rows: ComboOption[] = [];
      snap.forEach(d => rows.push({ id: d.id, name: d.data().name || 'Combo', price: d.data().price || 0 }));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setCombos(rows);
    });

    return () => {
      unsubscribeCategories();
      unsubscribeItems();
      unsubscribeModifiers();
      unsubCombos();
    };
  }, [storeId, user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      // Compress image before setting preview and saving
      const compressed = await compressImage(base64);
      setImagePreview(compressed);
    };
    reader.readAsDataURL(file);
  };

  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  };

  const filteredItems = items.filter(item => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.description.en.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    try {
      const docRef = doc(db, 'menuItems', id);
      await updateDoc(docRef, { isAvailable: !currentStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menuItems/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteDoc(doc(db, 'menuItems', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `menuItems/${id}`);
      }
    }
  };

  const handleDuplicate = async (item: MenuItem) => {
    try {
      const { id: _id, ...rest } = item;
      const newDoc = await addDoc(collection(db, 'menuItems'), {
        ...rest,
        name: `${item.name} (Copy)`,
        isAvailable: false,
      });
      // Clone modifier associations to the new item
      const attachedModifiers = modifiers.filter(m => m.itemIds?.includes(item.id));
      await Promise.all(
        attachedModifiers.map(m =>
          updateDoc(doc(db, 'modifiers', m.id), {
            itemIds: [...(m.itemIds || []), newDoc.id],
          })
        )
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menuItems');
    }
  };

  const openEditModal = async (item: MenuItem) => {
    setEditingItem(item);
    let img = item.image;
    // If existing image is a large base64 string, compress it to avoid future save errors
    if (img && img.startsWith('data:image') && img.length > 500000) {
      try {
        img = await compressImage(img);
      } catch (e) {
        console.error("Failed to compress existing image:", e);
      }
    }
    setImagePreview(img);
    setEditingVariations(item.variations || []);
    // Pre-select modifiers already associated with this item
    const preSelected = new Set(modifiers.filter(m => m.itemIds?.includes(item.id)).map(m => m.id));
    setSelectedModifierIds(preSelected);
    // Set item type (prefer new field; fall back from legacy modifier itemType)
    setSelectedItemType(item.itemType || 'food');
    setSelectedComboUpsellId(item.comboUpsellId || '');
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setImagePreview(null);
    setEditingVariations([]);
    setSelectedModifierIds(new Set());
    setSelectedItemType('food');
    setSelectedComboUpsellId('');
    setIsModalOpen(true);
  };

  const openCategoryModal = (category: Category | null = null) => {
    setEditingCategory(category);
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const order = parseInt(formData.get('order') as string) || 0;

    // Default save as an object with the same string for en/fr/nl to avoid breaking changes, 
    // real multilingual editing happens in the Categories page.
    const safeName = { en: name, fr: name, nl: name };

    try {
      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), { name: safeName, order });
      } else {
        await addDoc(collection(db, 'categories'), { storeId, name: safeName, order });
      }
      setIsCategoryModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this category? Items in this category will remain but their category will be unassigned.')) {
      try {
        await deleteDoc(doc(db, 'categories', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
      }
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const category = formData.get('category') as string;
    const descEn = formData.get('description_en') as string;
    const descFr = formData.get('description_fr') as string;
    const descNl = formData.get('description_nl') as string;

    const description = { en: descEn, fr: descFr, nl: descNl };

    let priceRaw = (formData.get('price') as string).replace(',', '.');
    if (priceRaw && !priceRaw.includes('.')) {
      priceRaw = (parseFloat(priceRaw) / 100).toFixed(2);
    }
    const price = parseFloat(priceRaw) || 0;

    const processedVariations = editingVariations.map(v => {
      // currency input handles float parsing
      return { ...v, priceAdjustment: parseFloat(v.priceAdjustment as any) || 0 };
    });

    const itemData = {
      storeId,
      name,
      price,
      itemType: selectedItemType,
      comboUpsellId: selectedComboUpsellId || null,
      category,
      description,
      image: imagePreview,
      variations: processedVariations,
    };

    try {
      let savedItemId: string;
      if (editingItem) {
        const docRef = doc(db, 'menuItems', editingItem.id);
        await updateDoc(docRef, itemData);
        savedItemId = editingItem.id;
      } else {
        const newDoc = await addDoc(collection(db, 'menuItems'), {
          ...itemData,
          isAvailable: true,
        });
        savedItemId = newDoc.id;
      }

      // Sync modifier itemIds — add/remove this item from each modifier
      const modifierUpdatePromises = modifiers.map(async (modifier) => {
        const currentIds: string[] = modifier.itemIds || [];
        const shouldBeAttached = selectedModifierIds.has(modifier.id);
        const isCurrentlyAttached = currentIds.includes(savedItemId);

        if (shouldBeAttached && !isCurrentlyAttached) {
          await updateDoc(doc(db, 'modifiers', modifier.id), {
            itemIds: [...currentIds, savedItemId],
          });
        } else if (!shouldBeAttached && isCurrentlyAttached) {
          await updateDoc(doc(db, 'modifiers', modifier.id), {
            itemIds: currentIds.filter(id => id !== savedItemId),
          });
        }
      });
      await Promise.all(modifierUpdatePromises);

      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menuItems');
    }
  };

  const handleAddVariation = () => {
    setEditingVariations([
      ...editingVariations,
      {
        id: crypto.randomUUID(),
        name: '',
        priceAdjustment: 0,
      }
    ]);
  };

  const handleUpdateVariation = (id: string, field: string, value: any) => {
    setEditingVariations(editingVariations.map(v => {
      if (v.id === id) {
        return { ...v, [field]: value };
      }
      return v;
    }));
  };

  const handleRemoveVariation = (id: string) => {
    setEditingVariations(editingVariations.filter(v => v.id !== id));
  };

  const handleReorder = (newOrder: MenuItem[]) => {
    if (searchQuery) return; // Disable reordering when searching
    
    if (activeCategory === 'All') {
      setItems(newOrder);
    } else {
      // If filtered by category, we only get the new order of that category.
      // We need to merge it back into the main items array.
      let orderIndex = 0;
      const updatedItems = items.map(item => {
        if (item.category === activeCategory) {
          return newOrder[orderIndex++];
        }
        return item;
      });
      setItems(updatedItems);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 max-w-7xl mx-auto min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Menu Management</h1>
          <p className="mt-2 text-slate-500 font-medium">Manage items, prices, and availability for {storeName || storeId.replace('-', ' ')}.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => openCategoryModal()}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Tag className="w-5 h-5" />
            Manage Categories
          </button>
          <button 
            onClick={openAddModal}
            className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Add New Item
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="mb-8 flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        <div className="flex overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 lg:pb-0 space-x-2 w-full lg:w-auto scrollbar-hide">
          {['All', ...categories.map(c => getCategoryName(c.name))].map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-xl font-bold transition-all relative overflow-hidden ${
                activeCategory === category
                  ? 'text-slate-900 bg-white shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-900'
              }`}
            >
              {activeCategory === category && (
                <motion.div 
                  layoutId="activeCategoryTab"
                  className="absolute inset-0 bg-white border border-slate-200 rounded-xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{category}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-80 flex-shrink-0">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus:border-amber-500 focus:ring-amber-500 bg-white transition-colors"
          />
        </div>
      </div>

      {/* Menu Grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
          <Tag className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No items found</h3>
          <p className="text-slate-500 mt-1">Try adjusting your search or category filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700">All Items</h3>
            <span className="text-sm font-medium text-slate-500">{filteredItems.length} total</span>
          </div>
          <div className="divide-y divide-slate-100">
            <Reorder.Group axis="y" values={filteredItems} onReorder={handleReorder}>
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item, idx) => (
                  <MenuItemRow 
                    key={item.id}
                    item={item}
                    idx={idx}
                    searchQuery={searchQuery}
                    toggleAvailability={toggleAvailability}
                    openEditModal={openEditModal}
                    handleDelete={handleDelete}
                    handleDuplicate={handleDuplicate}
                  />
                ))}
              </AnimatePresence>
            </Reorder.Group>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
              className="relative w-full sm:max-w-3xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Modal Header */}
              <div className="px-7 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-amber-50/40 flex-shrink-0">
                <div>
                  <h2 className="text-2xl font-heading font-black text-slate-900">
                    {editingItem ? 'Edit Menu Item' : 'Add New Item'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">
                    {editingItem ? 'Update the details below and save.' : 'Fill in the details to create a new menu item.'}
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="item-form" onSubmit={handleSave} className="overflow-y-auto flex-1">
                <div className="flex flex-col lg:flex-row min-h-0">

                  {/* ── LEFT PANEL: Image Upload ── */}
                  <div className="lg:w-64 xl:w-72 flex-shrink-0 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-100 p-6 flex flex-col gap-4">
                    <div>
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Item Photo</p>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="relative w-full aspect-square rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden cursor-pointer group hover:border-amber-400 transition-colors bg-white"
                      >
                        {imagePreview ? (
                          <>
                            <Image src={imagePreview} alt="Preview" fill className="object-contain p-3 group-hover:scale-105 transition-transform duration-500" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end pb-5 gap-1">
                              <ImageIcon className="w-5 h-5 text-white" />
                              <span className="text-white font-bold text-xs">Change Photo</span>
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 group-hover:text-amber-500 transition-colors">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 group-hover:bg-amber-50 flex items-center justify-center transition-colors">
                              <ImageIcon className="w-7 h-7" />
                            </div>
                            <span className="text-xs font-bold text-center px-2 leading-relaxed">
                              Click to upload<br />
                              <span className="font-medium text-slate-400">PNG, JPG up to 5MB</span>
                            </span>
                          </div>
                        )}
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/png, image/jpeg"
                          className="hidden"
                        />
                      </div>
                      {imagePreview && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setImagePreview(null); }}
                          className="mt-2.5 w-full text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center gap-1.5 py-1.5"
                        >
                          <X className="w-3.5 h-3.5" /> Remove photo
                        </button>
                      )}
                    </div>

                    {/* Quick-info pills */}
                    <div className="mt-auto pt-4 border-t border-slate-200 space-y-2">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Tips</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">Use a square, high-contrast image on a white or transparent background for best kiosk & web display.</p>
                    </div>
                  </div>

                  {/* ── RIGHT PANEL: Form Fields ── */}
                  <div className="flex-1 p-6 space-y-6 overflow-y-auto">

                    {/* — Section: Identity — */}
                    <div>
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Identity</p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">Item Name <span className="text-slate-400 font-medium">(shown on all platforms)</span></label>
                          <input
                            type="text"
                            name="name"
                            required
                            defaultValue={editingItem?.name}
                            placeholder="e.g. Spicy Cod Bites"
                            autoCapitalize="words"
                            onInput={onInputCap}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-sm font-medium placeholder:text-slate-300"
                          />
                        </div>

                        {/* Language Tabs */}
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">Description</label>
                          <div className="flex gap-1 mb-2 bg-slate-100 p-1 rounded-xl w-fit">
                            {([['en', '🇬🇧'], ['fr', '🇫🇷'], ['nl', '🇳🇱']] as const).map(([lang, flag]) => (
                              <button
                                key={lang}
                                type="button"
                                onClick={() => setModalLang(lang as 'en' | 'fr' | 'nl')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                  modalLang === lang
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {flag} {lang.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          {(['en', 'fr', 'nl'] as const).map(lang => (
                            <div key={lang} className={modalLang === lang ? 'block' : 'hidden'}>
                              <textarea
                                name={`description_${lang}`}
                                required={lang === 'en'}
                                rows={3}
                                defaultValue={editingItem?.description[lang]}
                                placeholder={
                                  lang === 'en' ? 'Describe the item in English...' :
                                  lang === 'fr' ? 'Décrivez l\'article en français...' :
                                  'Beschrijf het artikel in het Nederlands...'
                                }
                                onInput={onInputCap}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all resize-none text-sm placeholder:text-slate-300"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Divider */}
                    <hr className="border-slate-100" />

                    {/* — Section: Pricing & Classification — */}
                    <div>
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Pricing &amp; Classification</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">Base Price</label>
                          <CurrencyInput
                            name="price"
                            required
                            defaultValue={editingItem?.price || 0}
                            className="w-full py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">Category</label>
                          <select
                            name="category"
                            required
                            defaultValue={editingItem?.category || getCategoryName(categories[0]?.name)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all bg-white text-sm font-medium"
                          >
                            {categories.map(c => (
                              <option key={c.id} value={getCategoryName(c.name)}>{getCategoryName(c.name)}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Item Type — drives automatic VAT resolution at checkout */}
                      <div className="mt-4">
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          Item Type <span className="text-slate-400 font-medium text-xs">(determines VAT rate automatically)</span>
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(Object.entries(ITEM_TYPE_LABELS) as [ItemType, typeof ITEM_TYPE_LABELS[ItemType]][]).map(([type, meta]) => {
                            // Find the resolved category for display
                            const resolved = vatCategories.find(c => {
                              const eff = type === 'non-alcoholic' ? 'food' : type;
                              return c.itemType === eff;
                            }) ?? vatCategories.find(c => c.isDefault);
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setSelectedItemType(type)}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                                  selectedItemType === type
                                    ? 'border-amber-400 bg-amber-50 shadow-sm'
                                    : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40'
                                }`}
                              >
                                <span className="text-2xl">{meta.emoji}</span>
                                <span className={`text-xs font-black leading-tight ${
                                  selectedItemType === type ? 'text-amber-800' : 'text-slate-700'
                                }`}>{meta.label}</span>
                                {resolved && (
                                  <span className="text-[10px] font-bold text-slate-400">
                                    [{resolved.code}] {resolved.rate}%
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                          💡 The system picks the correct GKS fiscal category based on item type + service (Dine-In / Takeaway) at order time.
                        </p>
                      </div>
                    </div>

                    {/* Divider */}
                    <hr className="border-slate-100" />

                    {/* — Section: Variations — */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Variations</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Sizes or options — customer picks one. Leave empty if not needed.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddVariation}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-bold text-xs hover:bg-amber-100 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Variation
                        </button>
                      </div>

                      {editingVariations.length === 0 ? (
                        <div className="text-center py-7 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                          <div className="text-2xl mb-1">🔀</div>
                          <p className="text-xs font-bold text-slate-500">No variations yet</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Add one if this item comes in sizes (e.g. Small / Large)</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {editingVariations.map((variation, vidx) => {
                            const basePrice = editingItem?.price || 0;
                            const adj = parseFloat(variation.priceAdjustment as any) || 0;
                            const finalPrice = basePrice + adj;
                            return (
                              <div key={variation.id} className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-3 rounded-xl border border-slate-200">
                                <span className="text-[10px] font-black text-slate-400 w-4 shrink-0 text-center">{vidx + 1}</span>
                                <input
                                  type="text"
                                  value={variation.name}
                                  onChange={(e) => handleUpdateVariation(variation.id, 'name', autoCapWords(e.target.value))}
                                  placeholder="e.g. Large, With Cheese…"
                                  autoCapitalize="words"
                                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:border-amber-500 focus:outline-none text-sm font-bold bg-white min-w-0"
                                />
                                <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                                  <span className="text-[11px] font-bold text-slate-400">±€</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={adj}
                                    onChange={(e) => handleUpdateVariation(variation.id, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                                    className="w-16 text-sm font-mono text-center bg-transparent focus:outline-none"
                                  />
                                </div>
                                <span className={`text-xs font-black shrink-0 w-16 text-right ${adj > 0 ? 'text-emerald-600' : adj < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                  €{finalPrice.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveVariation(variation.id)}
                                  className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                          <p className="text-[11px] text-slate-400 italic px-1 pt-1">
                            💡 +€1.50 for pricier option, -€1.00 for cheaper. 0 = same as base price.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <hr className="border-slate-100" />

                    {/* — Section: Modifiers — */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Modifiers</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Add-ons or choices that appear at checkout for this item.</p>
                        </div>
                        {selectedModifierIds.size > 0 && (
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-black">
                            {selectedModifierIds.size} attached
                          </span>
                        )}
                      </div>

                      {modifiers.length === 0 ? (
                        <div className="text-center py-7 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                          <Settings2 className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                          <p className="text-xs font-bold text-slate-500">No modifiers yet</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Create modifiers from the Modifiers page first.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {modifiers.map((modifier) => {
                            const isChecked = selectedModifierIds.has(modifier.id);
                            return (
                              <label
                                key={modifier.id}
                                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                  isChecked
                                    ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200'
                                    : 'bg-slate-50 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400 shrink-0"
                                  checked={isChecked}
                                  onChange={() => {
                                    setSelectedModifierIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(modifier.id)) next.delete(modifier.id);
                                      else next.add(modifier.id);
                                      return next;
                                    });
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                    <span className={`text-sm font-bold ${isChecked ? 'text-indigo-900' : 'text-slate-800'}`}>
                                      {getModName(modifier.name)}
                                    </span>
                                    {modifier.isRequired && (
                                      <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[9px] font-black border border-rose-100 uppercase tracking-wider">Required</span>
                                    )}
                                    {modifier.allowMultiple && (
                                      <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[9px] font-black border border-indigo-100 uppercase tracking-wider">Multi</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {modifier.options.slice(0, 4).map(o => o.name).join(' · ')}
                                    {modifier.options.length > 4 ? ` +${modifier.options.length - 4} more` : ''}
                                  </p>
                                </div>
                                {isChecked && <Check className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>

              {/* Modal Footer */}
                    {/* Combo Upsell Section */}
                    {combos.length > 0 && (
                      <>
                        <hr className="border-slate-100" />
                        <div>
                          <div className="mb-3">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">🔥 Combo Upsell</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Suggest a combo when this item is ordered on its own. The kiosk will prompt: &quot;Make it a meal — save €X!&quot;
                            </p>
                          </div>

                          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                            <select
                              value={selectedComboUpsellId}
                              onChange={e => setSelectedComboUpsellId(e.target.value)}
                              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:border-amber-500 focus:outline-none"
                            >
                              <option value="">— No upsell —</option>
                              {combos.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name} (€{c.price.toFixed(2)})
                                </option>
                              ))}
                            </select>

                            {selectedComboUpsellId && (
                              <button
                                type="button"
                                onClick={() => setSelectedComboUpsellId('')}
                                className="shrink-0 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>

                          {selectedComboUpsellId && (
                            <p className="text-[11px] text-emerald-600 font-bold mt-2 pl-1">
                              ✅ Kiosk will suggest &quot;{combos.find(c => c.id === selectedComboUpsellId)?.name}&quot; when this item is added alone.
                            </p>
                          )}
                        </div>
                      </>
                    )}

              <div className="px-4 sm:px-7 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0">
                <p className="text-xs text-slate-400 font-medium hidden sm:block">
                  {editingItem ? `Last edited · ID: ${editingItem.id.slice(0, 8)}…` : 'New item will be marked visible by default.'}
                </p>
                <div className="flex gap-3 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 sm:flex-none px-5 py-3 sm:py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="item-form"
                    className="flex-1 sm:flex-none px-6 py-3 sm:py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 active:bg-amber-600 transition-colors shadow-sm text-sm flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {editingItem ? 'Save Changes' : 'Create Item'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Management Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategoryModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-2xl font-heading font-black text-slate-900">Manage Categories</h2>
                <button 
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <form onSubmit={handleSaveCategory} className="mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <h3 className="font-bold text-slate-900 mb-4">{editingCategory ? 'Edit Category' : 'Add New Category'}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Category Name</label>
                      <input 
                        type="text" 
                        name="name"
                        required
                        defaultValue={getCategoryName(editingCategory?.name ?? '') || ''}
                        placeholder="e.g. Burgers"
                        autoCapitalize="words"
                        onInput={onInputCap}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Order</label>
                      <input 
                        type="number" 
                        name="order"
                        defaultValue={editingCategory?.order || 0}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    {editingCategory && (
                      <button 
                        type="button"
                        onClick={() => setEditingCategory(null)}
                        className="px-4 py-2 text-slate-500 font-bold hover:text-slate-700"
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button 
                      type="submit"
                      className="px-6 py-2 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors shadow-sm"
                    >
                      {editingCategory ? 'Update Category' : 'Add Category'}
                    </button>
                  </div>
                </form>

                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 mb-2">Existing Categories</h3>
                  {categories.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 font-medium italic">No categories yet.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                      {categories.map((cat) => (
                        <div key={cat.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 font-bold text-xs">
                              {cat.order || 0}
                            </div>
                            <span className="font-bold text-slate-900">{getCategoryName(cat.name)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setEditingCategory(cat)}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteCategory(cat.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
