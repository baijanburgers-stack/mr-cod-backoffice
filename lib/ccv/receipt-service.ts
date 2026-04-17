import { CcvTransactionDetails } from './types';

// ─── Receipt & Journal Service ───────────────────────────────────────────────
//
// Rules (from CCV spec):
// 1. NEVER alter EFT receipt lines — not even blank lines
// 2. Print customerReceipt ONLY when printCustomerReceipt === true
// 3. Store merchantReceipt for legal / chargeback purposes
// 4. Use monospace font for CCV receipt blocks
// 5. Preserve all blank lines and alignment exactly as returned
//
// Refund receipt (RG54): append recommended Dutch footer AFTER EFT lines

// CCV Test Book RG54 — recommended (not mandatory) refund footer text
export const REFUND_RECEIPT_FOOTER_NL =
  'Het geld zal de volgende werkdag op uw rekening staan';

export interface ParsedReceipts {
  customerReceipt?:     string;
  merchantReceipt?:     string;
  journalReceipt?:      string;
  eJournal?:            string;
  printCustomerReceipt: boolean;
}

// ── Parse receipts from CCV transaction details ──────────────────────────────

export function parseReceipts(
  details?: CcvTransactionDetails,
): ParsedReceipts {
  if (!details) {
    return { printCustomerReceipt: false };
  }

  return {
    customerReceipt:     details.customerReceipt ?? undefined,
    merchantReceipt:     details.merchantReceipt ?? undefined,
    journalReceipt:      details.journalReceipt  ?? undefined,
    eJournal:            details.eJournal         ?? undefined,
    printCustomerReceipt: details.printCustomerReceipt === true,
  };
}

// ── Format receipt for printing — NEVER modify EFT lines ────────────────────
//
// Returns the receipt EXACTLY as received from CCV, wrapped in a pre-formatted
// block for monospace rendering. Preserves all blank lines and alignment.

export function formatReceiptForPrint(receiptText: string): string {
  // Do NOT modify the text — return verbatim
  return receiptText;
}

// ── Format receipt as HTML (monospace) for screen display ────────────────────

export function formatReceiptAsHtml(receiptText: string): string {
  const escaped = receiptText
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/ /g,  '&nbsp;');

  const lines = escaped.split('\n').join('<br/>');
  return `<pre style="font-family:monospace;white-space:pre;font-size:12px;line-height:1.4">${lines}</pre>`;
}

// ── Format receipt as plain ESC/POS-ready text ───────────────────────────────
//
// Returns receipt as-is with a clear separator. Used for printing via
// Star printer or similar.

export function formatReceiptForEscPos(
  receiptText:    string,
  receiptType:    'customer' | 'merchant' | 'journal' = 'customer',
  isRefund:       boolean = false,
): string {
  const header = receiptType === 'merchant'
    ? '------- MERCHANT COPY -------\n'
    : receiptType === 'journal'
    ? '------- JOURNAL COPY --------\n'
    : '------- CUSTOMER COPY -------\n';

  // RG54: append refund footer AFTER EFT lines (never modify EFT lines)
  const refundFooter = isRefund
    ? `\n------------------------------\n${REFUND_RECEIPT_FOOTER_NL}\n`
    : '';

  const footer = '\n------------------------------\n\n\n';   // feed before cut

  // IMPORTANT: do NOT modify receiptText
  return `${header}${receiptText}${refundFooter}${footer}`;
}

// ── Validate that a receipt should be printed ────────────────────────────────

export function shouldPrintCustomerReceipt(
  details?: CcvTransactionDetails,
): boolean {
  return details?.printCustomerReceipt === true;
}

// ── Extract all receipt data into a flat log object for Firestore ────────────

export function receiptToLog(details?: CcvTransactionDetails): {
  customerReceipt?:     string;
  merchantReceipt?:     string;
  journalReceipt?:      string;
  eJournal?:            string;
  printCustomerReceipt: boolean;
} {
  return parseReceipts(details);
}
