'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, CheckCircle, Package, AlertTriangle, ArrowRight } from 'lucide-react';

interface FullscreenOrderAlertProps {
  orderNumber?: string;
  customerName?: string;
  title: string;
  subtitle?: string;
  onAccept: () => void;
  type?: 'restaurant' | 'driver';
  buttonText?: string;
}

export default function FullscreenOrderAlert({ 
  orderNumber,
  customerName,
  title, 
  subtitle,
  onAccept,
  type = 'restaurant',
  buttonText
}: FullscreenOrderAlertProps) {
  
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // Attempt rapid looping play
    if (audioRef.current) {
       audioRef.current.volume = 1.0;
       audioRef.current.play().catch(e => console.log('Audio autoplay blocked', e));
    }

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 1000]);
      const vInterval = setInterval(() => {
         navigator.vibrate([500, 200, 500]);
      }, 4000);
      return () => clearInterval(vInterval);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.2 }}
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center p-6 backdrop-blur-2xl ${type === 'restaurant' ? 'bg-emerald-600' : 'bg-amber-600'}`}
    >
      <audio ref={audioRef} src="/sounds/register.mp3" loop />
      
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="absolute inset-0 opacity-20 pointer-events-none"
      >
        <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent opacity-50" />
      </motion.div>

      <div className="relative z-10 text-center flex flex-col items-center text-white max-w-lg w-full">
        <motion.div 
           animate={{ rotate: [-5, 5, -5] }}
           transition={{ repeat: Infinity, duration: 0.5 }}
           className="bg-white text-slate-900 p-6 rounded-full shadow-2xl mb-8"
        >
          {type === 'restaurant' ? <Bell className="w-20 h-20 text-emerald-600" /> : <AlertTriangle className="w-20 h-20 text-amber-600 border-b-0" />}
        </motion.div>
        
        <h1 className="text-5xl sm:text-6xl font-black mb-4 tracking-tight drop-shadow-lg text-center uppercase leading-none">
          {title}
        </h1>
        
        {subtitle && <p className="text-2xl font-bold mb-8 text-white/90">{subtitle}</p>}
        
        {orderNumber && (
          <div className="bg-black/20 rounded-3xl p-8 mb-12 w-full backdrop-blur-md border border-white/20 shadow-xl">
            <p className="text-white/80 font-bold uppercase tracking-widest text-sm mb-2">Order Number</p>
            <p className="text-6xl font-black tracking-wider shadow-sm">{orderNumber}</p>
            {customerName && <p className="text-2xl font-bold mt-4 text-white/90">{customerName}</p>}
          </div>
        )}
        
        <button
          onClick={() => {
            if (audioRef.current) {
               audioRef.current.pause();
               audioRef.current.currentTime = 0;
            }
            onAccept();
          }}
          className={`w-full py-6 sm:py-8 bg-white text-slate-900 rounded-[32px] text-2xl sm:text-3xl font-black uppercase tracking-wide hover:scale-105 active:scale-95 transition-all shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-center gap-4 group ${type === 'restaurant' ? 'hover:bg-emerald-50' : 'hover:bg-amber-50'}`}
        >
          {buttonText ? (
            <ArrowRight className={`w-10 h-10 transition-colors ${type === 'restaurant' ? 'group-hover:text-emerald-500' : 'group-hover:text-amber-500'}`} />
          ) : (
            <CheckCircle className={`w-10 h-10 transition-colors ${type === 'restaurant' ? 'group-hover:text-emerald-500' : 'group-hover:text-amber-500'}`} />
          )}
          {buttonText || 'Tap to Accept'}
        </button>
      </div>
    </motion.div>
  );
}
