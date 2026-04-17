'use client';

import { useState, use, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { Search, Plus, Edit2, Trash2, Image as ImageIcon, MoreVertical, Check, X, Tag, GripVertical } from 'lucide-react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import CurrencyInput from '@/components/ui/CurrencyInput';

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
  itemType?: 'food' | 'soft_drink' | 'alcohol';
  vatRate?: number; // legacy support
  category: string;
  isAvailable: boolean;
  image: string | null;
  variations: Variation[];
};

type Category = {
  id: string;
  name: string;
  order: number;
};

function MenuItemRow({ 
  item, 
  idx, 
  searchQuery, 
  toggleAvailability, 
  openEditModal, 
  handleDelete 
}: { 
  item: MenuItem, 
  idx: number, 
  searchQuery: string,
  toggleAvailability: (id: string, currentStatus: boolean) => void,
  openEditModal: (item: MenuItem) => void,
  handleDelete: (id: string) => void
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
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">VAT: {item.vatRate}%</span>
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
      fetchedCategories.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
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

    return () => {
      unsubscribeCategories();
      unsubscribeItems();
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
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setImagePreview(null);
    setEditingVariations([]);
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

    try {
      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), { name, order });
      } else {
        await addDoc(collection(db, 'categories'), { storeId, name, order });
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
    const itemType = formData.get('itemType') as 'food' | 'soft_drink' | 'alcohol';
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
      itemType,
      category,
      description,
      image: imagePreview,
      variations: processedVariations,
    };

    try {
      if (editingItem) {
        const docRef = doc(db, 'menuItems', editingItem.id);
        await updateDoc(docRef, itemData);
      } else {
        await addDoc(collection(db, 'menuItems'), {
          ...itemData,
          isAvailable: true,
        });
      }
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
          {['All', ...categories.map(c => c.name)].map((category) => (
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
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-2xl font-heading font-black text-slate-900">
                  {editingItem ? 'Edit Item' : 'Add New Item'}
                </h2>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form id="item-form" onSubmit={handleSave} className="p-6 overflow-y-auto">
                <div className="flex border-b border-slate-200 mb-5">
                  {(['en', 'fr', 'nl'] as const).map(lang => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setModalLang(lang)}
                      className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${
                        modalLang === lang 
                          ? 'border-amber-500 text-amber-600' 
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="space-y-5">
                   <div className="mb-4 pt-4 border-t border-slate-200">
                     <label className="block text-sm font-bold text-slate-700 mb-1.5">Item Name (Global)</label>
                     <input 
                       type="text" 
                       name="name"
                       required
                       defaultValue={editingItem?.name}
                       placeholder="e.g. Spicy Cod Bites"
                       className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                     />
                   </div>

                  {(['en', 'fr', 'nl'] as const).map(lang => (
                    <div key={lang} className={modalLang === lang ? 'block space-y-5' : 'hidden'}>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Description ({lang.toUpperCase()})</label>
                        <textarea 
                          name={`description_${lang}`}
                          required={lang === 'en'}
                          rows={3}
                          defaultValue={editingItem?.description[lang]}
                          placeholder="Describe the item..."
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors resize-none"
                        />
                      </div>
                    </div>
                  ))}
                  
                  <div className="grid grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Price</label>
                      <CurrencyInput
                        name="price"
                        required
                        defaultValue={editingItem?.price || 0}
                        className="w-full py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Item Type</label>
                      <select 
                        name="itemType"
                        required
                        defaultValue={editingItem?.itemType || 'food'}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors bg-white"
                      >
                        <option value="food">Food</option>
                        <option value="soft_drink">Soft Drink</option>
                        <option value="alcohol">Alcoholic Drink</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Category</label>
                      <select 
                        name="category"
                        required
                        defaultValue={editingItem?.category || (categories[0]?.name || '')}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors bg-white"
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Image</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-amber-400 transition-colors cursor-pointer relative overflow-hidden min-h-[160px]"
                    >
                      {imagePreview ? (
                        <div className="absolute inset-0 w-full h-full bg-slate-50">
                          <Image src={imagePreview} alt="Preview" fill className="object-contain p-4" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <span className="text-white font-bold text-sm">Change Image</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <ImageIcon className="w-8 h-8 mb-2 text-slate-400" />
                          <span className="text-sm font-bold">Click to upload image</span>
                          <span className="text-xs mt-1">PNG, JPG up to 5MB</span>
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

                  {/* Variations Section */}
                  <div className="pt-6 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <label className="block text-sm font-bold text-slate-700">Variations (Sizes / Options)</label>
                        <p className="text-xs text-slate-400 mt-0.5">Each variation = a different version. Customer picks one only.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddVariation}
                        className="text-sm font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" /> Add Variation
                      </button>
                    </div>
                    
                    {editingVariations.length === 0 ? (
                      <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-200 border-dashed text-slate-500 text-sm">
                        No variations added yet. Add one if this item has different sizes (e.g. Small / Large).
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {editingVariations.map((variation, vidx) => {
                          const basePrice = editingItem?.price || 0;
                          const adj = parseFloat(variation.priceAdjustment as any) || 0;
                          const finalPrice = basePrice + adj;
                          return (
                            <div key={variation.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black text-slate-400 w-5 shrink-0">{vidx + 1}.</span>
                                <input
                                  type="text"
                                  value={variation.name}
                                  onChange={(e) => handleUpdateVariation(variation.id, 'name', e.target.value)}
                                  placeholder="e.g. Large, Extra Spicy, With Cheese"
                                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:border-amber-500 focus:outline-none text-sm font-bold"
                                />
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-xs font-bold text-slate-500">+/- €</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={adj}
                                    onChange={(e) => handleUpdateVariation(variation.id, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                                    className="w-20 px-2 py-2 rounded-lg border border-slate-200 focus:border-amber-500 focus:outline-none text-sm font-mono text-center"
                                  />
                                </div>
                                <span className={`text-sm font-black shrink-0 ${adj > 0 ? 'text-emerald-600' : adj < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                                  = €{finalPrice.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveVariation(variation.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-xs text-slate-400 italic px-1">💡 Use + for more expensive options (e.g. Large +€1.50) and - for cheaper ones (e.g. Small -€1.00). 0 = same price as base.</p>
                      </div>
                    )}
                  </div>
                </div>
              </form>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  form="item-form"
                  className="px-6 py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors shadow-sm"
                >
                  {editingItem ? 'Save Changes' : 'Create Item'}
                </button>
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
                        defaultValue={editingCategory?.name || ''}
                        placeholder="e.g. Burgers"
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
                            <span className="font-bold text-slate-900">{cat.name}</span>
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
