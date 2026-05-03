import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

const CENTER_SCOPED_COLLECTIONS = ['tasks', 'residents', 'reports', 'messages', 'alerts'];
const BATCH_LIMIT = 400;

function normalizeCenterCode(code: unknown) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeCenterCode).filter(Boolean)));
}

function getActiveCenters(userData: Record<string, any> | undefined) {
  if (!userData) return [];

  const activeCenters = normalizeStringArray(userData.activeCenters);
  if (activeCenters.length > 0) return activeCenters;

  if (userData.accountStatus === 'active') {
    return Array.from(new Set([
      ...normalizeStringArray(userData.associatedCenters),
      normalizeCenterCode(userData.centerCode)
    ].filter(Boolean)));
  }

  return [];
}

function getPrimaryRole(centerRoles: Record<string, unknown>) {
  if (Object.values(centerRoles).includes('employer')) return 'employer';
  if (Object.values(centerRoles).includes('admin')) return 'admin';
  return 'employee';
}

function getLegacyAwareCenterRoles(userData: Record<string, any>, activeCenters: string[]) {
  const centerRoles = userData.centerRoles && typeof userData.centerRoles === 'object'
    ? { ...userData.centerRoles }
    : {};

  const hasExplicitRoles = Object.keys(centerRoles).length > 0;
  const legacyIsEmployer = userData.role === 'employer' || userData.isEmployer === true;
  const legacyIsAdmin = userData.role === 'admin';

  if (!hasExplicitRoles && activeCenters.length > 0) {
    activeCenters.forEach((centerCode) => {
      if (legacyIsEmployer) {
        centerRoles[centerCode] = 'employer';
      } else if (legacyIsAdmin) {
        centerRoles[centerCode] = 'admin';
      }
    });
  }

  return centerRoles;
}

async function deleteCollectionDocsByCenter(adminDb: FirebaseFirestore.Firestore, collectionName: string, centerCode: string) {
  let deletedCount = 0;

  while (true) {
    const snapshot = await adminDb
      .collection(collectionName)
      .where('centerCode', '==', centerCode)
      .limit(BATCH_LIMIT)
      .get();

    if (snapshot.empty) break;

    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deletedCount += snapshot.size;

    if (snapshot.size < BATCH_LIMIT) break;
  }

  return deletedCount;
}

async function collectUsersLinkedToCenters(adminDb: FirebaseFirestore.Firestore, centerCodes: string[]) {
  const users = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

  for (const centerCode of centerCodes) {
    const queries = [
      adminDb.collection('users').where('activeCenters', 'array-contains', centerCode).get(),
      adminDb.collection('users').where('associatedCenters', 'array-contains', centerCode).get(),
      adminDb.collection('users').where('pendingCenterCodes', 'array-contains', centerCode).get(),
      adminDb.collection('users').where('centerCode', '==', centerCode).get()
    ];

    const snapshots = await Promise.all(queries);
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((doc) => users.set(doc.id, doc));
    });
  }

  return Array.from(users.values());
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
    const body = await request.json().catch(() => ({}));
    const centerCodes = Array.isArray(body.centerCodes)
      ? Array.from(new Set(body.centerCodes.map(normalizeCenterCode).filter(Boolean)))
      : [];

    if (centerCodes.length === 0) {
      return NextResponse.json({ error: 'Sélectionnez au moins un centre à supprimer' }, { status: 400 });
    }

    const requesterRef = adminDb.collection('users').doc(decodedToken.uid);
    const requesterSnap = await requesterRef.get();

    if (!requesterSnap.exists) {
      return NextResponse.json({ error: 'Compte employeur introuvable' }, { status: 403 });
    }

    const requester = requesterSnap.data();
    const requesterRole = requester?.role || (requester?.isEmployer ? 'employer' : 'employee');
    const requesterActiveCenters = getActiveCenters(requester);
    const requesterCenterRoles = getLegacyAwareCenterRoles(requester || {}, requesterActiveCenters);

    if (requesterRole !== 'employer' || requester?.accountStatus === 'pending_approval') {
      return NextResponse.json({ error: 'Action réservée aux employeurs actifs' }, { status: 403 });
    }

    for (const centerCode of centerCodes) {
      const centerSnap = await adminDb.collection('centers').doc(centerCode).get();
      if (!centerSnap.exists) {
        return NextResponse.json({ error: `Le centre ${centerCode} est introuvable` }, { status: 404 });
      }

      const centerData = centerSnap.data();
      const isOwner = centerData?.ownerId === decodedToken.uid;
      const isEmployerForCenter = requesterActiveCenters.includes(centerCode) && requesterCenterRoles[centerCode] === 'employer';
      const isLegacyEmployerForCenter = requesterActiveCenters.includes(centerCode) &&
        requester?.isEmployer === true &&
        Object.keys(requesterCenterRoles).length === 0;

      if (!isOwner && !isEmployerForCenter && !isLegacyEmployerForCenter) {
        return NextResponse.json({ error: `Vous ne pouvez pas supprimer le centre ${centerCode}` }, { status: 403 });
      }
    }

    const deletedDocuments: Record<string, number> = {};
    for (const centerCode of centerCodes) {
      for (const collectionName of CENTER_SCOPED_COLLECTIONS) {
        deletedDocuments[collectionName] = (deletedDocuments[collectionName] || 0)
          + await deleteCollectionDocsByCenter(adminDb, collectionName, centerCode);
      }
    }

    const affectedUsers = await collectUsersLinkedToCenters(adminDb, centerCodes);
    const authUsersToDelete: string[] = [];
    let updatedUsersCount = 0;
    let deletedUsersCount = 0;

    for (let i = 0; i < affectedUsers.length; i += BATCH_LIMIT) {
      const batch = adminDb.batch();
      const chunk = affectedUsers.slice(i, i + BATCH_LIMIT);

      chunk.forEach((userDoc) => {
        const userData = userDoc.data();
        const activeCenters = getActiveCenters(userData);
        const remainingActiveCenters = activeCenters.filter((centerCode) => !centerCodes.includes(centerCode));
        const remainingAssociatedCenters = normalizeStringArray(userData.associatedCenters)
          .filter((centerCode) => !centerCodes.includes(centerCode));
        const pendingCenterRequests = Array.isArray(userData.pendingCenterRequests) ? userData.pendingCenterRequests : [];
        const remainingPendingRequests = pendingCenterRequests.filter((pendingRequest: Record<string, unknown>) => {
          return !centerCodes.includes(normalizeCenterCode(pendingRequest.centerCode));
        });
        const remainingPendingCodes = remainingPendingRequests
          .map((pendingRequest: Record<string, unknown>) => normalizeCenterCode(pendingRequest.centerCode))
          .filter(Boolean);
        const centerRoles = getLegacyAwareCenterRoles(userData, activeCenters);

        centerCodes.forEach((centerCode) => {
          delete centerRoles[centerCode];
        });

        if (remainingActiveCenters.length === 0) {
          batch.delete(userDoc.ref);
          authUsersToDelete.push(userDoc.id);
          deletedUsersCount += 1;
          return;
        }

        const nextAssociatedCenters = Array.from(new Set([...remainingAssociatedCenters, ...remainingActiveCenters]));
        const nextCenterCode = remainingActiveCenters.includes(normalizeCenterCode(userData.centerCode))
          ? normalizeCenterCode(userData.centerCode)
          : remainingActiveCenters[0];
        const nextRole = getPrimaryRole(centerRoles);

        batch.update(userDoc.ref, {
          role: nextRole,
          isEmployer: nextRole === 'admin' || nextRole === 'employer',
          accountStatus: 'active',
          centerCode: nextCenterCode,
          associatedCenters: nextAssociatedCenters,
          activeCenters: remainingActiveCenters,
          pendingCenterRequests: remainingPendingRequests,
          pendingCenterCodes: remainingPendingCodes,
          centerRoles,
          updatedAt: FieldValue.serverTimestamp()
        });
        updatedUsersCount += 1;
      });

      await batch.commit();
    }

    const centerBatch = adminDb.batch();
    centerCodes.forEach((centerCode) => {
      centerBatch.delete(adminDb.collection('centers').doc(centerCode));
    });
    await centerBatch.commit();

    for (const uid of authUsersToDelete) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (error: unknown) {
        const firebaseError = error as { code?: string };
        if (firebaseError.code !== 'auth/user-not-found') {
          throw error;
        }
      }
    }

    return NextResponse.json({
      success: true,
      accountDeleted: authUsersToDelete.includes(decodedToken.uid),
      deletedCenters: centerCodes,
      deletedDocuments,
      updatedUsersCount,
      deletedUsersCount
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Firebase Admin credentials are missing')) {
      return NextResponse.json({
        code: 'firebase-admin-missing',
        error: 'Configuration Firebase Admin manquante. Ajoutez FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.'
      }, { status: 503 });
    }

    console.error('Error deleting centers:', error);
    return NextResponse.json({ error: 'Erreur lors de la suppression du centre' }, { status: 500 });
  }
}
