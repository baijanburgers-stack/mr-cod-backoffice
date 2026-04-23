'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, PenLine,
  CreditCard, IdCard, Timer, RefreshCw,
} from 'lucide-react';
import { CashierPaymentPhase, CashierPaymentState } from '@/lib/ccv/use-ccv-payment';

// ─── CCV Cashier Payment Overlay ──────────────────────────────────────────────
//
// Full-screen payment state overlay — CCV Integration Test Book Attended v2.2
//
// CERTIFICATION COMPLIANCE:
//   G1/G2  : pendng screen, amount shown without thousands separator
//   FS5/FS6: waiting_confirmation + manualintervention (neutral language)
//   FS7    : return page does NOT show result — overlay handles state
//   RG1    : askCustomerSignature → "VRAAG HANDTEKENING" min 6 seconds
//   RG2    : askCustomerIdentification → "VRAAG IDENTIFICATIE" min 6 seconds
//   RG3    : both → "VRAAG HANDTEKENING EN IDENTIFICATIE" min 6 seconds
//   RG51/52: askMerchantSignature → "ZET HANDTEKENING" min 6 seconds

interface Props {
  state:              CashierPaymentState;
  onRetry?:           () => void;
  onCancel?:          () => void;
  onConfirmPrompt?:   () => void;  // cashier confirms they have collected sig/id
  onRefreshStatus?:   () => void;
  visible:            boolean;
}

export default function CcvPaymentOverlay({
  state,
  onRetry,
  onCancel,
  onConfirmPrompt,
  onRefreshStatus,
  visible,
}: Props) {
  if (!visible) return null;

  // ── Determine which prompt (if any) takes priority ────────────────────────
  // Prompts are set by the webhook/readTransaction response.

  const hasBoth = state.askCustomerSignature && state.askCustomerIdentification;

  if (state.askMerchantSignature) {
    return (
      <Overlay>
        <PromptCard
          dutchTitle="ZET HANDTEKENING"
          icon={<PenLine size={44} className="text-blue-400" />}
          detail="Druk op BEVESTIGEN nadat de handtekening is gezet op het bonnetje."
          color="blue"
          minSec={6}
          onConfirm={onConfirmPrompt}
          confirmLabel="Handtekening gezet ✓"
        />
      </Overlay>
    );
  }

  if (hasBoth) {
    return (
      <Overlay>
        <PromptCard
          dutchTitle="VRAAG HANDTEKENING EN IDENTIFICATIE"
          icon={<PenLine size={44} className="text-orange-400" />}
          detail="Vraag handtekening EN identificatiebewijs voordat u bevestigt."
          color="orange"
          minSec={6}
          onConfirm={onConfirmPrompt}
          confirmLabel="Beide verzameld ✓"
        />
      </Overlay>
    );
  }

  if (state.askCustomerSignature) {
    return (
      <Overlay>
        <PromptCard
          dutchTitle="VRAAG HANDTEKENING"
          icon={<PenLine size={44} className="text-amber-400" />}
          detail="Vraag de klant om te tekenen op het betaalterminalbonnetje."
          color="amber"
          minSec={6}
          onConfirm={onConfirmPrompt}
          confirmLabel="Handtekening ontvangen ✓"
        />
      </Overlay>
    );
  }

  if (state.askCustomerIdentification) {
    return (
      <Overlay>
        <PromptCard
          dutchTitle="VRAAG IDENTIFICATIE"
          icon={<IdCard size={44} className="text-purple-400" />}
          detail="Vraag een geldig identiteitsbewijs en noteer naam en documentnummer."
          color="purple"
          minSec={6}
          onConfirm={onConfirmPrompt}
          confirmLabel="Identiteit geverifieerd ✓"
        />
      </Overlay>
    );
  }

  // ── Payment phase screens ─────────────────────────────────────────────────
  return (
    <Overlay>
      {state.phase === 'pending' && !state.payUrl && (
        <PhaseScreen
          icon={
            <div className="relative">
              <CreditCard size={52} className="text-red-400" />
              <Loader2 size={22} className="text-white animate-spin absolute -bottom-1 -right-1 bg-[#1C1F26] rounded-full p-0.5" />
            </div>
          }
          title="Verwerken betaling…"
          subtitle="Wacht tot de klant de kaartbetaling afrondt op het betaalterminal."
          extra={
            <div className="flex items-center gap-3 text-gray-400 text-sm mt-1">
              <Timer size={14} />
              <span className="tabular-nums">{state.elapsedSeconds}s</span>
              {state.amount && (
                /* Amount shown without thousands separator — G2 compliance */
                <span className="font-mono font-black text-white text-lg">
                  €{formatAmount(state.amount)}
                </span>
              )}
            </div>
          }
          showCancel={state.elapsedSeconds > 15}
          onCancel={onCancel}
          cancelLabel="Annuleren"
        />
      )}

      {state.phase === 'pending' && state.payUrl && (
        <div className="w-full max-w-lg mx-4 rounded-3xl bg-white overflow-hidden shadow-2xl relative">
          {/* Header to allow cancellation if iframe hangs */}
          <div className="flex items-center justify-between p-4 bg-gray-100 border-b">
             <div className="flex items-center gap-2 text-gray-600 font-bold text-sm">
                <Loader2 size={16} className="animate-spin" />
                Betaalterminal Instructies
             </div>
             <button onClick={onCancel} className="text-red-500 text-sm font-bold">Annuleren</button>
          </div>
          <iframe 
            src={state.payUrl} 
            className="w-full h-[500px] border-none"
            title="CCV Cashier Display"
          />
        </div>
      )}

      {state.phase === 'waiting_confirmation' && (
        <PhaseScreen
          icon={<Loader2 size={52} className="text-yellow-400 animate-spin" />}
          title="Één moment…"
          subtitle="De betaling wordt bevestigd. Herstart de POS niet."
          extra={
            <p className="text-xs text-gray-600 max-w-xs text-center mt-1">
              De betaalstatus wordt automatisch opgehaald. Wacht rustig af.
            </p>
          }
          showRefresh
          onRefresh={onRefreshStatus}
        />
      )}

      {state.phase === 'success' && (
        <PhaseScreen
          icon={<CheckCircle2 size={60} className="text-green-400" />}
          title="Betaling geslaagd"
          subtitle={`€${formatAmount(state.amount ?? '')} betaald via kaart.`}
          titleColor="text-green-400"
          extra={
            state.printCustomerReceipt
              ? <span className="text-xs text-gray-400 mt-1">Klantenbon wordt afgedrukt…</span>
              : null
          }
        />
      )}

      {state.phase === 'failed' && (
        <PhaseScreen
          icon={<XCircle size={60} className="text-red-400" />}
          title="Betaling geweigerd"
          subtitle={
            state.failureCode === 'cancelled'
              ? 'De klant heeft de kaartbetaling geannuleerd.'
              : 'De betaling is niet goedgekeurd. Probeer opnieuw of kies een andere betaalmethode.'
          }
          titleColor="text-red-400"
          extra={
            state.failureCode ? (
              <span className="text-xs font-mono text-gray-600 mt-1">{state.failureCode}</span>
            ) : null
          }
          showRetry
          onRetry={onRetry}
          showCancel
          onCancel={onCancel}
          cancelLabel="Andere betaalmethode"
        />
      )}

      {/* FS6 / manualintervention — NEUTRAL language required by spec */}
      {(state.phase === 'manualintervention' || state.phase === 'timeout') && (
        <PhaseScreen
          icon={<AlertTriangle size={60} className="text-orange-400" />}
          title="Betaalresultaat onbekend"
          subtitle="Neem contact op met een medewerker vóórdat u verder gaat."
          titleColor="text-orange-400"
          extra={
            <div className="text-center space-y-3 mt-1">
              <p className="text-xs text-gray-500 max-w-[280px]">
                Controleer het betaalterminal. Start geen nieuwe betaling voordat het resultaat
                is geverifieerd. Referentie: {state.reference?.slice(-8)?.toUpperCase() ?? '—'}
              </p>
              <button
                onClick={onRefreshStatus}
                className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl
                           bg-orange-600/20 border border-orange-500/40
                           text-orange-400 text-sm font-bold
                           hover:bg-orange-600/40 transition-all"
              >
                <RefreshCw size={14} />
                Status opnieuw controleren
              </button>
            </div>
          }
        />
      )}
    </Overlay>
  );
}

// ─── Amount formatter — no thousands separator (G2 certification rule) ────────

function formatAmount(amount: string | number): string {
  // amount comes in as "1000.00" already — ensure no comma ever appears
  const n = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(n)) return String(amount);
  // Always use '.' as decimal separator, never ',' as thousands separator
  return n.toFixed(2).replace(',', '.');
}

// ─── Overlay backdrop ─────────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      {children}
    </div>
  );
}

// ─── Phase screen ─────────────────────────────────────────────────────────────

function PhaseScreen({
  icon, title, subtitle, extra, titleColor = 'text-white',
  showRetry, onRetry,
  showCancel, onCancel, cancelLabel = 'Annuleren',
  showRefresh, onRefresh,
}: {
  icon:          React.ReactNode;
  title:         string;
  subtitle:      string;
  extra?:        React.ReactNode;
  titleColor?:   string;
  showRetry?:    boolean; onRetry?:  () => void;
  showCancel?:   boolean; onCancel?: () => void; cancelLabel?: string;
  showRefresh?:  boolean; onRefresh?: () => void;
}) {
  return (
    <div className="w-full max-w-md mx-4 rounded-3xl bg-[#13161D] border border-[#2A2D36] p-8 flex flex-col items-center gap-4 shadow-2xl">
      {icon}
      <h2 className={`text-xl font-black text-center ${titleColor}`}>{title}</h2>
      <p className="text-sm text-gray-400 text-center leading-relaxed">{subtitle}</p>
      {extra && <div className="flex flex-col items-center w-full">{extra}</div>}

      {(showRetry || showCancel || showRefresh) && (
        <div className="flex gap-3 pt-2 w-full">
          {showRefresh && (
            <button
              onClick={onRefresh}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                         bg-[#1C1F26] border border-[#2A2D36] hover:border-gray-500
                         text-sm font-bold text-white transition-all"
            >
              <RefreshCw size={14} /> Vernieuwen
            </button>
          )}
          {showCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl bg-[#1C1F26] border border-[#2A2D36]
                         hover:border-gray-500 text-sm font-bold text-gray-300 transition-all"
            >
              {cancelLabel}
            </button>
          )}
          {showRetry && (
            <button
              onClick={onRetry}
              className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500
                         text-sm font-black text-white transition-all"
            >
              Opnieuw proberen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Prompt card (signature / ID) ─────────────────────────────────────────────
//
// CERTIFICATION REQUIREMENT (RG1, RG2, RG3, RG51, RG52):
//   - Dutch title shown prominently
//   - Confirm button DISABLED for minimum `minSec` seconds
//   - Countdown timer displayed so cashier knows when they can dismiss

function PromptCard({
  dutchTitle, icon, detail, color, minSec, onConfirm, confirmLabel,
}: {
  dutchTitle:   string;
  icon:         React.ReactNode;
  detail:       string;
  color:        'blue' | 'amber' | 'purple' | 'orange';
  minSec:       number;       // minimum seconds before cashier can dismiss
  onConfirm?:   () => void;
  confirmLabel: string;
}) {
  const [remaining, setRemaining] = useState(minSec);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const initTimer = setTimeout(() => setRemaining(minSec), 0);
    timerRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return r - 1;
      });
    }, 1_000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timerRef.current);
    };
  }, [minSec, dutchTitle]);

  const canConfirm  = remaining === 0;

  const borderCls = {
    blue:   'border-blue-500/50',
    amber:  'border-amber-500/50',
    purple: 'border-purple-500/50',
    orange: 'border-orange-500/50',
  }[color];

  const titleCls = {
    blue:   'text-blue-300',
    amber:  'text-amber-300',
    purple: 'text-purple-300',
    orange: 'text-orange-300',
  }[color];

  const btnCls = {
    blue:   canConfirm ? 'bg-blue-600 hover:bg-blue-500'     : 'bg-blue-900/50 cursor-not-allowed',
    amber:  canConfirm ? 'bg-amber-600 hover:bg-amber-500'   : 'bg-amber-900/50 cursor-not-allowed',
    purple: canConfirm ? 'bg-purple-600 hover:bg-purple-500' : 'bg-purple-900/50 cursor-not-allowed',
    orange: canConfirm ? 'bg-orange-600 hover:bg-orange-500' : 'bg-orange-900/50 cursor-not-allowed',
  }[color];

  return (
    <div className={`w-full max-w-md mx-4 rounded-3xl bg-[#13161D] border-2 ${borderCls} p-8 flex flex-col items-center gap-5 shadow-2xl`}>
      {icon}

      {/* Dutch certification title — must match test book exactly */}
      <h2 className={`text-2xl font-black text-center tracking-wide ${titleCls}`}>
        {dutchTitle}
      </h2>

      <p className="text-sm text-gray-400 text-center leading-relaxed">{detail}</p>

      {/* 6-second countdown */}
      {!canConfirm && (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Timer size={14} />
          <span>Wacht {remaining}s…</span>
        </div>
      )}

      <button
        onClick={canConfirm ? onConfirm : undefined}
        disabled={!canConfirm}
        className={`w-full py-4 rounded-2xl text-white text-base font-black transition-all mt-2 ${btnCls}`}
      >
        {canConfirm ? confirmLabel : `Wacht ${remaining}s…`}
      </button>
    </div>
  );
}
