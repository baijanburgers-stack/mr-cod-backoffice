'use client';

import { useState, useEffect } from 'react';
import { Volume2, VolumeX, MousePointerClick } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function AudioUnlockOverlay() {
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    // If we've already stored interaction state in this session
    if (sessionStorage.getItem('audio_unlocked')) {
      setHasInteracted(true);
      return;
    }

    const handleInteraction = () => {
      // Play a short silent buffer to officially unlock the AudioContext on iOS/Chrome
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtx.resume();
      } catch (e) {}

      setHasInteracted(true);
      sessionStorage.setItem('audio_unlocked', 'true');
      
      // Cleanup
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  return (
    <AnimatePresence>
      {!hasInteracted && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-6 right-6 z-[100] bg-slate-900 border-2 border-amber-500 text-white p-4 rounded-2xl shadow-2xl shadow-amber-500/20 max-w-sm flex items-start gap-4 cursor-pointer hover:bg-slate-800 transition-colors"
          onClick={() => setHasInteracted(true)}
        >
          <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 text-amber-500">
            <VolumeX className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-lg text-amber-400 leading-tight mb-1">Enable Kitchen Sounds</h3>
            <p className="text-sm font-medium text-slate-300 leading-snug">
              Browsers block automatic notification sounds. <span className="text-white font-bold underline decoration-amber-500">Tap anywhere on the screen</span> to unlock incoming order alerts!
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
