'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Save, Globe, Bell, Shield, Palette, Check, Store, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { resizeImage, base64ByteSize } from '@/lib/image-utils';

const TABS = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'integrations', label: 'Integrations', icon: LinkIcon },
];

export default function SuperAdminSettings() {
  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  // Default to URL mode since defaults are already URLs
  const [heroInputMode, setHeroInputMode] = useState<'upload' | 'url'>('url');
  const [logoInputMode, setLogoInputMode] = useState<'upload' | 'url'>('url');

  const [settings, setSettings] = useState({
    appName: 'MR COD',
    appSubtitle: 'Belgium',
    appLogo: 'https://firebasestorage.googleapis.com/v0/b/mr-cod-online-ordering.firebasestorage.app/o/logo%20mr%20cod.png?alt=media&token=9ecf39cd-567f-437a-b395-6ffd949f7f1e',
    supportEmail: 'support@mrcod.be',
    hqTelephone: '+32 2 123 45 67',
    hqAddress: 'Grand Place 1, 1000 Brussels',
    heroImage: 'https://picsum.photos/seed/mrcod_hero/1920/1080',
    currency: 'EUR',
    timezone: 'Europe/Brussels',
    primaryColor: '#f59e0b', // amber-500
    radiusPreference: 'rounded', // sharp, rounded, soft
    ccvWebhookUrl: '', // Global webhook URL for CCV
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(prev => ({ ...prev, ...data }));
          // Auto-detect modes based on stored values
          if (data.heroImage) {
            setHeroInputMode(data.heroImage.startsWith('data:') ? 'upload' : 'url');
          }
          if (data.appLogo) {
            setLogoInputMode(data.appLogo.startsWith('data:') ? 'upload' : 'url');
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings/global');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/svg+xml'].includes(file.type)) {
      alert('Please upload a PNG, JPG, or SVG file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Logo file size must be less than 5MB.');
      return;
    }

    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        // Resize logo to max 512x512
        const resized = await resizeImage(base64, 512, 512, 0.9);
        setSettings({ ...settings, appLogo: resized });
      } catch (error) {
        console.error('Error processing logo:', error);
        alert('Failed to process logo. Please try another one.');
      } finally {
        setIsProcessingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('Please upload a PNG or JPG file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB.');
      return;
    }

    setIsProcessingImage(true);
    setImageError(null);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        // Hero images MUST be aggressively compressed to stay under Firestore's 1MB doc limit.
        // Force JPEG output (PNG ignores quality and outputs uncompressed, easily blowing the limit).
        const resized = await resizeImage(base64, 800, 450, 0.5, true);

        // Guard: reject if still too large (>700KB leaves safe headroom in the doc)
        const sizeBytes = base64ByteSize(resized);
        if (sizeBytes > 700_000) {
          setImageError(
            `Image is still too large after compression (${(sizeBytes / 1024).toFixed(0)} KB). ` +
            'Please use a smaller source image, or switch to a URL instead.'
          );
          return;
        }

        setSettings(prev => ({ ...prev, heroImage: resized }));
      } catch (error) {
        console.error('Error processing image:', error);
        alert('Failed to process image. Please try another one.');
      } finally {
        setIsProcessingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // ── Guard: block save if heroImage base64 is too large for Firestore ─────────
    if (settings.heroImage?.startsWith('data:')) {
      const sizeBytes = base64ByteSize(settings.heroImage);
      if (sizeBytes > 900_000) {
        setImageError(
          `Hero image is too large to save (${(sizeBytes / 1024).toFixed(0)} KB). ` +
          'Firestore has a 1 MB document limit. Please use a URL instead, or upload a smaller image.'
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      setShowSuccess(true);
      setImageError(null);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Global Settings</h1>
          <p className="mt-2 text-slate-500 font-medium">Manage application preferences, security, and notifications.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving || isProcessingImage}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed min-w-[140px]"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
          ) : isProcessingImage ? (
            'Processing...'
          ) : showSuccess ? (
            <>
              <Check className="w-5 h-5 mr-2" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-5 h-5 mr-2" />
              Save Changes
            </>
          )}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Settings Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sticky top-28">
            <nav className="space-y-1">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all relative overflow-hidden ${
                      isActive
                        ? 'text-amber-900 bg-amber-100/50'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="activeSettingsTab"
                        className="absolute inset-0 bg-amber-100 border border-amber-200 rounded-2xl -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <tab.icon className={`w-5 h-5 relative z-10 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex-1">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
          >
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-xl font-heading font-black text-slate-900">
                {TABS.find(t => t.id === activeTab)?.label} Settings
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Update your {activeTab} configurations here.
              </p>
            </div>

            <div className="p-8">
              {activeTab === 'general' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Main Application Name</label>
                      <input
                        type="text"
                        value={settings.appName}
                        onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                        placeholder="e.g. MR COD"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Subtitle / Tagline (Smaller text)</label>
                      <input
                        type="text"
                        value={settings.appSubtitle || ''}
                        onChange={(e) => setSettings({ ...settings, appSubtitle: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                        placeholder="e.g. Belgium"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-slate-700">Application Logo</label>
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setLogoInputMode('upload')}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                            logoInputMode === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Upload
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogoInputMode('url')}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                            logoInputMode === 'url' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          URL
                        </button>
                      </div>
                    </div>

                    {logoInputMode === 'url' ? (
                      <div className="space-y-2">
                        <input
                          type="url"
                          value={settings.appLogo?.startsWith('data:') ? '' : (settings.appLogo || '')}
                          onChange={(e) => setSettings(prev => ({ ...prev, appLogo: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors font-mono text-sm"
                          placeholder="https://example.com/logo.png"
                        />
                        <p className="text-xs text-slate-400">Paste a Firebase Storage or CDN URL. Recommended to avoid Firestore size limits.</p>
                        {settings.appLogo && !settings.appLogo.startsWith('data:') && (
                          <div className="relative w-full h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                            <Image src={settings.appLogo} alt="Logo Preview" fill className="object-contain p-3" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => logoInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-amber-400 transition-colors cursor-pointer relative overflow-hidden min-h-[160px]"
                      >
                        {settings.appLogo ? (
                          <div className="absolute inset-0 w-full h-full flex justify-center items-center p-4">
                            <Image src={settings.appLogo} alt="Logo Preview" fill className="object-contain p-2" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <span className="text-white font-bold text-sm bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">Change Logo</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <ImageIcon className="w-8 h-8 mb-2 text-slate-400" />
                            <span className="text-sm font-bold">Click to upload brand logo</span>
                            <span className="text-xs mt-1 text-slate-400">PNG, JPG, SVG up to 5MB (Square recommended)</span>
                          </>
                        )}
                        <input
                          type="file"
                          ref={logoInputRef}
                          onChange={handleLogoUpload}
                          accept="image/png, image/jpeg, image/svg+xml"
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-slate-700">Hero Image</label>
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setHeroInputMode('upload')}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                            heroInputMode === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Upload
                        </button>
                        <button
                          type="button"
                          onClick={() => setHeroInputMode('url')}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                            heroInputMode === 'url' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          URL
                        </button>
                      </div>
                    </div>

                    {heroInputMode === 'url' ? (
                      <div className="space-y-2">
                        <input
                          type="url"
                          value={settings.heroImage?.startsWith('data:') ? '' : (settings.heroImage || '')}
                          onChange={(e) => {
                            setSettings(prev => ({ ...prev, heroImage: e.target.value }));
                            setImageError(null);
                          }}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition-colors font-mono text-sm"
                          placeholder="https://example.com/hero.jpg"
                        />
                        <p className="text-xs text-slate-400">Use an external URL to avoid Firestore size limits. Recommended for large hero images.</p>
                        {settings.heroImage && !settings.heroImage.startsWith('data:') && (
                          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200">
                            <Image src={settings.heroImage} alt="Hero Preview" fill className="object-cover" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-amber-400 transition-colors cursor-pointer relative overflow-hidden min-h-[240px]"
                        >
                          {settings.heroImage ? (
                            <div className="absolute inset-0 w-full h-full">
                              <Image src={settings.heroImage} alt="Hero Preview" fill className="object-cover" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-white font-bold text-sm bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">Change Image</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <ImageIcon className="w-8 h-8 mb-2 text-slate-400" />
                              <span className="text-sm font-bold">Click to upload hero image</span>
                              <span className="text-xs mt-1 text-center text-slate-400">PNG or JPG · Auto-compressed to JPEG 800×450 · Must be under 700 KB after compression</span>
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
                        {settings.heroImage?.startsWith('data:') && (
                          <p className="mt-1.5 text-xs text-slate-400">
                            Size: ~{(base64ByteSize(settings.heroImage) / 1024).toFixed(0)} KB stored in Firestore
                          </p>
                        )}
                      </div>
                    )}

                    {imageError && (
                      <div className="mt-2 flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
                        <span className="text-rose-500 text-sm font-semibold">{imageError}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Support Email</label>
                    <input
                      type="email"
                      value={settings.supportEmail}
                      onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">HQ Telephone</label>
                    <input
                      type="text"
                      value={settings.hqTelephone}
                      onChange={(e) => setSettings({ ...settings, hqTelephone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="+32 2 123 45 67"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">HQ Address</label>
                    <textarea
                      rows={3}
                      value={settings.hqAddress}
                      onChange={(e) => setSettings({ ...settings, hqAddress: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors resize-none"
                      placeholder="Grand Place 1, 1000 Brussels"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Default Currency</label>
                      <select
                        value={settings.currency}
                        onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white"
                      >
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Timezone</label>
                      <select
                        value={settings.timezone}
                        onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white"
                      >
                        <option value="Europe/Brussels">Europe/Brussels</option>
                        <option value="Europe/London">Europe/London</option>
                        <option value="Europe/Paris">Europe/Paris</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="space-y-6 max-w-2xl">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Primary Interactive Color</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="color"
                        value={settings.primaryColor}
                        onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                        className="h-12 w-12 rounded-xl border border-slate-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={settings.primaryColor}
                        onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">UI Corner Radius Preference</label>
                    <select
                      value={settings.radiusPreference}
                      onChange={(e) => setSettings({ ...settings, radiusPreference: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors bg-white mt-2"
                    >
                      <option value="sharp">Sharp (0px)</option>
                      <option value="rounded">Rounded (Standard)</option>
                      <option value="soft">Soft (Pill shape)</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Live Preview</h3>
                    <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center gap-6">
                      <button 
                        className={`px-6 py-2.5 font-bold text-slate-900 shadow-sm transition-opacity hover:opacity-90 ${
                          settings.radiusPreference === 'sharp' ? 'rounded-none' :
                          settings.radiusPreference === 'soft' ? 'rounded-full' : 'rounded-xl'
                        }`}
                        style={{ backgroundColor: settings.primaryColor }}
                      >
                        Action Button
                      </button>
                      <div 
                        className={`w-12 h-12 flex items-center justify-center text-white shadow-sm ${
                          settings.radiusPreference === 'sharp' ? 'rounded-none' :
                          settings.radiusPreference === 'soft' ? 'rounded-full' : 'rounded-xl'
                        }`}
                        style={{ backgroundColor: settings.primaryColor }}
                      >
                        <Store className="w-5 h-5 text-slate-900" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'integrations' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                        <LinkIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">CCV Payment Terminal Webhook</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Global webhook URL to receive payment status updates from CCV terminals across all stores.</p>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Backend Webhook URL</label>
                      <input
                        type="url"
                        value={settings.ccvWebhookUrl || ''}
                        onChange={(e) => setSettings({ ...settings, ccvWebhookUrl: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors font-mono text-sm"
                        placeholder="https://your-backend-api.com/webhooks/ccv"
                      />
                      <p className="text-xs text-slate-400 mt-2">
                        This URL will be used by the CCV cloud service to push real-time transaction updates (e.g., SUCCESS, FAILED) back to the Mr. Cod ecosystem.
                      </p>
                    </div>
                  </div>
                </div>
              )}


            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
