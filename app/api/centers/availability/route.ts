import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

function normalizeCenterCode(code: unknown) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const centerCode = normalizeCenterCode(body.centerCode);

    if (!centerCode) {
      return NextResponse.json({ error: 'Veuillez entrer un code de centre' }, { status: 400 });
    }

    const centerSnap = await getAdminDb().collection('centers').doc(centerCode).get();

    return NextResponse.json({
      centerCode,
      exists: centerSnap.exists
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Firebase Admin credentials are missing')) {
      return NextResponse.json({
        code: 'firebase-admin-missing',
        error: 'Configuration Firebase Admin manquante. Ajoutez FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.'
      }, { status: 503 });
    }

    console.error('Error checking center availability:', error);
    return NextResponse.json({ error: 'Impossible de vérifier le code du centre' }, { status: 500 });
  }
}
