import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

type PendingCenterRequest = {
  centerCode: string;
  role: 'employee' | 'admin';
  requestedAt?: unknown;
};

function normalizeCenterCode(code: unknown) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeCenterCode).filter(Boolean)));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(normalizeCenterCode).filter(Boolean)));
}

function getActiveCenters(userData: Record<string, any> | undefined) {
  if (!userData) return [];

  const activeCenters = normalizeStringArray(userData.activeCenters);
  if (activeCenters.length > 0) return activeCenters;

  if (userData.accountStatus === 'active') {
    return uniqueStrings([
      ...normalizeStringArray(userData.associatedCenters),
      normalizeCenterCode(userData.centerCode)
    ]);
  }

  return [];
}

function getPendingCenterRequests(userData: Record<string, any> | undefined) {
  if (!userData) return [];

  const requests: PendingCenterRequest[] = Array.isArray(userData.pendingCenterRequests)
    ? userData.pendingCenterRequests
        .map((request: Record<string, unknown>) => ({
          centerCode: normalizeCenterCode(request.centerCode),
          role: request.role === 'admin' ? 'admin' as const : 'employee' as const,
          requestedAt: request.requestedAt
        }))
        .filter((request: PendingCenterRequest) => request.centerCode !== '')
    : [];

  if (userData.accountStatus === 'pending_approval') {
    const legacyCenterCode = normalizeCenterCode(userData.centerCode);
    const hasLegacyRequest = requests.some((request) => request.centerCode === legacyCenterCode);
    if (legacyCenterCode && !hasLegacyRequest) {
      requests.push({
        centerCode: legacyCenterCode,
        role: userData.role === 'admin' ? 'admin' : 'employee',
        requestedAt: userData.approvalRequestedAt
      });
    }
  }

  return requests;
}

function getRequestedRole(userData: Record<string, any> | undefined) {
  const role = userData?.role || (userData?.isEmployer ? 'employer' : 'employee');
  if (role === 'admin') return 'admin';
  if (role === 'employee') return 'employee';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const { centerCode } = await request.json() as { centerCode?: string };
    const requestedCenterCode = normalizeCenterCode(centerCode);

    if (!requestedCenterCode) {
      return NextResponse.json({ error: 'Veuillez entrer un code de centre' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(decodedToken.uid);
    const centerRef = adminDb.collection('centers').doc(requestedCenterCode);
    const [userSnap, centerSnap] = await Promise.all([userRef.get(), centerRef.get()]);

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
    }

    if (!centerSnap.exists) {
      return NextResponse.json({ error: 'Ce centre n’existe pas' }, { status: 404 });
    }

    const userData = userSnap.data();
    const requestedRole = getRequestedRole(userData);

    if (!requestedRole) {
      return NextResponse.json({ error: 'Cette inscription est réservée aux employés et administrateurs' }, { status: 403 });
    }

    const activeCenters = getActiveCenters(userData);
    if (activeCenters.length === 0) {
      return NextResponse.json({ error: 'Votre compte doit déjà être actif dans au moins un centre' }, { status: 403 });
    }

    if (activeCenters.includes(requestedCenterCode)) {
      return NextResponse.json({ error: 'Votre compte est déjà associé à ce centre' }, { status: 400 });
    }

    const pendingCenterRequests = getPendingCenterRequests(userData);
    if (pendingCenterRequests.some((pendingRequest) => pendingRequest.centerCode === requestedCenterCode)) {
      return NextResponse.json({ error: 'Une demande est déjà en attente pour ce centre' }, { status: 400 });
    }

    const nextPendingRequests = [
      ...pendingCenterRequests,
      {
        centerCode: requestedCenterCode,
        role: requestedRole,
        requestedAt: new Date()
      }
    ];
    const pendingCenterCodes = uniqueStrings(nextPendingRequests.map((pendingRequest) => pendingRequest.centerCode));

    await userRef.update({
      accountStatus: 'active',
      activeCenters,
      pendingCenterRequests: nextPendingRequests,
      pendingCenterCodes,
      updatedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Firebase Admin credentials are missing')) {
      return NextResponse.json({
        code: 'firebase-admin-missing',
        error: 'Configuration Firebase Admin manquante. Ajoutez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.'
      }, { status: 503 });
    }

    console.error('Error creating center join request:', error);
    return NextResponse.json({ error: 'Erreur lors de l’envoi de la demande' }, { status: 500 });
  }
}
