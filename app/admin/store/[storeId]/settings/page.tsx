'use client';

import { useState, use, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Save, Check, Percent, FileText, Settings, Clock, Phone, Mail, MapPin, CalendarOff, Plus, Trash2, Copy, Image as ImageIcon, Volume2, Utensils, Coffee, Truck, Store, CreditCard, Eye, EyeOff, Wifi, WifiOff, Tablet, X, Upload } from 'lucide-react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';
import { resizeImage } from '@/lib/image-utils';

const TABS = [
  { id: 'general',  label: 'General',          icon: Settings },
  { id: 'hours',    label: 'Store Hours',       icon: Clock },
  { id: 'holidays', label: 'Holidays & Closures', icon: CalendarOff },
  { id: 'vat',      label: 'VAT Configuration', icon: Percent },
  { id: 'payment',  label: 'Payment Terminal',  icon: CreditCard },
];

export default function StoreSettingsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('vat');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

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

  // CCV Payment Settings State
  const [ccvSettings, setCcvSettings] = useState({
    ccvApiKeyLive: '',
    ccvApiKeyTest: '',
    ccvEnvironment: 'TEST' as 'TEST' | 'LIVE',
    ccvManagementSystemId: 'GrundmasterBE' as 'GrundmasterBE' | 'GrundmasterNL' | 'GrundmasterNL-ThirdPartyTest',
    ccvBackendUrl: 'https://app.mrcod.be',
  });
  const [showLiveKey, setShowLiveKey] = useState(false);
  const [showTestKey, setShowTestKey] = useState(false);
  const [isSavingCcv, setIsSavingCcv] = useState(false);
  const [ccvSaveSuccess, setCcvSaveSuccess] = useState(false);

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
          setCcvSettings({
            ccvApiKeyLive: data.ccvApiKeyLive || '',
            ccvApiKeyTest: data.ccvApiKeyTest || '',
            ccvEnvironment: data.ccvEnvironment || 'TEST',
            ccvManagementSystemId: data.ccvManagementSystemId || 'GrundmasterBE',
            ccvBackendUrl: data.ccvBackendUrl || 'https://app.mrcod.be',
          });
        } else {
          // Initialize default store if it doesn't exist
          const defaultData = {
            name: storeId.replace('-', ' '),
            address: 'Default Address',
            hqTelephone: '',
            email: '',
            isOpen: true,
            notificationSound: 'default',
            services: { takeaway: true, delivery: true, dineIn: true },
            vatSettings: {
              vatNumber: '',
              foodTakeawayRate: 6,
              foodDineInRate: 12,
              softDrinkTakeawayRate: 6,
              softDrinkDineInRate: 21,
              alcoholTakeawayRate: 21,
              alcoholDineInRate: 21,
              deliveryVatRate: 21,
            },
            storeHours: [
              { day: 'Monday', isOpen: true, is24Hours: false, open: '11:00', close: '22:00' },
              { day: 'Tuesday', isOpen: true, is24Hours: false, open: '11:00', close: '22:00' },
              { day: 'Wednesday', isOpen: true, is24Hours: false, open: '11:00', close: '22:00' },
              { day: 'Thursday', isOpen: true, is24Hours: false, open: '11:00', close: '22:00' },
              { day: 'Friday', isOpen: true, is24Hours: false, open: '11:00', close: '23:00' },
              { day: 'Saturday', isOpen: true, is24Hours: false, open: '12:00', close: '23:00' },
              { day: 'Sunday', isOpen: false, is24Hours: false, open: '12:00', close: '22:00' },
            ],
            holidays: []
          };
          await setDoc(docRef, defaultData);
          setGeneralSettings(prev => ({ ...prev, name: defaultData.name, address: defaultData.address }));
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
        holidays
      });
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${storeId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCcv = async () => {
    setIsSavingCcv(true);
    try {
      await updateDoc(doc(db, 'stores', storeId), {
        ccvApiKeyLive: ccvSettings.ccvApiKeyLive.trim(),
        ccvApiKeyTest: ccvSettings.ccvApiKeyTest.trim(),
        ccvEnvironment: ccvSettings.ccvEnvironment,
        ccvManagementSystemId: ccvSettings.ccvManagementSystemId,
        ccvBackendUrl: ccvSettings.ccvBackendUrl.trim(),
      });
      setCcvSaveSuccess(true);
      setTimeout(() => setCcvSaveSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${storeId}`);
    } finally {
      setIsSavingCcv(false);
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
    <div className="p-6 lg:p-10 max-w-7xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900 capitalize">
            {generalSettings.name || storeId.replace('-', ' ')} Settings
          </h1>
          <p className="mt-2 text-slate-500 font-medium">Manage your store&apos;s configuration and tax settings.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
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
                        layoutId="activeStoreSettingsTab"
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
                {TABS.find(t => t.id === activeTab)?.label}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Update your {activeTab} configurations here.
              </p>
            </div>

            <div className="p-8">
              {activeTab === 'vat' && (
                <div className="space-y-8 max-w-2xl">
                  {/* Standard Rates Config */}
                  <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                        <Percent className="w-6 h-6"/>
                      </div>
                      <div>
                        <h3 className="font-heading font-black text-slate-900 text-xl">Tax Categories</h3>
                        <p className="text-sm text-slate-500 font-medium">Configure VAT percentage by service</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      
                      {/* Food ROW */}
                      <div className="col-span-1 md:col-span-2 pb-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Food VAT</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Takeaway / Pickup (%)</label>
                            <input
                              type="number" min="0" max="100"
                              value={vatSettings.foodTakeawayRate ?? ''}
                              onChange={(e) => setVatSettings({ ...vatSettings, foodTakeawayRate: parseFloat(e.target.value) || 0 })}
                              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-all shadow-sm focus:shadow-md bg-slate-50 focus:bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Dine-In (%)</label>
                            <input
                              type="number" min="0" max="100"
                              value={vatSettings.foodDineInRate ?? ''}
                              onChange={(e) => setVatSettings({ ...vatSettings, foodDineInRate: parseFloat(e.target.value) || 0 })}
                              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-all shadow-sm focus:shadow-md bg-slate-50 focus:bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Soft Drinks ROW */}
                      <div className="col-span-1 md:col-span-2 pb-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Soft Drinks VAT</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Takeaway / Pickup (%)</label>
                            <input
                              type="number" min="0" max="100"
                              value={vatSettings.softDrinkTakeawayRate ?? ''}
                              onChange={(e) => setVatSettings({ ...vatSettings, softDrinkTakeawayRate: parseFloat(e.target.value) || 0 })}
                              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-all shadow-sm focus:shadow-md bg-slate-50 focus:bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Dine-In (%)</label>
                            <input
                              type="number" min="0" max="100"
                              value={vatSettings.softDrinkDineInRate ?? ''}
                              onChange={(e) => setVatSettings({ ...vatSettings, softDrinkDineInRate: parseFloat(e.target.value) || 0 })}
                              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-all shadow-sm focus:shadow-md bg-slate-50 focus:bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Alcoholic Drinks ROW */}
                      <div className="col-span-1 md:col-span-2 pb-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Alcoholic Drinks VAT</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Takeaway / Pickup (%)</label>
                            <input
                              type="number" min="0" max="100"
                              value={vatSettings.alcoholTakeawayRate ?? ''}
                              onChange={(e) => setVatSettings({ ...vatSettings, alcoholTakeawayRate: parseFloat(e.target.value) || 0 })}
                              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-all shadow-sm focus:shadow-md bg-slate-50 focus:bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Dine-In (%)</label>
                            <input
                              type="number" min="0" max="100"
                              value={vatSettings.alcoholDineInRate ?? ''}
                              onChange={(e) => setVatSettings({ ...vatSettings, alcoholDineInRate: parseFloat(e.target.value) || 0 })}
                              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-all shadow-sm focus:shadow-md bg-slate-50 focus:bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Delivery ROW */}
                      <div className="col-span-1 md:col-span-2 pb-2 pt-2">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Service Fees</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Delivery Service VAT (%)</label>
                            <input
                              type="number" min="0" max="100"
                              value={vatSettings.deliveryVatRate ?? ''}
                              onChange={(e) => setVatSettings({ ...vatSettings, deliveryVatRate: parseFloat(e.target.value) || 0 })}
                              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-all shadow-sm focus:shadow-md bg-slate-50 focus:bg-white"
                            />
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Belgian GKS VAT Letter Codes — dynamic from configured rates */}
                  <div className="bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-700 shadow-sm">
                    <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-700">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <FileText className="w-6 h-6"/>
                      </div>
                      <div>
                        <h3 className="font-heading font-black text-white text-xl">Belgian GKS VAT Letter Codes</h3>
                        <p className="text-sm text-slate-400 font-medium">Fixed codes mandated by SPF Finances — printed on every POS receipt</p>
                      </div>
                    </div>

                    {(() => {
                      // Build a map: rate → list of item type labels that use it
                      const rateToItems: Record<number, string[]> = {};
                      const add = (rate: number, label: string) => {
                        if (!rateToItems[rate]) rateToItems[rate] = [];
                        rateToItems[rate].push(label);
                      };
                      add(vatSettings.foodTakeawayRate,      'Food Takeaway/Pickup');
                      add(vatSettings.foodDineInRate,         'Food Dine-In');
                      add(vatSettings.softDrinkTakeawayRate,  'Soft Drinks Takeaway/Pickup');
                      add(vatSettings.softDrinkDineInRate,    'Soft Drinks Dine-In');
                      add(vatSettings.alcoholTakeawayRate,    'Alcohol Takeaway/Pickup');
                      add(vatSettings.alcoholDineInRate,      'Alcohol Dine-In');
                      add(vatSettings.deliveryVatRate,        'Delivery Service');

                      // Code mapping: A=21, B=12, C=6, D=0
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

                    <p className="text-xs text-slate-500 font-medium">
                      Codes update automatically when you change the rates above.
                      The POS assigns the correct letter to each item and prints it on every receipt next to item lines and in the DETAIL TVA / BTW table.
                    </p>
                  </div>

                </div>
              )}

              {activeTab === 'general' && (
                <div className="space-y-8 max-w-2xl">
                  {/* Operational Services */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Operational Services</h3>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-8">
                      <p className="text-sm text-slate-500 mb-6">Enable or disable specific services for this location. Ensure VAT rates are configured appropriately.</p>
                      <div className="space-y-4 max-w-lg">
                        
                        {/* Takeaway / Pickup Toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900">Takeaway / Pickup</div>
                            <div className="text-sm text-slate-500">Allow customers to pick up their orders</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={storeServices.takeaway} onChange={(e) => setStoreServices({ ...storeServices, takeaway: e.target.checked })} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                          </label>
                        </div>

                        {/* Delivery Toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900">Delivery</div>
                            <div className="text-sm text-slate-500">Allow customers to request delivery</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={storeServices.delivery} onChange={(e) => setStoreServices({ ...storeServices, delivery: e.target.checked })} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                          </label>
                        </div>

                        {/* Dine-In Toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900">Dine-In</div>
                            <div className="text-sm text-slate-500">Allow customers to eat inside the restaurant</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={storeServices.dineIn} onChange={(e) => setStoreServices({ ...storeServices, dineIn: e.target.checked })} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                          </label>
                        </div>

                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Order Notification Sound</label>
                    <div className="flex flex-col gap-4">
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
                          className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-amber-100 hover:text-amber-600 transition-colors flex-shrink-0"
                          title="Test Sound"
                        >
                          <Volume2 className="w-5 h-5" />
                        </button>
                      </div>
                      
                      {generalSettings.notificationSound === 'custom' && (
                        <div className="flex flex-col items-start gap-2">
                           <button 
                             type="button"
                             onClick={() => soundInputRef.current?.click()}
                             className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                           >
                             {generalSettings.customNotificationSound ? 'Change Custom Sound' : 'Upload Custom Sound (Max 2MB)'}
                           </button>
                           {generalSettings.customNotificationSound && <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><Check className="w-3 h-3"/> Custom sound loaded and ready</span>}
                           <input type="file" ref={soundInputRef} onChange={handleSoundUpload} accept="audio/*" className="hidden" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Telephone</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={generalSettings.hqTelephone}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, hqTelephone: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                        placeholder="e.g. +32 2 123 45 67"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="email"
                        value={generalSettings.email}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, email: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                        placeholder="e.g. contact@mrcod.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">HQ Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 pt-3 pointer-events-none">
                        <MapPin className="h-5 w-5 text-slate-400" />
                      </div>
                      <textarea
                        rows={3}
                        value={generalSettings.address}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, address: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors resize-none"
                        placeholder="e.g. Grand Place 1, 1000 Brussels"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'payment' && (
                <div className="space-y-6 max-w-2xl">

                  {/* Environment Toggle */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <Wifi className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">Active Environment</h3>
                        <p className="text-xs text-slate-500">Kiosks will use the selected environment&apos;s API key</p>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setCcvSettings(s => ({ ...s, ccvEnvironment: 'TEST' }))}
                          className={`flex-1 py-3 px-4 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2 ${
                            ccvSettings.ccvEnvironment === 'TEST'
                              ? 'bg-amber-500 border-amber-500 text-white shadow-md'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'
                          }`}
                        >
                          <WifiOff className="w-4 h-4" />
                          TEST Mode
                        </button>
                        <button
                          type="button"
                          onClick={() => setCcvSettings(s => ({ ...s, ccvEnvironment: 'LIVE' }))}
                          className={`flex-1 py-3 px-4 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2 ${
                            ccvSettings.ccvEnvironment === 'LIVE'
                              ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                          }`}
                        >
                          <Wifi className="w-4 h-4" />
                          LIVE Mode
                        </button>
                      </div>
                      {ccvSettings.ccvEnvironment === 'LIVE' && (
                        <div className="mt-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
                          <span className="text-rose-600 text-lg leading-none">⚠️</span>
                          <p className="text-xs text-rose-700 font-medium">LIVE mode — real card transactions will be processed. Ensure certification is complete before enabling.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live API Key */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50/60 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-emerald-700" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">Live API Key</h3>
                        <p className="text-xs text-slate-500">From CCV back-office → Technical Settings (starts with <code className="bg-slate-100 px-1 rounded">l_</code>)</p>
                      </div>
                      {ccvSettings.ccvApiKeyLive && (
                        <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Configured
                        </span>
                      )}
                    </div>
                    <div className="p-6">
                      <div className="relative">
                        <input
                          type={showLiveKey ? 'text' : 'password'}
                          value={ccvSettings.ccvApiKeyLive}
                          onChange={(e) => setCcvSettings(s => ({ ...s, ccvApiKeyLive: e.target.value }))}
                          className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 outline-none transition-colors font-mono text-sm"
                          placeholder="l_xxxxxxxxxxxxxxxxxxxxxxxx"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLiveKey(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                        >
                          {showLiveKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Test API Key */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-amber-50/60 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-amber-700" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">Test API Key</h3>
                        <p className="text-xs text-slate-500">Sandbox key for development (starts with <code className="bg-slate-100 px-1 rounded">t_</code>)</p>
                      </div>
                      {ccvSettings.ccvApiKeyTest && (
                        <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Configured
                        </span>
                      )}
                    </div>
                    <div className="p-6">
                      <div className="relative">
                        <input
                          type={showTestKey ? 'text' : 'password'}
                          value={ccvSettings.ccvApiKeyTest}
                          onChange={(e) => setCcvSettings(s => ({ ...s, ccvApiKeyTest: e.target.value }))}
                          className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors font-mono text-sm"
                          placeholder="t_xxxxxxxxxxxxxxxxxxxxxxxx"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTestKey(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                        >
                          {showTestKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Management System ID */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80">
                      <h3 className="font-bold text-slate-900">Management System ID</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Identifies your terminal region to CCV. Belgium = GrundmasterBE.</p>
                    </div>
                    <div className="p-6">
                      <div className="flex gap-2">
                        {(['GrundmasterBE', 'GrundmasterNL', 'GrundmasterNL-ThirdPartyTest'] as const).map(id => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setCcvSettings(s => ({ ...s, ccvManagementSystemId: id }))}
                            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border-2 transition-all ${
                              ccvSettings.ccvManagementSystemId === id
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                            }`}
                          >
                            {id === 'GrundmasterBE' ? '🇧🇪 BE' : id === 'GrundmasterNL' ? '🇳🇱 NL' : '🧪 Test'}
                            <span className="block text-[9px] mt-0.5 opacity-70 font-mono truncate">{id}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Backend / Webhook URL */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80">
                      <h3 className="font-bold text-slate-900">Backend Base URL</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Your deployed Next.js app URL. Used to build the webhook endpoint and returnUrl for CCV.</p>
                    </div>
                    <div className="p-6 space-y-3">
                      <input
                        type="url"
                        value={ccvSettings.ccvBackendUrl}
                        onChange={(e) => setCcvSettings(s => ({ ...s, ccvBackendUrl: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 outline-none transition-colors font-mono text-sm"
                        placeholder="https://app.mrcod.be"
                      />
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Webhook URL (register in CCV portal)</p>
                        <code className="text-xs text-emerald-700 font-mono break-all">
                          {(ccvSettings.ccvBackendUrl || 'https://app.mrcod.be').replace(/\/$/, '')}/api/ccv/webhook
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Info box */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
                    <h4 className="font-bold text-slate-800 mb-2 text-sm">📋 How to get your CCV API Keys</h4>
                    <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
                      <li>Log in to your CCV merchant back-office at <span className="font-mono bg-white px-1 rounded border border-slate-200">myccv.eu</span></li>
                      <li>Navigate to <strong>Configuration → Technical Information</strong></li>
                      <li>Copy the <strong>Live Key</strong> (<code>l_...</code>) and <strong>Test Key</strong> (<code>t_...</code>)</li>
                      <li>Paste them above and click Save</li>
                      <li>Each kiosk terminal ID is configured separately in the <strong>Kiosks</strong> section</li>
                    </ol>
                  </div>

                  {/* Save button */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveCcv}
                      disabled={isSavingCcv}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed min-w-[160px] justify-center"
                    >
                      {isSavingCcv ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : ccvSaveSuccess ? (
                        <><Check className="w-4 h-4" /> Saved!</>
                      ) : (
                        <><Save className="w-4 h-4" /> Save CCV Settings</>
                      )}
                    </button>
                  </div>

                </div>
              )}

              {activeTab === 'hours' && (
                <div className="space-y-6 max-w-3xl">
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-[120px_1fr_1fr_60px_80px_40px] sm:grid-cols-[140px_1fr_1fr_60px_100px_50px] gap-4 p-4 bg-slate-50 border-b border-slate-200 font-bold text-sm text-slate-700">
                      <div>Day</div>
                      <div>Opening Time</div>
                      <div>Closing Time</div>
                      <div className="text-center">24H</div>
                      <div className="text-center">Status</div>
                      <div className="text-center">All</div>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {storeHours.map((schedule, index) => (
                        <li key={schedule.day} className="grid grid-cols-[120px_1fr_1fr_60px_80px_40px] sm:grid-cols-[140px_1fr_1fr_60px_100px_50px] gap-4 p-4 items-center hover:bg-slate-50 transition-colors">
                          <div className="font-bold text-slate-900">{schedule.day}</div>
                          
                          <div>
                            <input
                              type="time"
                              value={schedule.open}
                              onChange={(e) => handleUpdateHour(index, 'open', e.target.value)}
                              disabled={!schedule.isOpen || schedule.is24Hours}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>
                          
                          <div>
                            <input
                              type="time"
                              value={schedule.close}
                              onChange={(e) => handleUpdateHour(index, 'close', e.target.value)}
                              disabled={!schedule.isOpen || schedule.is24Hours}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>
                          
                          <div className="flex justify-center flex-col items-center gap-1">
                            <input 
                              type="checkbox" 
                              checked={schedule.is24Hours || false} 
                              onChange={(e) => handleUpdateHour(index, 'is24Hours', e.target.checked)} 
                              className="w-5 h-5 accent-amber-500 rounded cursor-pointer" 
                              disabled={!schedule.isOpen}
                            />
                          </div>
                          
                          <div className="flex justify-center">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={schedule.isOpen}
                                onChange={(e) => handleUpdateHour(index, 'isOpen', e.target.checked)}
                              />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                            </label>
                          </div>

                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => handleApplyToAll(index)}
                              title="Apply these hours to all days"
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'holidays' && (
                <div className="space-y-8 max-w-3xl">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Add Special Closure or Holiday</h3>
                    <form onSubmit={handleAddHoliday} className="flex flex-col sm:flex-row gap-4 items-end">
                      <div className="flex-1 w-full">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Date</label>
                        <input
                          type="date"
                          required
                          value={newHolidayDate}
                          onChange={(e) => setNewHolidayDate(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                        />
                      </div>
                      <div className="flex-[2] w-full">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Note (e.g., &apos;Closed for public holiday&apos;)</label>
                        <input
                          type="text"
                          required
                          value={newHolidayNote}
                          onChange={(e) => setNewHolidayNote(e.target.value)}
                          placeholder="Special hours: 11 AM - 5 PM"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-amber-500 outline-none transition-colors"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-sm"
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        Add
                      </button>
                    </form>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Upcoming Holidays & Closures</h3>
                    {holidays.length === 0 ? (
                      <div className="text-center py-8 bg-white rounded-2xl border border-slate-100 border-dashed">
                        <CalendarOff className="mx-auto h-8 w-8 text-slate-300 mb-3" />
                        <p className="text-slate-500">No special closures configured.</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <ul className="divide-y divide-slate-100">
                          {holidays.map((holiday) => (
                            <li key={holiday.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                              <div>
                                <div className="font-bold text-slate-900 text-lg mb-1">
                                  {new Date(holiday.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </div>
                                <div className="text-slate-600 font-medium flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                  {holiday.note}
                                </div>
                              </div>
                              <button
                                onClick={() => handleRemoveHoliday(holiday.id)}
                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors self-start sm:self-auto"
                                title="Remove holiday"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
