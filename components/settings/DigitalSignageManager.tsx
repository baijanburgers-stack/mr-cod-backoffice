'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { MonitorPlay, Trash2, Plus, Save, Settings } from 'lucide-react';

type TvProfile = {
  id: string;
  name: string;
  layoutRatio: number; // 0 to 100 (Menu width percentage)
  assignedCategories: string[];
  mediaPlaylist: string[];
  openHour: number;
  closeHour: number;
  orientation: 'landscape' | 'portrait';
};

export function DigitalSignageManager({ storeId }: { storeId: string }) {
  const [profiles, setProfiles] = useState<TvProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<TvProfile | null>(null);

  // Example categories - normally fetched from Firestore
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    if (!storeId) return;

    // Fetch Categories
    const fetchCats = async () => {
      const q = query(collection(db, 'categories'), where('storeId', '==', storeId));
      const catSnap = await getDocs(q);
      setCategories(catSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
    };
    fetchCats();

    // Listen to TV Profiles
    const unsubscribe = onSnapshot(collection(db, 'stores', storeId, 'tv_profiles'), (snap) => {
      setProfiles(snap.docs.map(d => ({ id: d.id, ...d.data() } as TvProfile)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [storeId]);

  const handleCreateProfile = () => {
    const newId = 'TV-' + Date.now();
    setEditingProfile({
      id: newId,
      name: 'New Screen Profile',
      layoutRatio: 70,
      assignedCategories: [],
      mediaPlaylist: [
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=1599&auto=format&fit=crop'
      ],
      openHour: 10,
      closeHour: 23,
      orientation: 'landscape',
    });
  };

  const handleSaveProfile = async () => {
    if (!editingProfile || !storeId) return;
    try {
      await setDoc(doc(db, 'stores', storeId, 'tv_profiles', editingProfile.id), editingProfile);
      setEditingProfile(null);
    } catch (e) {
      console.error("Failed to save TV profile", e);
      alert("Failed to save. Check permissions.");
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!storeId || !confirm("Are you sure you want to delete this TV Profile?")) return;
    await deleteDoc(doc(db, 'stores', storeId, 'tv_profiles', id));
  };

  return (
    <div className="mt-8 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-200">
            <MonitorPlay className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-heading font-black text-slate-900">
              Digital Signage Command Center
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Create and manage display profiles for your physical TV screens.
            </p>
          </div>
        </div>
        <button type="button" onClick={handleCreateProfile} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-sm min-w-[130px] justify-center">
          <Plus className="w-4 h-4" /> Add TV Profile
        </button>
      </div>
      
      <div className="p-8">
        {loading ? (
          <div className="text-center p-4 text-gray-500">Loading TV profiles...</div>
        ) : profiles.length === 0 && !editingProfile ? (
          <div className="text-center p-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
            <MonitorPlay className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No Screens Configured</h3>
            <p className="text-gray-500 text-sm mt-1">Create a profile to start managing your TV displays.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map(profile => (
              <div key={profile.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
                <div className="p-5 flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">{profile.name}</h4>
                    <span className="text-xs font-mono text-slate-400">{profile.id}</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingProfile(profile)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                      <Settings className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleDeleteProfile(profile.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="px-5 pb-5 space-y-2 text-sm text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Layout Split</span>
                    <span className="font-medium text-gray-900 dark:text-white">{profile.layoutRatio || 0}% Menu / {100 - (profile.layoutRatio || 0)}% Media</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Categories</span>
                    <span className="font-medium text-gray-900 dark:text-white">{profile.assignedCategories?.length || 0} selected</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Media Items</span>
                    <span className="font-medium text-gray-900 dark:text-white">{profile.mediaPlaylist?.length || 0} active</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Sleep Schedule</span>
                    <span className="font-medium text-gray-900 dark:text-white">{profile.closeHour || 0}:00 to {profile.openHour || 0}:00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Orientation</span>
                    <span className="font-medium text-gray-900 dark:text-white capitalize">{profile.orientation || 'landscape'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Editor Modal Overlay */}
        {editingProfile && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="text-lg font-heading font-black text-slate-900">Configure TV Profile</h3>
                <button type="button" onClick={() => setEditingProfile(null)} className="text-slate-400 hover:text-slate-600 text-xl p-2">&times;</button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 space-y-8">
                
                {/* General Settings */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">1. General Settings</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Profile Name</label>
                      <input 
                        type="text"
                        value={editingProfile.name} 
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingProfile({...editingProfile, name: e.target.value})}
                        placeholder="e.g., Drive-Thru Menu" 
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none transition-colors font-bold text-sm text-slate-900"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Wake Time (Hour)</label>
                        <input 
                          type="number" min="0" max="23"
                          value={editingProfile.openHour} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingProfile({...editingProfile, openHour: parseInt(e.target.value) || 0})} 
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none transition-colors font-mono text-sm font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sleep Time (Hour)</label>
                        <input 
                          type="number" min="0" max="23"
                          value={editingProfile.closeHour} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingProfile({...editingProfile, closeHour: parseInt(e.target.value) || 0})} 
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none transition-colors font-mono text-sm font-bold"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Screen Orientation</label>
                      <select
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none transition-colors font-bold text-sm text-slate-900"
                        value={editingProfile.orientation || 'landscape'}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditingProfile({...editingProfile, orientation: e.target.value as 'landscape' | 'portrait'})}
                      >
                        <option value="landscape">Landscape (Horizontal TV)</option>
                        <option value="portrait">Portrait (Vertical Kiosk TV)</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">The TV app will automatically rotate to match this setting.</p>
                    </div>
                  </div>
                </div>

                {/* Layout Slider */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">2. Layout Split</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium mb-2">
                      <span className="text-slate-700">Menu Width: {editingProfile.layoutRatio || 0}%</span>
                      <span className="text-slate-700">Media Width: {100 - (editingProfile.layoutRatio || 0)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" step="5"
                      value={editingProfile.layoutRatio || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingProfile({...editingProfile, layoutRatio: parseInt(e.target.value) || 0})}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">Set to 100% to hide media, or 0% to show only full-screen videos.</p>
                  </div>
                  
                  {/* Visualizer */}
                  <div className="h-16 w-full flex rounded-lg overflow-hidden border border-slate-200">
                    <div className="bg-slate-800 flex items-center justify-center text-white text-[10px] font-black tracking-widest" style={{ width: `${editingProfile.layoutRatio || 0}%` }}>
                      {(editingProfile.layoutRatio || 0) > 10 ? 'MENU ITEMS' : ''}
                    </div>
                    <div className="bg-amber-500 flex items-center justify-center text-white text-[10px] font-black tracking-widest" style={{ width: `${100 - (editingProfile.layoutRatio || 0)}%` }}>
                      {(editingProfile.layoutRatio || 0) < 90 ? 'PROMO MEDIA' : ''}
                    </div>
                  </div>
                </div>

                {/* Categories */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">3. Display Categories</h4>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl max-h-[200px] overflow-y-auto">
                    {categories.length === 0 ? <p className="text-sm text-slate-500">No categories found in store.</p> : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {categories.map(cat => {
                          const safeCats = Array.isArray(editingProfile.assignedCategories) ? editingProfile.assignedCategories : [];
                          const isSelected = safeCats.includes(cat.id);
                          return (
                            <label key={cat.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${isSelected ? 'border-amber-500 bg-amber-50/50' : 'border-transparent hover:bg-slate-100'}`}>
                              <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                  const newCats = e.target.checked 
                                    ? [...safeCats, cat.id]
                                    : safeCats.filter(id => id !== cat.id);
                                  setEditingProfile({...editingProfile, assignedCategories: newCats});
                                }}
                                className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4"
                              />
                              <span className="text-sm font-bold text-slate-700 truncate">{cat.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Media Playlist */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">4. Media Playlist (URLs)</h4>
                  <div className="space-y-3">
                    {(Array.isArray(editingProfile.mediaPlaylist) ? editingProfile.mediaPlaylist : []).map((url, i) => (
                      <div key={i} className="flex gap-2">
                        <input 
                          type="text"
                          value={url}
                          placeholder="Paste image or mp4 url here..."
                          className="flex-1 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none transition-colors text-sm font-medium text-slate-900"
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const newList = [...(Array.isArray(editingProfile.mediaPlaylist) ? editingProfile.mediaPlaylist : [])];
                            newList[i] = e.target.value;
                            setEditingProfile({...editingProfile, mediaPlaylist: newList});
                          }}
                        />
                        <button 
                          type="button"
                          className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors shrink-0"
                          onClick={() => {
                            const newList = [...(Array.isArray(editingProfile.mediaPlaylist) ? editingProfile.mediaPlaylist : [])];
                            newList.splice(i, 1);
                            setEditingProfile({...editingProfile, mediaPlaylist: newList});
                          }}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    <button 
                      type="button"
                      onClick={() => setEditingProfile({...editingProfile, mediaPlaylist: [...(Array.isArray(editingProfile.mediaPlaylist) ? editingProfile.mediaPlaylist : []), '']})}
                      className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 font-bold text-sm hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50/40 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add Media URL
                    </button>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingProfile(null)} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={handleSaveProfile} className="px-5 py-2.5 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save Profile
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
