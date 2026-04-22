'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  CreditCard, Settings, RefreshCw, Search, CheckCircle,
  AlertTriangle, XCircle, Clock, Terminal, FileText,
  ChevronDown, ChevronUp, AlertCircle, Eye, Download,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ── Status badge config ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; cls: string }> = {
  success:              { label: 'Paid',              icon: CheckCircle,  cls: 'bg-green-500/15 text-green-400 border border-green-500/30' },
  payment_pending:      { label: 'Pending',           icon: Clock,        cls: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' },
  failed:               { label: 'Failed',            icon: XCircle,      cls: 'bg-red-500/15 text-red-400 border border-red-500/30' },
  manualintervention:   { label: 'Manual Check',      icon: AlertTriangle, cls: 'bg-orange-500/15 text-orange-400 border border-orange-500/30' },
  payment_unknown:      { label: 'Unknown',           icon: AlertCircle,  cls: 'bg-gray-500/15 text-gray-400 border border-gray-500/30' },
  payment_failed:       { label: 'Failed',            icon: XCircle,      cls: 'bg-red-500/15 text-red-400 border border-red-500/30' },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function CcvAdminPage() {
  const params  = useParams<{ storeId: string }>();
  const storeId = params.storeId;

  const [idToken, setIdToken]             = useState<string | null>(null);
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
  const [activeTab, setActiveTab]         = useState<'transactions' | 'settings'>('transactions');

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) setIdToken(await user.getIdToken());
    });
    return unsub;
  }, []);

  // ── Load transactions ─────────────────────────────────────────────────────
  const loadTransactions = useCallback(async () => {
    if (!idToken) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/ccv/reconcile?storeId=${storeId}`, {
        headers: { 'x-id-token': idToken },
      });
      const data = await res.json();
      if (res.ok) setTransactions(data.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }, [storeId, idToken]);

  useEffect(() => {
    if (idToken) loadTransactions();
  }, [idToken, loadTransactions]);

  // ── Search by reference ───────────────────────────────────────────────────
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

  // ── Manually reconcile single transaction ─────────────────────────────────
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

  // ── Batch reconcile all pending ───────────────────────────────────────────
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

  // ────────────────────────────────────────────────────  UI ──────────────────

  return (
    <div className="p-6 space-y-6 bg-[#0B0D11] min-h-screen text-white">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
            <CreditCard size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">CCV Payment Terminal</h1>
            <p className="text-xs text-gray-500">Cloud Connect Attended · OPI_NL · v2.2</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadTransactions()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1C1F26] border border-[#2A2D36] hover:border-gray-500 text-sm font-semibold transition-all"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={batchReconcile}
            disabled={batchLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-sm font-black text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={batchLoading ? 'animate-spin' : ''} />
            Reconcile Pending
          </button>
        </div>
      </div>

      {batchMsg && (
        <div className="px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold">
          ✓ {batchMsg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-[#1C1F26] rounded-xl border border-[#2A2D36] w-fit">
        {(['transactions', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all ${
              activeTab === tab
                ? 'bg-red-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── TRANSACTIONS TAB ─────────────────────────────────────────────── */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">

          {/* Search */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={searchRef}
                onChange={e => setSearchRef(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search by CCV reference..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#1C1F26] border border-[#2A2D36] focus:border-red-500 text-sm text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-black text-white transition-all disabled:opacity-50"
            >
              {searchLoading ? '...' : 'Search'}
            </button>
          </div>

          {/* Search result */}
          {searchError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {searchError}
            </div>
          )}
          {searchResult && (
            <div className="p-4 rounded-xl bg-[#1C1F26] border border-[#2A2D36] space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <StatusBadge status={searchResult.status as string} />
                <span className="text-xs font-mono text-gray-400">{searchResult.reference as string}</span>
              </div>
              <InfoGrid data={searchResult as Record<string, unknown>} />
            </div>
          )}

          {/* Transaction list */}
          <div className="rounded-2xl border border-[#2A2D36] overflow-hidden">
            <div className="px-4 py-3 bg-[#1C1F26] border-b border-[#2A2D36] flex items-center justify-between">
              <span className="text-sm font-bold text-gray-300">
                Recent Transactions ({transactions.length})
              </span>
              <span className="text-xs text-gray-600">Last 50 · sorted newest first</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
            ) : transactions.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">No transactions found</div>
            ) : (
              <div className="divide-y divide-[#2A2D36]">
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
      )}

      {/* ── SETTINGS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <SettingsTab storeId={storeId} idToken={idToken} />
      )}
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────

function TransactionRow({
  tx, expanded, onToggle, onReconcile, isReconciling, reconcileMsg,
}: {
  tx:            CcvTxRecord;
  expanded:      boolean;
  onToggle:      () => void;
  onReconcile:   () => void;
  isReconciling: boolean;
  reconcileMsg?: string;
}) {
  const isPending = tx.status === 'payment_pending' || tx.status === 'payment_unknown';

  return (
    <div className="bg-[#13161D]">
      {/* Summary row */}
      <div className="px-4 py-3 flex items-center gap-3 hover:bg-[#1C1F26] transition-colors">
        {/* Type badge */}
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
          tx.transactionType === 'refund'
            ? 'bg-purple-500/15 text-purple-400'
            : 'bg-blue-500/15 text-blue-400'
        }`}>
          {tx.transactionType}
        </span>

        {/* Amount */}
        <span className="font-mono font-bold text-white text-sm">
          €{parseFloat(tx.amount).toFixed(2)}
        </span>

        {/* Status */}
        <StatusBadge status={tx.status} />

        {/* Reference */}
        <span className="text-xs font-mono text-gray-500 flex-1 truncate">
          {tx.ccvReference ?? '—'}
        </span>

        {/* Webhook indicator */}
        <span
          title={tx.webhookReceived ? 'Webhook received' : 'No webhook yet'}
          className={`w-2 h-2 rounded-full ${tx.webhookReceived ? 'bg-green-400' : 'bg-gray-700'}`}
        />

        {/* Terminal */}
        <span className="text-xs text-gray-600 hidden md:block">{tx.terminalId}</span>

        {/* Environment */}
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
          tx.environment === 'production'
            ? 'bg-red-500/15 text-red-400'
            : 'bg-yellow-500/15 text-yellow-400'
        }`}>
          {tx.environment === 'production' ? 'LIVE' : 'TEST'}
        </span>

        {/* Date */}
        <span className="text-xs text-gray-600 hidden lg:block">
          {new Date(tx.createdAt).toLocaleString('nl-BE')}
        </span>

        {/* Reconcile button — only for pending */}
        {isPending && tx.ccvReference && (
          <button
            onClick={e => { e.stopPropagation(); onReconcile(); }}
            disabled={isReconciling}
            className="px-2 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-[11px] font-black text-white transition-all disabled:opacity-50"
          >
            {isReconciling ? '...' : 'Check'}
          </button>
        )}

        {/* Expand toggle */}
        <button onClick={onToggle} className="text-gray-600 hover:text-gray-300 transition-colors">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 grid grid-cols-2 md:grid-cols-3 gap-3 border-t border-[#2A2D36]">
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
            <div className="col-span-full text-xs text-green-400 font-semibold">
              ✓ Last check: {reconcileMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ storeId, idToken }: { storeId: string; idToken: string | null }) {
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting]       = useState(false);

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
    <div className="space-y-4 max-w-2xl">
      {/* Info card */}
      <div className="p-5 rounded-2xl bg-[#1C1F26] border border-[#2A2D36] space-y-4">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-gray-400" />
          <h2 className="text-sm font-black text-white">CCV Configuration</h2>
        </div>
        <div className="text-xs text-gray-500 leading-relaxed space-y-2">
          <p>
            API keys are managed securely in Store Settings → Payment Terminal.
            They are <span className="text-red-400 font-bold">never exposed</span> to the browser or kiosk devices.
          </p>
          <p>CCV credentials are loaded server-side only via Firebase Admin SDK for each API call.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <ConfigRow label="Access Protocol"   value="OPI_NL" />
          <ConfigRow label="Operating Mode"    value="ATTENDED" />
          <ConfigRow label="Belgium MSID"      value="GrundmasterBE" />
          <ConfigRow label="Test MSID"         value="GrundmasterNL-ThirdPartyTest" />
          <ConfigRow label="Production Host"   value="api.psp.ccv.eu" />
          <ConfigRow label="Test Host"         value="vpos-test.jforce.be" />
        </div>
      </div>

      {/* Webhook info */}
      <div className="p-5 rounded-2xl bg-[#1C1F26] border border-[#2A2D36] space-y-3">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-gray-400" />
          <h2 className="text-sm font-black text-white">Webhook Endpoint</h2>
        </div>
        <div className="p-3 rounded-xl bg-[#0B0D11] border border-[#2A2D36] font-mono text-xs text-green-400 break-all">
          POST {process.env.NEXT_PUBLIC_BASE_URL ?? 'https://mr-cod-backoffice--mr-cod-online-ordering.europe-west4.hosted.app'}/api/ccv/webhook
        </div>
        <p className="text-xs text-gray-500">
          Register this URL in your CCV merchant portal as the webhook endpoint.
          CCV will POST <code className="text-yellow-400">{'{"id":"REFERENCE"}'}</code> on every transaction status change.
        </p>
      </div>

      {/* Security rules */}
      <div className="p-5 rounded-2xl bg-[#1C1F26] border border-yellow-500/20 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-yellow-400" />
          <h2 className="text-sm font-black text-yellow-400">Security Rules</h2>
        </div>
        <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
          <li>API key is <strong className="text-white">never sent</strong> to frontend, browser, kiosk app, or POS device storage</li>
          <li>All CCV requests originate exclusively from Next.js API routes (server-side)</li>
          <li>Webhook processing is idempotent — duplicate deliveries are safely discarded</li>
          <li>Orders are only marked <strong className="text-green-400">paid</strong> after CCV readTransaction confirms success</li>
          <li>Browser returnUrl redirect is never treated as payment confirmation</li>
          <li>Refunds require manager role Firebase claim</li>
        </ul>
      </div>

      {/* Connection test */}
      <div className="p-5 rounded-2xl bg-[#1C1F26] border border-[#2A2D36] space-y-3">
        <h2 className="text-sm font-black text-white">Connection Test</h2>
        <p className="text-xs text-gray-500">
          Attempts to list pending transactions for this store using server-side credentials.
        </p>
        <button
          onClick={testConnection}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-black text-white transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        {testResult && (
          <div className={`p-3 rounded-xl text-xs font-semibold ${
            testResult.startsWith('✓')
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            {testResult}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.payment_unknown;
  const Icon = cfg.icon;
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${cfg.cls}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function DetailCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-xs text-white font-semibold break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center p-2 rounded-lg bg-[#0B0D11] border border-[#2A2D36]">
      <span className="text-gray-500 font-semibold">{label}</span>
      <span className="font-mono text-white font-bold">{value}</span>
    </div>
  );
}

function InfoGrid({ data }: { data: Record<string, unknown> }) {
  const safe = Object.entries(data).filter(
    ([k]) => !['rawCreateRequest','rawCreateResponse','rawReadResponse','apiKey'].includes(k)
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      {safe.map(([k, v]) => (
        <DetailCell key={k} label={k} value={String(v ?? '—')} mono={k.includes('Reference') || k.includes('Id')} />
      ))}
    </div>
  );
}
