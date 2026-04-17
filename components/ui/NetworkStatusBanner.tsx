'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function NetworkStatusBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return;

    // Set initial state
    setIsOffline(!navigator.onLine);

    // Event listeners for connection changes
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed top-0 left-0 right-0 z-[100] bg-rose-600 text-white min-h-[40px] px-4 py-2 flex items-center justify-center shadow-lg shadow-rose-900/20 pointer-events-none"
        >
          <div className="flex items-center gap-3 font-black text-sm uppercase tracking-widest text-center">
            <WifiOff className="w-5 h-5 animate-pulse" />
            Network Disconnected - Reconnecting...
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
