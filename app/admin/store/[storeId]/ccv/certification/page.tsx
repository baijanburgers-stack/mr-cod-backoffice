'use client';

import { useState, use, useEffect, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Clock, Play, RotateCcw, Download,
  ChevronDown, ChevronRight, AlertTriangle, CreditCard,
  FileText, Printer, Mail, ShieldCheck, Database, Zap,
  RefreshCw, X, Save, ClipboardList,
} from 'lucide-react';
import {
  CCV_CERT_TESTS, CERT_GROUPS, testsByGroup, getCertTest,
  type CertEvidence, type CertResult, type CertTestCase,
  emptyCertEvidence,
} from '@/lib/ccv/certification-tests';

// ─── CCV Certification Dashboard ─────────────────────────────────────────────
//
// Implements the CCV Integration Test Book Attended v2.2 compliance checklist.
// Allows staff to execute and record all 23 certification test scenarios.

export default function CcvCertificationPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = use(params);

  // Evidence map: testId → latest CertEvidence
  const [evidence, setEvidence] = useState<Record<string, CertEvidence & { id?: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [terminalId, setTerminalId] = useState('');

  // Editing state
  const [editTest, setEditTest]     = useState<CertTestCase | null>(null);
  const [editForm, setEditForm]     = useState<CertEvidence | null>(null);
  const [isSaving, setIsSaving]     = useState(false);
  const [saveOk, setSaveOk]         = useState(false);

  // Expanded groups
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(CERT_GROUPS.map(g => [g, true]))
  );

  // ── Load evidence ──────────────────────────────────────────────────────────

  const loadEvidence = useCallback(async () => {
    setIsLoading(true);
    try {
      const res  = await fetch(`/api/ccv/certification?storeId=${storeId}`);
      const data = await res.json();
      if (!data.runs) return;

      // Keep latest run per testId
      const map: Record<string, CertEvidence & { id?: string }> = {};
      for (const run of (data.runs as (CertEvidence & { id: string })[])) {
        if (!map[run.testId] || run.runAt > map[run.testId].runAt) {
          map[run.testId] = run;
        }
      }
      setEvidence(map);
    } catch { /* ignore */ }
    setIsLoading(false);
  }, [storeId]);

  useEffect(() => {
    const t = setTimeout(() => loadEvidence(), 0);
    return () => clearTimeout(t);
  }, [loadEvidence]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const total   = CCV_CERT_TESTS.length;
  const passed  = Object.values(evidence).filter(e => e.result === 'pass').length;
  const failed  = Object.values(evidence).filter(e => e.result === 'fail').length;
  const pct     = Math.round((passed / total) * 100);

  // ── Open evidence modal ────────────────────────────────────────────────────

  const openEvidence = (test: CertTestCase) => {
    const existing = evidence[test.id];
    setEditTest(test);
    setEditForm(
      existing
        ? { ...existing }
        : emptyCertEvidence(test.id, storeId, terminalId, test.amountCents ?? 0)
    );
  };

  const closeEdit = () => { setEditTest(null); setEditForm(null); setSaveOk(false); };

  const saveEvidence = async () => {
    if (!editForm) return;
    setIsSaving(true);
    try {
      const body = { ...editForm, storeId, id: (evidence[editForm.testId] as any)?.id };
      const res  = await fetch('/api/ccv/certification', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      setSaveOk(true);
      setEvidence(prev => ({
        ...prev,
        [editForm.testId]: { ...editForm, id: data.id ?? prev[editForm.testId]?.id },
      }));
    } catch { /* ignore */ }
    setIsSaving(false);
  };

  const clearRun = async (testId: string) => {
    const run = evidence[testId];
    if (!run?.id) { setEvidence(prev => { const n = { ...prev }; delete n[testId]; return n; }); return; }
    await fetch(`/api/ccv/certification?id=${run.id}`, { method: 'DELETE' });
    setEvidence(prev => { const n = { ...prev }; delete n[testId]; return n; });
  };

  // ── Export summary ─────────────────────────────────────────────────────────

  const exportSummary = () => {
    const lines: string[] = [
      `CCV Certification Evidence — Store ${storeId}`,
      `Exported: ${new Date().toISOString()}`,
      `Progress: ${passed}/${total} passed (${pct}%)`,
      '',
      ...CCV_CERT_TESTS.map(t => {
        const ev = evidence[t.id];
        const status = ev ? ev.result.toUpperCase() : 'NOT RUN';
        return [
          `${t.id} — ${t.title} [${status}]`,
          `  Amount: €${((t.amountCents ?? 0) / 100).toFixed(2)}`,
          ev ? `  Reference: ${ev.reference || '—'}` : '',
          ev ? `  Final status: ${ev.finalStatus || '—'}` : '',
          ev ? `  Webhook: ${ev.webhookReceivedAt ? 'YES' : 'NO'}` : '',
          ev ? `  Prompt shown: ${ev.cashierPromptShown ? ev.cashierPromptText : 'No'}` : '',
          ev ? `  Notes: ${ev.operatorNotes || '—'}` : '',
          '',
        ].filter(Boolean).join('\n');
      }),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ccv-cert-evidence-${storeId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Group icon ─────────────────────────────────────────────────────────────

  const groupIcon = (g: string) => {
    if (g.includes('Happy'))     return <CreditCard className="w-4 h-4" />;
    if (g.includes('Print'))     return <Printer className="w-4 h-4" />;
    if (g.includes('Email'))     return <Mail className="w-4 h-4" />;
    if (g.includes('Signature')) return <ShieldCheck className="w-4 h-4" />;
    if (g.includes('Refund'))    return <RefreshCw className="w-4 h-4" />;
    if (g.includes('Journal'))   return <Database className="w-4 h-4" />;
    if (g.includes('Failure'))   return <Zap className="w-4 h-4" />;
    return <ClipboardList className="w-4 h-4" />;
  };

  // ── Result badge ───────────────────────────────────────────────────────────

  const ResultBadge = ({ result }: { result?: CertResult }) => {
    if (!result || result === 'not_run') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
        <Clock className="w-3 h-3" /> NOT RUN
      </span>
    );
    if (result === 'pass') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" /> PASS
      </span>
    );
    if (result === 'fail') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
        <XCircle className="w-3 h-3" /> FAIL
      </span>
    );
    if (result === 'pending') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
        <RefreshCw className="w-3 h-3" /> PENDING
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400">
        SKIPPED
      </span>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto min-h-screen">

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              CCV Certification
            </h1>
            <p className="mt-2 text-slate-500">
              Integration Test Book Attended v2.2 — Remote certification compliance dashboard
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadEvidence}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button
              onClick={exportSummary}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all text-sm"
            >
              <Download className="w-4 h-4" /> Export Evidence
            </button>
          </div>
        </div>

        {/* Terminal ID input */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-bold text-slate-700">Test Terminal ID:</label>
          <input
            type="text"
            value={terminalId}
            onChange={e => setTerminalId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 font-mono text-sm outline-none focus:border-red-500 w-48"
            placeholder="e.g. TRM-0012"
          />
          <span className="text-xs text-slate-400">Used as default when recording test evidence.</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-8 bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-black text-slate-900">
            Certification Progress — {passed}/{total} tests passed
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-emerald-700 font-bold">{passed} Pass</span>
            <span className="text-rose-700 font-bold">{failed} Fail</span>
            <span className="text-slate-500">{total - passed - failed} Remaining</span>
          </div>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              pct === 100 ? 'bg-emerald-500' : pct > 60 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct === 100 && (
          <p className="mt-2 text-emerald-700 font-bold text-sm text-center">
            🎉 All test cases passed — ready for CCV remote certification!
          </p>
        )}
      </div>

      {/* Test Groups */}
      {CERT_GROUPS.map(group => {
        const tests      = testsByGroup(group);
        const groupPassed = tests.filter(t => evidence[t.id]?.result === 'pass').length;
        const isOpen     = expanded[group];

        return (
          <div key={group} className="mb-4 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Group header */}
            <button
              onClick={() => setExpanded(p => ({ ...p, [group]: !p[group] }))}
              className="w-full px-5 py-4 flex items-center gap-3 hover:bg-slate-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                {groupIcon(group)}
              </div>
              <div className="flex-1 text-left">
                <div className="font-black text-slate-900">{group}</div>
                <div className="text-xs text-slate-500">{groupPassed}/{tests.length} passed</div>
              </div>
              <div className="flex gap-2 items-center">
                {tests.map(t => (
                  <div
                    key={t.id}
                    className={`w-2 h-2 rounded-full ${
                      evidence[t.id]?.result === 'pass'    ? 'bg-emerald-500' :
                      evidence[t.id]?.result === 'fail'    ? 'bg-rose-500' :
                      evidence[t.id]?.result === 'pending' ? 'bg-amber-400' :
                      'bg-slate-200'
                    }`}
                    title={t.id}
                  />
                ))}
              </div>
              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {isOpen && (
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {tests.map(test => {
                  const ev = evidence[test.id];
                  return (
                    <div key={test.id} className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors">
                      {/* Test ID */}
                      <div className="w-12 flex-shrink-0 pt-0.5">
                        <span className="inline-block px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-black text-xs font-mono">
                          {test.id}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{test.title}</span>
                          <ResultBadge result={ev?.result} />
                          {test.amountCents && (
                            <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                              €{(test.amountCents / 100).toFixed(2)}
                            </span>
                          )}
                          {test.promptRequired && (
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                              {test.promptRequired}
                            </span>
                          )}
                          {test.conditionalOn && (
                            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                              ⚡ {test.conditionalOn}
                            </span>
                          )}
                        </div>

                        {/* Trigger note */}
                        {test.triggerNote && (
                          <p className="mt-1 text-xs text-slate-400 italic">{test.triggerNote}</p>
                        )}

                        {/* Evidence summary */}
                        {ev && ev.result !== 'not_run' && (
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                            {ev.reference && <span>Ref: <code className="font-mono">{ev.reference.slice(0, 16)}…</code></span>}
                            {ev.finalStatus && <span>Status: <strong className="text-slate-700">{ev.finalStatus}</strong></span>}
                            {ev.webhookReceivedAt !== null && <span>Webhook: <strong>{ev.webhookReceivedAt ? '✓ received' : '✗ missing'}</strong></span>}
                            {ev.cashierPromptShown && <span>Prompt: ✓ shown</span>}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        {ev && (
                          <button
                            onClick={() => clearRun(test.id)}
                            title="Reset this test run"
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openEvidence(test)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            ev
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          {ev ? <FileText className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          {ev ? 'View / Edit' : 'Record'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Amount Quick Reference */}
      <div className="mt-6 bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <h3 className="font-black text-slate-900 text-sm">Exact C-TAP Trigger Amounts</h3>
          <p className="text-xs text-slate-500 mt-0.5">These exact amounts must be used. Never format with a thousands separator.</p>
        </div>
        <div className="p-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[...new Set(CCV_CERT_TESTS.filter(t => t.amountCents).map(t => t.amountCents!))]
            .sort((a, b) => a - b)
            .map(cents => (
              <div key={cents} className="text-center py-2 px-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-black font-mono text-slate-900">€{(cents / 100).toFixed(2)}</div>
                <div className="text-[10px] text-slate-400">
                  {CCV_CERT_TESTS.filter(t => t.amountCents === cents).map(t => t.id).join(', ')}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Dutch Prompts Quick Reference */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <h3 className="font-black text-amber-900 text-sm mb-3">Required Dutch Cashier Prompts (min. 6 seconds)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { text: 'VRAAG HANDTEKENING',            tests: 'RG1, RG51, RG52',  type: 'sig' },
            { text: 'VRAAG IDENTIFICATIE',            tests: 'RG2',              type: 'id' },
            { text: 'VRAAG HANDTEKENING EN IDENTIFICATIE', tests: 'RG3',        type: 'both' },
            { text: 'ZET HANDTEKENING',               tests: 'RG51, RG52',       type: 'merchant' },
          ].map(p => (
            <div key={p.text} className="bg-white rounded-xl border border-amber-200 px-4 py-3 flex items-center justify-between gap-2">
              <code className="text-sm font-mono font-black text-amber-900">{p.text}</code>
              <span className="text-xs text-amber-700 font-bold whitespace-nowrap">{p.tests}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Evidence Modal ───────────────────────────────────────────────────── */}
      {editTest && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-slate-500 text-sm">{editTest.id}</span>
                  <h2 className="font-black text-slate-900">{editTest.title}</h2>
                </div>
                {editTest.amountCents && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    Exact amount: <code className="font-mono font-bold text-blue-700">€{(editTest.amountCents / 100).toFixed(2)}</code>
                    {editTest.triggerNote && <span className="ml-2 italic">({editTest.triggerNote})</span>}
                  </p>
                )}
              </div>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Preparation */}
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-sm">
                <p className="font-black text-blue-800 mb-1">📋 Preparation</p>
                <ul className="space-y-1 text-blue-700 list-disc list-inside">
                  {editTest.preparation.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>

              {/* Execution */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-sm">
                <p className="font-black text-slate-800 mb-1">▶ Execution Steps</p>
                <ol className="space-y-1 text-slate-700 list-decimal list-inside">
                  {editTest.execution.map((e, i) => <li key={i}>{e}</li>)}
                </ol>
              </div>

              {/* Expected result */}
              <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-sm">
                <p className="font-black text-emerald-800 mb-1">✓ Expected Result</p>
                <ul className="space-y-1 text-emerald-700 list-disc list-inside">
                  {editTest.expectedResult.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>

              {/* Evidence form */}
              <div className="space-y-4">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">Evidence</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">CCV Reference</label>
                    <input
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none font-mono text-sm"
                      value={editForm.reference}
                      onChange={e => setEditForm(f => f && ({ ...f, reference: e.target.value }))}
                      placeholder="ccv-xxxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Terminal ID</label>
                    <input
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none font-mono text-sm"
                      value={editForm.terminalId}
                      onChange={e => setEditForm(f => f && ({ ...f, terminalId: e.target.value }))}
                      placeholder="TRM-0012"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Started At</label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none text-sm"
                      value={editForm.startedAt.slice(0, 16)}
                      onChange={e => setEditForm(f => f && ({ ...f, startedAt: new Date(e.target.value).toISOString() }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Completed At</label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none text-sm"
                      value={editForm.completedAt?.slice(0, 16) ?? ''}
                      onChange={e => setEditForm(f => f && ({ ...f, completedAt: new Date(e.target.value).toISOString() }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Final Status</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none text-sm"
                      value={editForm.finalStatus}
                      onChange={e => setEditForm(f => f && ({ ...f, finalStatus: e.target.value }))}
                    >
                      <option value="">— select —</option>
                      <option value="success">success</option>
                      <option value="failed">failed</option>
                      <option value="manualintervention">manualintervention</option>
                      <option value="declined">declined</option>
                      <option value="rejected">rejected (terminal busy)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Receipt Behavior</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none text-sm"
                      value={editForm.receiptBehavior}
                      onChange={e => setEditForm(f => f && ({ ...f, receiptBehavior: e.target.value as any }))}
                    >
                      <option value="unknown">unknown</option>
                      <option value="printed">printed</option>
                      <option value="emailed">emailed</option>
                      <option value="none">none (no receipt)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Webhook Received At</label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none text-sm"
                      value={editForm.webhookReceivedAt?.slice(0, 16) ?? ''}
                      onChange={e => setEditForm(f => f && ({
                        ...f,
                        webhookReceivedAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                      }))}
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Leave empty if no webhook received.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Polling Attempts</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none text-sm"
                      value={editForm.pollingAttempts}
                      min={0}
                      onChange={e => setEditForm(f => f && ({ ...f, pollingAttempts: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editForm.journalStored}
                      onChange={e => setEditForm(f => f && ({ ...f, journalStored: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm font-bold text-slate-700">Journal stored securely</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editForm.cashierPromptShown}
                      onChange={e => setEditForm(f => f && ({ ...f, cashierPromptShown: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm font-bold text-slate-700">Cashier prompt shown</span>
                  </label>
                </div>

                {editForm.cashierPromptShown && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Prompt Text Shown</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none text-sm"
                      value={editForm.cashierPromptText}
                      onChange={e => setEditForm(f => f && ({ ...f, cashierPromptText: e.target.value }))}
                    >
                      <option value="">— select prompt —</option>
                      <option>VRAAG HANDTEKENING</option>
                      <option>VRAAG IDENTIFICATIE</option>
                      <option>VRAAG HANDTEKENING EN IDENTIFICATIE</option>
                      <option>ZET HANDTEKENING</option>
                    </select>
                  </div>
                )}

                {/* Refund footer text for RG54 */}
                {editTest.refundFooterText && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-800">
                    <p className="font-bold mb-1">Expected Footer Text (recommended):</p>
                    <code className="block text-xs bg-white border border-purple-200 rounded px-2 py-1">
                      {editTest.refundFooterText}
                    </code>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input type="checkbox" className="rounded"
                        checked={editForm.operatorNotes.includes('FOOTER_PRESENT')}
                        onChange={e => setEditForm(f => f && ({
                          ...f,
                          operatorNotes: e.target.checked
                            ? (f.operatorNotes + ' FOOTER_PRESENT').trim()
                            : f.operatorNotes.replace('FOOTER_PRESENT', '').trim(),
                        }))} />
                      <span className="font-bold text-purple-900">Footer text present on printed receipt</span>
                    </label>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Operator Notes</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-red-500 outline-none text-sm resize-none"
                    value={editForm.operatorNotes}
                    onChange={e => setEditForm(f => f && ({ ...f, operatorNotes: e.target.value }))}
                    placeholder="Observations, edge cases, any deviations from expected…"
                  />
                </div>

                {/* Pass / Fail */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Test Result</label>
                  <div className="flex gap-3">
                    {(['pass', 'fail', 'pending', 'skipped'] as CertResult[]).map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setEditForm(f => f && ({ ...f, result: r }))}
                        className={`flex-1 py-2.5 rounded-xl font-black text-sm border-2 transition-all uppercase ${
                          editForm.result === r
                            ? r === 'pass'    ? 'bg-emerald-500 border-emerald-500 text-white'
                            : r === 'fail'    ? 'bg-rose-500 border-rose-500 text-white'
                            : r === 'pending' ? 'bg-amber-500 border-amber-500 text-white'
                            :                   'bg-slate-400 border-slate-400 text-white'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
              <button onClick={closeEdit} className="px-4 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-all text-sm">
                Cancel
              </button>
              <button
                onClick={saveEvidence}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all text-sm disabled:opacity-60"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : saveOk ? (
                  <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                ) : (
                  <><Save className="w-4 h-4" /> Save Evidence</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
