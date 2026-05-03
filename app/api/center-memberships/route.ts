import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

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

function getPrimaryRole(centerRoles: Record<string, unknown>) {
  if (Object.values(centerRoles).includes('admin')) return 'admin';
  if (Object.values(centerRoles).includes('employer')) return 'employer';
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
    const { targetUid } = await request.json() as { targetUid?: string };

    if (!targetUid) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    if (targetUid === decodedToken.uid) {
      return NextResponse.json({ error: 'Vous ne pouvez pas retirer votre propre accès au centre' }, { status: 400 });
    }

    const requesterRef = adminDb.collection('users').doc(decodedToken.uid);
    const targetRef = adminDb.collection('users').doc(targetUid);
    const [requesterSnap, targetSnap] = await Promise.all([requesterRef.get(), targetRef.get()]);

    if (!requesterSnap.exists) {
      return NextResponse.json({ error: 'Compte employeur introuvable' }, { status: 403 });
    }

    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'Compte employé introuvable' }, { status: 404 });
    }

    const requester = requesterSnap.data();
    const target = targetSnap.data();
    const requesterRole = requester?.role || (requester?.isEmployer ? 'employer' : 'employee');
    const requesterCenterCode = normalizeCenterCode(requester?.centerCode);

    if (requesterRole !== 'employer' || requester?.accountStatus === 'pending_approval') {
      return NextResponse.json({ error: 'Action réservée aux employeurs actifs' }, { status: 403 });
    }

    const activeCenters = getActiveCenters(target);
    if (!requesterCenterCode || !activeCenters.includes(requesterCenterCode)) {
      return NextResponse.json({ error: 'Ce compte n’est pas associé à votre centre actif' }, { status: 403 });
    }

    const remainingActiveCenters = activeCenters.filter((centerCode) => centerCode !== requesterCenterCode);

    if (remainingActiveCenters.length === 0) {
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

    const existingCenterRoles = target?.centerRoles && typeof target.centerRoles === 'object'
      ? { ...target.centerRoles }
      : {};
    delete existingCenterRoles[requesterCenterCode];
    const nextRole = getPrimaryRole(existingCenterRoles);
    const existingPendingRequests = Array.isArray(target?.pendingCenterRequests) ? target.pendingCenterRequests : [];
    const remainingPendingRequests = existingPendingRequests.filter((pendingRequest: Record<string, unknown>) => {
      return normalizeCenterCode(pendingRequest.centerCode) !== requesterCenterCode;
    });
    const remainingPendingCodes = remainingPendingRequests
      .map((pendingRequest: Record<string, unknown>) => normalizeCenterCode(pendingRequest.centerCode))
      .filter(Boolean);

    await targetRef.update({
      role: nextRole,
      isEmployer: nextRole === 'admin' || nextRole === 'employer',
      accountStatus: 'active',
      centerCode: remainingActiveCenters.includes(normalizeCenterCode(target?.centerCode))
        ? normalizeCenterCode(target?.centerCode)
        : remainingActiveCenters[0],
      associatedCenters: remainingActiveCenters,
      activeCenters: remainingActiveCenters,
      centerRoles: existingCenterRoles,
      pendingCenterRequests: remainingPendingRequests,
      pendingCenterCodes: remainingPendingCodes,
      updatedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true, result: 'center_removed' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Firebase Admin credentials are missing')) {
      return NextResponse.json({
        code: 'firebase-admin-missing',
        error: 'Configuration Firebase Admin manquante. Ajoutez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.'
      }, { status: 503 });
    }

    console.error('Error removing center membership:', error);
    return NextResponse.json({ error: 'Erreur lors de la suppression de l’employé du centre' }, { status: 500 });
  }
}
