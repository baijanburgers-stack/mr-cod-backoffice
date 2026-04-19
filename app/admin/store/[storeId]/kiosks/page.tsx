'use client';

import { useState, use, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Tablet, Edit, Trash2, X, AlertTriangle,
  Eye, EyeOff, Printer, Wifi, WifiOff,
  Image as ImageIcon, Video, Palette, Upload, CheckCircle,
  RotateCcw, Loader2, RefreshCw, Radio,
} from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, getDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytesResumable,
  getDownloadURL, deleteObject,
} from 'firebase/storage';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';

// ─── SHA-256 hash ─────────────────────────────────────────────────────────────
async function sha256(message: string): Promise<string> {
  const buf  = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PrinterConfig = { type: 'lan' | 'usb'; ip: string; port: number };

type KioskBranding = {
  logoUrl?:           string;
  idleBackgroundUrl?: string;
  idleVideoUrl?:      string;
  accentColor?:       string;
  tagline?:           string;
};

type Kiosk = {
  id:              string;
  name:            string;
  loginId:         string;
  password:        string;
  passwordHash:    string;
  ccvTerminalId:   string;
  customerPrinter: PrinterConfig;
  kitchenPrinter:  PrinterConfig;
  isActive:        boolean;
  branding:        KioskBranding;
  createdAt?:      string;
};

type FormData = {
  name: string; loginId: string; password: string;
  isActive: boolean;
};

const defaultForm: FormData = {
  name: '', loginId: '', password: '',
  isActive: true,
};

// ─── Upload progress state ────────────────────────────────────────────────────
type UploadState = { progress: number; uploading: boolean; error?: string };
const idle: UploadState = { progress: 0, uploading: false };

export default function KiosksPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId }    = use(params);
  const [kiosks, setKiosks]         = useState<Kiosk[]>([]);
  const [maxKiosks, setMaxKiosks]   = useState(0);
  const [isLoading, setIsLoading]   = useState(true);
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [editingKiosk, setEditingKiosk] = useState<Kiosk | null>(null);
  const [formData, setFormData]     = useState<FormData>(defaultForm);
  const [fd, setFd]                 = ([ formData, setFormData ] as const);
  const [showPw, setShowPw]         = useState(false);
  const [isSaving, setIsSaving]     = useState(false);
  const [loginIdError, setLoginIdError] = useState('');
  const [activeTab, setActiveTab]   = useState<'identity'>('identity');
  const [delModal, setDelModal]     = useState<Kiosk | null>(null);

  // Publish state
  const [isPublishing, setIsPublishing] = useState(false);
  const [lastPublished, setLastPublished] = useState<Date | null>(null);

  // Load last publish timestamp from store doc
  useEffect(() => {
    getDoc(doc(db, 'stores', storeId)).then(s => {
      if (s.exists()) {
        const ts = s.data().kioskSyncAt;
        if (ts instanceof Timestamp) setLastPublished(ts.toDate());
      }
    });
  }, [storeId]);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await updateDoc(doc(db, 'stores', storeId), { kioskSyncAt: serverTimestamp() });
      setLastPublished(new Date());
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'stores');
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    getDoc(doc(db, 'stores', storeId)).then(s => {
      if (s.exists()) setMaxKiosks(s.data().maxKiosks ?? 0);
    });
    const unsub = onSnapshot(
      collection(db, 'stores', storeId, 'kiosks'),
      snap => {
        setKiosks(snap.docs.map(d => ({
          id: d.id,
          name:            d.data().name || '',
          loginId:         d.data().loginId || '',
          password:        d.data().password || '',
          passwordHash:    d.data().passwordHash || '',
          ccvTerminalId:   d.data().ccvTerminalId || '',
          customerPrinter: d.data().customerPrinter || { type: 'lan', ip: '', port: 9100 },
          kitchenPrinter:  d.data().kitchenPrinter  || { type: 'lan', ip: '', port: 9100 },
          isActive:        d.data().isActive ?? true,
          branding:        d.data().branding || {},
          createdAt:       d.data().createdAt || '',
        })));
        setIsLoading(false);
      },
      err => { handleFirestoreError(err, OperationType.GET, 'kiosks'); setIsLoading(false); }
    );
    return () => unsub();
  }, [storeId]);



  // ── Modals open ───────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingKiosk(null);
    setFormData(defaultForm);
    setLoginIdError('');
    setActiveTab('identity');
    setIsModalOpen(true);
  };

  const openEdit = (k: Kiosk) => {
    setEditingKiosk(k);
    setFormData({
      name: k.name, loginId: k.loginId, password: '',
      isActive: k.isActive,
    });
    setLoginIdError('');
    setActiveTab('identity');
    setIsModalOpen(true);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginIdError('');
    const dup = kiosks.find(k => k.loginId === fd.loginId.trim() && k.id !== editingKiosk?.id);
    if (dup) { setLoginIdError('Login ID already in use.'); setActiveTab('identity'); return; }

    setIsSaving(true);
    try {
      const newPassword = fd.password || (editingKiosk?.password || '');
      const ph = fd.password ? await sha256(fd.password) : (editingKiosk?.passwordHash || '');
      const data = {
        name:         fd.name.trim(),
        loginId:      fd.loginId.trim(),
        password:     newPassword,
        passwordHash: ph,
        isActive: fd.isActive,
        // CCV Terminal ID and Printers are configured on-device via the Kiosk Config panel
      };
      const col = collection(db, 'stores', storeId, 'kiosks');
      if (editingKiosk) await updateDoc(doc(col, editingKiosk.id), data);
      else              await addDoc(col, { ...data, createdAt: serverTimestamp() });
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, editingKiosk ? OperationType.UPDATE : OperationType.CREATE, 'kiosks');
    } finally { setIsSaving(false); }
  };

  const handleDelete = async () => {
    if (!delModal) return;
    try { await deleteDoc(doc(db, 'stores', storeId, 'kiosks', delModal.id)); }
    catch (err) { handleFirestoreError(err, OperationType.DELETE, 'kiosks'); }
    finally { setDelModal(null); }
  };

  const atLimit = maxKiosks > 0 && kiosks.length >= maxKiosks;

  if (isLoading) return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
      <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-md shadow-red-600/30">
              <Tablet className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-heading font-black text-slate-900">Kiosk Terminals</h1>
          </div>
          <p className="text-slate-500 font-medium mt-1 ml-[52px]">
            Self-service ordering screens for this location
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Stats badges */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {kiosks.filter(k => k.isActive).length} Online
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
              atLimit ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-slate-50 border border-slate-200 text-slate-600'
            }`}>
              {kiosks.length} / {maxKiosks > 0 ? maxKiosks : '∞'}
            </span>
          </div>
          <button onClick={openAdd} disabled={atLimit}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 active:scale-95 transition-all shadow-md shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
            <Plus className="w-4 h-4" /> Add Kiosk
          </button>
        </div>
      </div>

      {/* ── Publish Banner ───────────────────────────────────────────────── */}
      <div className="mb-8 relative overflow-hidden rounded-2xl border border-slate-700 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #E3000F 0%, transparent 60%)' }} />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
              <Radio className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="font-black text-white text-base tracking-tight">Publish to All Kiosks</div>
              <div className="text-sm text-slate-400 mt-0.5">
                {lastPublished
                  ? <><span className="text-slate-500">Last push: </span><span className="text-slate-200 font-semibold">{lastPublished.toLocaleString()}</span></>
                  : 'Forces all active kiosks to reload menu & branding on next cycle.'}
              </div>
            </div>
          </div>
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white rounded-xl font-black transition-all shadow-lg shadow-red-900/40 disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0 text-sm"
          >
            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isPublishing ? 'Publishing…' : 'Publish Now'}
          </button>
        </div>
      </div>

      {atLimit && (
        <div className="mb-6 flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700 font-medium">
            Limit of <strong>{maxKiosks} kiosks</strong> reached. Contact your super admin.
          </p>
        </div>
      )}

      {/* ── Kiosk List ───────────────────────────────────────────────────── */}
      {kiosks.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center py-24 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
            <Tablet className="w-10 h-10 text-red-300" />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2">No kiosks yet</h3>
          <p className="text-slate-400 mb-6 max-w-xs mx-auto">Add your first self-service ordering terminal for this location.</p>
          <button onClick={openAdd} disabled={atLimit}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add Kiosk
          </button>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 px-5 py-3 bg-gradient-to-r from-slate-50 to-slate-50/50 border-b-2 border-slate-100">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.08em]">Kiosk</span>
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.08em]">Terminal / Printer</span>
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.08em]">Status</span>
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.08em]">Actions</span>
          </div>
          {kiosks.map((k, i) => (
            <KioskRow key={k.id} kiosk={k} isLast={i === kiosks.length - 1}
              onEdit={() => openEdit(k)}
              onDelete={() => setDelModal(k)} />
          ))}
        </div>
      )}

      {/* ── ADD / EDIT MODAL ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">

              {/* Modal header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
                <h2 className="text-xl font-heading font-black text-slate-900">
                  {editingKiosk ? 'Edit Kiosk' : 'Add New Kiosk'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
              </div>

              {/* Tab bar */}
              <div className="flex border-b border-slate-100 flex-shrink-0">
                <button type="button" onClick={() => setActiveTab('identity' as any)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold border-b-2 border-red-600 text-red-600">
                  <Tablet className="w-4 h-4" />Identity
                </button>
              </div>

              <form onSubmit={handleSave} className="overflow-y-auto flex-1">

                {/* ── IDENTITY ─────────────────────────────────────────── */}
                {activeTab === 'identity' && (
                  <div className="p-6 space-y-4">
                    <Field label="Kiosk Name">
                      <input required value={fd.name} onChange={e => setFd(f => ({ ...f, name: e.target.value }))}
                        className="input" placeholder="e.g. Kiosk 1 — Entrance" />
                    </Field>
                    <Field label="Login ID" error={loginIdError}>
                      <input required value={fd.loginId}
                        onChange={e => { setFd(f => ({ ...f, loginId: e.target.value })); setLoginIdError(''); }}
                        className={`input ${loginIdError ? 'border-rose-400' : ''}`} placeholder="e.g. kiosk1" />
                    </Field>
                    <Field label={<>Password {editingKiosk && <span className="text-slate-400 font-normal">(blank = keep)</span>}</>}>
                      <div className="relative">
                        <input type={showPw ? 'text' : 'password'} required={!editingKiosk}
                          value={fd.password} onChange={e => setFd(f => ({ ...f, password: e.target.value }))}
                          className="input pr-12" placeholder={editingKiosk ? '••••••••' : 'Set password'} />
                        <button type="button" onClick={() => setShowPw(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400">
                          {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Stored as SHA-256 hash.</p>
                    </Field>
                    <div className="flex items-center justify-between py-3 border-t border-slate-100">
                      <div>
                        <div className="font-bold text-slate-900">Active</div>
                        <div className="text-xs text-slate-500">Inactive kiosks cannot process orders</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={fd.isActive}
                          onChange={e => setFd(f => ({ ...f, isActive: e.target.checked }))} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600" />
                      </label>
                    </div>
                  </div>
                )}


                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
                  <button type="button" onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 inline-flex items-center gap-2">
                    {isSaving
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <CheckCircle className="w-4 h-4" />}
                    {editingKiosk ? 'Save Changes' : 'Create Kiosk'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Delete confirmation */}
      <AnimatePresence>
        {delModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-rose-600" />
              </div>
              <h2 className="text-xl font-heading font-black text-slate-900 mb-2">Delete Kiosk?</h2>
              <p className="text-slate-500 mb-6">
                Are you sure you want to delete <strong className="text-slate-900">{delModal.name}</strong>?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDelModal(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button onClick={handleDelete}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors">
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

// ─── Upload Zone ───────────────────────────────────────────────────────────────
// Drag-and-drop or click-to-select zone with upload progress bar

function UploadZone({
  accept, currentUrl, uploadState, previewType,
  onFile, onClear, hint,
}: {
  accept:       string;
  currentUrl:   string;
  uploadState:  UploadState;
  previewType:  'image' | 'video';
  onFile:       (f: File) => void;
  onClear:      () => void;
  hint:         string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 py-6 px-4 text-center ${
          drag
            ? 'border-red-500 bg-red-50'
            : uploadState.uploading
            ? 'border-slate-200 bg-slate-50 cursor-default'
            : 'border-slate-200 hover:border-red-400 hover:bg-red-50/30'
        }`}
      >
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handlePick} />

        {uploadState.uploading ? (
          <>
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            <p className="text-sm font-bold text-slate-700">Uploading… {uploadState.progress}%</p>
            <div className="w-full max-w-xs bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-red-500 rounded-full transition-all duration-300"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
          </>
        ) : currentUrl ? (
          <>
            <CheckCircle className="w-6 h-6 text-emerald-500" />
            <p className="text-xs text-emerald-700 font-bold">Uploaded ✓</p>
            <p className="text-[10px] text-slate-400">Click to replace</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-slate-400" />
            <p className="text-sm font-bold text-slate-600">
              Drop file here or <span className="text-red-600 underline">browse</span>
            </p>
            <p className="text-xs text-slate-400">{hint}</p>
          </>
        )}

        {uploadState.error && (
          <p className="text-xs text-rose-600 font-bold">{uploadState.error}</p>
        )}
      </div>

      {/* Preview + Clear */}
      {currentUrl && !uploadState.uploading && (
        <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
          {previewType === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="preview" className="w-full max-h-48 object-contain" />
          ) : (
            <video src={currentUrl} muted loop autoPlay playsInline className="w-full max-h-48 object-contain" />
          )}
          <button
            type="button"
            onClick={onClear}
            title="Remove"
            className="absolute top-2 right-2 w-7 h-7 bg-rose-600 rounded-full flex items-center justify-center text-white hover:bg-rose-700 transition-all shadow"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Kiosk Row (list style) ────────────────────────────────────────────────────

function KioskRow({ kiosk, isLast, onEdit, onDelete }: {
  kiosk: Kiosk; isLast: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const hasCcv = !!kiosk.ccvTerminalId;
  const printerIp = kiosk.customerPrinter?.type === 'lan'
    ? kiosk.customerPrinter.ip
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 items-center px-5 py-4 group hover:bg-slate-50/80 transition-colors ${
        isLast ? '' : 'border-b border-slate-100'
      }`}
    >
      {/* ── Kiosk name + login ── */}
      <div className="flex items-center gap-3.5 min-w-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
          kiosk.isActive
            ? 'bg-gradient-to-br from-red-500 to-rose-600'
            : 'bg-slate-200'
        }`}>
          <Tablet className={`w-4.5 h-4.5 ${kiosk.isActive ? 'text-white' : 'text-slate-400'}`} style={{ width: 18, height: 18 }} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-slate-900 truncate leading-tight">{kiosk.name}</div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">ID: {kiosk.loginId}</div>
        </div>
      </div>

      {/* ── Terminal + printer ── */}
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            hasCcv ? 'bg-emerald-500' : 'bg-amber-400'
          }`} />
          <span className={`text-[12px] font-mono truncate ${
            hasCcv ? 'text-slate-700 font-semibold' : 'text-amber-600 italic'
          }`}>
            {hasCcv ? kiosk.ccvTerminalId : 'No terminal set'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Printer className="w-3 h-3 text-slate-300 flex-shrink-0" />
          <span className="text-[11px] text-slate-400 font-mono truncate">
            {kiosk.customerPrinter?.type === 'usb'
              ? 'USB'
              : printerIp || <span className="italic">No IP set</span>}
          </span>
        </div>
      </div>

      {/* ── Status ── */}
      <div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
          kiosk.isActive
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            kiosk.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
          }`} />
          {kiosk.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
        <PasswordReveal password={kiosk.password} />
        <button onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all">
          <Edit className="w-3.5 h-3.5" /> Edit
        </button>
        <button onClick={onDelete}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 active:scale-95 transition-all">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Password Reveal Button ──────────────────────────────────────────────────────

function PasswordReveal({ password }: { password: string }) {
  const [show, setShow] = useState(false);

  if (!password) return (
    <span className="text-[11px] text-slate-300 italic px-1 hidden lg:block">no pwd stored</span>
  );

  return (
    <div className="flex items-center gap-1.5">
      <AnimatePresence mode="wait">
        {show && (
          <motion.span
            key="pw"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="font-mono text-[12px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg overflow-hidden whitespace-nowrap select-all border border-slate-200"
          >
            {password}
          </motion.span>
        )}
      </AnimatePresence>
      <button
        onClick={() => setShow(v => !v)}
        title={show ? 'Hide password' : 'Reveal password'}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95 ${
          show
            ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
        }`}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ─── Idle Screen Preview ───────────────────────────────────────────────────────

function IdlePreview({ logoUrl, bgUrl, videoUrl, accentColor, tagline, fullscreen = false }: {
  logoUrl?: string; bgUrl?: string; videoUrl?: string;
  accentColor: string; tagline?: string; fullscreen?: boolean;
}) {
  return (
    <div className={`relative flex flex-col items-center justify-center overflow-hidden ${
      fullscreen ? 'w-full h-full' : 'aspect-[9/16] max-h-64'
    } rounded-2xl bg-[#0B0D11]`}>
      {bgUrl && !videoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
      )}
      {videoUrl && (
        <video src={videoUrl} muted loop autoPlay playsInline className="absolute inset-0 w-full h-full object-cover opacity-50" />
      )}
      <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 40%, ${accentColor}22)` }} />
      <div className="relative z-10 flex flex-col items-center gap-3 p-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="logo" className="h-14 object-contain drop-shadow-lg" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
            <Tablet className="w-7 h-7 text-white/40" />
          </div>
        )}
        {tagline && <p className="text-white/70 text-sm">{tagline}</p>}
        <div className="px-6 py-3 rounded-2xl text-white text-sm font-black shadow-lg" style={{ background: accentColor }}>
          Touch to Order
        </div>
      </div>
    </div>
  );
}

// ─── Printer fields ────────────────────────────────────────────────────────────


// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, children, error }: { label: React.ReactNode; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-600 font-medium mt-1">{error}</p>}
    </div>
  );
}
