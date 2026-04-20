'use client';

import { useState, use, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Save, Check, Image as ImageIcon, Video, Palette, Type, X, Upload, GripVertical, Play, ChevronUp, ChevronDown } from 'lucide-react';
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
  type BannerItem = { url: string; type: 'image' | 'video' };
  const [branding, setBranding] = useState({
    storeLogo: '',
    heroImage: '', // The bg for kiosk / website
    splashVideo: '', // Idle video
    accentColor: '#DC2626',
    tagline: '',
    kioskBanners: [] as BannerItem[],   // NEW canonical field for kiosk carousel
    promoBanners: [] as string[],        // Legacy string array preserved
    receiptLogo: '',
    kioskFooterBanner: '' // Full-width image shown at the bottom of the kiosk idle screen
  });

  const [footerUp, setFooterUp] = useState({ uploading: false, progress: 0 });

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
            kioskBanners: (() => {
              // Load from new kioskBanners array first, fallback to legacy promoBanners (string[]) 
              const raw = savedBranding.kioskBanners ?? savedBranding.promoBanners ?? data.promoBanners ?? data.banners ?? [];
              if (!Array.isArray(raw)) return [];
              return raw.map((item: unknown) => {
                if (typeof item === 'string') return { url: item, type: 'image' as const };
                if (item && typeof item === 'object' && 'url' in item) return item as BannerItem;
                return null;
              }).filter(Boolean) as BannerItem[];
            })(),
            promoBanners: Array.isArray(savedBranding.promoBanners) ? savedBranding.promoBanners : (Array.isArray(data.promoBanners) ? data.promoBanners : []),
            receiptLogo: savedBranding.receiptLogo || '',
            kioskFooterBanner: savedBranding.kioskFooterBanner || ''
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

  const handleClearFile = async (url: string, field: 'storeLogo' | 'receiptLogo' | 'heroImage' | 'splashVideo' | 'kioskFooterBanner') => {
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
      // Build string-only URL array for legacy compatibility
      const bannerUrls = branding.kioskBanners.map(b => b.url);
      await updateDoc(docRef, {
        branding: {
          storeLogo: branding.storeLogo,
          receiptLogo: branding.receiptLogo,
          heroImage: branding.heroImage,
          splashVideo: branding.splashVideo,
          accentColor: branding.accentColor,
          tagline: branding.tagline,
          // NEW: rich array with url + type, read by kiosk PromoCarousel
          kioskBanners: branding.kioskBanners,
          // Legacy flat array fallback
          promoBanners: bannerUrls,
          kioskFooterBanner: branding.kioskFooterBanner
        },
        storeLogo: branding.storeLogo,
        image: branding.heroImage, // Legacy website hero
        kioskBg: branding.heroImage, // Legacy kiosk bg fallback
        // Legacy top-level banners key
        banners: bannerUrls,
        promoBanners: bannerUrls,
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
    const results: BannerItem[] = [];
    for (const file of files) {
      const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(`${file.name} is too large (max ${file.type.startsWith('video/') ? '50 MB for videos' : '10 MB for images'})`);
        continue;
      }
      try {
        const isVideo = file.type.startsWith('video/');
        const folder = isVideo ? 'banners/videos' : 'banners/images';
        const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const fileRef = ref(storage, `stores/${storeId}/branding/${folder}/${filename}`);
        const uploadTask = uploadBytesResumable(fileRef, file);
        const url = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            () => {},
            reject,
            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
          );
        });
        results.push({ url, type: isVideo ? 'video' : 'image' });
      } catch (err) {
        console.error('Banner upload failed:', err);
        alert(`Failed to upload ${file.name}. Please try again.`);
      }
    }
    setBranding(b => ({ ...b, kioskBanners: [...b.kioskBanners, ...results] }));
    setBannerUploading(false);
    e.target.value = '';
  };

  const moveBanner = (from: number, to: number) => {
    setBranding(b => {
      const arr = [...b.kioskBanners];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...b, kioskBanners: arr };
    });
  };

  const deleteBanner = async (i: number) => {
    const item = branding.kioskBanners[i];
    if (item.url.includes('firebasestorage.googleapis.com')) {
      await deleteObject(ref(storage, item.url)).catch(() => {});
    }
    setBranding(b => ({ ...b, kioskBanners: b.kioskBanners.filter((_, idx) => idx !== i) }));
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

        {/* Unified Kiosk Idle Media */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><Video className="w-5 h-5" /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Kiosk Idle Media (Image or Video)</h2>
              <p className="text-xs text-slate-500">Upload an Image (Web + Kiosk) OR a Video (Kiosk Screensaver).</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <UploadZone
              accept="image/*,video/mp4,video/webm"
              currentUrl={branding.splashVideo || branding.heroImage}
              uploadState={bgUp}
              previewType={branding.splashVideo ? 'video' : 'image'}
              onFile={file => {
                const isVideo = file.type.startsWith('video/');
                uploadFile(
                  file,
                  isVideo ? 'videos' : 'backgrounds',
                  setBgUp,
                  url => {
                    if (isVideo) {
                      setBranding(b => ({ ...b, splashVideo: url }));
                    } else {
                      // If user uploads an image, explicitly clear the video so the image actually plays on the Kiosk
                      setBranding(b => ({ ...b, heroImage: url, splashVideo: '' }));
                    }
                  },
                  isVideo ? branding.splashVideo : branding.heroImage
                );
              }}
              onClear={() => {
                if (branding.splashVideo) {
                  handleClearFile(branding.splashVideo, 'splashVideo');
                } else if (branding.heroImage) {
                  handleClearFile(branding.heroImage, 'heroImage');
                }
              }}
              hint="Drop a JPG/PNG for a static background, or an MP4/WebM to play an animated screen saver."
            />
          </div>
        </div>

        {/* Kiosk Footer Banner */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><ImageIcon className="w-5 h-5" /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Kiosk Footer Banner</h2>
              <p className="text-xs text-slate-500">Full-width image shown at the bottom of the idle screen (like a KFC-style brand bar). No overlay is applied — the image renders exactly as uploaded.</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <UploadZone
              accept="image/*"
              currentUrl={branding.kioskFooterBanner}
              uploadState={footerUp}
              onFile={file => uploadFile(file, 'footer', setFooterUp, url => setBranding(b => ({ ...b, kioskFooterBanner: url })), branding.kioskFooterBanner)}
              onClear={() => handleClearFile(branding.kioskFooterBanner, 'kioskFooterBanner')}
              hint="Wide banner image (e.g. 1280×200 px). Displayed as-is at the bottom of the kiosk idle screen."
            />
          </div>
        </div>

        {/* Promo Carousel — Kiosk Footer Slideshow */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
                <Play className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg">
                  Kiosk Promo Carousel&nbsp;
                  <span className="text-sm font-normal text-slate-400">({branding.kioskBanners.length} slide{branding.kioskBanners.length !== 1 ? 's' : ''})</span>
                </h2>
                <p className="text-xs text-slate-500">Images &amp; videos shown in the bottom 30% footer on ALL kiosk screens. Drag to reorder.</p>
              </div>
            </div>
            <label
              className={`px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm cursor-pointer flex items-center gap-2 transition-all active:scale-95 ${bannerUploading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              {bannerUploading ? (
                <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Add Images &amp; Videos</>
              )}
              <input ref={bannerRef} type="file" multiple accept="image/*,video/mp4,video/webm" className="hidden" onChange={handleBannerUpload} />
            </label>
          </div>

          <div className="p-6">
            {branding.kioskBanners.length > 0 ? (
              <div className="space-y-3">
                {branding.kioskBanners.map((item, i) => (
                  <div key={`${item.url}-${i}`} className="group flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all">
                    {/* Drag handle / Order controls */}
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <button type="button" disabled={i === 0} onClick={() => moveBanner(i, i - 1)}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-100 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <GripVertical className="w-4 h-4 text-slate-300" />
                      <button type="button" disabled={i === branding.kioskBanners.length - 1} onClick={() => moveBanner(i, i + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-100 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Thumbnail */}
                    <div className="relative w-28 h-16 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0 border border-slate-200">
                      {item.type === 'video' ? (
                        <video src={item.url} muted loop autoPlay playsInline className="w-full h-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt={`Slide ${i+1}`} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute top-1 left-1">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                          item.type === 'video' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                        }`}>
                          {item.type === 'video' ? <Video className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                          {item.type.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-700">Slide {i + 1}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs font-mono">{item.url.split('/').pop()?.split('?')[0]}</p>
                    </div>

                    {/* Delete */}
                    <button type="button" onClick={() => deleteBanner(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Drop zone for adding more */}
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-blue-200 rounded-2xl py-4 text-sm text-blue-600 font-bold cursor-pointer hover:bg-blue-50 transition-colors">
                  <Upload className="w-4 h-4" /> Add more slides
                  <input type="file" multiple accept="image/*,video/mp4,video/webm" className="hidden" onChange={handleBannerUpload} />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl py-14 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Play className="w-8 h-8 text-blue-500" />
                </div>
                <div className="text-center">
                  <p className="font-black text-slate-700 text-base">Add your first promo slide</p>
                  <p className="text-sm text-slate-400 mt-1">Supports images (JPG/PNG/WEBP) and videos (MP4/WebM) · max 50 MB per video</p>
                </div>
                <span className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">Browse Files</span>
                <input type="file" multiple accept="image/*,video/mp4,video/webm" className="hidden" onChange={handleBannerUpload} />
              </label>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
