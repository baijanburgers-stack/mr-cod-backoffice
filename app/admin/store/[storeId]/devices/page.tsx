'use client';

import { useState, use, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tablet, Plus, Trash2, ShieldCheck, AlertTriangle, KeyRound, Mail } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot, deleteDoc, doc, getDoc
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

interface DeviceLogin {
  id: string;
  name: string;
  email: string;
  storeId: string;
  role: string;
  status: string;
  createdAt: any;
  lastLogin?: string;
}

export default function DevicesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [devices, setDevices] = useState<DeviceLogin[]>([]);
  const [maxDevices, setMaxDevices] = useState(10);
  const [isLoading, setIsLoading] = useState(true);

  // Create form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Delete modal
  const [deviceToDelete, setDeviceToDelete] = useState<DeviceLogin | null>(null);

  useEffect(() => {
    // Load max limit (optional, can be expanded later)
    getDoc(doc(db, 'stores', storeId)).then(snap => {
      if (snap.exists()) setMaxDevices(snap.data().maxKdsDevices ?? 10);
    });

    // Live device subscription
    const q = query(
      collection(db, 'users'), 
      where('storeId', '==', storeId),
      where('role', '==', 'kds')
    );
    
    const unsub = onSnapshot(q,
      (snap) => {
        const list = snap.docs.map(d => ({
          id: d.id,
          name: d.data().name || '',
          email: d.data().email || '',
          storeId: d.data().storeId || '',
          role: d.data().role || 'kds',
          status: d.data().status || 'Active',
          lastLogin: d.data().lastLogin || 'Never',
          createdAt: d.data().createdAt || null,
        })) as DeviceLogin[];

        list.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
             const aTime = a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
             const bTime = b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
             return bTime - aTime;
          }
          return 0;
        });

        setDevices(list);
        setIsLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'users(kds)');
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [storeId, user]);

  const atLimit = devices.length >= maxDevices;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim() || atLimit) return;
    
    if (newPassword.length < 6) {
      setCreateError('Password must be at least 6 characters long.');
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      const response = await fetch('/api/admin/create-device-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          name: newName.trim(),
          role: 'kds',
          storeId: storeId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create device login');
      }

      setNewName('');
      setNewEmail('');
      setNewPassword('');
    } catch (err: any) {
      setCreateError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deviceToDelete) return;
    try {
      // By deleting the user document, the tablet app StoreResolver will fail 
      // and reject the login, effectively revoking access immediately.
      await deleteDoc(doc(db, 'users', deviceToDelete.id));
      setDeviceToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${deviceToDelete.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">Live Order Devices</h1>
          <p className="mt-2 text-slate-500 font-medium">
            Manage tablet and TV display logins for this store.
            <span className={`ml-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
              atLimit ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {devices.length} / {maxDevices} devices
            </span>
          </p>
        </div>
      </div>

      {atLimit && (
        <div className="mb-6 flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700 font-medium">
            You&apos;ve reached the maximum of <strong>{maxDevices} Live Order devices</strong> for this store.
            Contact your super admin to increase the limit.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Create Form */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-50 rounded-full blur-2xl pointer-events-none" />

            <h2 className="text-xl font-heading font-black text-slate-900 flex items-center gap-2 mb-6">
              <Tablet className="w-5 h-5 text-amber-500" />
              New Device Login
            </h2>

            {atLimit ? (
              <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                <p className="text-sm text-rose-800 font-medium flex items-start gap-2">
                  <ShieldCheck className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <span>Limit of <strong>{maxDevices}</strong> devices reached.</span>
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="p-3 bg-rose-50 text-rose-600 text-sm font-bold rounded-xl border border-rose-100">
                    {createError}
                  </div>
                )}
                
                {/* Device Name */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Device Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kitchen Tablet 1"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all font-medium"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Login Email</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. kitchen1@mrcod.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all font-medium"
                  />
                </div>
                
                {/* Password */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Login Password</label>
                  <input
                    type="text"
                    required
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">We recommend a simple pin like &quot;123456&quot; for ease of use on tablets.</p>
                </div>

                <button
                  type="submit"
                  disabled={isCreating || !newName.trim() || !newEmail.trim() || !newPassword.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-3 rounded-xl font-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-amber-500/20 mt-6"
                >
                  {isCreating ? (
                    <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                  ) : (
                    <><Plus className="w-5 h-5" /> Create Login</>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Device Cards */}
        <div className="lg:col-span-2">
          {devices.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <Tablet className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Devices Configured</h3>
              <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                Create a login credentials above so your kitchen tablets and TV screens can log in to this store.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {devices.map(device => (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden group"
                >
                  {/* Card header */}
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                        <Tablet className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{device.name}</div>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {device.status}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDeviceToDelete(device)}
                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Revoke Access"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Email */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        LOGIN EMAIL
                      </p>
                      <div className="font-mono text-sm font-bold text-slate-900 break-all select-all">
                        {device.email}
                      </div>
                    </div>

                    {/* Last Login */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        LAST ACTIVE
                      </p>
                      <div className="text-sm font-medium text-slate-700">
                        {device.lastLogin}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deviceToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-rose-600" />
              </div>
              <h2 className="text-xl font-heading font-black text-slate-900 mb-2">Revoke Access?</h2>
              <p className="text-slate-500 mb-6 text-sm">
                <strong className="text-slate-900">{deviceToDelete.name}</strong> will be permanently revoked.
                If they are currently logged in, they will be kicked out.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeviceToDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                >
                  Revoke Access
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
