import { NextRequest, NextResponse } from 'next/server';
import { initiateRefund, resolveStoreApiKey } from '@/lib/ccv/payment-service';
import { CcvClientError } from '@/lib/ccv/client';
import { getAdminAuth } from '@/lib/firebase-admin';

// ─── POST /api/ccv/refund ─────────────────────────────────────────────────────
// Initiate a card refund on a CCV attended terminal
// Requires manager role (checked via Firebase custom claims)
//
// Request body:
// {
//   storeId:              string
//   orderId:              string
//   terminalId:           string
//   amountCents:          number
//   originalCcvReference: string
//   cashierId?:           string
// }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth: require manager role ────────────────────────────────────────────
  const idToken = req.headers.get('x-id-token') ??
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let cashierId: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    cashierId     = decoded.uid;

    // Check manager claim
    const isManager =
      decoded['role'] === 'manager'   ||
      decoded['role'] === 'superadmin' ||
      decoded['role'] === 'storeAdmin';

    if (!isManager) {
      return NextResponse.json(
        { error: 'Forbidden — manager role required for refunds' },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    storeId:              string;
    orderId:              string;
    terminalId:           string;
    amountCents:          number;
    originalCcvReference: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, orderId, terminalId, amountCents, originalCcvReference } = body;

  if (!storeId || !orderId || !terminalId || !amountCents || !originalCcvReference) {
    return NextResponse.json(
      { error: 'Missing required fields: storeId, orderId, terminalId, amountCents, originalCcvReference' },
      { status: 400 },
    );
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: 'amountCents must be a positive integer' },
      { status: 400 },
    );
  }

  // ── Resolve API key server-side ───────────────────────────────────────────
  let storeConfig: Awaited<ReturnType<typeof resolveStoreApiKey>>;
  try {
    storeConfig = await resolveStoreApiKey(storeId);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }

  // ── Initiate refund ───────────────────────────────────────────────────────
  try {
    const result = await initiateRefund({
      orderId,
      storeId,
      cashierId,
      amountCents,
      originalCcvReference,
      terminalId,
      managementSystemId: storeConfig.managementSystemId,
      environment:        storeConfig.environment,
      apiKey:             storeConfig.apiKey,
    });

    return NextResponse.json({
      transactionId: result.transactionId,
      reference:     result.ccvReference,
      status:        result.status,
      payUrl:        result.payUrl,
    });
  } catch (err) {
    if (err instanceof CcvClientError) {
      return NextResponse.json(
        {
          error:       err.ccvError.message ?? 'CCV refund error',
          failureCode: err.ccvError.failureCode,
        },
        { status: err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500 },
      );
    }
    console.error('[CCV /refund] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
