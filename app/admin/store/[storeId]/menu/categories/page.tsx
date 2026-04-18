'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Search, Plus, Edit2, Trash2, GripVertical, Tag, X, AlertCircle, Upload, Image as ImageIcon, Loader2, CheckCircle2 } from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

type Category = {
  id: string;
  storeId: string;
  name: string;
  isActive: boolean;
  itemCount: number;
  order: number;
  imageUrl?: string;
  imagePath?: string;
  parentId?: string | null;
};

export default function StoreCategoriesPage({ params }: { params: Promise<{ storeId: string }> }) {
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

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categoryName, setCategoryName] = useState('');
  const [isActiveState, setIsActiveState] = useState(true);
  const [parentIdState, setParentIdState] = useState<string>('');

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

  const filteredCategoriesRaw = categories.filter(category =>
    category.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const mainCategories = categories.filter(c => !c.parentId);

  // Sort them so that subcategories physically render immediately under their parents
  const filteredCategories: Category[] = [];
  const mainFiltered = filteredCategoriesRaw.filter(c => !c.parentId);
  mainFiltered.forEach(m => {
    filteredCategories.push(m);
    const children = filteredCategoriesRaw.filter(c => c.parentId === m.id);
    filteredCategories.push(...children);
  });
  // Toss any orphaned categories at the end just in case
  const handled = new Set(filteredCategories.map(c => c.id));
  filteredCategories.push(...filteredCategoriesRaw.filter(c => !handled.has(c.id)));

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
    const cat = categories.find(c => c.id === categoryToDelete);
    try {
      if (cat?.imagePath) {
        await deleteObject(ref(storage, cat.imagePath)).catch(() => {});
      }
      await deleteDoc(doc(db, 'categories', categoryToDelete));
      setCategoryToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryToDelete}`);
    }
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setIsActiveState(category.isActive);
    setParentIdState(category.parentId || '');
    setImagePreview(category.imageUrl || null);
    setImageFile(null);
    setUploadProgress(0);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingCategory(null);
    setCategoryName('');
    setIsActiveState(true);
    setParentIdState('');
    setImagePreview(null);
    setImageFile(null);
    setUploadProgress(0);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setImageFile(null);
    setImagePreview(null);
    setUploadProgress(0);
    setParentIdState('');
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDropZoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => setIsDraggingOver(false);

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadImage = async (categoryId: string): Promise<{ imageUrl: string; imagePath: string } | null> => {
    if (!imageFile) return null;
    const imagePath = `stores/${storeId}/categories/${categoryId}/${Date.now()}_${imageFile.name}`;
    const storageRef = ref(storage, imagePath);
    setIsUploading(true);
    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, imageFile);
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          setIsUploading(false);
          reject(error);
        },
        async () => {
          const imageUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setIsUploading(false);
          resolve({ imageUrl, imagePath });
        }
      );
    });
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    setIsSaving(true);

    try {
      if (editingCategory) {
        // Handle image replacement
        let imageData: { imageUrl?: string; imagePath?: string } = {};

        if (imageFile) {
          // Delete old image if exists
          if (editingCategory.imagePath) {
            await deleteObject(ref(storage, editingCategory.imagePath)).catch(() => {});
          }
          const result = await uploadImage(editingCategory.id);
          if (result) imageData = result;
        } else if (!imagePreview && editingCategory.imageUrl) {
          // User removed the image
          if (editingCategory.imagePath) {
            await deleteObject(ref(storage, editingCategory.imagePath)).catch(() => {});
          }
          imageData = { imageUrl: '', imagePath: '' };
        }

        await updateDoc(doc(db, 'categories', editingCategory.id), {
          name: categoryName,
          isActive: isActiveState,
          parentId: parentIdState || null,
          ...imageData,
        });
      } else {
        // Create first to get the ID, then upload image
        const docRef = await addDoc(collection(db, 'categories'), {
          storeId,
          name: categoryName,
          isActive: isActiveState,
          parentId: parentIdState || null,
          itemCount: 0,
          order: categories.length,
          imageUrl: '',
          imagePath: '',
        });

        if (imageFile) {
          const result = await uploadImage(docRef.id);
          if (result) {
            await updateDoc(docRef, result);
          }
        }
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReorder = async (newOrder: Category[]) => {
    if (searchQuery) return;
    setCategories(newOrder);
    try {
      const batch = writeBatch(db);
      newOrder.forEach((category, index) => {
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
        ) : (
          <Reorder.Group
            axis="y"
            values={filteredCategories}
            onReorder={handleReorder}
            className="divide-y divide-slate-100"
          >
            <AnimatePresence mode="popLayout">
              {filteredCategories.map((category, idx) => (
                <Reorder.Item
                  value={category}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  key={category.id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-slate-50 transition-colors group bg-white border border-slate-100 ${category.parentId ? 'ml-8 sm:ml-12 border-l-4 border-l-amber-400' : ''} ${!category.isActive ? 'opacity-75' : ''}`}
                >
                  {/* Drag Handle & Image */}
                  <div className="flex items-center gap-4">
                    <div className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-500 transition-colors">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    {/* Category thumbnail */}
                    <div className={`w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden border-2 ${category.isActive ? 'border-amber-200' : 'border-slate-200'}`}>
                      {category.imageUrl ? (
                        <img
                          src={category.imageUrl}
                          alt={category.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${category.isActive ? 'bg-amber-50 text-amber-400' : 'bg-slate-100 text-slate-400'}`}>
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-0.5">
                      <h4 className="text-base font-bold text-slate-900 truncate">{category.name}</h4>
                      {!category.isActive && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                          Hidden
                        </span>
                      )}
                    </div>
                    {!category.imageUrl && (
                      <p className="text-xs text-slate-400 font-medium">No image — click edit to add one</p>
                    )}
                  </div>

                  {/* Stats & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 mt-2 sm:mt-0">
                    <div className="text-center">
                      <span className="block text-xl font-black text-slate-900">{category.itemCount}</span>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Items</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Toggle Switch */}
                      <label className="flex items-center cursor-pointer mr-2">
                        <div className="relative">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={category.isActive}
                            onChange={() => toggleStatus(category.id, category.isActive)}
                          />
                          <div className={`block w-10 h-6 rounded-full transition-colors ${category.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${category.isActive ? 'transform translate-x-4' : ''}`}></div>
                        </div>
                      </label>

                      <button
                        onClick={() => openEditModal(category)}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                        title="Edit Category"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(category.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Delete Category"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>
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
              onClick={closeModal}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
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

              <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5">

                {/* Category Name */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Category Name *</label>
                  <input
                    type="text"
                    required
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="e.g. Starters"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                  />
                </div>

                {/* Parent Category Header */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Parent Category (Optional)</label>
                  <p className="text-xs text-slate-400 mb-2">If you select a parent, this category will appear inside it on the Kiosk as a sub-category.</p>
                  <select
                    value={parentIdState}
                    onChange={(e) => setParentIdState(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all bg-white"
                  >
                    <option value="">-- None (This is a Main Category) --</option>
                    {mainCategories.filter(c => c.id !== editingCategory?.id).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">
                    Category Image
                    <span className="text-slate-400 font-medium ml-1">(optional)</span>
                  </label>

                  {imagePreview ? (
                    /* Image Preview */
                    <div className="relative rounded-2xl overflow-hidden border-2 border-amber-300 bg-slate-100">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-48 object-cover"
                      />
                      {/* Upload progress overlay */}
                      <AnimatePresence>
                        {isUploading && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center gap-3"
                          >
                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                            <div className="w-2/3 bg-slate-700 rounded-full h-2">
                              <motion.div
                                className="h-full bg-amber-400 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                                transition={{ ease: 'linear' }}
                              />
                            </div>
                            <span className="text-white text-sm font-bold">{Math.round(uploadProgress)}%</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {/* Remove button */}
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={removeImage}
                          className="absolute top-2 right-2 p-1.5 bg-slate-900/70 hover:bg-rose-600 text-white rounded-full transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {/* Change image overlay */}
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/70 hover:bg-slate-900/90 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Change
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Drop Zone */
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative flex flex-col items-center justify-center gap-3 h-44 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                        isDraggingOver
                          ? 'border-amber-400 bg-amber-50 scale-[1.01]'
                          : 'border-slate-200 bg-slate-50 hover:border-amber-400 hover:bg-amber-50/50'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isDraggingOver ? 'bg-amber-100' : 'bg-slate-100'}`}>
                        <ImageIcon className={`w-6 h-6 transition-colors ${isDraggingOver ? 'text-amber-500' : 'text-slate-400'}`} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-slate-700">
                          {isDraggingOver ? 'Drop image here' : 'Click or drag & drop'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">PNG, JPG, WEBP · Max 5MB</p>
                      </div>
                      <div className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${isDraggingOver ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-700'}`}>
                        <Upload className="w-3.5 h-3.5" />
                        Browse Files
                      </div>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleDropZoneChange}
                    className="hidden"
                  />
                </div>

                {/* Active Status */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-900">Active Status</h4>
                    <p className="text-sm text-slate-500">Show this category on the customer menu.</p>
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

                {/* Actions */}
                <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || isUploading || !categoryName.trim()}
                    className="px-6 py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCategoryToDelete(null)}
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
              <h2 className="text-2xl font-heading font-black text-slate-900 mb-2">Delete Category?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete this category? Its image will also be permanently removed.
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
