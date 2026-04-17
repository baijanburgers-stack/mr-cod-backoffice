import { NextRequest, NextResponse } from 'next/server';
import { refreshTransaction, resolveStoreApiKey, getTransactionByReference, getTransactionById } from '@/lib/ccv/payment-service';
import { CcvClientError } from '@/lib/ccv/client';
import { getAdminAuth } from '@/lib/firebase-admin';

// ─── GET /api/ccv/transaction ─────────────────────────────────────────────────
// Read current transaction status from CCV (or from Firestore cache)
//
// Query params:
//   reference     — CCV transaction reference (preferred)
//   transactionId — Our Firestore doc ID (alternative)
//   refresh=true  — Force re-read from CCV (default: false)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const idToken = req.headers.get('x-id-token') ??
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (idToken) {
    try {
      await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = req.nextUrl;
  const reference     = searchParams.get('reference');
  const transactionId = searchParams.get('transactionId');
  const forceRefresh  = searchParams.get('refresh') === 'true';

  if (!reference && !transactionId) {
    return NextResponse.json(
      { error: 'Provide reference or transactionId query param' },
      { status: 400 },
    );
  }

  // ── Load local record ─────────────────────────────────────────────────────
  const transaction = reference
    ? await getTransactionByReference(reference)
    : await getTransactionById(transactionId!);

  if (!transaction) {
    return NextResponse.json(
      { error: 'Transaction not found', reference },
      { status: 404 },
    );
  }

  const ccvRef = transaction.ccvReference;

  // ── If not pending or explicitly refreshing, return cached ────────────────
  if (!forceRefresh && transaction.status !== 'payment_pending') {
    return NextResponse.json(safeTransactionResponse(transaction));
  }

  if (!ccvRef) {
    return NextResponse.json(safeTransactionResponse(transaction));
  }

  // ── Refresh from CCV ─────────────────────────────────────────────────────
  let storeConfig: Awaited<ReturnType<typeof resolveStoreApiKey>>;
  try {
    storeConfig = await resolveStoreApiKey(transaction.storeId);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }

  try {
    const refreshed = await refreshTransaction(
      ccvRef,
      storeConfig.apiKey,
      storeConfig.environment,
    );

    return NextResponse.json({
      transactionId:            transaction.id,
      reference:                ccvRef,
      status:                   refreshed.status,
      // Cashier prompts to show in UI
      askCustomerSignature:     refreshed.receiptPrompts.askCustomerSignature,
      askCustomerIdentification: refreshed.receiptPrompts.askCustomerIdentification,
      askMerchantSignature:     refreshed.receiptPrompts.askMerchantSignature,
      // Receipt availability
      printCustomerReceipt:     refreshed.raw.details?.printCustomerReceipt ?? false,
      hasCustomerReceipt:       !!refreshed.raw.details?.customerReceipt,
      hasMerchantReceipt:       !!refreshed.raw.details?.merchantReceipt,
    });
  } catch (err) {
    if (err instanceof CcvClientError) {
      if (err.statusCode === 404) {
        return NextResponse.json(
          { error: 'Transaction not found at CCV', failureCode: 'unknown_reference' },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: err.ccvError.message, failureCode: err.ccvError.failureCode },
        { status: 502 },
      );
    }
    console.error('[CCV /transaction] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Strip sensitive fields from response ─────────────────────────────────────

function safeTransactionResponse(t: NonNullable<Awaited<ReturnType<typeof getTransactionByReference>>>) {
  return {
    transactionId:             t.id,
    reference:                 t.ccvReference,
    status:                    t.status,
    amount:                    t.amount,
    currency:                  t.currency,
    transactionType:           t.transactionType,
    terminalId:                t.terminalId,
    environment:               t.environment,
    createdAt:                 t.createdAt,
    updatedAt:                 t.updatedAt,
    webhookReceivedAt:         t.webhookReceivedAt,
    finalResolvedAt:           t.finalResolvedAt,
    failureCode:               t.failureCode,
    printCustomerReceipt:      t.printCustomerReceipt,
    askCustomerSignature:      t.askCustomerSignature,
    askCustomerIdentification: t.askCustomerIdentification,
    askMerchantSignature:      t.askMerchantSignature,
    hasCustomerReceipt:        !!t.customerReceipt,
    hasMerchantReceipt:        !!t.merchantReceipt,
    // Never return rawCreateRequest / rawCreateResponse / apiKey / receipts inline
    // Use /api/ccv/receipt endpoint for receipt content
  };
}
