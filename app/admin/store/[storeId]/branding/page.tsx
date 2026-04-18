'use client';

import { useState, use, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Save, Check, Image as ImageIcon, Video, Palette, Type, X, Upload } from 'lucide-react';
import Image from 'next/image';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

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

export default function StoreBrandingPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Consolidated Branding State
  const [branding, setBranding] = useState({
    storeLogo: '',
    heroImage: '', // The bg for kiosk / website
    splashVideo: '', // Idle video
    accentColor: '#DC2626',
    tagline: '',
    promoBanners: [] as string[],
    receiptLogo: ''
  });

  const bannerRef = useRef<HTMLInputElement>(null);

  const [logoUp, setLogoUp] = useState({ uploading: false, progress: 0 });
  const [rcptUp, setRcptUp] = useState({ uploading: false, progress: 0 });
  const [bgUp, setBgUp] = useState({ uploading: false, progress: 0 });
  const [vidUp, setVidUp] = useState({ uploading: false, progress: 0 });
  const [bannerUploading, setBannerUploading] = useState(false);

  useEffect(() => {
    const fetchStore = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, 'stores', storeId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
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
        console.error("Error loading branding:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStore();
  }, [storeId, user]);

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

  const handleClearFile = async (url: string, field: 'storeLogo' | 'receiptLogo' | 'heroImage' | 'splashVideo') => {
    if (url && url.includes('firebasestorage.googleapis.com')) {
      await deleteObject(ref(storage, url)).catch(() => {});
    }
    setBranding(b => ({ ...b, [field]: '' }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const docRef = doc(db, 'stores', storeId);
      
      // Update the main branding object and mirror to legacy fields to ensure backwards compatibility
      await updateDoc(docRef, {
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
        image: branding.heroImage, // Legacy website hero
        kioskBg: branding.heroImage, // Legacy kiosk bg fallback
        promoBanners: branding.promoBanners,
        kioskSyncAt: serverTimestamp() // triggers global kiosk reloads immediately
      });
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${storeId}`);
    } finally {
      setIsSaving(false);
    }
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

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 max-w-5xl mx-auto min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900 capitalize">
            Unified Branding Studio
          </h1>
          <p className="mt-2 text-slate-500 font-medium">Control the visual identity across Kiosks, Web Ordering, Driver App, and POS from one place.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving || logoUp.uploading || bgUp.uploading || vidUp.uploading}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed min-w-[140px]"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
          ) : showSuccess ? (
            <><Check className="w-5 h-5 mr-2" /> Saved!</>
          ) : (
            <><Save className="w-5 h-5 mr-2" /> Publish to All Platforms</>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Core Identity */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><Palette className="w-5 h-5" /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Core Branch Identity</h2>
              <p className="text-xs text-slate-500">The primary logo and theme colors for {storeId}.</p>
            </div>
          </div>
          
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-widest text-xs">Primary Logo</label>
              <UploadZone
                accept="image/*"
                currentUrl={branding.storeLogo}
                uploadState={logoUp}
                onFile={file => uploadFile(file, 'logo', setLogoUp, url => setBranding(b => ({ ...b, storeLogo: url })), branding.storeLogo)}
                onClear={() => handleClearFile(branding.storeLogo, 'storeLogo')}
                hint="PNG/SVG (transparent) — used everywhere"
              />
            </div>
            <div className="md:col-span-2 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-widest text-xs">Global Accent Color</label>
                <div className="flex items-center gap-4">
                  <input type="color" value={branding.accentColor} onChange={e => setBranding(b => ({ ...b, accentColor: e.target.value }))} className="w-14 h-14 rounded-xl border border-slate-200 cursor-pointer p-0.5" />
                  <div className="flex-1">
                    <input type="text" value={branding.accentColor} onChange={e => setBranding(b => ({ ...b, accentColor: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none text-sm font-mono" />
                    <p className="text-xs text-slate-400 mt-2">Applies to checkout buttons, kiosk touches, and POS highlights.</p>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-widest text-xs">Branch Tagline (Optional)</label>
                <div className="flex items-center gap-3">
                  <Type className="w-5 h-5 text-slate-400" />
                  <input type="text" value={branding.tagline} onChange={e => setBranding(b => ({ ...b, tagline: e.target.value }))} placeholder="e.g. Belgian Kitchen" className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none text-sm" />
                </div>
                <p className="text-xs text-slate-400 mt-2 ml-8">Displayed beneath the logo on immersive screens like Kiosks.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt Printer Logo */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-100 flex items-center justify-center"><ImageIcon className="w-5 h-5" /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Receipt Printer Artwork</h2>
              <p className="text-xs text-slate-500">Black and white, high-contrast logo optimized for thermal receipt printers.</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <UploadZone
              accept="image/*"
              currentUrl={branding.receiptLogo}
              uploadState={rcptUp}
              onFile={file => uploadFile(file, 'logo', setRcptUp, url => setBranding(b => ({ ...b, receiptLogo: url })), branding.receiptLogo)}
              onClear={() => handleClearFile(branding.receiptLogo, 'receiptLogo')}
              hint="JPG/PNG — Pure black & white without gradients (max 500x500)."
            />
          </div>
        </div>

        {/* Global Hero & Idle */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><ImageIcon className="w-5 h-5" /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Kiosk Background & Hero</h2>
              <p className="text-xs text-slate-500">Kiosk background • Web header • POS wallpaper</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <UploadZone
                accept="image/*"
                currentUrl={branding.heroImage}
                uploadState={bgUp}
                onFile={file => uploadFile(file, 'backgrounds', setBgUp, url => setBranding(b => ({ ...b, heroImage: url })), branding.heroImage)}
                onClear={() => handleClearFile(branding.heroImage, 'heroImage')}
                hint="JPG/PNG — Large high-res portrait image for Kiosk."
              />
          </div>
        </div>

        {/* Splash Video */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center"><Video className="w-5 h-5" /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Kiosk Screen Saver Video</h2>
              <p className="text-xs text-slate-500">Takes priority on Kiosk Idle Screens & POS.</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <UploadZone
              accept="video/mp4,video/webm"
              currentUrl={branding.splashVideo}
              uploadState={vidUp}
              previewType="video"
              onFile={file => uploadFile(file, 'videos', setVidUp, url => setBranding(b => ({ ...b, splashVideo: url })), branding.splashVideo)}
              onClear={() => handleClearFile(branding.splashVideo, 'splashVideo')}
              hint="MP4/WebM — Portrait 9:16 (Max ~20MB). Plays silently in a loop."
            />
          </div>
        </div>

        {/* Promo Carousel */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><ImageIcon className="w-5 h-5" /></div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg">Shared Promo Carousel <span className="text-sm font-normal text-slate-400">({branding.promoBanners.length})</span></h2>
                <p className="text-xs text-slate-500">Images shown on top of the Kiosk and Web menus.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => bannerRef.current?.click()}
              disabled={bannerUploading}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
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
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button type="button" onClick={async () => {
                        if (url.includes('firebasestorage.googleapis.com')) {
                          await deleteObject(ref(storage, url)).catch(() => {});
                        }
                        setBranding(b => ({ ...b, promoBanners: b.promoBanners.filter((_, idx) => idx !== i) }));
                      }} className="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-bold shadow-sm hover:scale-105 transition-transform">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400">
                <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                <p className="font-bold text-sm">No promo banners</p>
                <p className="text-xs mt-1">Upload images to display special offers</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
