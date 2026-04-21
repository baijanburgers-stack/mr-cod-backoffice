'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Store, Clock, ArrowLeft, ChevronRight, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'motion/react';
import { auth, db } from '@/lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';

const LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/mr-cod-online-ordering.firebasestorage.app/o/logo%20mr%20cod.png?alt=media&token=9ecf39cd-567f-437a-b395-6ffd949f7f1e';

const PORTAL_META: Record<string, { label: string; badge: string; icon: any; color: string }> = {
  super_admin: { label: 'Super Admin',    badge: 'Full Access',  icon: Shield, color: 'text-purple-600' },
  store_admin: { label: 'Store Admin',    badge: 'Store Level',  icon: Store,  color: 'text-blue-600'   },
  manager:     { label: 'Shift Manager',  badge: 'Operations',   icon: Clock,  color: 'text-emerald-600'},
};

export default function AdminLoginPage() {
  const [error, setError]                       = useState('');
  const [isLoading, setIsLoading]               = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [loggedInUser, setLoggedInUser]         = useState<any>(null);
  // Read ?portal= only on the client to avoid SSR/client hydration mismatch
  const [portalParam, setPortalParam]           = useState('store_admin');
  const router = useRouter();

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('portal') ?? 'store_admin';
    setPortalParam(param);
  }, []);

  const portalMeta = PORTAL_META[portalParam] ?? PORTAL_META['store_admin'];
  const PortalIcon = portalMeta.icon;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user   = result.user;

      // ── BOOTSTRAP: one-time super admin provisioning ──────────────────────
      const BOOTSTRAP_UID   = '9BWz4cewy7Qi0KmJefN0buJ5CfB3';
      const BOOTSTRAP_EMAIL = 'baijanburgers@gmail.com';
      if (user.uid === BOOTSTRAP_UID && user.email === BOOTSTRAP_EMAIL) {
        const bootstrapData = {
          uid: BOOTSTRAP_UID, email: BOOTSTRAP_EMAIL,
          name: 'Baijan Burger Owner', role: 'super_admin',
          storeId: 'R747GssH3XxH5m6wOt1j',
          status: 'Active', createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(),
        };
        try { await setDoc(doc(db, 'users', BOOTSTRAP_UID), bootstrapData, { merge: true }); } catch {}
        router.push('/admin/super');
        return;
      }
      // ── END BOOTSTRAP ─────────────────────────────────────────────────────

      // ── Firestore role lookup: UID first, then email fallback ─────────────
      let userDoc = await getDoc(doc(db, 'users', user.uid));

      if (!userDoc.exists() && user.email) {
        const emailDoc = await getDoc(doc(db, 'users', user.email.toLowerCase()));
        if (emailDoc.exists()) {
          try {
            const migrated = { ...emailDoc.data(), uid: user.uid, lastLogin: new Date().toISOString() };
            await setDoc(doc(db, 'users', user.uid), migrated, { merge: true });
            try { await deleteDoc(doc(db, 'users', user.email.toLowerCase())); } catch {}
            userDoc = await getDoc(doc(db, 'users', user.uid));
          } catch { userDoc = emailDoc; }
        }
      }

      if (!userDoc.exists()) {
        setError('Access denied. Your account has not been granted access. Contact the Super Admin.');
        await auth.signOut();
        return;
      }

      const userData = userDoc.data();
      const role     = userData?.role;

      if (!role || !['super_admin', 'admin', 'store_admin', 'manager'].includes(role)) {
        setError('Access denied. Your role does not permit admin access.');
        await auth.signOut();
        return;
      }

      try { await updateDoc(doc(db, 'users', user.uid), { lastLogin: new Date().toISOString() }); } catch {}

      setLoggedInUser({ ...userData, role });

      const storeId = Array.isArray(userData.storeIds) && userData.storeIds.length > 0
        ? userData.storeIds[0]
        : userData.storeId;

      if (role === 'super_admin' || role === 'admin') { router.push('/admin/super'); return; }
      if (role === 'store_admin' && storeId)           { router.push(`/admin/store/${storeId}`); return; }
      if (role === 'manager'     && storeId)           { router.push(`/manager/store/${storeId}/orders`); return; }

      setShowRoleSelection(true);

    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('Login cancelled.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Popup blocked. Please allow popups for this site and try again.');
      } else {
        setError(err.message || 'Failed to sign in.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Role selection fallback (edge case) ───────────────────────────────────
  if (showRoleSelection && loggedInUser) {
    const roleOptions = [
      { show: loggedInUser.role === 'super_admin' || loggedInUser.role === 'admin', label: 'Super Admin Portal', icon: Shield, action: () => router.push('/admin/super') },
      { show: ['store_admin', 'admin'].includes(loggedInUser.role) && loggedInUser.storeId, label: 'Store Admin Portal', icon: Store, action: () => router.push(`/admin/store/${loggedInUser.storeId}`) },
      { show: ['manager', 'store_admin', 'admin'].includes(loggedInUser.role) && loggedInUser.storeId, label: 'Shift Manager', icon: Clock, action: () => router.push(`/manager/store/${loggedInUser.storeId}/orders`) },
    ].filter(o => o.show);

    return (
      <div className="min-h-screen flex flex-col lg:flex-row bg-white">
        <BrandPanel subtitle="Welcome back" heading={<>Select your<br />destination</>} />
        <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-20 bg-white">
          <div className="max-w-lg w-full mx-auto lg:mx-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CC0000] mb-3">Authenticated</p>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Where would you like to go?</h2>
            <p className="text-slate-400 text-sm font-medium mb-8">Your account has multiple access levels.</p>
            <div className="space-y-3">
              {roleOptions.map((opt, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={opt.action}
                  className="group w-full flex items-center gap-5 p-5 rounded-2xl border-2 border-slate-100 bg-white hover:border-[#CC0000] hover:bg-red-50/30 transition-all duration-200 text-left"
                >
                  <div className="w-14 h-14 flex-shrink-0 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-[#CC0000] group-hover:border-[#CC0000] flex items-center justify-center transition-all duration-200">
                    <opt.icon className="w-6 h-6 text-slate-400 group-hover:text-white transition-colors" />
                  </div>
                  <span className="flex-1 font-black text-slate-900 group-hover:text-[#CC0000] transition-colors">{opt.label}</span>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#CC0000] transition-colors flex-shrink-0" />
                </motion.button>
              ))}
              {roleOptions.length === 0 && (
                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl font-bold text-sm text-center border border-rose-100">
                  Your account is missing a Store Assignment. Contact your administrator.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main login view ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">

      {/* Left brand panel */}
      <BrandPanel
        subtitle={portalMeta.badge}
        heading={<>Sign in to<br />{portalMeta.label}</>}
      />

      {/* Right sign-in panel */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-20 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-lg w-full mx-auto lg:mx-0"
        >
          {/* Back link */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-[#CC0000] transition-colors mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to portals
          </Link>

          {/* Role badge */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#CC0000] flex items-center justify-center">
              <PortalIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CC0000]">{portalMeta.badge}</p>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">{portalMeta.label}</h2>
            </div>
          </div>

          <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Welcome back</h1>
          <p className="text-slate-400 text-sm font-medium mb-8">
            Sign in with your Google account to access the management dashboard.
          </p>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl"
            >
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-rose-600">{error}</p>
            </motion.div>
          )}

          {/* Google Sign-in */}
          <form onSubmit={handleLogin}>
            <button
              type="submit"
              disabled={isLoading}
              className="group w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl border-2 border-slate-200 bg-white hover:border-[#CC0000] hover:bg-red-50/30 transition-all duration-200 font-black text-slate-900 shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-slate-300 border-t-[#CC0000] rounded-full animate-spin" />
              ) : (
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  className="w-5 h-5"
                />
              )}
              {isLoading ? 'Authenticating...' : 'Sign in with Google'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-300 font-medium">
            Protected by securely-bound internal networks.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

// ── Shared red brand panel ─────────────────────────────────────────────────
function BrandPanel({ subtitle, heading }: { subtitle: string; heading: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="relative lg:w-[420px] xl:w-[480px] flex-shrink-0 bg-[#CC0000] flex flex-col justify-between px-10 py-12 overflow-hidden"
    >
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/5" />
      <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-white/5" />
      <div className="absolute top-1/2 -translate-y-1/2 right-[-60px] w-40 h-40 rounded-full bg-white/10" />

      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-16">
          <div className="w-14 h-14 rounded-2xl bg-white/15 p-1.5 flex items-center justify-center backdrop-blur-sm flex-shrink-0 overflow-hidden">
            <Image src={LOGO_URL} alt="MR COD Logo" width={44} height={44} className="object-contain" />
          </div>
          <div>
            <p className="font-black text-white text-2xl leading-none tracking-tight">MR COD</p>
            <p className="text-white/60 text-xs font-bold uppercase tracking-[0.2em] mt-1">{subtitle}</p>
          </div>
        </div>

        <h2 className="text-4xl xl:text-5xl font-black text-white leading-[1.05] tracking-tight mb-5">
          {heading}
        </h2>
        <p className="text-white/60 text-base font-medium leading-relaxed max-w-xs">
          Use your authorised Google account to securely access the system.
        </p>
      </div>

      <div className="relative z-10">
        <div className="w-10 h-[2px] bg-white/30 mb-4" />
        <p className="text-white/40 text-xs font-semibold uppercase tracking-widest">
          Secure Management Platform
        </p>
      </div>
    </motion.div>
  );
}
