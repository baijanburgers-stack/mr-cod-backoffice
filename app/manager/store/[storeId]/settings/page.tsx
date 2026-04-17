'use client';

import { useState, use, useEffect } from 'react';
import { motion } from 'motion/react';
import { Save, Check, Settings, Clock, Power, Image as ImageIcon, Upload, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

export default function ManagerSettingsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // General Settings State
  const [isOpen, setIsOpen] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
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

  useEffect(() => {
    const fetchStoreData = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, 'stores', storeId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsOpen(data.isOpen ?? true);
          if (data.logoUrl || data.logo) {
            setLogoUrl(data.logoUrl || data.logo);
          }
          if (data.storeHours) setStoreHours(data.storeHours);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `stores/${storeId}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStoreData();
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const docRef = doc(db, 'stores', storeId);
      await updateDoc(docRef, {
        isOpen: isOpen,
        storeHours: storeHours,
        logoUrl: logoUrl,
      });
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${storeId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 250;
        
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to grayscale for thermal optimization
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = avg; 
          data[i + 1] = avg; 
          data[i + 2] = avg; 
        }
        ctx.putImageData(imgData, 0, 0);

        setLogoUrl(canvas.toDataURL('image/jpeg', 0.9));
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Live Config</h1>
          <p className="mt-2 text-slate-500 font-medium">Manage daily operational hours and live storefront status.</p>
        </div>
        <button 
          type="submit"
          disabled={isSaving}
          className={`group flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold transition-all ${
            showSuccess 
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20'
          }`}
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : showSuccess ? (
            <><Check className="w-5 h-5" /> Saved Successfully</>
          ) : (
            <><Save className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" /> Save Operations</>
          )}
        </button>
      </div>

      <div className="space-y-6">
        {/* Core Live Toggle */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-sm shadow-emerald-100/50">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
            <div>
              <h2 className="text-xl font-heading font-black text-slate-900 flex items-center gap-2">
                <Power className="w-6 h-6 text-emerald-500" />
                Storefront Live Status
              </h2>
              <p className="text-slate-500 mt-2 font-medium max-w-lg leading-relaxed">
                Emergency switch. If your kitchen is overloaded, toggle this off immediately to stop all incoming digital orders.
              </p>
            </div>
            
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={`relative inline-flex h-10 w-20 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                isOpen ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span className="sr-only">Toggle store status</span>
              <span
                className={`pointer-events-none inline-block h-9 w-9 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isOpen ? 'translate-x-10' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          
          <div className={`mt-6 p-4 rounded-xl border ${isOpen ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            <p className={`font-bold flex items-center gap-2 ${isOpen ? 'text-emerald-700' : 'text-rose-700'}`}>
              {isOpen ? (
                <><Check className="w-5 h-5" /> Customers can currently place orders.</>
              ) : (
                <><Power className="w-5 h-5" /> The store is currently marked as CLOSED.</>
              )}
            </p>
          </div>
        </div>

        {/* Schedule Grid */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm">
          <div className="mb-6 pb-6 border-b border-slate-100">
            <h2 className="text-xl font-heading font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-6 h-6 text-slate-400" />
              Regular Operating Hours
            </h2>
            <p className="text-slate-500 mt-1 font-medium">Set the daily schedule. The store will automatically open and close.</p>
          </div>

          <div className="space-y-4">
            {storeHours.map((day, index) => (
              <div key={day.day} className={`flex flex-col xl:flex-row items-center gap-4 p-4 rounded-2xl border transition-colors ${
                day.isOpen ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/50 border-slate-100 opacity-75'
              }`}>
                {/* Day Toggle */}
                <div className="w-full xl:w-48 flex items-center justify-between xl:justify-start gap-4">
                  <span className={`font-bold ${day.isOpen ? 'text-slate-900' : 'text-slate-400'}`}>
                    {day.day}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateHour(index, 'isOpen', !day.isOpen)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      day.isOpen ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        day.isOpen ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className={`flex flex-wrap sm:flex-nowrap items-center gap-4 w-full transition-opacity ${day.isOpen ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  {/* Time Inputs */}
                  {!day.is24Hours && (
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                        <input
                          type="time"
                          value={day.open}
                          onChange={(e) => handleUpdateHour(index, 'open', e.target.value)}
                          className="w-full outline-none bg-transparent font-medium text-slate-700"
                        />
                      </div>
                      <span className="text-slate-400 font-bold">to</span>
                      <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                        <input
                          type="time"
                          value={day.close}
                          onChange={(e) => handleUpdateHour(index, 'close', e.target.value)}
                          className="w-full outline-none bg-transparent font-medium text-slate-700"
                        />
                      </div>
                    </div>
                  )}

                  {day.is24Hours && (
                    <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center justify-center text-slate-500 font-bold">
                      Open 24 Hours
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={day.is24Hours}
                      onChange={(e) => handleUpdateHour(index, 'is24Hours', e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 border-slate-300"
                    />
                    <span className="text-sm font-bold text-slate-600">24h</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleApplyToAll(index)}
                    className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-2.5 rounded-xl transition-colors whitespace-nowrap"
                  >
                    Apply to All
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Receipt Logo Management */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm">
          <div className="mb-6 pb-6 border-b border-slate-100 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-heading font-black text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-6 h-6 text-slate-400" />
                POS Receipt Logo
              </h2>
              <p className="text-slate-500 mt-1 font-medium max-w-lg">
                Upload a branding logo for your VAT receipts. It will be automatically converted to thermal-friendly grayscale and optimized for 80mm printers.
              </p>
            </div>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl(null)}
                className="text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 p-2 rounded-xl transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-8 items-center">
            {logoUrl ? (
              <div className="shrink-0 p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner">
                {/* Visualizing 80mm thermal paper approx 250px width */}
                <div className="bg-white p-4 border border-dashed border-slate-300 shadow-sm flex items-center justify-center min-h-[100px] min-w-[250px]">
                  <img src={logoUrl} alt="Store Logo Preview" className="max-w-[250px] mix-blend-multiply" />
                </div>
                <p className="text-center text-xs text-slate-500 font-bold mt-3 uppercase tracking-wider">Thermal Preview</p>
              </div>
            ) : (
              <div className="shrink-0 w-[250px] h-[150px] bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
                <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm font-bold">No Logo Uploaded</span>
              </div>
            )}

            <div className="flex-1 w-full">
              <label className="group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 py-8 px-6 transition-colors hover:border-emerald-400 hover:bg-emerald-50">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-4 rounded-full bg-emerald-100 p-3 text-emerald-600 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    Click to upload receipt logo
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    PNG, JPG or GIF (max 5MB)
                  </p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/png, image/jpeg, image/gif" 
                  onChange={handleLogoUpload}
                />
              </label>
            </div>
          </div>
        </div>

      </div>
    </form>
  );
}
