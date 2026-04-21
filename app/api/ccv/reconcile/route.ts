import { NextRequest, NextResponse } from 'next/server';
import { refreshTransaction, resolveStoreApiKey, getTransactionByReference, listStoreTransactions } from '@/lib/ccv/payment-service';
import { getAdminAuth } from '@/lib/firebase-admin';

// ─── POST /api/ccv/reconcile ─────────────────────────────────────────────────
// Admin tool — manually refresh/reconcile a CCV transaction
//
// Request:
//   { reference: string }         — reconcile single transaction
//   { storeId: string }           — list & refresh pending for store
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth: require admin role ──────────────────────────────────────────────
  const idToken = req.headers.get('x-id-token') ??
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const role    = decoded['role'] as string | undefined;
    if (!['manager', 'storeAdmin', 'superadmin'].includes(role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { reference?: string; storeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Single-reference reconcile ────────────────────────────────────────────
  if (body.reference) {
    const transaction = await getTransactionByReference(body.reference);
    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    let storeConfig: Awaited<ReturnType<typeof resolveStoreApiKey>>;
    try {
      storeConfig = await resolveStoreApiKey(transaction.storeId);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 422 });
    }

    try {
      const result = await refreshTransaction(
        body.reference,
        storeConfig.apiKey,
        storeConfig.environment,
      );
      return NextResponse.json({
        reference:     body.reference,
        status:        result.status,
        prompts:       result.receiptPrompts,
        resolved:      result.status !== 'payment_pending',
      });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  }

  // ── Batch reconcile pending for store ─────────────────────────────────────
  if (body.storeId) {
    const transactions = await listStoreTransactions(body.storeId, 100);
    const pending      = transactions.filter(t => t.status === 'payment_pending' && t.ccvReference);

    let storeConfig: Awaited<ReturnType<typeof resolveStoreApiKey>>;
    try {
      storeConfig = await resolveStoreApiKey(body.storeId);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 422 });
    }

    const results: { reference: string; status: string; error?: string }[] = [];

    for (const t of pending) {
      try {
        const result = await refreshTransaction(
          t.ccvReference!,
          storeConfig.apiKey,
          storeConfig.environment,
        );
        results.push({ reference: t.ccvReference!, status: result.status });
      } catch (err) {
        results.push({ reference: t.ccvReference!, status: 'error', error: String(err) });
      }
    }

    return NextResponse.json({
      storeId:     body.storeId,
      reconciled:  results.length,
      results,
    });
  }

  return NextResponse.json(
    { error: 'Provide reference or storeId' },
    { status: 400 },
  );
}

// ─── GET /api/ccv/reconcile?storeId=... ──────────────────────────────────────
// List recent transactions for admin panel

export async function GET(req: NextRequest) {
  const idToken = req.headers.get('x-id-token') ??
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storeId = req.nextUrl.searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  let transactions: Awaited<ReturnType<typeof listStoreTransactions>>;
  try {
    transactions = await listStoreTransactions(storeId, 100);
  } catch (err) {
    console.error('[GET /api/ccv/reconcile] listStoreTransactions failed:', err);
    return NextResponse.json({ error: 'Failed to fetch transactions', detail: String(err) }, { status: 502 });
  }

  // Strip sensitive fields before returning to admin
  const safe = transactions.map(t => ({
    id:              t.id,
    orderId:         t.orderId,
    amount:          t.amount,
    currency:        t.currency,
    status:          t.status,
    transactionType: t.transactionType,
    ccvReference:    t.ccvReference,
    terminalId:      t.terminalId,
    environment:     t.environment,
    failureCode:     t.failureCode,
    createdAt:       t.createdAt,
    updatedAt:       t.updatedAt,
    webhookReceived: !!t.webhookReceivedAt,
    finalResolvedAt: t.finalResolvedAt,
    hasMerchantReceipt: !!t.merchantReceipt,
  }));

  return NextResponse.json({ storeId, transactions: safe });
}
