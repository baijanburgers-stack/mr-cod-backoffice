'use client';

import { useState, use, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Save, Check, Percent, FileText, Settings, Clock, Phone, Mail, MapPin, CalendarOff, Plus, Trash2, Copy, Image as ImageIcon, Volume2, CreditCard, Eye, EyeOff, Wifi, WifiOff, Tablet, X, Upload, Store, Palette, Type, Video, Utensils, Coffee, Wine, Truck, Lock, Unlock, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import CcvTransactionViewer from '@/components/settings/CcvTransactionViewer';

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
  { id: 'general', label: 'General Settings', icon: Settings },
  { id: 'store', label: 'Online Ordering', icon: Store },
  { id: 'kiosk', label: 'Kiosk Settings',  icon: Tablet },
  { id: 'vat',   label: 'VAT Settings',    icon: Percent },
];

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
    hqTelephone: '',
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

  // VAT Settings State
  const [isVatUnlocked, setIsVatUnlocked] = useState(false);
  const [vatSettings, setVatSettings] = useState({
    vatNumber: '',
    foodTakeawayRate: 6,
    foodDineInRate: 12,
    softDrinkTakeawayRate: 6,
    softDrinkDineInRate: 21,
    alcoholTakeawayRate: 21,
    alcoholDineInRate: 21,
    deliveryVatRate: 21,
  });



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
            hqTelephone: data.hqTelephone || '',
            email: data.email || '',
            address: data.address || 'Default Address',
            isOpen: data.isOpen ?? true,
            notificationSound: data.notificationSound || 'default',
            customNotificationSound: data.customNotificationSound || ''
          });
          if (data.services) setStoreServices(data.services);
          if (data.vatSettings) setVatSettings({ ...vatSettings, ...data.vatSettings });
          if (data.storeHours) setStoreHours(data.storeHours);
          if (data.holidays) setHolidays(data.holidays);
          if (data.kioskSettings) setKioskSettings(data.kioskSettings);


          const savedBranding = data.branding || {};
          setBranding({
            storeLogo: savedBranding.storeLogo || data.storeLogo || '',
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

    fetchStoreData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, user]);

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
        hqTelephone: generalSettings.hqTelephone,
        email: generalSettings.email,
        address: generalSettings.address || 'Default Address',
        isOpen: generalSettings.isOpen,
        notificationSound: generalSettings.notificationSound,
        customNotificationSound: generalSettings.customNotificationSound || '',
        services: storeServices,
        vatSettings: {
          vatNumber: vatSettings.vatNumber || '',
          foodTakeawayRate: vatSettings.foodTakeawayRate ?? 6,
          foodDineInRate: vatSettings.foodDineInRate ?? 12,
          softDrinkTakeawayRate: vatSettings.softDrinkTakeawayRate ?? 6,
          softDrinkDineInRate: vatSettings.softDrinkDineInRate ?? 21,
          alcoholTakeawayRate: vatSettings.alcoholTakeawayRate ?? 21,
          alcoholDineInRate: vatSettings.alcoholDineInRate ?? 21,
          deliveryVatRate: vatSettings.deliveryVatRate ?? 21,
        },
        storeHours,
        holidays,
        kioskSettings,
        branding: {
          storeLogo: branding.storeLogo,
          receiptLogo: branding.receiptLogo,
          heroImage: branding.heroImage,
          splashVideo: branding.splashVideo,
          accentColor: branding.accentColor,
          tagline: branding.tagline,
          promoBanners: branding.promoBanners
        },
        storeLogo: branding.storeLogo,
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
      <div className="flex flex-wrap gap-2 mb-8 p-1.5 bg-slate-100 rounded-2xl w-fit">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
             <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors ${
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
                <span className="relative z-10">{tab.label}</span>
             </button>
          )
        })}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-8"
      >
        {activeTab === 'general' && (
           <div className="space-y-8">
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
                        <input type="text" value={generalSettings.hqTelephone} onChange={(e) => setGeneralSettings({ ...generalSettings, hqTelephone: e.target.value })} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none" placeholder="+32 2 123 45 67" />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                        <input type="email" value={generalSettings.email} onChange={(e) => setGeneralSettings({ ...generalSettings, email: e.target.value })} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none" placeholder="contact@mrcod.be" />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">HQ Address</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                        <textarea rows={3} value={generalSettings.address} onChange={(e) => setGeneralSettings({ ...generalSettings, address: e.target.value })} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none resize-none" placeholder="Grand Place 1, 1000 Brussels"/>
                      </div>
                    </div>
                  </div>
               </div>
           </div>
        )}

        {activeTab === 'store' && (
           <div className="space-y-8">
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
        )}        {activeTab === 'kiosk' && (
           <div className="space-y-8">
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
                      <div className="text-sm text-slate-500 max-w-md">When enabled, kiosks will display an "out of service" screen outside of these hours.</div>
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
                       Primary Logo
                    </label>
                    <UploadZone
                      accept="image/*"
                      currentUrl={branding.storeLogo}
                      uploadState={logoUp}
                      onFile={file => uploadFile(file, 'logo', setLogoUp, url => setBranding(b => ({ ...b, storeLogo: url })), branding.storeLogo)}
                      onClear={() => handleClearFile(branding.storeLogo, 'storeLogo')}
                      hint="PNG/SVG (transparent)"
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
        )}

        {activeTab === 'vat' && (
           <div className="space-y-8 max-w-2xl bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex items-start justify-between mb-8 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20"><Percent className="w-7 h-7"/></div>
                  <div>
                    <h3 className="font-heading font-black text-slate-900 text-2xl">Tax Categories</h3>
                    <p className="text-sm text-slate-500 font-medium">Configure VAT percentage by service</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVatUnlocked(!isVatUnlocked)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all border ${
                    isVatUnlocked 
                      ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm'
                  }`}
                >
                  {isVatUnlocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4 text-emerald-600" />}
                  {isVatUnlocked ? 'Lock Fields' : 'Unlock to Edit'}
                </button>
              </div>

              {isVatUnlocked && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200/60 rounded-xl flex items-start gap-3 text-rose-800 animate-in fade-in slide-in-from-top-2">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <strong>Critical Warning:</strong> Modifying VAT rates directly alters tax calculations on all future orders. 
                    Be careful of stray mouse scrolls or accidental clicks.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ── FOOD ── */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200/60 bg-white/50 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                      <Utensils className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm tracking-wide">Food VAT</h4>
                      <p className="text-[11px] text-slate-500">Standard meals and snacks</p>
                    </div>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">Takeaway</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" value={vatSettings.foodTakeawayRate ?? ''} onChange={(e) => setVatSettings({ ...vatSettings, foodTakeawayRate: parseFloat(e.target.value) || 0 })} disabled={!isVatUnlocked} className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50" />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">Dine-In</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" value={vatSettings.foodDineInRate ?? ''} onChange={(e) => setVatSettings({ ...vatSettings, foodDineInRate: parseFloat(e.target.value) || 0 })} disabled={!isVatUnlocked} className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50" />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── SOFT DRINKS ── */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200/60 bg-white/50 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Coffee className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm tracking-wide">Soft Drinks VAT</h4>
                      <p className="text-[11px] text-slate-500">Non-alcoholic beverages</p>
                    </div>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">Takeaway</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" value={vatSettings.softDrinkTakeawayRate ?? ''} onChange={(e) => setVatSettings({ ...vatSettings, softDrinkTakeawayRate: parseFloat(e.target.value) || 0 })} disabled={!isVatUnlocked} className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50" />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">Dine-In</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" value={vatSettings.softDrinkDineInRate ?? ''} onChange={(e) => setVatSettings({ ...vatSettings, softDrinkDineInRate: parseFloat(e.target.value) || 0 })} disabled={!isVatUnlocked} className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50" />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── ALCOHOLIC DRINKS ── */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200/60 bg-white/50 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                      <Wine className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm tracking-wide">Alcoholic Drinks VAT</h4>
                      <p className="text-[11px] text-slate-500">Beer, wine, and spirits</p>
                    </div>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">Takeaway</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" value={vatSettings.alcoholTakeawayRate ?? ''} onChange={(e) => setVatSettings({ ...vatSettings, alcoholTakeawayRate: parseFloat(e.target.value) || 0 })} disabled={!isVatUnlocked} className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50" />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">Dine-In</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" value={vatSettings.alcoholDineInRate ?? ''} onChange={(e) => setVatSettings({ ...vatSettings, alcoholDineInRate: parseFloat(e.target.value) || 0 })} disabled={!isVatUnlocked} className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50" />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── SERVICE FEES ── */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200/60 bg-white/50 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm tracking-wide">Service Fees</h4>
                      <p className="text-[11px] text-slate-500">Delivery and processing</p>
                    </div>
                  </div>
                  <div className="p-5">
                    <label className="block text-xs font-bold text-slate-700 mb-2">Delivery Service VAT (%)</label>
                    <div className="relative">
                      <input type="number" min="0" max="100" value={vatSettings.deliveryVatRate ?? ''} onChange={(e) => setVatSettings({ ...vatSettings, deliveryVatRate: parseFloat(e.target.value) || 0 })} disabled={!isVatUnlocked} className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50" />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Belgian GKS VAT Letter Codes */}
              <div className="bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-700 shadow-sm mt-8">
                <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-700">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                    <FileText className="w-6 h-6"/>
                  </div>
                  <div>
                    <h3 className="font-heading font-black text-white text-xl">Belgian GKS VAT Letter Codes</h3>
                    <p className="text-sm text-slate-400 font-medium">Fixed codes mandated by SPF</p>
                  </div>
                </div>

                {(() => {
                  const rateToItems: Record<number, string[]> = {};
                  const add = (rate: number, label: string) => {
                    if (!rateToItems[rate]) rateToItems[rate] = [];
                    rateToItems[rate].push(label);
                  };
                  add(vatSettings.foodTakeawayRate,      'Food Takeaway');
                  add(vatSettings.foodDineInRate,         'Food Dine-In');
                  add(vatSettings.softDrinkTakeawayRate,  'Soft Drinks Takeaway');
                  add(vatSettings.softDrinkDineInRate,    'Soft Drinks Dine-In');
                  add(vatSettings.alcoholTakeawayRate,    'Alcohol Takeaway');
                  add(vatSettings.alcoholDineInRate,      'Alcohol Dine-In');
                  add(vatSettings.deliveryVatRate,        'Delivery Service');

                  const codes = [
                    { code: 'A', rate: 21, bg: 'bg-red-500' },
                    { code: 'B', rate: 12, bg: 'bg-orange-500' },
                    { code: 'C', rate: 6,  bg: 'bg-amber-500' },
                    { code: 'D', rate: 0,  bg: 'bg-green-500' },
                  ];

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      {codes.map(({ code, rate, bg }) => {
                        const items = rateToItems[rate] ?? [];
                        return (
                          <div key={code} className="rounded-2xl bg-slate-800 border border-slate-700 p-4 flex flex-col items-center gap-2">
                            <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center`}>
                              <span className="text-2xl font-black text-white">{code}</span>
                            </div>
                            <span className="text-xl font-black text-white">{rate}%</span>
                            <div className="w-full mt-1 space-y-1">
                              {items.length > 0 ? items.map(item => (
                                <div key={item} className="text-xs text-center text-slate-400 font-medium bg-slate-700 rounded-lg px-2 py-1">{item}</div>
                              )) : (
                                <div className="text-xs text-center text-slate-600 font-medium">Not used</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
           </div>
        )}
      </motion.div>
    </div>
  );
}
