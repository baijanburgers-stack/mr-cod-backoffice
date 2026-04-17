import { NextRequest, NextResponse } from 'next/server';
import { processWebhook, resolveStoreApiKey, getTransactionByReference } from '@/lib/ccv/payment-service';
import { CcvWebhookPayload } from '@/lib/ccv/types';
import { getAdminDb } from '@/lib/firebase-admin';

// ─── POST /api/ccv/webhook ────────────────────────────────────────────────────
// CCV sends: POST { "id": "TRANSACTION_REFERENCE" }
//
// Processing rules:
// 1. Validate payload structure
// 2. Find local transaction record by reference
// 3. Resolve store API key server-side
// 4. Re-read transaction from CCV for authoritative status
// 5. Update Firestore record (idempotent)
// 6. Update order payment status
// 7. Respond 200 quickly — CCV retries on non-200
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse & validate ──────────────────────────────────────────────────────
  let payload: CcvWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    console.warn('[CCV Webhook] Invalid JSON payload');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload?.id || typeof payload.id !== 'string') {
    console.warn('[CCV Webhook] Missing or invalid id field:', payload);
    return NextResponse.json({ error: 'Missing id field' }, { status: 400 });
  }

  const reference = payload.id;
  console.log(`[CCV Webhook] Received for reference: ${reference}`);

  // ── Find transaction / resolve credentials ────────────────────────────────
  const transaction = await getTransactionByReference(reference);

  if (!transaction) {
    // Unknown reference — CCV may be sending a webhook for a transaction we
    // don't know about. Log and return 200 to stop retries.
    console.warn(`[CCV Webhook] Unknown reference: ${reference}`);
    return NextResponse.json({ received: true, known: false });
  }

  let storeConfig: Awaited<ReturnType<typeof resolveStoreApiKey>>;
  try {
    storeConfig = await resolveStoreApiKey(transaction.storeId);
  } catch (err) {
    console.error(`[CCV Webhook] Cannot resolve store config for ${transaction.storeId}:`, err);
    // Return 200 to CCV (don't retry) — we'll reconcile manually
    return NextResponse.json({ received: true });
  }

  // ── Process webhook idempotently ─────────────────────────────────────────
  let result: Awaited<ReturnType<typeof processWebhook>>;
  try {
    result = await processWebhook(payload, storeConfig.apiKey, storeConfig.environment);
  } catch (err) {
    console.error(`[CCV Webhook] Error processing ${reference}:`, err);
    // Return 200 — we'll resolve via polling / admin reconcile
    return NextResponse.json({ received: true });
  }

  console.log(`[CCV Webhook] ${reference} → ${result.status} (already: ${result.alreadyProcessed})`);

  // ── Update order payment status in Firestore ──────────────────────────────
  if (!result.alreadyProcessed && result.orderId) {
    await updateOrderPaymentStatus(result.orderId, transaction.storeId, result.status);
  }

  // ── Log cashier prompts ───────────────────────────────────────────────────
  const { askCustomerSignature, askCustomerIdentification, askMerchantSignature } =
    result.receiptPrompts;

  if (askCustomerSignature)     console.log(`[CCV] ✍ Customer signature required for ${reference}`);
  if (askCustomerIdentification) console.log(`[CCV] 🪪 Customer identification required for ${reference}`);
  if (askMerchantSignature)     console.log(`[CCV] 📋 Merchant signature required for ${reference}`);

  // Always respond 200 to CCV (never return 5xx for processing errors)
  return NextResponse.json({
    received:          true,
    reference,
    status:            result.status,
    alreadyProcessed:  result.alreadyProcessed,
    prompts: {
      askCustomerSignature,
      askCustomerIdentification,
      askMerchantSignature,
    },
  });
}

// ── Update order payment status ──────────────────────────────────────────────

async function updateOrderPaymentStatus(
  orderId: string,
  storeId: string,
  status:  string,
) {
  try {
    const db       = getAdminDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      console.warn(`[CCV Webhook] Order ${orderId} not found`);
      return;
    }

    let paymentStatus: string;
    let orderStatus:   string | undefined;

    switch (status) {
      case 'success':
        paymentStatus = 'Paid';
        orderStatus   = 'New';    // move to kitchen queue
        break;
      case 'failed':
        paymentStatus = 'payment_failed';
        break;
      case 'manualintervention':
        paymentStatus = 'payment_unknown';
        break;
      default:
        paymentStatus = 'payment_pending';
    }

    const update: Record<string, unknown> = {
      paymentStatus,
      paymentMethod:     'Card',
      paymentProvider:   'CCV',
      paymentUpdatedAt:  new Date().toISOString(),
    };
    if (orderStatus) update.status = orderStatus;

    await orderRef.update(update);
    console.log(`[CCV Webhook] Order ${orderId} → paymentStatus: ${paymentStatus}`);
  } catch (err) {
    console.error(`[CCV Webhook] Failed to update order ${orderId}:`, err);
  }
}
