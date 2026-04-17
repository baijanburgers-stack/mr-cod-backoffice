// ─── CCV Cloud Connect (Attended) v2.2 — TypeScript Types ──────────────────

// ── Environments ────────────────────────────────────────────────────────────

export type CcvEnvironment = 'test' | 'production';

export const CCV_HOSTS: Record<CcvEnvironment, string> = {
  test:       'https://vpos-test.jforce.be/vpos/api/v1',
  production: 'https://api.psp.ccv.eu/api/v1',
};

// ── Management System IDs ────────────────────────────────────────────────────

export type CcvManagementSystemId =
  | 'GrundmasterBE'
  | 'GrundmasterNL'
  | 'GrundmasterNL-ThirdPartyTest';

export const CCV_MANAGEMENT_SYSTEM_IDS: Record<string, CcvManagementSystemId> = {
  BE:   'GrundmasterBE',
  NL:   'GrundmasterNL',
  TEST: 'GrundmasterNL-ThirdPartyTest',
};

// ── Languages ────────────────────────────────────────────────────────────────

export type CcvLanguage         = 'eng' | 'nld' | 'fra' | 'deu';
export type CcvMerchantLanguage = 'ENG' | 'NLD' | 'FRA' | 'DEU';

// ── Transaction Status ───────────────────────────────────────────────────────

export type CcvTransactionStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'manualintervention';

// ── Operating Environment ────────────────────────────────────────────────────

export type CcvOperatingEnvironment = 'ATTENDED';   // only attended for POS

// ── Access Protocol ──────────────────────────────────────────────────────────

export type CcvAccessProtocol = 'OPI_NL';           // always OPI_NL

// ── Transaction Type ─────────────────────────────────────────────────────────

export type CcvTransactionType = 'sale' | 'refund';

// ── Request/Response shapes ──────────────────────────────────────────────────

export interface CcvPaymentDetails {
  operatingEnvironment: CcvOperatingEnvironment;
  merchantLanguage:     CcvMerchantLanguage;
  managementSystemId:   CcvManagementSystemId;
  terminalId:           string;
  accessProtocol:       CcvAccessProtocol;
}

/** POST /payment — create sale transaction */
export interface CcvCreatePaymentRequest {
  currency:   'EUR';
  amount:     string;          // decimal string, e.g. "12.50"
  method:     'terminal';
  language:   CcvLanguage;
  returnUrl:  string;
  webhookUrl: string;
  details:    CcvPaymentDetails;
}

/** POST /refund — create refund transaction */
export interface CcvCreateRefundRequest {
  amount:     string;
  reference:  string;          // original payment reference
  returnUrl:  string;
  webhookUrl: string;
  details:    CcvPaymentDetails;
}

/** Response details returned after readTransaction */
export interface CcvTransactionDetails {
  operatingEnvironment?:    string;
  merchantLanguage?:        string;
  managementSystemId?:      string;
  terminalId?:              string;
  accessProtocol?:          string;
  printCustomerReceipt?:    boolean;
  customerReceipt?:         string;
  merchantReceipt?:         string;
  journalReceipt?:          string;
  eJournal?:                string;
  askCustomerSignature?:    boolean;
  askCustomerIdentification?: boolean;
  askMerchantSignature?:    boolean;
}

/** Response from POST /payment or POST /refund */
export interface CcvCreateTransactionResponse {
  status:      CcvTransactionStatus;
  type:        string;
  currency:    string;
  amount:      string;
  reference:   string;
  payUrl?:     string;
  returnUrl?:  string;
  created?:    string;
  lastUpdate?: string;
  details?:    CcvTransactionDetails;
  // error fields that may appear
  failureCode?:          string;
  transactionReference?: string;
}

/** Response from GET /transaction?reference=... */
export interface CcvReadTransactionResponse {
  status:      CcvTransactionStatus;
  type:        string;
  currency:    string;
  amount:      string;
  reference:   string;
  language?:   string;
  method?:     string;
  payUrl?:     string;
  returnUrl?:  string;
  created?:    string;
  lastUpdate?: string;
  details?:    CcvTransactionDetails;
  failureCode?:          string;
  transactionReference?: string;
}

/** POST body sent by CCV to our webhook endpoint */
export interface CcvWebhookPayload {
  id: string;   // transaction reference
}

/** CCV API error body */
export interface CcvApiError {
  type?:                 string;
  message?:              string;
  field?:                string;
  fields?:               string[];
  reference?:            string;
  failureCode?:          string;
  transactionReference?: string;
}

// ── Known failure codes ──────────────────────────────────────────────────────

export type CcvFailureCode =
  | 'processing_error'
  | 'invalid_config'
  | 'cancelled'
  | 'rejected'
  | 'unknown_reference'
  | 'unsupported_currency'
  | 'bad_credentials';

// ── Terminal Configuration ───────────────────────────────────────────────────

/** Stored per-store in Firestore stores/{storeId} */
export interface CcvTerminalConfig {
  environment:        CcvEnvironment;
  apiKeyTest?:        string;      // server-side only
  apiKeyLive?:        string;      // server-side only
  managementSystemId: CcvManagementSystemId;
  defaultLanguage:    CcvLanguage;
  defaultMerchantLanguage: CcvMerchantLanguage;
}

/** Stored per-POS terminal or per-kiosk */
export interface CcvDeviceConfig {
  terminalId: string;              // TMS TID assigned by CCV
  storeId:    string;
  deviceId:   string;
  deviceType: 'pos' | 'kiosk';
}

// ── Firestore Transaction Record ─────────────────────────────────────────────

export type PaymentTransactionStatus =
  | 'payment_pending'
  | 'success'
  | 'failed'
  | 'manualintervention'
  | 'payment_unknown';

export interface CcvTransactionRecord {
  id?:                   string;   // Firestore doc id
  orderId:               string;
  storeId:               string;
  posScreenId?:          string;
  cashierId?:            string;
  provider:              'CCV';
  transactionType:       CcvTransactionType;
  amount:                string;
  currency:              'EUR';
  status:                PaymentTransactionStatus;
  ccvReference?:         string;
  originalReference?:    string;   // for refunds
  terminalId:            string;
  managementSystemId:    CcvManagementSystemId;
  accessProtocol:        CcvAccessProtocol;
  environment:           CcvEnvironment;
  idempotencyReference:  string;
  webhookReceivedAt?:    string;   // ISO timestamp
  createdAt:             string;   // ISO timestamp
  updatedAt:             string;   // ISO timestamp
  rawCreateRequest?:     unknown;
  rawCreateResponse?:    unknown;
  rawReadResponse?:      unknown;
  customerReceipt?:      string;
  merchantReceipt?:      string;
  journalReceipt?:       string;
  eJournal?:             string;
  printCustomerReceipt?: boolean;
  askCustomerSignature?: boolean;
  askCustomerIdentification?: boolean;
  askMerchantSignature?: boolean;
  failureCode?:          string;
  errorReference?:       string;
  retryCount:            number;
  finalResolvedAt?:      string;
  payUrl?:               string;
}

// ── Service input/output ─────────────────────────────────────────────────────

export interface InitiateSaleParams {
  orderId:            string;
  storeId:            string;
  posScreenId?:       string;
  cashierId?:         string;
  amountCents:        number;       // integer cents
  language?:          CcvLanguage;
  terminalId:         string;
  managementSystemId: CcvManagementSystemId;
  environment:        CcvEnvironment;
  apiKey:             string;
}

export interface InitiateRefundParams {
  orderId:               string;
  storeId:               string;
  cashierId?:            string;
  amountCents:           number;
  originalCcvReference:  string;
  terminalId:            string;
  managementSystemId:    CcvManagementSystemId;
  environment:           CcvEnvironment;
  apiKey:                string;
}

export interface TransactionResult {
  transactionId:  string;       // Firestore doc id
  ccvReference:   string;
  status:         PaymentTransactionStatus;
  payUrl?:        string;
  rawResponse:    CcvCreateTransactionResponse;
}
