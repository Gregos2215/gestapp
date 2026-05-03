import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

type ApprovalAction = 'approve' | 'reject';
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
    const associatedCenters = normalizeStringArray(userData.associatedCenters);
    const centerCode = normalizeCenterCode(userData.centerCode);
    return uniqueStrings([...associatedCenters, centerCode]);
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
    const hasLegacyRequest = requests.some((request: PendingCenterRequest) => request.centerCode === legacyCenterCode);
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

function getPrimaryRole(centerRoles: Record<string, unknown>, fallbackRole: unknown) {
  if (Object.values(centerRoles).includes('admin')) return 'admin';
  if (fallbackRole === 'employer') return 'employer';
  return 'employee';
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
    const { targetUid, action } = await request.json() as { targetUid?: string; action?: ApprovalAction };

    if (!targetUid || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    const requesterRef = adminDb.collection('users').doc(decodedToken.uid);
    const targetRef = adminDb.collection('users').doc(targetUid);
    const [requesterSnap, targetSnap] = await Promise.all([requesterRef.get(), targetRef.get()]);

    if (!requesterSnap.exists) {
      return NextResponse.json({ error: 'Compte employeur introuvable' }, { status: 403 });
    }

    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    const requester = requesterSnap.data();
    const target = targetSnap.data();
    const requesterRole = requester?.role || (requester?.isEmployer ? 'employer' : 'employee');
    const requesterCenterCode = normalizeCenterCode(requester?.centerCode);

    if (requesterRole !== 'employer' || requester?.accountStatus === 'pending_approval') {
      return NextResponse.json({ error: 'Action réservée aux employeurs actifs' }, { status: 403 });
    }

    const activeCenters = getActiveCenters(target);
    const pendingRequests = getPendingCenterRequests(target);
    const matchingRequest = pendingRequests.find((pendingRequest) => pendingRequest.centerCode === requesterCenterCode);

    if (!requesterCenterCode || !matchingRequest) {
      return NextResponse.json({ error: 'Cette demande ne correspond pas à votre centre actif' }, { status: 403 });
    }

    const remainingRequests = pendingRequests.filter((pendingRequest) => pendingRequest.centerCode !== requesterCenterCode);
    const remainingPendingCodes = remainingRequests.map((pendingRequest) => pendingRequest.centerCode);

    if (action === 'approve') {
      const role = matchingRequest.role === 'admin' ? 'admin' : 'employee';
      const nextActiveCenters = uniqueStrings([...activeCenters, requesterCenterCode]);
      const nextAssociatedCenters = uniqueStrings([
        ...normalizeStringArray(target?.associatedCenters),
        ...nextActiveCenters
      ]);
      const centerRoles = {
        ...(target?.centerRoles && typeof target.centerRoles === 'object' ? target.centerRoles : {}),
        [requesterCenterCode]: role
      };
      const primaryRole = getPrimaryRole(centerRoles, target?.role);

      await targetRef.update({
        role: primaryRole,
        accountStatus: 'active',
        isEmployer: primaryRole === 'admin' || primaryRole === 'employer',
        centerCode: activeCenters.length > 0 ? normalizeCenterCode(target?.centerCode) || requesterCenterCode : requesterCenterCode,
        associatedCenters: nextAssociatedCenters,
        activeCenters: nextActiveCenters,
        pendingCenterRequests: remainingRequests,
        pendingCenterCodes: remainingPendingCodes,
        centerRoles,
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: decodedToken.uid
      });

      return NextResponse.json({ success: true, result: 'approved' });
    }

    if (activeCenters.length === 0) {
      await targetRef.delete();
      try {
        await adminAuth.deleteUser(targetUid);
      } catch (error: unknown) {
        const firebaseError = error as { code?: string };
        if (firebaseError.code !== 'auth/user-not-found') {
          throw error;
        }
      }

      return NextResponse.json({ success: true, result: 'account_deleted' });
    }

    const nextAssociatedCenters = uniqueStrings([
      ...normalizeStringArray(target?.associatedCenters),
      ...activeCenters
    ]);

    await targetRef.update({
      accountStatus: 'active',
      associatedCenters: nextAssociatedCenters,
      activeCenters,
      pendingCenterRequests: remainingRequests,
      pendingCenterCodes: remainingPendingCodes,
      centerCode: normalizeCenterCode(target?.centerCode) || activeCenters[0],
      updatedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true, result: 'request_removed' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Firebase Admin credentials are missing')) {
      return NextResponse.json({
        code: 'firebase-admin-missing',
        error: 'Configuration Firebase Admin manquante. Ajoutez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY pour activer ou supprimer les comptes.'
      }, { status: 503 });
    }

    console.error('Error processing account approval:', error);
    return NextResponse.json({ error: 'Erreur lors du traitement de la demande' }, { status: 500 });
  }
}
