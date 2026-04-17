'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Cashier CCV Payment Flow Hook ───────────────────────────────────────────
//
// Manages the complete attended terminal payment state machine:
//   idle → pending → (polling) → success | failed | manualintervention
//
// Implements:
// - 45-second polling fallback (if no webhook)
// - 6-minute max timeout → manualintervention
// - Correct cashier prompts (signature, identification, merchant signature)
// - Late status recovery support

export type CashierPaymentPhase =
  | 'idle'
  | 'pending'
  | 'waiting_confirmation'   // browser returned but webhook not yet
  | 'success'
  | 'failed'
  | 'manualintervention'
  | 'timeout';

export interface CashierPaymentState {
  phase:                    CashierPaymentPhase;
  reference?:               string;
  transactionId?:           string;
  amount?:                  string;
  currency:                 'EUR';
  failureCode?:             string;
  askCustomerSignature:     boolean;
  askCustomerIdentification: boolean;
  askMerchantSignature:     boolean;
  printCustomerReceipt:     boolean;
  elapsedSeconds:           number;
  error?:                   string;
}

interface UseCcvPaymentOptions {
  storeId:      string;
  terminalId:   string;
  idToken?:     string;          // Firebase ID token for API auth
  onSuccess?:   (reference: string) => void;
  onFailed?:    (failureCode?: string) => void;
  onUnknown?:   (reference: string) => void;
}

interface StartPaymentParams {
  orderId:      string;
  amountCents:  number;
  language?:    'eng' | 'nld' | 'fra' | 'deu';
  posScreenId?: string;
}

const POLL_INITIAL_DELAY_MS  = 45_000;   // wait 45s before first poll
const POLL_INTERVAL_MS       = 30_000;   // 30s between polls
const MAX_TIMEOUT_MS         = 360_000;  // 6 minutes
const TICKER_INTERVAL_MS     = 1_000;    // 1s ticker for elapsed display

export function useCcvPayment(options: UseCcvPaymentOptions) {
  const { storeId, terminalId, idToken, onSuccess, onFailed, onUnknown } = options;

  const [state, setState] = useState<CashierPaymentState>({
    phase:                    'idle',
    currency:                 'EUR',
    askCustomerSignature:     false,
    askCustomerIdentification: false,
    askMerchantSignature:     false,
    printCustomerReceipt:     false,
    elapsedSeconds:           0,
  });

  const pollTimerRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tickerRef       = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const startTimeRef    = useRef<number>(0);
  const referenceRef    = useRef<string>('');

  // ── Auth headers ─────────────────────────────────────────────────────────

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) h['x-id-token'] = idToken;
    return h;
  }, [idToken]);

  // ── Cleanup timers ────────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    clearTimeout(pollTimerRef.current);
    clearTimeout(timeoutTimerRef.current);
    clearInterval(tickerRef.current);
  }, []);

  // ── Poll CCV transaction status ───────────────────────────────────────────

  const pollStatus = useCallback(async (reference: string) => {
    try {
      const res  = await fetch(
        `/api/ccv/transaction?reference=${encodeURIComponent(reference)}&refresh=true`,
        { headers: authHeaders() },
      );
      const data = await res.json();

      if (!res.ok) {
        console.warn('[CCV Poll] Error:', data.error);
        return;
      }

      applyStatusUpdate(data.status, data);
    } catch (err) {
      console.warn('[CCV Poll] Fetch failed:', err);
    }
  }, [authHeaders]); // eslint-disable-line

  // ── Apply a status update to state ───────────────────────────────────────

  const applyStatusUpdate = useCallback((
    status:  string,
    data:    Record<string, unknown>,
  ) => {
    const ref = referenceRef.current;

    switch (status) {
      case 'success':
        clearTimers();
        setState(s => ({ ...s,
          phase:                    'success',
          askCustomerSignature:     !!data.askCustomerSignature,
          askCustomerIdentification: !!data.askCustomerIdentification,
          askMerchantSignature:     !!data.askMerchantSignature,
          printCustomerReceipt:     !!data.printCustomerReceipt,
        }));
        onSuccess?.(ref);
        break;

      case 'failed':
        clearTimers();
        setState(s => ({ ...s,
          phase:       'failed',
          failureCode: data.failureCode as string | undefined,
        }));
        onFailed?.(data.failureCode as string | undefined);
        break;

      case 'manualintervention':
        clearTimers();
        setState(s => ({ ...s, phase: 'manualintervention' }));
        onUnknown?.(ref);
        break;

      case 'payment_pending':
      case 'payment_unknown':
        // Still pending — schedule next poll
        pollTimerRef.current = setTimeout(
          () => pollStatus(ref),
          POLL_INTERVAL_MS,
        );
        break;
    }
  }, [clearTimers, onSuccess, onFailed, onUnknown, pollStatus]);

  // ── Start payment ─────────────────────────────────────────────────────────

  const startPayment = useCallback(async (params: StartPaymentParams) => {
    setState({
      phase:                    'pending',
      currency:                 'EUR',
      amount:                   (params.amountCents / 100).toFixed(2),
      askCustomerSignature:     false,
      askCustomerIdentification: false,
      askMerchantSignature:     false,
      printCustomerReceipt:     false,
      elapsedSeconds:           0,
    });

    startTimeRef.current = Date.now();

    // ── Start elapsed ticker ───────────────────────────────────────────
    tickerRef.current = setInterval(() => {
      setState(s => ({
        ...s,
        elapsedSeconds: Math.floor((Date.now() - startTimeRef.current) / 1000),
      }));
    }, TICKER_INTERVAL_MS);

    // ── Call backend to create payment ────────────────────────────────
    let reference: string;
    let transactionId: string;

    try {
      const res  = await fetch('/api/ccv/payment', {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({
          storeId,
          terminalId,
          orderId:     params.orderId,
          amountCents: params.amountCents,
          language:    params.language ?? 'eng',
          posScreenId: params.posScreenId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        clearTimers();
        setState(s => ({
          ...s,
          phase: 'failed',
          error: data.error ?? 'Payment initiation failed',
          failureCode: data.failureCode,
        }));
        return;
      }

      reference     = data.reference;
      transactionId = data.transactionId;
      referenceRef.current = reference;

      setState(s => ({ ...s, reference, transactionId }));

      // If already resolved (shouldn't happen in ATTENDED mode)
      if (data.status === 'success') {
        clearTimers();
        setState(s => ({ ...s, phase: 'success' }));
        onSuccess?.(reference);
        return;
      }
    } catch (err) {
      clearTimers();
      setState(s => ({ ...s, phase: 'failed', error: String(err) }));
      return;
    }

    // ── Schedule polling fallback after 45s ────────────────────────────
    pollTimerRef.current = setTimeout(
      () => pollStatus(reference),
      POLL_INITIAL_DELAY_MS,
    );

    // ── Schedule 6-minute timeout → manualintervention ─────────────────
    timeoutTimerRef.current = setTimeout(() => {
      clearTimers();
      setState(s => {
        if (s.phase === 'pending' || s.phase === 'waiting_confirmation') {
          onUnknown?.(reference);
          return { ...s, phase: 'manualintervention' };
        }
        return s;
      });
    }, MAX_TIMEOUT_MS);
  }, [storeId, terminalId, authHeaders, clearTimers, pollStatus, onSuccess, onUnknown]);

  // ── Handle browser return from payUrl ─────────────────────────────────────

  const handleReturnFromPayUrl = useCallback(() => {
    // Don't treat browser return as payment confirmation
    // Switch to "waiting_confirmation" and await webhook
    setState(s => {
      if (s.phase === 'pending') {
        return { ...s, phase: 'waiting_confirmation' };
      }
      return s;
    });
  }, []);

  // ── Cancel payment ────────────────────────────────────────────────────────

  const cancel = useCallback(() => {
    clearTimers();
    setState({
      phase:                    'idle',
      currency:                 'EUR',
      askCustomerSignature:     false,
      askCustomerIdentification: false,
      askMerchantSignature:     false,
      printCustomerReceipt:     false,
      elapsedSeconds:           0,
    });
    referenceRef.current = '';
  }, [clearTimers]);

  // ── Late status recovery — cashier triggers manually ──────────────────────

  const refreshStatus = useCallback(async () => {
    const ref = referenceRef.current;
    if (!ref) return;
    await pollStatus(ref);
  }, [pollStatus]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return {
    state,
    startPayment,
    handleReturnFromPayUrl,
    cancel,
    refreshStatus,
  };
}
