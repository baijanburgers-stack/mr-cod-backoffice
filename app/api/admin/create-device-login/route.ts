import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, storeId, role, name } = body;

    if (!email || !password || !storeId || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

    // 1. Create the user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name || 'Live Order Device',
    });

    // 2. Create the Firestore document so the app knows which store it belongs to
    await db.collection('users').doc(userRecord.uid).set({
      email: userRecord.email,
      name: name || 'Live Order Device',
      role,
      storeId,
      status: 'Active',
      createdAt: new Date(),
      lastLogin: 'Never',
    });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    console.error('Error creating device login:', error);
    
    // Handle Firebase Auth errors gracefully
    if (error.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'That email is already in use by another device.' }, { status: 400 });
    }
    
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
