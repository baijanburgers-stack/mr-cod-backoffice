'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Plus, Trash2, X, Upload, Image as ImageIcon, Loader2, Save, PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { db, storage } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import CurrencyInput from '@/components/ui/CurrencyInput';

type LocalizedString = { en: string; fr: string; nl: string };

type ModifierOption = {
  id: string;
  name: string | LocalizedString;
  price: number;
  vatRate?: number;
  imageUrl?: string;
  imagePath?: string;
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

type OptionImageState = {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  progress: number;
};

export default function ModifierOptionsPage({ params }: { params: Promise<{ storeId: string; modifierId: string }> }) {
  const { storeId, modifierId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const getOptName = (name: string | LocalizedString | undefined) => {
    if (!name) return '';
    if (typeof name === 'string') return name;
    return name.en || '';
  };

  const [modifier, setModifier] = useState<Modifier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Working copy of options being edited
  const [options, setOptions] = useState<ModifierOption[]>([]);
  const [optionImages, setOptionImages] = useState<Record<string, OptionImageState>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Option being deleted (confirm)
  const [optionToDelete, setOptionToDelete] = useState<string | null>(null);

  // Dirty tracking
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'modifiers', modifierId), (snap) => {
      if (!snap.exists()) {
        setIsLoading(false);
        return;
      }
      const data = { id: snap.id, ...snap.data() } as Modifier;
      setModifier(data);
      // Only set options from DB if user hasn't made changes
      if (!isDirty) {
        setOptions(data.options || []);
        initImageStates(data.options || []);
      }
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `modifiers/${modifierId}`);
      setIsLoading(false);
    });
    return () => unsub();
  }, [modifierId, user]);

  const initImageStates = (opts: ModifierOption[]) => {
    const map: Record<string, OptionImageState> = {};
    opts.forEach(o => {
      map[o.id] = { file: null, preview: o.imageUrl || null, uploading: false, progress: 0 };
    });
    setOptionImages(map);
  };

  // ── Image handlers ─────────────────────────────────────────────────────────
  const handleImageFile = useCallback((optId: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    setIsDirty(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setOptionImages(prev => ({
        ...prev,
        [optId]: { ...prev[optId], file, preview: e.target?.result as string }
      }));
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = (optId: string) => {
    setIsDirty(true);
    setOptionImages(prev => ({
      ...prev,
      [optId]: { ...prev[optId], file: null, preview: null }
    }));
    if (fileInputRefs.current[optId]) fileInputRefs.current[optId]!.value = '';
  };

  const uploadImage = async (optId: string, file: File): Promise<{ imageUrl: string; imagePath: string }> => {
    const path = `stores/${storeId}/modifiers/${modifierId}/options/${optId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    setOptionImages(prev => ({ ...prev, [optId]: { ...prev[optId], uploading: true, progress: 0 } }));

    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file);
      task.on('state_changed',
        (snap) => {
          const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
          setOptionImages(prev => ({ ...prev, [optId]: { ...prev[optId], progress: pct } }));
        },
        (err) => {
          setOptionImages(prev => ({ ...prev, [optId]: { ...prev[optId], uploading: false } }));
          reject(err);
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setOptionImages(prev => ({ ...prev, [optId]: { ...prev[optId], uploading: false } }));
          resolve({ imageUrl: url, imagePath: path });
        }
      );
    });
  };

  // ── Option CRUD ────────────────────────────────────────────────────────────
  const addOption = () => {
    const newOpt: ModifierOption = {
      id: crypto.randomUUID(),
      name: { en: '', fr: '', nl: '' },
      price: 0,
      imageUrl: '',
      imagePath: ''
    };
    setOptions(prev => [...prev, newOpt]);
    setOptionImages(prev => ({ ...prev, [newOpt.id]: { file: null, preview: null, uploading: false, progress: 0 } }));
    setIsDirty(true);
  };

  const updateName = (id: string, lang: 'en' | 'fr' | 'nl', value: string) => {
    setIsDirty(true);
    setOptions(prev => prev.map(o => {
      if (o.id !== id) return o;
      const cur = typeof o.name === 'string' ? { en: o.name, fr: o.name, nl: o.name } : (o.name || { en: '', fr: '', nl: '' });
      return { ...o, name: { ...cur, [lang]: value } };
    }));
  };

  const updatePrice = (id: string, price: number) => {
    setIsDirty(true);
    setOptions(prev => prev.map(o => o.id === id ? { ...o, price } : o));
  };

  const confirmRemoveOption = async () => {
    if (!optionToDelete) return;
    const opt = options.find(o => o.id === optionToDelete);
    // delete image from storage if it exists
    if (opt?.imagePath) {
      await deleteObject(ref(storage, opt.imagePath)).catch(() => {});
    }
    setOptions(prev => prev.filter(o => o.id !== optionToDelete));
    setOptionImages(prev => { const next = { ...prev }; delete next[optionToDelete]; return next; });
    setOptionToDelete(null);
    setIsDirty(true);
  };

  // ── Save all options ───────────────────────────────────────────────────────
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const finalOptions: ModifierOption[] = await Promise.all(
        options.map(async (opt) => {
          const imgState = optionImages[opt.id];
          if (imgState?.file) {
            // new file → delete old, upload new
            if (opt.imagePath) await deleteObject(ref(storage, opt.imagePath)).catch(() => {});
            const result = await uploadImage(opt.id, imgState.file);
            return { ...opt, imageUrl: result.imageUrl, imagePath: result.imagePath };
          } else if (!imgState?.preview && opt.imageUrl) {
            // image removed
            if (opt.imagePath) await deleteObject(ref(storage, opt.imagePath)).catch(() => {});
            return { ...opt, imageUrl: '', imagePath: '' };
          }
          return opt;
        })
      );

      await updateDoc(doc(db, 'modifiers', modifierId), { options: finalOptions });
      setIsDirty(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `modifiers/${modifierId}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading / not found ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!modifier) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-2xl font-heading font-black text-slate-900">Modifier not found</h1>
        <button onClick={() => router.push(`/admin/store/${storeId}/menu/modifiers`)}
          className="px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors">
          Back to Modifiers
        </button>
      </div>
    );
  }

  const modName = typeof modifier.name === 'string' ? modifier.name : modifier.name.en;
  const anyUploading = Object.values(optionImages).some(s => s.uploading);

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto min-h-screen">

      {/* Back & Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push(`/admin/store/${storeId}/menu/modifiers`)}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-amber-600 transition-colors mb-4 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Modifier Groups
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-black text-slate-900">{modName}</h1>
            <p className="mt-1 text-slate-500 font-medium">
              Manage options below — each can have a kiosk image.
            </p>
            <div className="flex items-center gap-2 mt-2">
              {modifier.isRequired
                ? <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 text-xs font-bold border border-rose-100">Required</span>
                : <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">Optional</span>
              }
              {modifier.allowMultiple && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-xs font-bold border border-indigo-100">Multiple Choice</span>
              )}
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200 capitalize">{modifier.itemType?.replace('_', ' ') || 'Food'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={addOption}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              Add Option
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSaving || anyUploading || !isDirty}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving || anyUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Options
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Options Grid */}
      {options.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm text-center py-20">
          <ImageIcon className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No options yet</h3>
          <p className="text-slate-500 text-sm mb-6">Add your first option with an image for the kiosk.</p>
          <button
            onClick={addOption}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add First Option
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {options.map((opt) => {
              const imgState = optionImages[opt.id] || { file: null, preview: null, uploading: false, progress: 0 };
              const optName = getOptName(opt.name);
              return (
                <motion.div
                  key={opt.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow"
                >
                  {/* Image Area */}
                  <div className="relative w-full aspect-[4/3] bg-slate-100">
                    {imgState.preview ? (
                      <>
                        <img
                          src={imgState.preview}
                          alt={optName || 'option'}
                          className="w-full h-full object-cover"
                        />
                        {/* Upload overlay */}
                        <AnimatePresence>
                          {imgState.uploading && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center gap-2"
                            >
                              <Loader2 className="w-6 h-6 text-white animate-spin" />
                              <div className="w-2/3 bg-slate-700 rounded-full h-1.5">
                                <motion.div
                                  className="h-full bg-amber-400 rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${imgState.progress}%` }}
                                  transition={{ ease: 'linear' }}
                                />
                              </div>
                              <span className="text-white text-xs font-bold">{Math.round(imgState.progress)}%</span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        {/* Controls */}
                        {!imgState.uploading && (
                          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => fileInputRefs.current[opt.id]?.click()}
                              className="p-1.5 bg-slate-900/70 hover:bg-slate-900/90 text-white rounded-lg transition-colors"
                              title="Change image"
                            >
                              <Upload className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeImage(opt.id)}
                              className="p-1.5 bg-slate-900/70 hover:bg-rose-600 text-white rounded-lg transition-colors"
                              title="Remove image"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[opt.id]?.click()}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 hover:bg-amber-50/80 transition-colors cursor-pointer group/upload"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-slate-200 group-hover/upload:bg-amber-100 flex items-center justify-center transition-colors">
                          <ImageIcon className="w-6 h-6 text-slate-400 group-hover/upload:text-amber-500 transition-colors" />
                        </div>
                        <span className="text-xs font-bold text-slate-400 group-hover/upload:text-amber-600 transition-colors">
                          Click to add image
                        </span>
                        <span className="text-[10px] text-slate-300">PNG · JPG · WEBP</span>
                      </button>
                    )}
                    <input
                      ref={el => { fileInputRefs.current[opt.id] = el; }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageFile(opt.id, f);
                      }}
                    />
                  </div>

                  {/* Fields */}
                  <div className="p-4 space-y-2.5 flex-1">
                    <input
                      type="text"
                      value={typeof opt.name === 'string' ? opt.name : opt.name?.en || ''}
                      onChange={(e) => updateName(opt.id, 'en', e.target.value)}
                      placeholder="Name (EN) — e.g. Extra Cheese"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors text-sm font-medium"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={typeof opt.name === 'string' ? '' : opt.name?.fr || ''}
                        onChange={(e) => updateName(opt.id, 'fr', e.target.value)}
                        placeholder="Name (FR)"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                      />
                      <input
                        type="text"
                        value={typeof opt.name === 'string' ? '' : opt.name?.nl || ''}
                        onChange={(e) => updateName(opt.id, 'nl', e.target.value)}
                        placeholder="Name (NL)"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <CurrencyInput
                          defaultValue={opt.price}
                          onChange={(val) => updatePrice(opt.id, val)}
                          className="w-full py-2 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 transition-colors text-sm"
                        />
                      </div>
                      <button
                        onClick={() => setOptionToDelete(opt.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors flex-shrink-0"
                        title="Delete option"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Add-option card */}
          <motion.button
            layout
            onClick={addOption}
            className="bg-white rounded-2xl border-2 border-dashed border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 min-h-[260px] flex flex-col items-center justify-center gap-3 transition-all group"
          >
            <div className="w-14 h-14 rounded-2xl bg-slate-100 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
              <Plus className="w-6 h-6 text-slate-400 group-hover:text-amber-500 transition-colors" />
            </div>
            <span className="text-sm font-bold text-slate-400 group-hover:text-amber-600 transition-colors">Add Option</span>
          </motion.button>
        </div>
      )}

      {/* Sticky save footer (visible when dirty) */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-lg border-t border-slate-200 px-6 py-4 flex items-center justify-between shadow-lg"
          >
            <p className="text-sm font-bold text-slate-600">
              <span className="text-amber-600">{options.length}</span> option{options.length !== 1 ? 's' : ''} — unsaved changes
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // Reset to DB state
                  if (modifier) {
                    setOptions(modifier.options || []);
                    initImageStates(modifier.options || []);
                    setIsDirty(false);
                  }
                }}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSaveAll}
                disabled={isSaving || anyUploading}
                className="px-6 py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving || anyUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save All Options
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete option confirm */}
      <AnimatePresence>
        {optionToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOptionToDelete(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-xs bg-white rounded-3xl shadow-2xl p-6 text-center"
            >
              <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-heading font-black text-slate-900 mb-2">Delete Option?</h2>
              <p className="text-slate-500 text-sm mb-5">This option and its image will be permanently removed.</p>
              <div className="flex gap-3">
                <button onClick={() => setOptionToDelete(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">
                  Cancel
                </button>
                <button onClick={confirmRemoveOption}
                  className="flex-1 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-500 transition-colors text-sm">
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
