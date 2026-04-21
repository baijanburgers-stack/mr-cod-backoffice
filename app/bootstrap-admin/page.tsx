'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Shield, CheckCircle2, AlertCircle } from 'lucide-react';

// ── ONE-TIME BOOTSTRAP PAGE ───────────────────────────────────────────────────
// DELETE THIS FILE after the first super admin is created.
// Access: http://localhost:3000/bootstrap-admin
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_UID   = 'PeXghivZSYSkd0B4YbHmnRl7ZRm1';
const TARGET_EMAIL = 'baijanburger@gmail.com';
const SECRET       = 'baijan-bootstrap-2024'; // change if you want

export default function BootstrapAdminPage() {
  const [secret, setSecret]     = useState('');
  const [status, setStatus]     = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage]   = useState('');

  const handleCreate = async () => {
    if (secret !== SECRET) {
      setStatus('error');
      setMessage('Wrong secret key.');
      return;
    }

    setStatus('loading');
    try {
      // Check if already exists
      const existing = await getDoc(doc(db, 'users', TARGET_UID));
      if (existing.exists()) {
        setStatus('success');
        setMessage(`Super admin already exists (role: ${existing.data().role}). Nothing to do.`);
        return;
      }

      await setDoc(doc(db, 'users', TARGET_UID), {
        uid:       TARGET_UID,
        email:     TARGET_EMAIL,
        name:      'Baijan Burger Owner',
        role:      'super_admin',
        status:    'Active',
        createdAt: new Date().toISOString(),
      });

      setStatus('success');
      setMessage(`✅ Super admin created! Now go to /admin/login and sign in with ${TARGET_EMAIL}. DELETE this file after done.`);
    } catch (err: any) {
      setStatus('error');
      setMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-8">

        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Shield className="w-8 h-8 text-amber-600" />
        </div>

        <h1 className="text-2xl font-black text-slate-900 text-center mb-1">Bootstrap Super Admin</h1>
        <p className="text-slate-500 text-sm text-center mb-6">One-time setup only. Delete this file after use.</p>

        <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-sm font-mono space-y-1 border border-slate-200">
          <p><span className="text-slate-400">UID:</span>   <span className="text-slate-800">{TARGET_UID}</span></p>
          <p><span className="text-slate-400">Email:</span> <span className="text-slate-800">{TARGET_EMAIL}</span></p>
          <p><span className="text-slate-400">Role:</span>  <span className="text-amber-600 font-black">super_admin</span></p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Enter Bootstrap Secret</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Enter secret key..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:outline-none font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">Secret: <code className="bg-slate-100 px-1 rounded">baijan-bootstrap-2024</code></p>
          </div>

          <button
            onClick={handleCreate}
            disabled={status === 'loading' || status === 'success'}
            className="w-full py-3 bg-amber-500 text-slate-900 font-black rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? 'Creating…' : 'Create Super Admin'}
          </button>
        </div>

        {status === 'success' && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex gap-3 items-start">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-emerald-800">{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-rose-800">{message}</p>
          </div>
        )}

        <div className="mt-6 p-3 bg-rose-50 border border-rose-200 rounded-xl">
          <p className="text-xs font-bold text-rose-700 text-center">
            ⚠️ DELETE this file from your project after the super admin is created!
          </p>
        </div>
      </div>
    </div>
  );
}
