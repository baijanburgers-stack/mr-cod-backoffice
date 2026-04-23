'use client';

import { useState, use, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, Plus, Trash2, KeyRound, ShieldCheck, CreditCard, AlertTriangle, X, Copy, Check } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, deleteDoc, doc, getDoc, updateDoc, getDocs
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import { useAuth } from '@/lib/AuthContext';

interface Terminal {
  id: string;
  name: string;
  pin: string;
  ccvTerminalId: string;
  storeId: string;
  status: string;
  createdAt: any;
}

export default function TerminalsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;
  const { user } = useAuth();

  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [maxTerminals, setMaxTerminals] = useState(5);
  const [isLoading, setIsLoading] = useState(true);

  // Create form
  const [newTerminalName, setNewTerminalName] = useState('');
  const [newCcvTerminalId, setNewCcvTerminalId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit CCV Terminal ID inline
  const [editingCcvId, setEditingCcvId] = useState<string | null>(null);
  const [editCcvValue, setEditCcvValue] = useState('');
  const [isSavingCcv, setIsSavingCcv] = useState(false);

  // Delete modal
  const [terminalToDelete, setTerminalToDelete] = useState<Terminal | null>(null);

  // PIN copy feedback
  const [copiedPin, setCopiedPin] = useState<string | null>(null);

  useEffect(() => {
    // Load max limit
    getDoc(doc(db, 'stores', storeId)).then(snap => {
      if (snap.exists()) setMaxTerminals(snap.data().maxPosTerminals ?? 5);
    });

    // Live terminal subscription
    const q = query(collection(db, 'terminals'), where('storeId', '==', storeId));
    const unsub = onSnapshot(q,
      (snap) => {
        const list = snap.docs.map(d => ({
          id: d.id,
          name: d.data().name || '',
          pin: d.data().pin || '',
          ccvTerminalId: d.data().ccvTerminalId || '',
          storeId: d.data().storeId || '',
          status: d.data().status || 'active',
          createdAt: d.data().createdAt || null,
        })) as Terminal[];

        list.sort((a, b) => {
          if (a.createdAt && b.createdAt) return b.createdAt.toMillis() - a.createdAt.toMillis();
          return 0;
        });

        setTerminals(list);
        setIsLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'terminals');
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [storeId, user]);

  const atLimit = terminals.length >= maxTerminals;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerminalName.trim() || atLimit) return;

    setIsCreating(true);
    try {
      let pin = '';
      let isUnique = false;
      
      // Ensure the generated PIN is globally unique
      while (!isUnique) {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
        const pinQuery = query(collection(db, 'terminals'), where('pin', '==', pin));
        const pinSnap = await getDocs(pinQuery);
        if (pinSnap.empty) {
          isUnique = true;
        }
      }

      await addDoc(collection(db, 'terminals'), {
        storeId,
        name: newTerminalName.trim(),
        pin,
        ccvTerminalId: newCcvTerminalId.trim(),
        status: 'active',
        createdAt: serverTimestamp(),
      });
      setNewTerminalName('');
      setNewCcvTerminalId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'terminals');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveCcv = async (terminalId: string) => {
    setIsSavingCcv(true);
    try {
      await updateDoc(doc(db, 'terminals', terminalId), {
        ccvTerminalId: editCcvValue.trim(),
      });
      setEditingCcvId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `terminals/${terminalId}`);
    } finally {
      setIsSavingCcv(false);
    }
  };

  const handleDelete = async () => {
    if (!terminalToDelete) return;
    try {
      await deleteDoc(doc(db, 'terminals', terminalToDelete.id));
      setTerminalToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `terminals/${terminalToDelete.id}`);
    }
  };

  const copyPin = (pin: string, id: string) => {
    navigator.clipboard.writeText(pin);
    setCopiedPin(id);
    setTimeout(() => setCopiedPin(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto min-h-screen">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black text-slate-900">POS Terminals</h1>
          <p className="mt-2 text-slate-500 font-medium">
            Manage access and payment configuration for in-store registers.
            <span className={`ml-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
              atLimit ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {terminals.length} / {maxTerminals} terminals
            </span>
          </p>
        </div>
      </div>

      {atLimit && (
        <div className="mb-6 flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700 font-medium">
            You&apos;ve reached the maximum of <strong>{maxTerminals} POS terminals</strong> for this store.
            Contact your super admin to increase the limit.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Create Form */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-50 rounded-full blur-2xl pointer-events-none" />

            <h2 className="text-xl font-heading font-black text-slate-900 flex items-center gap-2 mb-6">
              <Monitor className="w-5 h-5 text-red-600" />
              New Terminal
            </h2>

            {atLimit ? (
              <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                <p className="text-sm text-rose-800 font-medium flex items-start gap-2">
                  <ShieldCheck className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <span>
                    Limit of <strong>{maxTerminals}</strong> terminals reached.
                    Contact the Super Admin to increase this limit.
                  </span>
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                {/* Terminal Name */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Terminal Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. POS 1 — Counter"
                    value={newTerminalName}
                    onChange={e => setNewTerminalName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all font-medium"
                  />
                </div>

                {/* CCV Terminal ID */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">
                    CCV Terminal ID
                    <span className="text-slate-400 font-normal ml-1">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TRM-0010"
                    value={newCcvTerminalId}
                    onChange={e => setNewCcvTerminalId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-slate-400 mt-1">From CCV back-office → Terminals list. Can be set later.</p>
                </div>

                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                  <p className="text-xs text-amber-800 font-medium flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>A secure, random 6-digit PIN will be generated automatically for POS app login.</span>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isCreating || !newTerminalName.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-600/20"
                >
                  {isCreating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Plus className="w-5 h-5" /> Generate PIN & Create</>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Terminal Cards */}
        <div className="lg:col-span-2">
          {terminals.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <Monitor className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Terminals Yet</h3>
              <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                Create a terminal to generate a secure PIN and connect your POS register.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {terminals.map(terminal => (
                <motion.div
                  key={terminal.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden group"
                >
                  {/* Card header */}
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                        <Monitor className="w-4 h-4 text-red-600" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{terminal.name}</div>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setTerminalToDelete(terminal)}
                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Revoke Terminal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* PIN */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        POS LOGIN PIN
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-2xl font-black text-slate-900 tracking-widest select-all">
                          {terminal.pin?.slice(0, 3)} {terminal.pin?.slice(3, 6)}
                        </span>
                        <button
                          onClick={() => copyPin(terminal.pin, terminal.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 transition-all"
                          title="Copy PIN"
                        >
                          {copiedPin === terminal.id
                            ? <Check className="w-4 h-4 text-emerald-500" />
                            : <Copy className="w-4 h-4" />
                          }
                        </button>
                      </div>
                    </div>

                    {/* POS ID */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5" />
                        POS BIND ID
                      </p>
                      <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                        <span className="font-mono text-sm font-bold text-slate-700 select-all">
                          {terminal.id}
                        </span>
                        <button
                          onClick={() => copyPin(terminal.id, `id_${terminal.id}`)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all"
                          title="Copy POS ID"
                        >
                          {copiedPin === `id_${terminal.id}`
                            ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                            : <Copy className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </div>

                    {/* CCV Terminal ID */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" />
                        CCV TERMINAL ID
                      </p>
                      {editingCcvId === terminal.id ? (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={editCcvValue}
                            onChange={e => setEditCcvValue(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:border-red-500 outline-none transition-colors font-mono text-sm"
                            placeholder="e.g. TRM-0010"
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveCcv(terminal.id);
                              if (e.key === 'Escape') setEditingCcvId(null);
                            }}
                          />
                          <button
                            onClick={() => handleSaveCcv(terminal.id)}
                            disabled={isSavingCcv}
                            className="px-3 py-2 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {isSavingCcv ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingCcvId(null)}
                            className="px-2 py-2 text-slate-400 hover:text-slate-700 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingCcvId(terminal.id);
                            setEditCcvValue(terminal.ccvTerminalId || '');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-slate-200 hover:border-red-300 hover:bg-red-50/30 transition-all"
                        >
                          {terminal.ccvTerminalId ? (
                            <span className="font-mono font-bold text-slate-800 text-sm">{terminal.ccvTerminalId}</span>
                          ) : (
                            <span className="text-xs text-slate-400 italic flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Click to set CCV Terminal ID
                            </span>
                          )}
                        </button>
                      )}
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
        {terminalToDelete && (
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
              <h2 className="text-xl font-heading font-black text-slate-900 mb-2">Revoke Terminal?</h2>
              <p className="text-slate-500 mb-6">
                <strong className="text-slate-900">{terminalToDelete.name}</strong> will be permanently revoked.
                Any POS device using this PIN will be locked out immediately.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setTerminalToDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                >
                  Revoke
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
