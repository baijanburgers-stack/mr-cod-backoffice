// ─── CCV Integration Test Book Attended v2.2 — All Certification Test Cases ──
//
// These definitions are the source of truth for the certification dashboard.
// Each amount is EXACT — CCV C-TAP test host uses specific trigger amounts.
// DO NOT round or format with thousands separators.

export type CertGroup =
  | 'Happy Flow'
  | 'Receipt — Print'
  | 'Receipt — Email'
  | 'Signature / ID'
  | 'Refund'
  | 'Journal'
  | 'Failure Scenarios';

export type CertResult = 'pass' | 'fail' | 'pending' | 'skipped' | 'not_run';

export interface CertTestCase {
  id:              string;       // G1, RP21, FS6 etc.
  group:           CertGroup;
  title:           string;
  amountCents:     number | null; // null = no specific trigger amount
  preparation:     string[];
  execution:       string[];
  expectedResult:  string[];
  conditionalOn?:  string;        // only execute if condition is met
  promptRequired?: string | null; // Dutch popup text required
  promptMinSec?:   number;        // min seconds popup must show
  isRefundTest?:   boolean;
  isJournalTest?:  boolean;
  isReceiptTest?:  boolean;
  triggerNote?:    string;        // special C-TAP trigger behaviour
  refundFooterText?: string;      // expected footer text (RG54)
}

export const CCV_CERT_TESTS: CertTestCase[] = [

  // ── GROUP G: HAPPY FLOW ──────────────────────────────────────────────────

  {
    id:          'G1',
    group:       'Happy Flow',
    title:       'Happy Flow — Standard Sale',
    amountCents: 1000,  // €10.00
    preparation: [
      'All devices idle.',
      'Terminal configured to ask for cardholder receipt.',
    ],
    execution: [
      'Start a transaction of EUR 10.00.',
      'Ask for cardholder receipt when prompted.',
    ],
    expectedResult: [
      'Transaction ends successfully.',
      'Redirected page shown (mandatory for attended mode).',
      'Cardholder receipt printed.',
    ],
    isReceiptTest: true,
    triggerNote: 'Standard success path at C-TAP host.',
  },

  {
    id:          'G2',
    group:       'Happy Flow',
    title:       'Happy Flow — Amount ≥ EUR 1,000',
    amountCents: 100000,  // €1000.00
    preparation: [
      'All devices idle.',
      'Terminal configured to ask for cardholder receipt.',
    ],
    execution: [
      'Start a transaction of EUR 1000.00.',
      'CRITICAL: amount must be sent as "1000.00" — NOT "1,000.00" (no thousands separator).',
    ],
    expectedResult: [
      'Transaction ends successfully.',
      'No formatting error caused by thousands separator.',
    ],
    triggerNote: 'Tests that amount serialisation uses no thousands separator.',
  },

  // ── RECEIPT TESTS — PRINT ────────────────────────────────────────────────

  {
    id:           'RP1',
    group:        'Receipt — Print',
    title:        'Print Always',
    amountCents:  1100,  // €11.00
    conditionalOn: 'configuration = always print receipt',
    preparation:  ['All devices idle.'],
    execution:    ['Start a transaction of EUR 11.00.'],
    expectedResult: [
      'Transaction ends successfully.',
      'Cardholder receipt is always printed (no prompt to cardholder).',
    ],
    isReceiptTest: true,
  },

  {
    id:           'RP21',
    group:        'Receipt — Print',
    title:        'Cardholder Selects YES for Receipt',
    amountCents:  1100,  // €11.00
    conditionalOn: 'cashier display asks whether cardholder wants receipt',
    preparation:  ['All devices idle.'],
    execution: [
      'Start a transaction of EUR 11.00.',
      'Select YES when asked whether cardholder wants receipt.',
    ],
    expectedResult: [
      'Transaction ends successfully.',
      'Cardholder receipt is printed.',
    ],
    isReceiptTest: true,
  },

  {
    id:           'RP22',
    group:        'Receipt — Print',
    title:        'Cardholder Selects NO for Receipt',
    amountCents:  1200,  // €12.00
    conditionalOn: 'cashier display asks whether cardholder wants receipt',
    preparation:  ['All devices idle.'],
    execution: [
      'Start a transaction of EUR 12.00.',
      'Select NO when asked whether cardholder wants receipt.',
    ],
    expectedResult: [
      'Transaction ends successfully.',
      'No cardholder receipt is printed.',
    ],
    isReceiptTest: true,
  },

  {
    id:           'RP5',
    group:        'Receipt — Print',
    title:        'Paper Empty',
    amountCents:  1600,  // €16.00
    conditionalOn: 'printer paper is used',
    preparation: [
      'Remove printer paper to activate paper empty sensor.',
      'All devices idle.',
    ],
    execution: ['Start a transaction of EUR 16.00.'],
    expectedResult: [
      'Either: transaction is rejected because of paper empty.',
      'Or: transaction completes and next transaction is blocked until receipt printed after paper reinstalled.',
      'If signature required: cashier clearly informed that signature still must be collected on unprinted receipt.',
    ],
    isReceiptTest: true,
    triggerNote: 'Tests paper-empty edge case.',
  },

  // ── RECEIPT TESTS — EMAIL ────────────────────────────────────────────────

  {
    id:           'RE1',
    group:        'Receipt — Email',
    title:        'E-mail Address Already Known',
    amountCents:  1700,  // €17.00
    conditionalOn: 'receipts always sent by e-mail, customer e-mail already known',
    preparation:  ['All devices idle.'],
    execution:    ['Start a transaction of EUR 17.00.'],
    expectedResult: [
      'Transaction succeeds.',
      'Receipt sent to the already-known e-mail address automatically.',
    ],
    isReceiptTest: true,
  },

  {
    id:           'RE21',
    group:        'Receipt — Email',
    title:        'Cardholder Enters E-mail Address',
    amountCents:  1800,  // €18.00
    conditionalOn: 'receipt sent by e-mail, e-mail not known beforehand',
    preparation:  ['All devices idle.'],
    execution: [
      'Start a transaction of EUR 18.00.',
      'E-mail must be requested BEFORE the transaction starts (not after).',
    ],
    expectedResult: [
      'E-mail collected before transaction.',
      'If cardholder refuses e-mail but wants receipt: either print or cancel.',
      'If e-mail given: transaction completes and receipt sent to entered address.',
    ],
    isReceiptTest: true,
    triggerNote: 'E-mail MUST be requested before the transaction, not after.',
  },

  // ── SIGNATURE / IDENTIFICATION TESTS ────────────────────────────────────

  {
    id:           'RG1',
    group:        'Signature / ID',
    title:        'Request Signature',
    amountCents:  5001,  // €50.01
    preparation:  ['All devices idle.'],
    execution:    ['Start a transaction of EUR 50.01.'],
    expectedResult: [
      'Merchant receipt for signature printed immediately (no cashier action needed).',
      'Cardholder receipt printed always or on request per config.',
      'Cashier sees popup: VRAAG HANDTEKENING.',
      'Popup stays visible at least 6 seconds or until cashier dismisses.',
      'Signed merchant receipt stored securely by POS.',
    ],
    promptRequired: 'VRAAG HANDTEKENING',
    promptMinSec:   6,
    triggerNote:    '€50.01 triggers askCustomerSignature=true at C-TAP host.',
  },

  {
    id:           'RG2',
    group:        'Signature / ID',
    title:        'Request Identification',
    amountCents:  5002,  // €50.02
    preparation:  ['All devices idle.'],
    execution:    ['Start a transaction of EUR 50.02.'],
    expectedResult: [
      'Merchant receipt for identification printed immediately.',
      'Cardholder receipt printed on request.',
      'Cashier sees popup: VRAAG IDENTIFICATIE.',
      'Popup stays visible at least 6 seconds or until cashier dismisses.',
      'Merchant receipt with identification stored by POS.',
    ],
    promptRequired: 'VRAAG IDENTIFICATIE',
    promptMinSec:   6,
    triggerNote:    '€50.02 triggers askCustomerIdentification=true at C-TAP host.',
  },

  {
    id:           'RG3',
    group:        'Signature / ID',
    title:        'Request Signature AND Identification',
    amountCents:  5003,  // €50.03
    preparation:  ['All devices idle.'],
    execution:    ['Start a transaction of EUR 50.03.'],
    expectedResult: [
      'Merchant receipt (with both) printed immediately.',
      'Cardholder receipt printed on request.',
      'Cashier sees popup: VRAAG HANDTEKENING EN IDENTIFICATIE.',
      'Popup stays visible at least 6 seconds or until cashier dismisses.',
      'Receipt with signature and identification stored by POS.',
    ],
    promptRequired: 'VRAAG HANDTEKENING EN IDENTIFICATIE',
    promptMinSec:   6,
    triggerNote:    '€50.03 triggers both flags at C-TAP host.',
  },

  // ── REFUND TESTS ─────────────────────────────────────────────────────────

  {
    id:           'RG51',
    group:        'Refund',
    title:        'Refund Happy Flow — Full Amount',
    amountCents:  2000,  // €20.00
    preparation: [
      'Login as AUTHORIZED cashier (manager role).',
      'First perform a sale of EUR 20.00 and note the CCV reference.',
    ],
    execution: [
      'Start a refund of EUR 20.00 using the original sale reference.',
      'Ask for cardholder receipt.',
    ],
    expectedResult: [
      'Refund succeeds.',
      'Merchant receipt and cardholder refund receipt printed.',
      'Popup: ZET HANDTEKENING — stays at least 6 seconds.',
    ],
    isRefundTest:   true,
    promptRequired: 'ZET HANDTEKENING',
    promptMinSec:   6,
  },

  {
    id:           'RG52',
    group:        'Refund',
    title:        'Partial Refund',
    amountCents:  1500,  // €15.00
    preparation: [
      'Login as AUTHORIZED cashier (manager role).',
      'First perform a sale of EUR 20.00 and note the CCV reference.',
    ],
    execution: [
      'Start a refund of EUR 15.00 using the original sale reference.',
      'Ask for cardholder receipt.',
    ],
    expectedResult: [
      'Partial refund succeeds.',
      'Merchant and cardholder refund receipts printed.',
      'Popup: ZET HANDTEKENING — stays at least 6 seconds.',
    ],
    isRefundTest:   true,
    promptRequired: 'ZET HANDTEKENING',
    promptMinSec:   6,
  },

  {
    id:           'RG53',
    group:        'Refund',
    title:        'Normal Cashier Cannot Start Refund',
    amountCents:  2000,  // €20.00
    preparation: [
      'Create original sale of EUR 20.00.',
      'Switch to NON-authorized cashier login.',
    ],
    execution: ['Attempt to start refund as non-authorized cashier.'],
    expectedResult: [
      'Refund button is not visible or is disabled for non-authorized cashier.',
      'System refuses refund attempt.',
    ],
    isRefundTest: true,
    triggerNote:  'Role-based access control enforcement test.',
  },

  {
    id:           'RG54',
    group:        'Refund',
    title:        'Refund Receipt Footer Text',
    amountCents:  null,
    preparation:  ['Execute any successful refund first.'],
    execution:    ['Inspect the printed/displayed refund receipt footer.'],
    expectedResult: [
      'Footer text (recommended): "Het geld zal de volgende werkdag op uw rekening staan"',
      'This is RECOMMENDED, not mandatory — record whether present or absent.',
    ],
    isRefundTest:     true,
    refundFooterText: 'Het geld zal de volgende werkdag op uw rekening staan',
  },

  // ── JOURNAL TESTS ────────────────────────────────────────────────────────

  {
    id:           'J1',
    group:        'Journal',
    title:        'journalReceipt Storage',
    amountCents:  3000,  // €30.00
    conditionalOn: 'journalReceipt is stored by POS',
    preparation:  ['All devices idle.'],
    execution:    ['Start a transaction of EUR 30.00.'],
    expectedResult: [
      'Transaction succeeds.',
      'journalReceipt stored securely in Firestore.',
      'Only authorized users can read.',
      'Content is immutable (not editable by normal users).',
    ],
    isJournalTest: true,
  },

  {
    id:           'J2',
    group:        'Journal',
    title:        'eJournal Storage',
    amountCents:  3000,  // €30.00
    conditionalOn: 'eJournal is stored by POS',
    preparation:  ['All devices idle.'],
    execution:    ['Start a transaction of EUR 30.00.'],
    expectedResult: [
      'Transaction succeeds.',
      'eJournal stored securely.',
      'Only authorized users can read.',
      'Content is not editable.',
    ],
    isJournalTest: true,
  },

  // ── FAILURE SCENARIO TESTS ───────────────────────────────────────────────

  {
    id:          'FS1',
    group:       'Failure Scenarios',
    title:       'Declined Payment',
    amountCents: 5005,  // €50.05
    preparation: ['All devices idle.'],
    execution: [
      'Start a transaction of EUR 50.05.',
      'Pay using chip of the test card.',
    ],
    expectedResult: [
      'Transaction ends in failure/decline.',
      'POS clearly shows failed state.',
      'No goods or services delivered.',
    ],
    triggerNote: '€50.05 triggers decline at C-TAP test host (chip card required).',
  },

  {
    id:          'FS2',
    group:       'Failure Scenarios',
    title:       'Terminal Already In Use',
    amountCents: 2100,  // €21.00
    preparation: ['All devices idle.'],
    execution: [
      'Start EUR 21.00 on Session 2 (using the same terminal).',
      'While it is running, start EUR 11.00 on Session 1 (same terminal).',
    ],
    expectedResult: [
      'Second transaction (Session 1) receives terminal-busy error.',
      'Session 1 POS clearly shows failing state.',
      'No goods delivered on failed attempt.',
    ],
    triggerNote: 'Tests concurrent terminal access rejection.',
  },

  {
    id:          'FS4',
    group:       'Failure Scenarios',
    title:       'Terminal Busy (Engineer Mode)',
    amountCents: 1200,  // €12.00
    preparation: [
      'Enter Engineer Mode on terminal: press STOP, OK, CORR, CORR, CORR during idle screen after power up.',
      'All POS sessions idle.',
    ],
    execution: ['Start a transaction of EUR 12.00.'],
    expectedResult: [
      'POS clearly indicates failed transaction.',
      'Terminal is busy / unavailable message shown.',
    ],
    triggerNote: 'Terminal must be manually put into Engineer Mode before test.',
  },

  {
    id:          'FS5',
    group:       'Failure Scenarios',
    title:       'Short Term Interruption (<6 min)',
    amountCents: 2000,  // €20.00
    preparation: ['All devices idle.'],
    execution: [
      't=0: Start a transaction of EUR 20.00.',
      'Immediately after terminal shows successful: remove ethernet cable from terminal.',
      't=330s: Reconnect ethernet cable.',
    ],
    expectedResult: [
      'After reconnect, POS eventually shows successful transaction.',
      'Recovery < 6 minutes: normal success path.',
    ],
    triggerNote: 'Tests webhook/polling recovery within the 6-minute window.',
  },

  {
    id:          'FS6',
    group:       'Failure Scenarios',
    title:       'Long Term Interruption (≥6 min)',
    amountCents: 2100,  // €21.00
    preparation: ['All devices idle.'],
    execution: [
      't=0: Start a transaction of EUR 21.00.',
      'Immediately after terminal shows success: remove ethernet cable.',
      't=500s: Reconnect ethernet cable.',
    ],
    expectedResult: [
      'At t=360s: POS shows NEUTRAL unknown-result message — NOT "failed" or "error".',
      'Message must be: "Payment result unknown — Please contact staff".',
      'After reconnect and recovery: cashier sees that transaction was actually successful.',
    ],
    triggerNote: 'Tests 6-minute manualintervention threshold and neutral UX language.',
  },

  {
    id:          'FS7',
    group:       'Failure Scenarios',
    title:       'Async Webhook — Return Page Independent',
    amountCents: null,
    preparation: [
      'Temporarily change webhook URL in CCV portal to a capture endpoint (e.g. webhook.site).',
      'This simulates webhook being blocked/absent.',
    ],
    execution: [
      'Start any transaction.',
      'Wait until redirected return page is shown.',
    ],
    expectedResult: [
      'Return page shows NO final payment result (result not yet known at redirect time).',
      'POS sends ReadTransactionRequest after 45 seconds to self-recover.',
      'High-frequency polling (< 30s interval) is NOT used.',
    ],
    triggerNote: 'Tests that return page ≠ payment confirmation and that 45s poll fallback fires.',
  },

];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export const getCertTest = (id: string): CertTestCase | undefined =>
  CCV_CERT_TESTS.find(t => t.id === id);

export const CERT_GROUPS: CertGroup[] = [
  'Happy Flow',
  'Receipt — Print',
  'Receipt — Email',
  'Signature / ID',
  'Refund',
  'Journal',
  'Failure Scenarios',
];

export const testsByGroup = (group: CertGroup): CertTestCase[] =>
  CCV_CERT_TESTS.filter(t => t.group === group);

// ─── Evidence schema ──────────────────────────────────────────────────────────

export interface CertEvidence {
  id?:                  string;   // Firestore doc ID
  testId:               string;
  storeId:              string;
  terminalId:           string;
  runAt:                string;   // ISO
  amountCents:          number;
  reference:            string;   // CCV ccvReference
  startedAt:            string;   // ISO
  completedAt:          string;   // ISO
  finalStatus:          string;   // success | failed | manualintervention
  webhookReceivedAt:    string | null;
  pollingAttempts:      number;
  receiptBehavior:      'printed' | 'emailed' | 'none' | 'unknown';
  journalStored:        boolean;
  cashierPromptShown:   boolean;
  cashierPromptText:    string;
  result:               CertResult;
  operatorNotes:        string;
}

export const emptyCertEvidence = (
  testId: string,
  storeId: string,
  terminalId: string,
  amountCents: number,
): CertEvidence => ({
  testId,
  storeId,
  terminalId,
  runAt:              new Date().toISOString(),
  amountCents,
  reference:          '',
  startedAt:          new Date().toISOString(),
  completedAt:        '',
  finalStatus:        '',
  webhookReceivedAt:  null,
  pollingAttempts:    0,
  receiptBehavior:    'unknown',
  journalStored:      false,
  cashierPromptShown: false,
  cashierPromptText:  '',
  result:             'pending',
  operatorNotes:      '',
});
