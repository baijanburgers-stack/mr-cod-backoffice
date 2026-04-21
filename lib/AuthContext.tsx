'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

// ── Role types ──────────────────────────────────────────────────────────────
// Firestore users/{uid} document shape:
//   { role: 'super_admin' | 'store_admin', storeIds: string[] }
// Legacy: role: 'admin' is treated as 'super_admin' for backward compatibility.

export type UserRole = 'super_admin' | 'store_admin' | 'admin' | null;

interface AuthContextType {
  user:         User | null;
  loading:      boolean;
  /** Role from Firestore users/{uid}.role */
  role:         UserRole;
  /** True for super_admin or legacy 'admin' role */
  isSuperAdmin: boolean;
  /** Store IDs this user is authorized to manage (store_admin only) */
  storeIds:     string[];
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, role: null, isSuperAdmin: false, storeIds: [],
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,         setUser]         = useState<User | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [role,         setRole]         = useState<UserRole>(null);
  const [storeIds,     setStoreIds]     = useState<string[]>([]);

  useEffect(() => {
    let unsubscribe = () => {};

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          setUser(firebaseUser);

          if (firebaseUser) {
            try {
              const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
              if (userDoc.exists()) {
                const data = userDoc.data();
                const userRole = (data.role as UserRole) || null;
                setRole(userRole);

                // Normalise storeIds — support both storeId (string) and storeIds (array)
                const ids: string[] = Array.isArray(data.storeIds)
                  ? data.storeIds
                  : data.storeId
                    ? [data.storeId]
                    : [];
                setStoreIds(ids);
              } else {
                // User authenticated but no Firestore doc — treat as no role
                setRole(null);
                setStoreIds([]);
              }
            } catch {
              setRole(null);
              setStoreIds([]);
            }
          } else {
            setRole(null);
            setStoreIds([]);
          }

          setLoading(false);
        });
      })
      .catch(() => {
        setLoading(false);
      });

    return () => unsubscribe();
  }, []);

  const isSuperAdmin = role === 'super_admin' || role === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, role, isSuperAdmin, storeIds }}>
      {children}
    </AuthContext.Provider>
  );
}

