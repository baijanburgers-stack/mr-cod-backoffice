'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Search, Plus, Edit2, Trash2, GripVertical, Tag, X, AlertCircle, Loader2, Palette } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import { onInputCap } from '@/lib/utils';

type LocalizedString = {
  en: string;
  fr: string;
  nl: string;
};

type Category = {
  id: string;
  storeId: string;
  name: string | LocalizedString;
  isActive: boolean;
  itemCount: number;
  order: number;
  color?: string;
  parentId?: string | null;
};

const POS_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#facc15', 
  '#a3e635', '#4ade80', '#34d399', '#2dd4bf', 
  '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', 
  '#a78bfa', '#c084fc', '#f472b6', '#fb7185', 
  '#94a3b8', '#1e293b'
];

export default function StoreCategoriesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const getCategoryName = (name: string | LocalizedString | undefined) => {
    if (!name) return '';
    if (typeof name === 'string') return name;
    return name.en || '';
  };

  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [categoryName, setCategoryName] = useState<string | LocalizedString>({ en: '', fr: '', nl: '' });
  const [isActiveState, setIsActiveState] = useState(true);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>(POS_COLORS[0]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'categories'),
      where('storeId', '==', storeId),
      orderBy('order', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedCategories: Category[] = [];
      snapshot.forEach((doc) => {
        fetchedCategories.push({ id: doc.id, ...doc.data() } as Category);
      });
      setCategories(fetchedCategories);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [storeId, user]);

  const filteredCategories = categories.filter(category =>
    getCategoryName(category.name).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'categories', id), { isActive: !currentStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${id}`);
    }
  };

  const handleDeleteClick = (id: string) => {
    setCategoryToDelete(id);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteDoc(doc(db, 'categories', categoryToDelete));
      setCategoryToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryToDelete}`);
    }
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(typeof category.name === 'string' ? { en: category.name, fr: category.name, nl: category.name } : (category.name || { en: '', fr: '', nl: '' }));
    setIsActiveState(category.isActive);
    setSelectedParentId(category.parentId || '');
    setSelectedColor(category.color || POS_COLORS[0]);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingCategory(null);
    setCategoryName({ en: '', fr: '', nl: '' });
    setIsActiveState(true);
    setSelectedParentId('');
    setSelectedColor(POS_COLORS[0]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedParentId('');
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const safeName = typeof categoryName === 'string' ? { en: categoryName, fr: categoryName, nl: categoryName } : categoryName;
    if (!safeName.en.trim()) return;
    setIsSaving(true);

    try {
      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), {
          name: safeName,
          isActive: isActiveState,
          parentId: selectedParentId || null,
          color: selectedColor,
        });
      } else {
        await addDoc(collection(db, 'categories'), {
          storeId,
          name: safeName,
          isActive: isActiveState,
          itemCount: 0,
          order: categories.length,
          color: selectedColor,
          parentId: selectedParentId || null,
        });
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReorder = async (newMainOrder: Category[]) => {
    if (searchQuery) return;
    
    // Reconstruct the flat array by keeping sub-categories immediately after their parents
    const newFlatOrder: Category[] = [];
    newMainOrder.forEach(mainCat => {
      newFlatOrder.push(mainCat);
      const mySubCats = categories.filter(c => c.parentId === mainCat.id).sort((a, b) => a.order - b.order);
      newFlatOrder.push(...mySubCats);
    });

    // Add any orphaned sub-categories at the bottom
    const orphaned = categories.filter(c => c.parentId && !categories.find(m => m.id === c.parentId));
    newFlatOrder.push(...orphaned);

    setCategories(newFlatOrder);

    try {
      const batch = writeBatch(db);
      newFlatOrder.forEach((category, index) => {
        if (category.order !== index) {
          const catRef = doc(db, 'categories', category.id);
          batch.update(catRef, { order: index });
        }
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  const renderCategoryRow = (category: Category, isSubCat: boolean, parentName: string | null) => (
    <div className={`flex flex-row items-center gap-3 hover:bg-slate-50 transition-colors group bg-white ${!category.isActive ? 'opacity-75' : ''} p-2 sm:p-3`}>
      {/* Drag Handle & Color Block */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className={`p-1 text-slate-300 transition-colors ${isSubCat ? 'opacity-0 pointer-events-none w-4' : 'cursor-grab active:cursor-grabbing hover:text-slate-500'}`}>
          {!isSubCat && <GripVertical className="w-4 h-4" />}
        </div>
        <div 
          className={`relative w-10 h-10 rounded-xl flex-shrink-0 shadow-sm border ${isSubCat ? 'border-amber-100' : category.isActive ? 'border-amber-200' : 'border-slate-200'}`}
          style={{ backgroundColor: category.color || '#e2e8f0' }}
        >
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex flex-wrap items-center gap-2">
          {isSubCat && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-black border border-amber-200 uppercase tracking-widest flex-shrink-0">
              Sub of {parentName ?? '?'}
            </span>
          )}
          <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">{getCategoryName(category.name)}</h4>
          {!category.isActive && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold border border-slate-200 flex-shrink-0">Hidden</span>
          )}
        </div>
      </div>

      {/* Stats & Actions */}
      <div className="flex items-center justify-end gap-3 sm:gap-6 flex-shrink-0">
        <div className="text-center hidden sm:block">
          <span className="block text-sm font-black text-slate-900 leading-none">{category.itemCount}</span>
          <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Items</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <label className="flex items-center cursor-pointer mr-1 sm:mr-2">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={category.isActive} onChange={() => toggleStatus(category.id, category.isActive)} />
              <div className={`block w-8 h-5 rounded-full transition-colors ${category.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${category.isActive ? 'transform translate-x-3' : ''}`}></div>
            </div>
          </label>
          <button onClick={() => openEditModal(category)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Edit Category">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => handleDeleteClick(category.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete Category">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Menu Categories</h1>
          <p className="mt-2 text-slate-500 font-medium">Organize your menu items into logical groups.</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Category
        </button>
      </div>

      {/* Search */}
      <div className="mb-8 relative w-full">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Search categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 shadow-sm focus:border-amber-500 focus:ring-amber-500 bg-white transition-colors"
        />
      </div>

      {/* Categories List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">All Categories</h3>
          <span className="text-sm font-medium text-slate-500">{categories.length} total</span>
        </div>

        {filteredCategories.length === 0 ? (
          <div className="text-center py-16">
            <Tag className="mx-auto h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No categories found</h3>
            <p className="text-slate-500 mt-1">Try adjusting your search query.</p>
          </div>
        ) : searchQuery ? (
          /* Flat list for Search mode (dragging disabled) */
          <div className="divide-y divide-slate-100">
            {filteredCategories.map(category => {
              const isSubCat = !!category.parentId;
              const parentName = isSubCat ? getCategoryName(categories.find(c => c.id === category.parentId)?.name) : null;
              return (
                <div key={category.id}>
                  {renderCategoryRow(category, isSubCat, parentName)}
                </div>
              );
            })}
          </div>
        ) : (
          /* Nested Reorder List */
          <Reorder.Group
            axis="y"
            values={filteredCategories.filter(c => !c.parentId)}
            onReorder={handleReorder}
            className="p-3 sm:p-4 space-y-3"
          >
            <AnimatePresence mode="popLayout">
              {filteredCategories.filter(c => !c.parentId).map((mainCat, idx) => {
                const mySubCats = filteredCategories.filter(sc => sc.parentId === mainCat.id).sort((a,b) => a.order - b.order);
                return (
                  <Reorder.Item
                    value={mainCat}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    key={mainCat.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group"
                  >
                    {/* Main Category Row */}
                    {renderCategoryRow(mainCat, false, null)}

                    {/* Sub Categories nested inside parent item */}
                    {mySubCats.length > 0 && (
                      <div className="bg-slate-50/50 border-t border-slate-100">
                        {mySubCats.map(subCat => (
                          <div key={subCat.id} className="border-b border-slate-100 last:border-b-0 pl-6 sm:pl-10">
                            {renderCategoryRow(subCat, true, getCategoryName(mainCat.name))}
                          </div>
                        ))}
                      </div>
                    )}
                  </Reorder.Item>
                );
              })}
              
              {/* Orphaned subcategories (if any data is inconsistent) */}
              {(() => {
                const orphaned = filteredCategories.filter(sc => sc.parentId && !categories.find(c => c.id === sc.parentId));
                if (orphaned.length === 0) return null;
                return (
                  <div className="pt-4 border-t border-slate-200">
                    <p className="text-xs font-bold text-rose-500 mb-2 px-3">Orphaned Sub-Categories (Parent Missing)</p>
                    {orphaned.map(subCat => (
                      <div key={subCat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-2">
                        {renderCategoryRow(subCat, true, 'Unknown Parent')}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="relative w-full sm:max-w-xl lg:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-2xl font-heading font-black text-slate-900">
                  {editingCategory ? 'Edit Category' : 'Add Category'}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
                <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                  <div className="flex flex-col lg:flex-row gap-5 lg:gap-6">

                    {/* ── Left column: fields ── */}
                    <div className="flex-1 space-y-5">

                {/* Category Name */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5 flex justify-between items-center">
                      <span>Category Name (English)</span>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">Required</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={(categoryName as LocalizedString)?.en || ''}
                      onChange={(e) => setCategoryName({ ...(categoryName as LocalizedString), en: e.target.value })}
                      placeholder="e.g. Starters"
                      onInput={onInputCap}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Name (French)</label>
                      <input
                        type="text"
                        value={(categoryName as LocalizedString)?.fr || ''}
                        onChange={(e) => setCategoryName({ ...(categoryName as LocalizedString), fr: e.target.value })}
                        placeholder="e.g. Entrées"
                        onInput={onInputCap}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Name (Dutch)</label>
                      <input
                        type="text"
                        value={(categoryName as LocalizedString)?.nl || ''}
                        onChange={(e) => setCategoryName({ ...(categoryName as LocalizedString), nl: e.target.value })}
                        placeholder="e.g. Voorgerechten"
                        onInput={onInputCap}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Parent Category Selector */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">
                    Parent Category
                    <span className="text-slate-400 font-medium ml-1">(leave empty for a main category)</span>
                  </label>
                  <select
                    value={selectedParentId}
                    onChange={(e) => setSelectedParentId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all bg-white"
                  >
                    <option value="">— None (Main Category) —</option>
                    {categories
                      .filter(c => !c.parentId && c.id !== editingCategory?.id)
                      .map(c => (
                        <option key={c.id} value={c.id}>{getCategoryName(c.name)}</option>
                      ))
                    }
                  </select>
                  {selectedParentId && (
                    <p className="mt-1.5 text-xs text-amber-600 font-medium">
                      ✦ This will appear as a sub-category inside &quot;{getCategoryName(categories.find(c => c.id === selectedParentId)?.name)}&quot;
                    </p>
                  )}
                </div>

                  </div>{/* end left column */}

                  {/* ── Right column: color & active ── */}
                  <div className="lg:w-64 flex-shrink-0 flex flex-col gap-5">

                    {/* Color Picker */}
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">POS Category Color</label>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                        <div className="grid grid-cols-6 gap-2">
                          {POS_COLORS.map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setSelectedColor(color)}
                              className={`w-8 h-8 rounded-full transition-transform ${selectedColor === color ? 'scale-110 ring-2 ring-offset-2 ring-slate-400 shadow-md' : 'hover:scale-110'}`}
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Active Status */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div>
                        <h4 className="font-bold text-slate-900">Active</h4>
                        <p className="text-xs text-slate-500">Show on POS and Kiosk.</p>
                      </div>
                      <label className="flex items-center cursor-pointer">
                        <div className="relative">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={isActiveState}
                            onChange={(e) => setIsActiveState(e.target.checked)}
                          />
                          <div className={`block w-12 h-7 rounded-full transition-colors ${isActiveState ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                          <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform shadow-sm ${isActiveState ? 'translate-x-5' : ''}`}></div>
                        </div>
                      </label>
                    </div>

                  </div>{/* end right column */}
                  </div>{/* end flex row */}
                </div>{/* end scrollable area */}

                {/* Actions - Pinned to bottom */}
                <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isSaving}
                    className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || !((categoryName as LocalizedString)?.en || '').trim()}
                    className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      editingCategory ? 'Save Changes' : 'Create Category'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {categoryToDelete && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCategoryToDelete(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-heading font-black text-slate-900 mb-2">Delete Category?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete this category? 
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setCategoryToDelete(null)}
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
    </div>
  );
}
