import { randomUUID } from 'crypto';
import { getAdminDb } from '../firebase-admin';
import { CcvClient, CcvClientError, createCcvClient } from './client';
import { parseReceipts } from './receipt-service';
import {
  CcvEnvironment,
  CcvCreatePaymentRequest,
  CcvCreateRefundRequest,
  CcvCreateTransactionResponse,
  CcvReadTransactionResponse,
  CcvTransactionRecord,
  CcvWebhookPayload,
  InitiateSaleParams,
  InitiateRefundParams,
  TransactionResult,
  PaymentTransactionStatus,
  CcvManagementSystemId,
  CcvTransactionDetails,
} from './types';

const COLLECTION = 'ccv_transactions';

// ── Map CCV status → our status ──────────────────────────────────────────────

function mapStatus(
  ccvStatus: string | undefined,
): PaymentTransactionStatus {
  switch (ccvStatus) {
    case 'success':            return 'success';
    case 'failed':             return 'failed';
    case 'manualintervention': return 'manualintervention';
    case 'pending':            return 'payment_pending';
    default:                   return 'payment_unknown';
  }
}

// ── Build returnUrl / webhookUrl with reference substitution ─────────────────

function buildUrls(reference?: string) {
  const base       = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://mr-cod-backoffice--mr-cod-online-ordering.europe-west4.hosted.app';
  const ref        = reference ?? '{reference}';
  const returnUrl  = `${base}/ccv/return?reference=${ref}`;
  const webhookUrl = `${base}/api/ccv/webhook`;
  return { returnUrl, webhookUrl };
}

// ────────────────────────────────────────────────────────────────────────────
// Initiate a SALE transaction
// ────────────────────────────────────────────────────────────────────────────

export async function initiateSale(
  params: InitiateSaleParams,
): Promise<TransactionResult> {
  const {
    orderId, storeId, posScreenId, cashierId,
    amountCents, terminalId, managementSystemId,
    environment, apiKey,
    language = 'eng',
    isKiosk = false,
  } = params;

  const idempotencyRef  = randomUUID();
  const amountStr       = (amountCents / 100).toFixed(2);
  const { returnUrl, webhookUrl } = buildUrls();

  const requestBody: CcvCreatePaymentRequest = {
    currency:   'EUR',
    amount:     amountStr,
    method:     'terminal',
    language,
    returnUrl,
    webhookUrl,
    details: {
      operatingEnvironment: isKiosk ? 'SEMI_UNATTENDED' : 'ATTENDED',
      managementSystemId,
      terminalId,
      accessProtocol:       'OPI_NL',
      ...(isKiosk ? {} : { merchantLanguage: language.toUpperCase() as any }),
    },
  };

  // Persist with payment_pending immediately before calling CCV
  const db       = getAdminDb();
  const now      = new Date().toISOString();
  const docRef   = db.collection(COLLECTION).doc();
  const transId  = docRef.id;

  const initialRecord: CcvTransactionRecord = {
    id:                   transId,
    orderId,
    storeId,
    posScreenId,
    cashierId,
    provider:             'CCV',
    transactionType:      'sale',
    amount:               amountStr,
    currency:             'EUR',
    status:               'payment_pending',
    terminalId,
    managementSystemId,
    accessProtocol:       'OPI_NL',
    environment,
    idempotencyReference: idempotencyRef,
    createdAt:            now,
    updatedAt:            now,
    rawCreateRequest:     requestBody,
    retryCount:           0,
  };

  await docRef.set(initialRecord);

  // Call CCV
  const client = createCcvClient(apiKey, environment);
  let response: CcvCreateTransactionResponse;

  try {
    response = await client.createPayment(requestBody, idempotencyRef);
  } catch (err) {
    const ccvErr    = err instanceof CcvClientError ? err : null;
    const errorData = ccvErr
      ? { failureCode: ccvErr.ccvError.failureCode, errorReference: ccvErr.ccvError.reference }
      : {};

    await docRef.update({
      status:           'failed',
      rawCreateResponse: ccvErr?.ccvError ?? String(err),
      updatedAt:        new Date().toISOString(),
      ...errorData,
    });

    throw err;
  }

  // Update Firestore with CCV response
  const status = mapStatus(response.status);
  await docRef.update({
    ccvReference:      response.reference,
    status,
    payUrl:            response.payUrl,
    rawCreateResponse: response,
    updatedAt:         new Date().toISOString(),
    ...(response.failureCode ? { failureCode: response.failureCode } : {}),
  });

  return {
    transactionId: transId,
    ccvReference:  response.reference,
    status,
    payUrl:        response.payUrl,
    rawResponse:   response,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Initiate a REFUND transaction
// ────────────────────────────────────────────────────────────────────────────

export async function initiateRefund(
  params: InitiateRefundParams,
): Promise<TransactionResult> {
  const {
    orderId, storeId, cashierId,
    amountCents, originalCcvReference,
    terminalId, managementSystemId,
    environment, apiKey,
    isKiosk = false,
  } = params;

  const idempotencyRef  = randomUUID();
  const amountStr       = (amountCents / 100).toFixed(2);
  const { returnUrl, webhookUrl } = buildUrls();

  const requestBody: CcvCreateRefundRequest = {
    amount:     amountStr,
    reference:  originalCcvReference,
    returnUrl,
    webhookUrl,
    details: {
      operatingEnvironment: isKiosk ? 'SEMI_UNATTENDED' : 'ATTENDED',
      managementSystemId,
      terminalId,
      accessProtocol:       'OPI_NL',
      ...(isKiosk ? {} : { merchantLanguage: 'ENG' }),
    },
  };

  const db      = getAdminDb();
  const now     = new Date().toISOString();
  const docRef  = db.collection(COLLECTION).doc();
  const transId = docRef.id;

  const initialRecord: CcvTransactionRecord = {
    id:                   transId,
    orderId,
    storeId,
    cashierId,
    provider:             'CCV',
    transactionType:      'refund',
    amount:               amountStr,
    currency:             'EUR',
    status:               'payment_pending',
    originalReference:    originalCcvReference,
    terminalId,
    managementSystemId,
    accessProtocol:       'OPI_NL',
    environment,
    idempotencyReference: idempotencyRef,
    createdAt:            now,
    updatedAt:            now,
    rawCreateRequest:     requestBody,
    retryCount:           0,
  };

  await docRef.set(initialRecord);

  const client = createCcvClient(apiKey, environment);
  let response: CcvCreateTransactionResponse;

  try {
    response = await client.createRefund(requestBody, idempotencyRef);
  } catch (err) {
    await docRef.update({
      status:            'failed',
      rawCreateResponse: err instanceof CcvClientError ? err.ccvError : String(err),
      updatedAt:         new Date().toISOString(),
    });
    throw err;
  }

  const status = mapStatus(response.status);
  await docRef.update({
    ccvReference:      response.reference,
    status,
    payUrl:            response.payUrl,
    rawCreateResponse: response,
    updatedAt:         new Date().toISOString(),
  });

  return {
    transactionId: transId,
    ccvReference:  response.reference,
    status,
    rawResponse:   response,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Refresh transaction status from CCV (polling / admin)
// ────────────────────────────────────────────────────────────────────────────

export async function refreshTransaction(
  reference:   string,
  apiKey:      string,
  environment: CcvEnvironment,
): Promise<{
  status:          PaymentTransactionStatus;
  receiptPrompts:  ReturnType<typeof extractReceiptPrompts>;
  raw:             CcvReadTransactionResponse;
}> {
  const client    = createCcvClient(apiKey, environment);
  const response  = await client.readTransaction(reference);
  const db        = getAdminDb();

  const status    = mapStatus(response.status);
  const receipts  = parseReceipts(response.details);
  const prompts   = extractReceiptPrompts(response.details);

  // Find local record by CCVReference
  const snap = await db.collection(COLLECTION)
    .where('ccvReference', '==', reference)
    .limit(1)
    .get();

  if (!snap.empty) {
    const docRef = snap.docs[0].ref;
    const update: Partial<CcvTransactionRecord> = {
      status,
      rawReadResponse:      response,
      updatedAt:            new Date().toISOString(),
      customerReceipt:      receipts.customerReceipt,
      merchantReceipt:      receipts.merchantReceipt,
      journalReceipt:       receipts.journalReceipt,
      eJournal:             receipts.eJournal,
      printCustomerReceipt: receipts.printCustomerReceipt,
      ...prompts,
    };
    if (status !== 'payment_pending') {
      update.finalResolvedAt = new Date().toISOString();
    }
    await docRef.update(update);
  }

  return { status, receiptPrompts: prompts, raw: response };
}

// ────────────────────────────────────────────────────────────────────────────
// Handle incoming webhook — idempotent
// ────────────────────────────────────────────────────────────────────────────

export async function processWebhook(
  payload:     CcvWebhookPayload,
  apiKey:      string,
  environment: CcvEnvironment,
): Promise<{
  alreadyProcessed: boolean;
  status:           PaymentTransactionStatus;
  orderId?:         string;
  receiptPrompts:   ReturnType<typeof extractReceiptPrompts>;
}> {
  const { id: reference } = payload;
  const db  = getAdminDb();

  // Find local record
  const snap = await db.collection(COLLECTION)
    .where('ccvReference', '==', reference)
    .limit(1)
    .get();

  if (snap.empty) {
    // Unknown reference — still fetch and log
    const { status, receiptPrompts } = await refreshTransaction(reference, apiKey, environment);
    return { alreadyProcessed: false, status, receiptPrompts };
  }

  const docRef   = snap.docs[0].ref;
  const existing = snap.docs[0].data() as CcvTransactionRecord;

  // Idempotency — if already in a final state, skip re-processing
  if (
    existing.status === 'success'    ||
    existing.status === 'failed'     ||
    existing.status === 'manualintervention'
  ) {
    return {
      alreadyProcessed: true,
      status:           existing.status,
      orderId:          existing.orderId,
      receiptPrompts:   extractReceiptPrompts(undefined),
    };
  }

  // Fetch latest state from CCV
  const client   = createCcvClient(apiKey, environment);
  const response = await client.readTransaction(reference);
  const status   = mapStatus(response.status);
  const receipts = parseReceipts(response.details);
  const prompts  = extractReceiptPrompts(response.details);

  const now = new Date().toISOString();
  await docRef.update({
    status,
    webhookReceivedAt:    now,
    rawReadResponse:      response,
    updatedAt:            now,
    customerReceipt:      receipts.customerReceipt,
    merchantReceipt:      receipts.merchantReceipt,
    journalReceipt:       receipts.journalReceipt,
    eJournal:             receipts.eJournal,
    printCustomerReceipt: receipts.printCustomerReceipt,
    ...(status !== 'payment_pending' ? { finalResolvedAt: now } : {}),
    ...prompts,
  });

  return {
    alreadyProcessed: false,
    status,
    orderId:          existing.orderId,
    receiptPrompts:   prompts,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function extractReceiptPrompts(details?: CcvTransactionDetails) {
  return {
    askCustomerSignature:     details?.askCustomerSignature     ?? false,
    askCustomerIdentification: details?.askCustomerIdentification ?? false,
    askMerchantSignature:     details?.askMerchantSignature     ?? false,
  };
}

// ── Resolve API key from Firestore store document ────────────────────────────

export async function resolveStoreApiKey(storeId: string): Promise<{
  apiKey:      string;
  environment: CcvEnvironment;
  managementSystemId: CcvManagementSystemId;
}> {
  const db      = getAdminDb();
  const storeDoc = await db.collection('stores').doc(storeId).get();

  if (!storeDoc.exists) {
    throw new Error(`Store ${storeId} not found`);
  }

  const data   = storeDoc.data()!;
  const env: CcvEnvironment = data.ccvEnvironment === 'LIVE' ? 'production' : 'test';
  const apiKey = env === 'production'
    ? (data.ccvApiKeyLive ?? '')
    : (data.ccvApiKeyTest ?? '');

  if (!apiKey) {
    throw new Error(`No CCV API key configured for store ${storeId} in ${env} mode`);
  }

  const managementSystemId: CcvManagementSystemId =
    data.ccvManagementSystemId ?? (env === 'test' ? 'GrundmasterNL-ThirdPartyTest' : 'GrundmasterBE');

  return { apiKey, environment: env, managementSystemId };
}

// ── Get transaction record by Firestore id ───────────────────────────────────

export async function getTransactionById(id: string): Promise<CcvTransactionRecord | null> {
  const db  = getAdminDb();
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as CcvTransactionRecord) : null;
}

// ── Get transaction by CCV reference ─────────────────────────────────────────

export async function getTransactionByReference(
  reference: string,
): Promise<CcvTransactionRecord | null> {
  const db   = getAdminDb();
  const snap = await db.collection(COLLECTION)
    .where('ccvReference', '==', reference)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as CcvTransactionRecord;
}

// ── List recent transactions for admin ───────────────────────────────────────

export async function listStoreTransactions(
  storeId: string,
  limit = 50,
): Promise<CcvTransactionRecord[]> {
  const db   = getAdminDb();
  const snap = await db.collection(COLLECTION)
    .where('storeId', '==', storeId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CcvTransactionRecord));
}
