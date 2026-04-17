import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { CertEvidence } from '@/lib/ccv/certification-tests';

// ─── POST /api/ccv/certification  ────────────────────────────────────────────
// Save or update evidence for a certification test run.
// Body: CertEvidence (with optional id for update)

export async function POST(req: NextRequest) {
  try {
    const body: CertEvidence & { id?: string } = await req.json();

    if (!body.testId || !body.storeId) {
      return NextResponse.json({ error: 'testId and storeId required' }, { status: 400 });
    }

    const colRef = getAdminDb().collection('ccv_certification_runs');

    if (body.id) {
      // Update existing run
      const { id, ...data } = body;
      await colRef.doc(id).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ id, updated: true });
    }

    // Create new run
    const docRef = await colRef.add({
      ...body,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: docRef.id, created: true });
  } catch (err) {
    console.error('[CCV Cert] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET /api/ccv/certification?storeId=xxx  ─────────────────────────────────
// List all certification runs for a store, ordered by runAt desc.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }

    const snap = await getAdminDb()
      .collection('ccv_certification_runs')
      .where('storeId', '==', storeId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const runs = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? '',
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? '',
    }));

    return NextResponse.json({ runs });
  } catch (err) {
    console.error('[CCV Cert] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE /api/ccv/certification?id=xxx  ───────────────────────────────────
// Remove a certification run document.

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await getAdminDb().collection('ccv_certification_runs').doc(id).delete();
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[CCV Cert] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
