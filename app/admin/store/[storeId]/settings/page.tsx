'use client';

import { useState, use, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Check, Percent, Settings, Clock, Phone, Mail, MapPin, CalendarOff, Plus, Trash2, Copy, Image as ImageIcon, Volume2, Tablet, X, Upload, Store, Palette, Video, AlertTriangle, ShieldCheck, Globe, ChevronDown, Monitor, Activity } from 'lucide-react';
import Image from 'next/image';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import CcvTransactionViewer from '@/components/settings/CcvTransactionViewer';
import { type VatCategory, getDefaultVatCategories, getCountryLabel } from '@/lib/vat-rules';

function UploadZone({ 
  accept, 
  currentUrl, 
  uploadState, 
  onFile, 
  onClear,
  previewType = 'image',
  hint = ''
}: { 
  accept: string, 
  currentUrl: string, 
  uploadState: { uploading: boolean, progress: number }, 
  onFile: (file: File) => void,
  onClear: () => void,
  previewType?: 'image' | 'video',
  hint?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3 relative">
      <div 
        onClick={() => !uploadState.uploading && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all min-h-[160px] relative overflow-hidden group ${
          currentUrl ? 'border-amber-200 bg-amber-50/10' : 'border-slate-200 hover:border-amber-400 hover:bg-amber-50/20'
        } ${uploadState.uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        {currentUrl ? (
          <>
            {previewType === 'video' ? (
              <video src={currentUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" muted loop autoPlay playsInline />
            ) : (
              <div className="absolute inset-0 w-full h-full p-4 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentUrl} alt="preview" className="max-w-full max-h-full object-contain" />
              </div>
            )}
            <div className="relative z-10 bg-black/60 text-white rounded-full px-4 py-2 text-sm font-bold backdrop-blur-sm group-hover:bg-amber-600 transition-colors">
              ✓ File set — click to replace
            </div>
          </>
        ) : (
          <>
            {previewType === 'video' ? <Video className="w-8 h-8 text-slate-400" /> : <Upload className="w-8 h-8 text-slate-400" />}
            <p className="text-sm font-bold text-slate-600 text-center">Drop or click to upload</p>
            {hint && <p className="text-xs text-slate-400 text-center">{hint}</p>}
          </>
        )}
        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = '';
        }} />

        {uploadState.uploading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-[120px] h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${uploadState.progress}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-600">{Math.round(uploadState.progress)}%</span>
          </div>
        )}
      </div>
      
      {currentUrl && !uploadState.uploading && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> Remove file
        </button>
      )}
    </div>
  );
}

const TABS = [
  { id: 'general', label: 'General',       icon: Settings },
  { id: 'store',   label: 'Online Order',  icon: Store },
  { id: 'kiosk',   label: 'Kiosk',         icon: Tablet },
  { id: 'pos',     label: 'POS',           icon: Monitor },
  { id: 'live',    label: 'Live Order',    icon: Activity },
  { id: 'vat',     label: 'VAT & Tax',     icon: ShieldCheck },
];

const VAT_COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     badge: 'bg-red-500' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  badge: 'bg-orange-500' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   badge: 'bg-amber-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-500' },
  slate:   { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200',   badge: 'bg-slate-400' },
};

export default function StoreSettingsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // General Settings
  const [generalSettings, setGeneralSettings] = useState({
    name: '',
    companyName: '',
    vatNumber: '',
    phone: '',
    email: '',
    address: '',
    isOpen: true,
    notificationSound: 'default',
    customNotificationSound: '',
  });

  const soundInputRef = useRef<HTMLInputElement>(null);

  const handleSoundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      alert('Please upload an audio file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Sound file size must be less than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setGeneralSettings(prev => ({ ...prev, customNotificationSound: base64, notificationSound: 'custom' }));
    };
    reader.readAsDataURL(file);
  };

  // Operational Services State
  const [storeServices, setStoreServices] = useState({
    takeaway: true,
    delivery: true,
    dineIn: true,
  });

  const [vatCategories, setVatCategories] = useState<VatCategory[]>([]);
  const [vatCatLoading, setVatCatLoading] = useState(true);
  const [vatCatSaving, setVatCatSaving] = useState(false);
  const [seedCountry, setSeedCountry] = useState('BE');
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);



  // Holidays State
  const [holidays, setHolidays] = useState<{ id: string; date: string; note: string }[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayNote, setNewHolidayNote] = useState('');

  // Store Hours State
  const [storeHours, setStoreHours] = useState([
    { day: 'Monday', isOpen: true, is24Hours: false, open: '11:00', close: '22:00' },
    { day: 'Tuesday', isOpen: true, is24Hours: false, open: '11:00', close: '22:00' },
    { day: 'Wednesday', isOpen: true, is24Hours: false, open: '11:00', close: '22:00' },
    { day: 'Thursday', isOpen: true, is24Hours: false, open: '11:00', close: '22:00' },
    { day: 'Friday', isOpen: true, is24Hours: false, open: '11:00', close: '23:00' },
    { day: 'Saturday', isOpen: true, is24Hours: false, open: '12:00', close: '23:00' },
    { day: 'Sunday', isOpen: false, is24Hours: false, open: '12:00', close: '22:00' },
  ]);

  // Branding State
  const [branding, setBranding] = useState({
    storeLogo: '',
    kioskLogo: '',
    heroImage: '', 
    splashVideo: '', 
    accentColor: '#DC2626',
    tagline: '',
    promoBanners: [] as string[],
    receiptLogo: ''
  });

  const [kioskSettings, setKioskSettings] = useState({
    autoSleep: false,
    wakeTime: '09:00',
    sleepTime: '23:30',
  });

  const bannerRef = useRef<HTMLInputElement>(null);

  const [logoUp, setLogoUp] = useState({ uploading: false, progress: 0 });
  const [rcptUp, setRcptUp] = useState({ uploading: false, progress: 0 });
  const [bgUp, setBgUp] = useState({ uploading: false, progress: 0 });
  const [vidUp, setVidUp] = useState({ uploading: false, progress: 0 });
  const [bannerUploading, setBannerUploading] = useState(false);

  useEffect(() => {
    const fetchStoreData = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, 'stores', storeId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setGeneralSettings({
            name: data.name || storeId.replace('-', ' '),
            companyName: data.companyName || '',
            vatNumber: data.vatNumber || data.vatSettings?.vatNumber || '',
            phone: data.phone || data.hqTelephone || '',
            email: data.email || '',
            address: data.address || 'Default Address',
            isOpen: data.isOpen ?? true,
            notificationSound: data.notificationSound || 'default',
            customNotificationSound: data.customNotificationSound || ''
          });
          if (data.services) setStoreServices(data.services);
          if (data.storeHours) setStoreHours(data.storeHours);
          if (data.holidays) setHolidays(data.holidays);
          if (data.kioskSettings) setKioskSettings(data.kioskSettings);


          const savedBranding = data.branding || {};
          setBranding({
            storeLogo: savedBranding.storeLogo || data.storeLogo || '',
            kioskLogo: savedBranding.kioskLogo || '',
            heroImage: savedBranding.heroImage || savedBranding.idleBackgroundUrl || data.image || data.kioskBg || '',
            splashVideo: savedBranding.splashVideo || savedBranding.idleVideoUrl || '',
            accentColor: savedBranding.accentColor || '#DC2626',
            tagline: savedBranding.tagline || '',
            promoBanners: Array.isArray(savedBranding.promoBanners) ? savedBranding.promoBanners : (Array.isArray(data.promoBanners) ? data.promoBanners : []),
            receiptLogo: savedBranding.receiptLogo || ''
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `stores/${storeId}`);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchVatCategories = async () => {
      try {
        const snap = await getDocs(collection(db, 'stores', storeId, 'vatCategories'));
        const cats: VatCategory[] = [];
        snap.forEach(d => cats.push({ id: d.id, ...d.data() } as VatCategory));
        // Sort: by rate descending so highest rate is first
        cats.sort((a, b) => b.rate - a.rate);
        setVatCategories(cats);
      } catch (error) {
        console.error('Error fetching VAT categories:', error);
      } finally {
        setVatCatLoading(false);
      }
    };

    fetchStoreData();
    fetchVatCategories();
  }, [storeId, user]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setActiveTab(entry.target.id);
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    TABS.forEach(tab => {
      const el = document.getElementById(tab.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleUpdateHour = (dayIndex: number, field: string, value: string | boolean) => {
    const newHours = [...storeHours];
    newHours[dayIndex] = { ...newHours[dayIndex], [field]: value };
    setStoreHours(newHours);
  };

  const handleApplyToAll = (dayIndex: number) => {
    const sourceDay = storeHours[dayIndex];
    const newHours = storeHours.map(day => ({
      ...day,
      isOpen: sourceDay.isOpen,
      is24Hours: sourceDay.is24Hours,
      open: sourceDay.open,
      close: sourceDay.close
    }));
    setStoreHours(newHours);
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayNote) return;
    
    setHolidays([
      ...holidays,
      { id: Date.now().toString(), date: newHolidayDate, note: newHolidayNote }
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    
    setNewHolidayDate('');
    setNewHolidayNote('');
  };

  const handleRemoveHoliday = (id: string) => {
    setHolidays(holidays.filter(h => h.id !== id));
  };

  const uploadFile = async (
    file: File, 
    folder: string, 
    setUploadState: any, 
    onSuccess: (url: string) => void,
    existingUrl: string = ''
  ) => {
    try {
      if (existingUrl && existingUrl.includes('firebasestorage.googleapis.com')) {
        await deleteObject(ref(storage, existingUrl)).catch(() => {});
      }
      setUploadState({ uploading: true, progress: 0 });
      const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const fileRef = ref(storage, `stores/${storeId}/branding/${folder}/${filename}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadState({ uploading: true, progress });
        },
        (error) => {
          console.error('Upload failed:', error);
          alert('Upload failed. Please try again.');
          setUploadState({ uploading: false, progress: 0 });
        },
        async () => {
          const dlUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onSuccess(dlUrl);
          setUploadState({ uploading: false, progress: 100 });
        }
      );
    } catch (e) {
      console.error(e);
      setUploadState({ uploading: false, progress: 0 });
    }
  };

  const handleClearFile = async (url: string, field: keyof typeof branding) => {
    if (url && url.includes('firebasestorage.googleapis.com')) {
      await deleteObject(ref(storage, url)).catch(() => {});
    }
    setBranding(b => ({ ...b, [field]: '' as never }));
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBannerUploading(true);
    const results: string[] = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { alert(`${file.name} is too large (max 5 MB)`); continue; }
      try {
        const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const fileRef = ref(storage, `stores/${storeId}/branding/banners/${filename}`);
        const uploadTask = uploadBytesResumable(fileRef, file);
        const url = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            () => {},
            reject,
            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
          );
        });
        results.push(url);
      } catch (err) {
        console.error('Banner upload failed:', err);
        alert(`Failed to upload ${file.name}. Please try again.`);
      }
    }
    setBranding(b => ({ ...b, promoBanners: [...b.promoBanners, ...results] }));
    setBannerUploading(false);
    e.target.value = '';
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    
    try {
      const docRef = doc(db, 'stores', storeId);
      await updateDoc(docRef, {
        name: generalSettings.name || storeId.replace('-', ' '),
        companyName: generalSettings.companyName,
        vatNumber: generalSettings.vatNumber,
        phone: generalSettings.phone,
        email: generalSettings.email,
        address: generalSettings.address || 'Default Address',
        isOpen: generalSettings.isOpen,
        notificationSound: generalSettings.notificationSound,
        customNotificationSound: generalSettings.customNotificationSound || '',
        services: storeServices,
        storeHours,
        holidays,
        kioskSettings,
        branding: {
          storeLogo: branding.storeLogo,
          kioskLogo: branding.kioskLogo,
          receiptLogo: branding.receiptLogo,
          heroImage: branding.heroImage,
          splashVideo: branding.splashVideo,
          accentColor: branding.accentColor,
          tagline: branding.tagline,
          promoBanners: branding.promoBanners
        },
        storeLogo: branding.storeLogo,
        kioskLogo: branding.kioskLogo,
        image: branding.heroImage,
        kioskBg: branding.heroImage,
        promoBanners: branding.promoBanners,
        kioskSyncAt: serverTimestamp(),
      });
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${storeId}`);
    } finally {
      setIsSaving(false);
    }
  };



// ─── VAT Category Manager Component ──────────────────────────────────────────

type VatCategoryManagerProps = {
  storeId: string;
  vatNumber: string;
  onVatNumberChange: (v: string) => void;
  categories: VatCategory[];
  onCategoriesChange: (cats: VatCategory[]) => void;
  isLoading: boolean;
  isSaving: boolean;
  onSavingChange: (v: boolean) => void;
  seedCountry: string;
  onSeedCountryChange: (v: string) => void;
  showSeedConfirm: boolean;
  onShowSeedConfirmChange: (v: boolean) => void;
};

const SERVICE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'dine-in',  label: '🍽 Dine-In' },
  { value: 'takeaway', label: '🥡 Takeaway' },
  { value: 'delivery', label: '🚗 Delivery' },
];

function VatCategoryManager({
  storeId,
  categories, onCategoriesChange,
  isLoading, isSaving, onSavingChange,
  seedCountry, onSeedCountryChange,
  showSeedConfirm, onShowSeedConfirmChange,
}: Omit<VatCategoryManagerProps, 'vatNumber' | 'onVatNumberChange'>) {
  const [localCats, setLocalCats] = useState<VatCategory[]>(categories);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync from parent when data first loads
  useEffect(() => { setLocalCats(categories); }, [categories]);

  const updateCat = (id: string, field: keyof VatCategory, value: any) => {
    setLocalCats(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const toggleServiceType = (id: string, type: string) => {
    setLocalCats(prev => prev.map(c => {
      if (c.id !== id) return c;
      const types = c.serviceTypes as string[];
      return {
        ...c,
        serviceTypes: types.includes(type)
          ? types.filter(t => t !== type)
          : [...types, type],
      } as VatCategory;
    }));
  };

  const addCategory = () => {
    const newCat: VatCategory = {
      id: `custom-${Date.now()}`,
      code: 'X',
      label: 'New Category',
      rate: 0,
      serviceTypes: ['dine-in', 'takeaway', 'delivery'],
      color: 'slate',
      isDefault: false,
    };
    setLocalCats(prev => [...prev, newCat]);
  };

  const removeCategory = (id: string) => {
    setLocalCats(prev => prev.filter(c => c.id !== id));
  };

  const setDefault = (id: string) => {
    setLocalCats(prev => prev.map(c => ({ ...c, isDefault: c.id === id })));
  };

  const handleSeedDefaults = async () => {
    const seeds = getDefaultVatCategories(seedCountry);
    onShowSeedConfirmChange(false);
    onSavingChange(true);
    try {
      const batch = writeBatch(db);
      // Delete existing
      const snap = await getDocs(collection(db, 'stores', storeId, 'vatCategories'));
      snap.forEach(d => batch.delete(d.ref));
      // Write seeds
      seeds.forEach(cat => {
        batch.set(
          doc(db, 'stores', storeId, 'vatCategories', cat.id),
          cat
        );
      });
      await batch.commit();
      const sorted = [...seeds].sort((a, b) => b.rate - a.rate);
      setLocalCats(sorted);
      onCategoriesChange(sorted);
    } catch (e) {
      console.error('Seed error:', e);
    } finally {
      onSavingChange(false);
    }
  };

  const handleSave = async () => {
    onSavingChange(true);
    try {
      const batch = writeBatch(db);
      // Delete all existing
      const snap = await getDocs(collection(db, 'stores', storeId, 'vatCategories'));
      snap.forEach(d => batch.delete(d.ref));
      // Write current local state
      localCats.forEach(cat => {
        batch.set(
          doc(db, 'stores', storeId, 'vatCategories', cat.id),
          cat
        );
      });
      await batch.commit();
      onCategoriesChange(localCats);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error('VAT save error:', e);
      alert('Failed to save VAT categories. Please try again.');
    } finally {
      onSavingChange(false);
    }
  };

  const colorMap = VAT_COLOR_MAP;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-amber-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-200">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-heading font-black text-slate-900">VAT Category Manager</h2>
              <p className="text-sm text-slate-500 font-medium">Define fiscal rate buckets — assign them to menu items</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-all disabled:opacity-60 shadow-sm min-w-[130px] justify-center"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
            ) : saveSuccess ? (
              <><Check className="w-4 h-4" /> Saved!</>
            ) : (
              <><Save className="w-4 h-4" /> Save Categories</>
            )}
          </button>
        </div>
        {/* Seed Defaults */}
        <div className="px-8 py-5 bg-slate-50/50 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
            <Globe className="w-4 h-4 text-slate-400" />
            Apply official defaults for:
            <div className="relative">
              <select
                value={seedCountry}
                onChange={e => onSeedCountryChange(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:border-amber-500 outline-none cursor-pointer"
              >
                <option value="BE">🇧🇪 Belgium</option>
                <option value="NL">🇳🇱 Netherlands</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {!showSeedConfirm ? (
            <button
              type="button"
              onClick={() => onShowSeedConfirmChange(true)}
              className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-bold text-sm hover:bg-amber-100 transition-colors flex items-center gap-2"
            >
              <Globe className="w-4 h-4" /> Apply {getCountryLabel(seedCountry)} Defaults
            </button>
          ) : (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
              <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> This will replace all current categories!
              </span>
              <button type="button" onClick={handleSeedDefaults} disabled={isSaving} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors">Confirm</button>
              <button type="button" onClick={() => onShowSeedConfirmChange(false)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Category List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {localCats.map((cat, idx) => {
              const colors = colorMap[cat.color] ?? colorMap.slate;
              return (
                <motion.div
                  key={cat.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, delay: idx * 0.04 }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                >
                  {/* Category header strip */}
                  <div className={`px-5 py-3 ${colors.bg} ${colors.border} border-b flex items-center justify-between gap-4`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* GKS Code badge */}
                      <div className={`w-10 h-10 rounded-xl ${colors.badge} flex items-center justify-center shrink-0`}>
                        <span className="text-lg font-black text-white">{cat.code}</span>
                      </div>
                      {/* Label */}
                      <input
                        type="text"
                        value={cat.label}
                        onChange={e => updateCat(cat.id, 'label', e.target.value)}
                        className={`flex-1 min-w-0 bg-transparent font-bold text-slate-900 text-sm border-b-2 border-transparent focus:border-amber-400 outline-none pb-0.5 truncate`}
                        placeholder="Category label"
                      />
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Rate */}
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={cat.rate}
                          onChange={e => updateCat(cat.id, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-20 pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-sm font-bold text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none">%</span>
                      </div>
                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeCategory(cat.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Category body */}
                  <div className="px-5 py-4 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                    {/* Code + Color */}
                    <div className="flex items-center gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fiscal Code</label>
                        <input
                          type="text"
                          maxLength={2}
                          value={cat.code}
                          onChange={e => updateCat(cat.id, 'code', e.target.value.toUpperCase())}
                          className="w-14 text-center px-2 py-1.5 rounded-lg border border-slate-200 font-mono font-black text-lg text-slate-900 focus:border-amber-500 outline-none uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Badge Color</label>
                        <select
                          value={cat.color}
                          onChange={e => updateCat(cat.id, 'color', e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 bg-white focus:border-amber-500 outline-none"
                        >
                          <option value="red">Red (21%)</option>
                          <option value="orange">Orange (12%)</option>
                          <option value="amber">Amber (6%)</option>
                          <option value="emerald">Emerald (0%)</option>
                          <option value="slate">Slate (Custom)</option>
                        </select>
                      </div>
                    </div>

                    {/* Service Types */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Applies to</label>
                      <div className="flex flex-wrap gap-2">
                        {SERVICE_TYPE_OPTIONS.map(opt => {
                          const active = (cat.serviceTypes as string[]).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => toggleServiceType(cat.id, opt.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                active
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-700'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Default toggle */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Default for new items</label>
                      <button
                        type="button"
                        onClick={() => setDefault(cat.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          cat.isDefault
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-amber-300 hover:text-amber-600'
                        }`}
                      >
                        {cat.isDefault ? '⭐ Default' : 'Set as Default'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {localCats.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-slate-500">No VAT categories yet</p>
              <p className="text-sm text-slate-400 mt-1">Add a category below or apply country defaults above.</p>
            </div>
          )}

          <button
            type="button"
            onClick={addCategory}
            className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 font-bold text-sm hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50/40 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" /> Add Custom Category
          </button>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-slate-900 rounded-3xl border border-slate-700 p-6 flex gap-4">
        <ShieldCheck className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-white text-sm mb-1">How this works</p>
          <p className="text-slate-400 text-xs leading-relaxed">
            Each category defined here becomes a selectable option on every menu item (one for Dine-In, one for Takeaway).
            When an order is placed, the assigned VAT rate is <strong className="text-slate-300">frozen permanently</strong> on each order line for fiscal compliance.
            The receipt will show the full breakdown per rate code.
          </p>
        </div>
      </div>
    </div>
  );
}

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 max-w-7xl mx-auto min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900 capitalize">
            {generalSettings.name || storeId.replace('-', ' ')} Settings
          </h1>
          <p className="mt-2 text-slate-500 font-medium">Manage your store configurations, branding, and POS from one place.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving || logoUp.uploading || bgUp.uploading || vidUp.uploading || rcptUp.uploading}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed min-w-[140px]"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
          ) : showSuccess ? (
            <>
              <Check className="w-5 h-5 mr-2" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-5 h-5 mr-2" />
              Save {activeTab === 'pos' ? 'POS' : 'Changes'}
            </>
          )}
        </button>
      </div>

      {/* Top Navigation Tabs */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md pb-4 pt-4 border-b border-slate-100 mb-8 -mx-6 px-6 lg:-mx-10 lg:px-10 flex flex-wrap gap-2 shadow-sm">
        <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl w-full md:w-fit overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
               <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    document.getElementById(tab.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`relative px-4 md:px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors whitespace-nowrap ${
                    isActive ? 'text-amber-900' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                  }`}
               >
                  {isActive && (
                    <motion.div 
                      layoutId="header-tab"
                      className="absolute inset-0 bg-white rounded-xl shadow-sm border border-slate-200 z-0"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <tab.icon className={`w-4 h-4 relative z-10 ${isActive ? 'text-amber-600' : ''}`} />
                  <span className="relative z-10 text-sm">{tab.label}</span>
               </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-16 pb-32">
        {/* GENERAL SETTINGS */}
        <div id="general" className="scroll-mt-32 space-y-8">
               <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden pb-8">
                  <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      <Settings className="w-5 h-5"/>
                    </div>
                    <div>
                      <h2 className="text-xl font-heading font-black text-slate-900">General Settings</h2>
                      <p className="text-sm text-slate-500 font-medium">Core contact info and notification sounds</p>
                    </div>
                  </div>
                  <div className="px-8 pt-8 space-y-8 max-w-2xl">
                    {(user as any)?.role !== 'super_admin' && (
                      <div className="p-4 bg-blue-50 text-blue-700 rounded-xl font-bold flex items-center gap-2 text-sm border border-blue-100">
                        <ShieldCheck className="w-5 h-5 shrink-0" />
                        <p>Core store details and integrations are managed by the Super Admin. You can update your local notification settings below.</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        Store Name
                      </label>
                      <div className="relative">
                        <Store className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                        <input
                          type="text"
                          required
                          disabled={(user as any)?.role !== 'super_admin'}
                          value={generalSettings.name}
                          onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-bold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          placeholder="e.g. Baijan Burgers Brussels"
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">Shown in the store portal header and on all screens.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Company Name</label>
                        <input
                          type="text"
                          disabled={(user as any)?.role !== 'super_admin'}
                          value={generalSettings.companyName}
                          onChange={(e) => setGeneralSettings({ ...generalSettings, companyName: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          placeholder="Legal Company Name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">VAT Number</label>
                        <input
                          type="text"
                          disabled={(user as any)?.role !== 'super_admin'}
                          value={generalSettings.vatNumber}
                          onChange={(e) => setGeneralSettings({ ...generalSettings, vatNumber: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-mono disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          placeholder="e.g. BE 0123.456.789"
                        />
                        <p className="text-xs text-slate-400 mt-1.5">Appears on fiscal receipts.</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Order Notification Sound</label>
                      <div className="flex items-center gap-3">
                        <select
                          value={generalSettings.notificationSound || 'default'}
                          onChange={(e) => setGeneralSettings({ ...generalSettings, notificationSound: e.target.value })}
                          className="flex-1 pl-4 pr-10 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white appearance-none"
                        >
                          <option value="none">No Sound (Silent)</option>
                          <option value="default">Default Bell</option>
                          <option value="chime">Kitchen Chime</option>
                          <option value="register">Cash Register</option>
                          <option value="custom">Custom Uploaded Sound</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const val = generalSettings.notificationSound || 'default';
                            if (val === 'none') return;
                            let url = '/sounds/bell.mp3';
                            if (val === 'default') url = '/sounds/bell.mp3';
                            if (val === 'chime') url = '/sounds/chime.mp3';
                            if (val === 'register') url = '/sounds/register.mp3';
                            if (val === 'custom') {
                              if (!generalSettings.customNotificationSound) {
                                alert('Please upload a custom sound first.');
                                return;
                              }
                              url = generalSettings.customNotificationSound;
                            }
                            new Audio(url).play().catch(e => console.log('Audio test blocked by browser', e));
                          }}
                          className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-amber-100 hover:text-amber-600 transition-colors"
                        >
                          <Volume2 className="w-5 h-5" />
                        </button>
                      </div>
                      {generalSettings.notificationSound === 'custom' && (
                        <div className="mt-4">
                            <button type="button" onClick={() => soundInputRef.current?.click()} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                              {generalSettings.customNotificationSound ? 'Change Custom Sound' : 'Upload Custom Sound (Max 2MB)'}
                            </button>
                            <input type="file" ref={soundInputRef} onChange={handleSoundUpload} accept="audio/*" className="hidden" />
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-4 pt-4 border-t border-slate-100">Contacts</h3>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Telephone</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                        <input type="text" disabled={(user as any)?.role !== 'super_admin'} value={generalSettings.phone} onChange={(e) => setGeneralSettings({ ...generalSettings, phone: e.target.value })} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" placeholder="+32 2 123 45 67" />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                        <input type="email" disabled={(user as any)?.role !== 'super_admin'} value={generalSettings.email} onChange={(e) => setGeneralSettings({ ...generalSettings, email: e.target.value })} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" placeholder="contact@mrcod.be" />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">HQ Address</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                        <textarea rows={3} disabled={(user as any)?.role !== 'super_admin'} value={generalSettings.address} onChange={(e) => setGeneralSettings({ ...generalSettings, address: e.target.value })} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none resize-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" placeholder="Grand Place 1, 1000 Brussels"/>
                      </div>
                    </div>
                  </div>
           </div>
        </div>

        {/* ONLINE ORDERING SETTINGS */}
        <div id="store" className="scroll-mt-32 space-y-8">
               <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden pb-8">
                  <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5"/>
                    </div>
                    <div>
                      <h2 className="text-xl font-heading font-black text-slate-900">Online Ordering Settings</h2>
                      <p className="text-sm text-slate-500 font-medium">Configure store services and hours</p>
                    </div>
                  </div>
                  <div className="px-8 pt-8 space-y-8 max-w-2xl">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Operational Services</h3>
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-8">
                        <div className="space-y-6 max-w-lg">
                          <div className="flex items-center justify-between">
                            <div>
                               <div className="font-bold text-slate-900">Takeaway / Pickup</div>
                               <div className="text-xs text-slate-500">Allow customers to pick up their orders</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" checked={storeServices.takeaway} onChange={(e) => setStoreServices({ ...storeServices, takeaway: e.target.checked })} className="sr-only peer" />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </label>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                               <div className="font-bold text-slate-900">Delivery</div>
                               <div className="text-xs text-slate-500">Allow customers to request delivery</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" checked={storeServices.delivery} onChange={(e) => setStoreServices({ ...storeServices, delivery: e.target.checked })} className="sr-only peer" />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </label>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                               <div className="font-bold text-slate-900">Dine-In</div>
                               <div className="text-xs text-slate-500">Allow customers to eat inside</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" checked={storeServices.dineIn} onChange={(e) => setStoreServices({ ...storeServices, dineIn: e.target.checked })} className="sr-only peer" />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
               </div>

               {/* Hours and Holidays combined inside Store Settings */}
               <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden pb-8">
                  <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5"/>
                    </div>
                    <div>
                      <h2 className="text-xl font-heading font-black text-slate-900">Store Hours</h2>
                      <p className="text-sm text-slate-500 font-medium">Regular weekly schedule</p>
                    </div>
                  </div>
                  <div className="p-8">
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden max-w-3xl">
                      <div className="grid grid-cols-[120px_1fr_1fr_60px_80px_40px] sm:grid-cols-[140px_1fr_1fr_60px_100px_50px] gap-4 p-4 bg-slate-50 border-b border-slate-200 font-bold text-sm text-slate-700">
                        <div>Day</div>
                        <div>Opening</div>
                        <div>Closing</div>
                        <div className="text-center">24H</div>
                        <div className="text-center">Status</div>
                        <div className="text-center">All</div>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {storeHours.map((schedule, index) => (
                          <li key={schedule.day} className="grid grid-cols-[120px_1fr_1fr_60px_80px_40px] sm:grid-cols-[140px_1fr_1fr_60px_100px_50px] gap-4 p-4 items-center hover:bg-slate-50 transition-colors">
                            <div className="font-bold text-slate-900">{schedule.day}</div>
                            <input type="time" value={schedule.open} onChange={(e) => handleUpdateHour(index, 'open', e.target.value)} disabled={!schedule.isOpen || schedule.is24Hours} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-amber-500 outline-none" />
                            <input type="time" value={schedule.close} onChange={(e) => handleUpdateHour(index, 'close', e.target.value)} disabled={!schedule.isOpen || schedule.is24Hours} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-amber-500 outline-none" />
                            <div className="flex justify-center items-center">
                              <input type="checkbox" checked={schedule.is24Hours || false} onChange={(e) => handleUpdateHour(index, 'is24Hours', e.target.checked)} className="w-5 h-5 accent-amber-500 rounded cursor-pointer" disabled={!schedule.isOpen} />
                            </div>
                            <div className="flex justify-center">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={schedule.isOpen} onChange={(e) => handleUpdateHour(index, 'isOpen', e.target.checked)} />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                              </label>
                            </div>
                            <button type="button" title="Apply these hours to all days" onClick={() => handleApplyToAll(index)} className="p-2 text-slate-400 hover:text-amber-600 rounded-lg transition-colors"><Copy className="w-4 h-4" /></button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
               </div>

               <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden pb-8">
                  <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                      <CalendarOff className="w-5 h-5"/>
                    </div>
                    <div>
                      <h2 className="text-xl font-heading font-black text-slate-900">Holidays & Closures</h2>
                      <p className="text-sm text-slate-500 font-medium">Add special dates where the store is closed</p>
                    </div>
                  </div>
                  <div className="p-8 max-w-3xl space-y-6">
                    <form onSubmit={handleAddHoliday} className="flex flex-col sm:flex-row gap-4 items-end bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <div className="flex-1 w-full">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Date</label>
                        <input type="date" required value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none" />
                      </div>
                      <div className="flex-[2] w-full">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Note</label>
                        <input type="text" required value={newHolidayNote} onChange={(e) => setNewHolidayNote(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none" placeholder="e.g. Christmas Day" />
                      </div>
                      <button type="submit" className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center transition-colors hover:bg-slate-800">
                        <Plus className="w-5 h-5 mr-2" /> Add
                      </button>
                    </form>
                    {holidays.length === 0 ? (
                      <div className="text-center py-8 bg-white rounded-2xl border border-slate-100 border-dashed">
                        <CalendarOff className="mx-auto h-8 w-8 text-slate-300 mb-3" />
                        <p className="text-slate-500 font-bold">No special closures configured.</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                        {holidays.map((holiday) => (
                          <li key={holiday.id} className="p-4 sm:p-6 flex justify-between items-center bg-white hover:bg-slate-50 transition-colors">
                            <div>
                              <div className="font-bold text-slate-900 text-lg">{new Date(holiday.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                              <div className="text-slate-600 font-medium flex items-center gap-2 mt-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> {holiday.note}</div>
                            </div>
                            <button onClick={() => handleRemoveHoliday(holiday.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"><Trash2 className="w-5 h-5" /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
               </div>
           </div>

        {/* KIOSK SETTINGS */}
        <div id="kiosk" className="scroll-mt-32 space-y-8">
              {/* ── Operating Hours ─────────────────────────────────────── */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-heading font-black text-slate-900">Kiosk Operating Schedule</h2>
                    <p className="text-sm text-slate-500 font-medium">Set when all kiosks should automatically wake up and go to sleep.</p>
                  </div>
                </div>
                
                <div className="p-6 md:p-8">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
                    <div>
                      <div className="font-bold text-slate-900 text-base">Automatic Sleep Mode</div>
                      <div className="text-sm text-slate-500 max-w-md">When enabled, kiosks will display an &quot;out of service&quot; screen outside of these hours.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input type="checkbox" checked={kioskSettings.autoSleep} onChange={e => setKioskSettings(s => ({...s, autoSleep: e.target.checked}))} className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                      <span className="ml-3 text-sm font-bold text-slate-700">{kioskSettings.autoSleep ? 'Enabled' : 'Disabled'}</span>
                    </label>
                  </div>

                  <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 transition-opacity ${!kioskSettings.autoSleep ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Wake Up Time</label>
                      <input 
                        type="time" 
                        value={kioskSettings.wakeTime} 
                        onChange={e => setKioskSettings(s => ({...s, wakeTime: e.target.value}))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none transition-colors font-mono" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Sleep Time</label>
                      <input 
                        type="time" 
                        value={kioskSettings.sleepTime} 
                        onChange={e => setKioskSettings(s => ({...s, sleepTime: e.target.value}))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none transition-colors font-mono" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Branding / Visual Assets */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Palette className="w-5 h-5" /></div>
                  <div>
                    <h2 className="text-xl font-heading font-black text-slate-900">Kiosk Visual Assets</h2>
                    <p className="text-sm text-slate-500 font-medium">Configure logos and idle screens for the kiosk.</p>
                  </div>
                </div>
                
                <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-widest text-xs flex items-center gap-2">
                       Kiosk Logo
                    </label>
                    <UploadZone
                      accept="image/*"
                      currentUrl={branding.kioskLogo}
                      uploadState={logoUp}
                      onFile={file => uploadFile(file, 'logo', setLogoUp, url => setBranding(b => ({ ...b, kioskLogo: url })), branding.kioskLogo)}
                      onClear={() => handleClearFile(branding.kioskLogo, 'kioskLogo')}
                      hint="PNG/SVG (Overrides Store Logo on Kiosk)"
                    />
                  </div>
                  <div>
                     <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-widest text-xs flex items-center gap-2">
                        Receipt Artwork
                     </label>
                     <UploadZone
                       accept="image/*"
                       currentUrl={branding.receiptLogo}
                       uploadState={rcptUp}
                       onFile={file => uploadFile(file, 'logo', setRcptUp, url => setBranding(b => ({ ...b, receiptLogo: url })), branding.receiptLogo)}
                       onClear={() => handleClearFile(branding.receiptLogo, 'receiptLogo')}
                       hint="B&W high-contrast image"
                     />
                  </div>
                  <div>
                     <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-widest text-xs flex items-center gap-2">
                        Idle Media
                     </label>
                     <UploadZone
                       accept="image/*,video/mp4,video/webm"
                       currentUrl={branding.splashVideo || branding.heroImage}
                       uploadState={bgUp}
                       previewType={branding.splashVideo ? 'video' : 'image'}
                       onFile={file => {
                         const isVideo = file.type.startsWith('video/');
                         uploadFile(file, isVideo ? 'videos' : 'backgrounds', setBgUp, url => {
                           if (isVideo) {
                             setBranding(b => ({ ...b, splashVideo: url }));
                           } else {
                             setBranding(b => ({ ...b, heroImage: url, splashVideo: '' }));
                           }
                         }, isVideo ? branding.splashVideo : branding.heroImage);
                       }}
                       onClear={() => {
                         if (branding.splashVideo) handleClearFile(branding.splashVideo, 'splashVideo');
                         else if (branding.heroImage) handleClearFile(branding.heroImage, 'heroImage');
                       }}
                       hint="Image or Video (Screensaver)"
                     />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><ImageIcon className="w-5 h-5" /></div>
                    <div>
                      <h2 className="font-bold text-slate-900 text-lg">Shared Promo Carousel <span className="text-sm font-normal text-slate-400">({branding.promoBanners.length})</span></h2>
                      <p className="text-xs text-slate-500">Images shown on top of the Kiosk and Web menus.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => bannerRef.current?.click()} disabled={bannerUploading} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2 hover:bg-slate-50 transition-colors">
                    {bannerUploading ? (
                        <><div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> Uploading…</>
                    ) : '+ Add Promos'}
                  </button>
                  <input ref={bannerRef} type="file" multiple accept="image/*" className="hidden" onChange={handleBannerUpload} />
                </div>
                <div className="p-6">
                  {branding.promoBanners.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {branding.promoBanners.map((url, i) => (
                        <div key={i} className="group relative aspect-video rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                          <Image src={url} alt={`Promo ${i+1}`} fill className="object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <button type="button" onClick={async () => {
                              if (url.includes('firebasestorage.googleapis.com')) await deleteObject(ref(storage, url)).catch(() => {});
                              setBranding(b => ({ ...b, promoBanners: b.promoBanners.filter((_, idx) => idx !== i) }));
                            }} className="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-bold hover:scale-105 transition-transform">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
                      <ImageIcon className="w-10 h-10 mb-2 opacity-50 mx-auto text-slate-400" />
                      <p className="font-bold text-sm text-slate-400">No promo banners</p>
                      <p className="text-xs mt-1 text-slate-400">Upload images to display special offers.</p>
                    </div>
                  )}
                </div>
              </div>


             
             <CcvTransactionViewer storeId={storeId} />
           </div>

        {/* POS SETTINGS */}
        <div id="pos" className="scroll-mt-32 space-y-8">
           <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden pb-8">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5"/>
                </div>
                <div>
                  <h2 className="text-xl font-heading font-black text-slate-900">POS Settings</h2>
                  <p className="text-sm text-slate-500 font-medium">Manage registers, receipt printers, and cash drawer settings</p>
                </div>
              </div>
              <div className="p-8 text-center bg-slate-50/50 m-8 rounded-2xl border border-dashed border-slate-200">
                <Monitor className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="font-bold text-slate-500">POS Configurations</p>
                <p className="text-sm text-slate-400 mt-1">Receipt printers, fast-cash buttons, and local network devices will appear here.</p>
              </div>
           </div>
        </div>

        {/* LIVE ORDER SETTINGS */}
        <div id="live" className="scroll-mt-32 space-y-8">
           <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden pb-8">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5"/>
                </div>
                <div>
                  <h2 className="text-xl font-heading font-black text-slate-900">Live Order & KDS</h2>
                  <p className="text-sm text-slate-500 font-medium">Configure Kitchen Displays, TV Screens, and preparation times</p>
                </div>
              </div>
              <div className="p-8 text-center bg-slate-50/50 m-8 rounded-2xl border border-dashed border-slate-200">
                <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="font-bold text-slate-500">KDS Configurations</p>
                <p className="text-sm text-slate-400 mt-1">Bump bars, routing, and order ready timers will appear here.</p>
              </div>
           </div>
        </div>

        {/* VAT & TAX SETTINGS */}
        <div id="vat" className="scroll-mt-32 space-y-8">
          <VatCategoryManager
            storeId={storeId}
            categories={vatCategories}
            onCategoriesChange={setVatCategories}
            isLoading={vatCatLoading}
            isSaving={vatCatSaving}
            onSavingChange={setVatCatSaving}
            seedCountry={seedCountry}
            onSeedCountryChange={setSeedCountry}
            showSeedConfirm={showSeedConfirm}
            onShowSeedConfirmChange={setShowSeedConfirm}
          />
        </div>
      </div>
    </div>
  );
}
