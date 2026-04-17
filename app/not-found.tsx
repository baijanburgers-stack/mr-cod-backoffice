'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <h1 className="text-9xl font-black text-amber-500 mb-4">404</h1>
        <h2 className="text-3xl font-heading font-black text-slate-900 mb-4">Page Not Found</h2>
        <p className="text-slate-500 max-w-md mx-auto text-lg">
          Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <Link
          href="/"
          className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 transition-all shadow-lg hover:shadow-amber-200"
        >
          <Home className="mr-2 h-5 w-5" />
          Back to Home
        </Link>
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          Go Back
        </button>
      </motion.div>
    </div>
  );
}
