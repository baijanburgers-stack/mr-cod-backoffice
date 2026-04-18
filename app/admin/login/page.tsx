'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Globe, ArrowLeft, Shield, Store, Clock } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'motion/react';
import { auth, db } from '@/lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';

export default function AdminLoginPage() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log('User signed in:', user.email, user.uid);

      // 1. Try to get user by UID
      let userDoc = await getDoc(doc(db, 'users', user.uid));
      let userData = userDoc.data();

      // Check for pre-provisioned account data under email
      const emailToCheck = user.email?.toLowerCase();
      let preProvisionedData = null;
      let preProvisionedDocId = null;

      if (emailToCheck) {
        const emailDoc = await getDoc(doc(db, 'users', emailToCheck));
        if (emailDoc.exists()) {
          preProvisionedData = emailDoc.data();
          preProvisionedDocId = emailToCheck;
        } else {
          // Check by query just in case it was saved with different ID format
          const q = query(collection(db, 'users'), where('email', '==', user.email));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            preProvisionedData = querySnapshot.docs[0].data();
            preProvisionedDocId = querySnapshot.docs[0].id;
          }
        }
      }

      // Merge provisioned admin data into UID if necessary
      if (preProvisionedData && (['admin', 'store_admin', 'delivery', 'manager'].includes(preProvisionedData.role))) {
        const mergedData = { ...userData, ...preProvisionedData, uid: user.uid, lastLogin: new Date().toISOString() };
        await setDoc(doc(db, 'users', user.uid), mergedData, { merge: true });
        
        // Clean up the temporary email-based doc if we're migrating it
        if (preProvisionedDocId && preProvisionedDocId !== user.uid) {
          try {
            await deleteDoc(doc(db, 'users', preProvisionedDocId));
          } catch(e) {}
        }
        userData = mergedData;
      }

      if (userData) {
        // If we found them by UID natively, just update last login
        if (!preProvisionedData) {
          try {
            await updateDoc(doc(db, 'users', user.uid), {
              lastLogin: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Could not update lastLogin for user doc:', e);
          }
        }
      } else {
        // Auto-provision Super Admin
        if (user.email === 'yasirmahmood158@gmail.com' || user.email === 'baijanburgers@gmail.com') {
          console.log('Auto-provisioning Super Admin:', user.email);
          userData = {
            email: user.email,
            role: 'admin',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          };
          try {
            await setDoc(doc(db, 'users', user.uid), userData);
            console.log('Super Admin provisioned successfully!');
          } catch(e) {
            console.error('Failed to provision super admin:', e);
          }
        }
      }

      // 4. Check permissions
      console.log('Checking permissions for role:', userData?.role, 'Store ID:', userData?.storeId);
      
      const role = userData?.role;
      const isAutoAdmin = user.email === 'baijanburgers@gmail.com' || user.email === 'yasirmahmood158@gmail.com';
      const finalRole = isAutoAdmin ? 'admin' : role;
      
      if (['admin', 'store_admin', 'manager'].includes(finalRole)) {
        setLoggedInUser({
          ...userData,
          role: finalRole
        });
        
        const searchParams = new URLSearchParams(window.location.search);
        const requestedPortal = searchParams.get('portal');
        
        if (requestedPortal === 'super_admin' && finalRole === 'admin') {
          router.push('/admin/super');
          return;
        }
        
        if (requestedPortal === 'store_admin' && (finalRole === 'store_admin' || finalRole === 'admin') && userData?.storeId) {
          router.push(`/admin/store/${userData.storeId}`);
          return;
        }

        if (finalRole === 'manager' && userData?.storeId) {
          router.push(`/manager/store/${userData.storeId}/history`);
          return;
        }

        setShowRoleSelection(true);
      } else {
        console.log('No admin access');
        setError('You do not have staff/admin access.');
        await auth.signOut();
      }
    } catch (err: any) {
      const isCancellation = err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request';
      if (!isCancellation) {
        console.error('Login error:', err);
      }
      
      if (isCancellation) {
        setError('Login cancelled.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Your browser blocked the Google Login popup. Please click "Allow popups" in your address bar.');
      } else if (err.code === 'permission-denied') {
        setError('Access denied. Your account may not be fully set up yet or you lack permissions for this store.');
      } else {
        setError(err.message || 'Failed to sign in');
      }
    } finally {
      setIsLoading(false);
    }
  };



  if (showRoleSelection && loggedInUser) {
    return (
      <div className="min-h-[calc(100vh-16rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-3xl shadow-xl border border-slate-100">
             <div>
               <h2 className="text-3xl font-black text-center text-slate-900 mb-2">Welcome Back!</h2>
               <p className="text-center text-slate-500 font-medium mb-8">How would you like to continue today?</p>
             </div>

             <div className="space-y-4">
                {loggedInUser.role === 'admin' && (
                  <button onClick={() => router.push('/admin/super')} className="w-full flex items-center justify-between p-5 border-2 border-slate-100 rounded-2xl hover:border-red-600 hover:bg-red-50 transition-all font-black text-slate-700 hover:text-red-700 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                        <Shield className="w-6 h-6 text-red-600" />
                      </div>
                      <span className="text-lg">Super Admin Portal</span>
                    </div>
                  </button>
                )}

                {['store_admin', 'admin'].includes(loggedInUser.role) && loggedInUser.storeId && (
                  <button onClick={() => router.push(`/admin/store/${loggedInUser.storeId}`)} className="w-full flex items-center justify-between p-5 border-2 border-slate-100 rounded-2xl hover:border-orange-500 hover:bg-orange-50 transition-all font-black text-slate-700 hover:text-orange-600 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                        <Store className="w-6 h-6 text-orange-600" />
                      </div>
                      <span className="text-lg">Store Admin Portal</span>
                    </div>
                  </button>
                )}

                {['delivery', 'store_admin', 'admin'].includes(loggedInUser.role) && loggedInUser.storeId && (
                  <button onClick={() => router.push('/delivery')} className="w-full flex items-center justify-between p-5 border-2 border-slate-100 rounded-2xl hover:border-red-600 hover:bg-red-50 transition-all font-black text-slate-700 hover:text-red-700 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                        <Store className="w-6 h-6 text-red-600" />
                      </div>
                      <span className="text-lg">Delivery Dashboard</span>
                    </div>
                  </button>
                )}

                {['manager', 'store_admin', 'admin'].includes(loggedInUser.role) && loggedInUser.storeId && (
                  <button onClick={() => router.push(`/manager/store/${loggedInUser.storeId}/orders`)} className="w-full flex items-center justify-between p-5 border-2 border-slate-100 rounded-2xl hover:border-orange-500 hover:bg-orange-50 transition-all font-black text-slate-700 hover:text-orange-600 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                        <Clock className="w-6 h-6 text-orange-600" />
                      </div>
                      <span className="text-lg">Shift Manager</span>
                    </div>
                  </button>
                )}

                {loggedInUser.role === 'store_admin' && !loggedInUser.storeId && (
                  <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl font-bold text-sm text-center border border-rose-100">
                    Your account is missing a Store Assignment. Contact your administrator.
                  </div>
                )}
             </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#FAF9F6] overflow-hidden text-slate-900">
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0">
        <Image
          src="https://picsum.photos/seed/restaurant_ambience/1920/1080"
          alt="Restaurant Ambience"
          fill
          className="object-cover opacity-60 scale-105 blur-sm brightness-110"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#FAF9F6] via-[#FAF9F6]/90 to-[#FAF9F6]/60" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="text-center mb-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex flex-col items-center gap-1 mb-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-md mb-4 border border-slate-100">
              <span className="font-heading font-black text-2xl text-slate-900">
                MR<span className="text-red-600 font-brand">COD</span>
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black font-heading tracking-tight text-slate-900 mb-2">
              Staff Portal
            </h1>
            <p className="text-slate-600 font-medium max-w-sm mx-auto">
              Securely authenticate to access your dedicated management dashboard.
            </p>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative p-8 sm:p-10 rounded-3xl bg-white/80 backdrop-blur-2xl border border-slate-200 shadow-xl flex flex-col"
        >
          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400">
              <span className="text-sm font-bold">{error}</span>
            </div>
          )}

          <div className="space-y-6">
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="group relative w-full flex items-center justify-center gap-3 py-4 px-6 border-0 text-base font-black rounded-2xl text-slate-900 bg-white hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-white/20 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
              {isLoading ? 'Authenticating...' : 'Sign in with Google'}
            </button>
          </div>


        </motion.div>
      </div>
    </div>
  );
}
