import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { initiateSale, resolveStoreApiKey } from '@/lib/ccv/payment-service';
import { CcvClientError } from '@/lib/ccv/client';
import { getAdminAuth } from '@/lib/firebase-admin';

// ─── POST /api/ccv/payment ────────────────────────────────────────────────────
// Initiate a card sale on a CCV attended terminal
//
// Request body:
// {
//   storeId:      string
//   orderId:      string
//   terminalId:   string       -- TMS TID
//   amountCents:  number       -- integer (e.g. 1250 = €12.50)
//   language?:    'eng'|'nld'|'fra'|'deu'
//   posScreenId?: string
// }
//
// API key is NEVER accepted from frontend — loaded server-side only.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth: require Firebase session cookie or Bearer token ────────────────
  const idToken = req.headers.get('x-id-token') ??
    req.headers.get('authorization')?.replace('Bearer ', '');

  let cashierId: string | undefined;

  if (idToken) {
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken);
      cashierId     = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  let body: {
    storeId:      string;
    orderId:      string;
    terminalId:   string;
    amountCents:  number;
    language?:    string;
    posScreenId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, orderId, terminalId, amountCents, language, posScreenId } = body;

  if (!storeId || !orderId || !terminalId || !amountCents) {
    return NextResponse.json(
      { error: 'Missing required fields: storeId, orderId, terminalId, amountCents' },
      { status: 400 },
    );
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: 'amountCents must be a positive integer' },
      { status: 400 },
    );
  }

  // ── Resolve store API key (server-side only) ──────────────────────────────
  let storeConfig: Awaited<ReturnType<typeof resolveStoreApiKey>>;
  try {
    storeConfig = await resolveStoreApiKey(storeId);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 422 },
    );
  }

  // ── Initiate sale ─────────────────────────────────────────────────────────
  try {
    const result = await initiateSale({
      orderId,
      storeId,
      posScreenId,
      cashierId,
      amountCents,
      language:  (language as any) ?? 'eng',
      terminalId,
      managementSystemId: storeConfig.managementSystemId,
      environment:        storeConfig.environment,
      apiKey:             storeConfig.apiKey,
    });

    // IMPORTANT: Return only safe fields — never return the API key
    return NextResponse.json({
      transactionId: result.transactionId,
      reference:     result.ccvReference,
      status:        result.status,
      payUrl:        result.payUrl,
    });
  } catch (err) {
    if (err instanceof CcvClientError) {
      const httpStatus =
        err.statusCode === 400 ? 400 :
        err.statusCode === 401 ? 502 :      // CCV auth failure → 502 for us
        err.statusCode === 404 ? 404 :
        err.statusCode === 504 ? 504 :
        500;

      return NextResponse.json(
        {
          error:       err.ccvError.message ?? 'CCV error',
          failureCode: err.ccvError.failureCode,
          ccvType:     err.ccvError.type,
        },
        { status: httpStatus },
      );
    }

    console.error('[CCV /payment] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
