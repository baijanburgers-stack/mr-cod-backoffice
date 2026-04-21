'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Terminal, CreditCard, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

interface CcvTxRecord {
  id:              string;
  orderId:         string;
  amount:          string;
  currency:        string;
  status:          string;
  transactionType: string;
  ccvReference?:   string;
  terminalId:      string;
  environment:     string;
  failureCode?:    string;
  createdAt:       string;
  updatedAt:       string;
  webhookReceived: boolean;
  finalResolvedAt?: string;
  hasMerchantReceipt: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; cls: string }> = {
  success:              { label: 'Paid',              icon: CheckCircle,  cls: 'bg-green-500/15 text-green-600 border border-green-500/30' },
  payment_pending:      { label: 'Pending',           icon: Clock,        cls: 'bg-amber-500/15 text-amber-600 border border-amber-500/30' },
  failed:               { label: 'Failed',            icon: XCircle,      cls: 'bg-red-500/15 text-red-600 border border-red-500/30' },
  manualintervention:   { label: 'Manual Check',      icon: AlertTriangle, cls: 'bg-orange-500/15 text-orange-600 border border-orange-500/30' },
  payment_unknown:      { label: 'Unknown',           icon: AlertCircle,  cls: 'bg-slate-500/15 text-slate-600 border border-slate-500/30' },
  payment_failed:       { label: 'Failed',            icon: XCircle,      cls: 'bg-red-500/15 text-red-600 border border-red-500/30' },
};

export default function CcvTransactionViewer({ storeId }: { storeId: string }) {
  const { user } = useAuth();
  const [idToken, setIdToken] = useState<string | null>(null);

  const [transactions, setTransactions]   = useState<CcvTxRecord[]>([]);
  const [loading, setLoading]             = useState(true);
  const [searchRef, setSearchRef]         = useState('');
  const [searchResult, setSearchResult]   = useState<Record<string, unknown> | null>(null);
  const [searchError, setSearchError]     = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [reconciling, setReconciling]     = useState<Record<string, boolean>>({});
  const [reconcileMsg, setReconcileMsg]   = useState<Record<string, string>>({});
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [batchLoading, setBatchLoading]   = useState(false);
  const [batchMsg, setBatchMsg]           = useState('');
  const [testResult, setTestResult]       = useState<string | null>(null);
  const [testing, setTesting]             = useState(false);

  useEffect(() => {
    if (user) {
      user.getIdToken().then(setIdToken);
    }
  }, [user]);

  const loadTransactions = useCallback(async () => {
    if (!idToken) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/ccv/reconcile?storeId=${storeId}`, {
        headers: { 'x-id-token': idToken },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (res.ok && data) setTransactions(data.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }, [storeId, idToken]);

  useEffect(() => {
    if (idToken) loadTransactions();
  }, [idToken, loadTransactions]);

  const handleSearch = async () => {
    if (!searchRef.trim() || !idToken) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const res  = await fetch(
        `/api/ccv/transaction?reference=${encodeURIComponent(searchRef.trim())}&refresh=true`,
        { headers: { 'x-id-token': idToken } },
      );
      const data = await res.json();
      if (res.ok) setSearchResult(data);
      else       setSearchError(data.error ?? 'Not found');
    } catch {
      setSearchError('Network error');
    } finally {
      setSearchLoading(false);
    }
  };

  const reconcileSingle = async (ref: string, id: string) => {
    if (!idToken) return;
    setReconciling(p => ({ ...p, [id]: true }));
    try {
      const res  = await fetch('/api/ccv/reconcile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-id-token': idToken },
        body:    JSON.stringify({ reference: ref }),
      });
      const data = await res.json();
      setReconcileMsg(p => ({ ...p, [id]: data.status ?? data.error ?? 'done' }));
      loadTransactions();
    } finally {
      setReconciling(p => ({ ...p, [id]: false }));
    }
  };

  const batchReconcile = async () => {
    if (!idToken) return;
    setBatchLoading(true);
    setBatchMsg('');
    try {
      const res  = await fetch('/api/ccv/reconcile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-id-token': idToken },
        body:    JSON.stringify({ storeId }),
      });
      const data = await res.json();
      setBatchMsg(`Reconciled ${data.reconciled} pending transactions`);
      loadTransactions();
    } finally {
      setBatchLoading(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res  = await fetch('/api/ccv/reconcile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-id-token': idToken ?? '' },
        body:    JSON.stringify({ storeId }),
      });
      const data = await res.json();
      setTestResult(res.ok
        ? `✓ Connected — ${data.reconciled ?? 0} pending transactions found`
        : `✗ ${data.error ?? 'Connection failed'}`);
    } catch {
      setTestResult('✗ Network error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 mt-8 p-8 bg-slate-50 border border-slate-200 rounded-3xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h3 className="text-xl font-heading font-black text-slate-900">Payment Terminal History</h3>
          <p className="text-sm text-slate-500 font-medium">Reconcile CCV transactions natively.</p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => loadTransactions()} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-400 text-sm font-bold text-slate-700 shadow-sm transition-all">
             <RefreshCw size={14} /> Refresh
           </button>
           <button onClick={batchReconcile} disabled={batchLoading} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sm font-black text-white shadow-sm transition-all disabled:opacity-50">
             <RefreshCw size={14} className={batchLoading ? 'animate-spin' : ''} />
             Reconcile Pending
           </button>
        </div>
      </div>

      {batchMsg && (
        <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-bold shadow-sm">
          ✓ {batchMsg}
        </div>
      )}

      {/* Utilities Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Connection Test */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
             <div>
                <h2 className="text-sm font-black text-slate-900 mb-1">Live Connection Test</h2>
                <p className="text-xs text-slate-500">Retrieves config and lists pending transactions.</p>
             </div>
             <button onClick={testConnection} disabled={testing} className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50">
                <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
             </button>
          </div>
          {testResult && (
            <div className={`p-3 rounded-xl text-xs font-bold ${testResult.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {testResult}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
           <h2 className="text-sm font-black text-slate-900">Find Transaction</h2>
           <div className="flex gap-2">
             <div className="flex-1 relative">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
               <input
                 value={searchRef}
                 onChange={e => setSearchRef(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleSearch()}
                 placeholder="Search by CCV ref..."
                 className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-amber-500 text-sm text-slate-900 outline-none transition-colors"
               />
             </div>
             <button onClick={handleSearch} disabled={searchLoading} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-sm font-black text-slate-900 shadow-sm transition-all disabled:opacity-50">
               {searchLoading ? '...' : 'Search'}
             </button>
           </div>
           {searchError && <div className="p-2 rounded-lg bg-red-50 text-red-600 text-xs font-bold">{searchError}</div>}
        </div>
      </div>

      {searchResult && (
        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 shadow-sm">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
            <StatusBadge status={searchResult.status as string} />
            <span className="text-xs font-mono text-slate-500">{searchResult.reference as string}</span>
          </div>
          <InfoGrid data={searchResult as Record<string, unknown>} />
        </div>
      )}

      {/* Transaction List */}
      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">
            Recent Transactions ({transactions.length})
          </span>
          <span className="text-xs text-slate-500 font-medium">Last 50 · sorted newest first</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm font-bold flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-slate-400" /> Loading
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm font-medium">No transactions found</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {transactions.map(tx => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                expanded={expandedId === tx.id}
                onToggle={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                onReconcile={() => tx.ccvReference && reconcileSingle(tx.ccvReference, tx.id)}
                isReconciling={!!reconciling[tx.id]}
                reconcileMsg={reconcileMsg[tx.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionRow({ tx, expanded, onToggle, onReconcile, isReconciling, reconcileMsg }: any) {
  const isPending = tx.status === 'payment_pending' || tx.status === 'payment_unknown';

  return (
    <div className="bg-white">
      <div className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${
          tx.transactionType === 'refund' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {tx.transactionType}
        </span>

        <span className="font-mono font-bold text-slate-900 text-sm">
          €{parseFloat(tx.amount).toFixed(2)}
        </span>

        <StatusBadge status={tx.status} />

        <span className="text-xs font-mono text-slate-500 flex-1 truncate">
          {tx.ccvReference ?? '—'}
        </span>

        <span title={tx.webhookReceived ? 'Webhook received' : 'No webhook yet'} className={`w-2 h-2 rounded-full ${tx.webhookReceived ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-slate-300'}`} />

        <span className="text-xs text-slate-500 hidden md:block">{tx.terminalId}</span>

        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${tx.environment === 'production' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>
          {tx.environment === 'production' ? 'LIVE' : 'TEST'}
        </span>

        <span className="text-xs text-slate-500 hidden lg:block font-medium">
          {new Date(tx.createdAt).toLocaleString('nl-BE')}
        </span>

        {isPending && tx.ccvReference && (
          <button onClick={e => { e.stopPropagation(); onReconcile(); }} disabled={isReconciling} className="px-3 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 text-[11px] font-bold text-orange-700 transition-all disabled:opacity-50">
            {isReconciling ? '...' : 'Check'}
          </button>
        )}

        <button onClick={onToggle} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-3 grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-slate-100 bg-slate-50/50">
          <DetailCell label="Firestore ID"   value={tx.id} mono />
          <DetailCell label="Order ID"       value={tx.orderId} />
          <DetailCell label="CCV Reference"  value={tx.ccvReference ?? '—'} mono />
          <DetailCell label="Terminal ID"    value={tx.terminalId} mono />
          <DetailCell label="Amount"         value={`€${parseFloat(tx.amount).toFixed(2)}`} />
          <DetailCell label="Failure Code"   value={tx.failureCode ?? '—'} />
          <DetailCell label="Created"        value={new Date(tx.createdAt).toLocaleString('nl-BE')} />
          <DetailCell label="Last Updated"   value={new Date(tx.updatedAt).toLocaleString('nl-BE')} />
          <DetailCell label="Resolved At"    value={tx.finalResolvedAt ? new Date(tx.finalResolvedAt).toLocaleString('nl-BE') : '—'} />
          <DetailCell label="Webhook"        value={tx.webhookReceived ? '✓ Received' : '✗ Not yet'} />
          <DetailCell label="Merchant Rcpt"  value={tx.hasMerchantReceipt ? '✓ Stored' : '—'} />
          {reconcileMsg && (
            <div className="col-span-full text-xs text-green-600 font-bold bg-green-50 p-2 rounded-lg border border-green-100">
              ✓ Last check: {reconcileMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.payment_unknown;
  const Icon = cfg.icon;
  return (
    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black ${cfg.cls}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function DetailCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xs text-slate-900 font-semibold break-all ${mono ? 'font-mono bg-slate-100 px-1 py-0.5 rounded' : ''}`}>{value}</p>
    </div>
  );
}

function InfoGrid({ data }: { data: Record<string, unknown> }) {
  const safe = Object.entries(data).filter(
    ([k]) => !['rawCreateRequest','rawCreateResponse','rawReadResponse','apiKey'].includes(k)
  );
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      {safe.map(([k, v]) => (
        <DetailCell key={k} label={k} value={String(v ?? '—')} mono={k.includes('Reference') || k.includes('Id')} />
      ))}
    </div>
  );
}
