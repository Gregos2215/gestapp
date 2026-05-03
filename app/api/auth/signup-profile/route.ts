import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

type AccountRole = 'employer' | 'employee' | 'admin';

function normalizeCenterCode(code: unknown) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isAccountRole(value: unknown): value is AccountRole {
  return value === 'employer' || value === 'employee' || value === 'admin';
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
    const role = body.role;
    const centerCode = normalizeCenterCode(body.centerCode);
    const firstName = normalizeText(body.firstName);
    const lastName = normalizeText(body.lastName);
    const email = decodedToken.email || normalizeText(body.email);

    if (!isAccountRole(role)) {
      return NextResponse.json({ error: 'Type de compte invalide' }, { status: 400 });
    }

    if (!centerCode) {
      return NextResponse.json({ error: 'Veuillez entrer un code de centre' }, { status: 400 });
    }

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Veuillez remplir tous les champs' }, { status: 400 });
    }

    const isEmployer = role === 'employer';
    const accountStatus = isEmployer ? 'active' : 'pending_approval';
    const centerRef = adminDb.collection('centers').doc(centerCode);
    const userRef = adminDb.collection('users').doc(decodedToken.uid);

    await adminDb.runTransaction(async (transaction) => {
      const centerSnap = await transaction.get(centerRef);
      const userSnap = await transaction.get(userRef);

      if (userSnap.exists) {
        throw new Error('USER_PROFILE_EXISTS');
      }

      if (isEmployer && centerSnap.exists) {
        throw new Error('CENTER_ALREADY_EXISTS');
      }

      if (!isEmployer && !centerSnap.exists) {
        throw new Error('CENTER_NOT_FOUND');
      }

      if (isEmployer) {
        transaction.set(centerRef, {
          code: centerCode,
          title: `Centre ${centerCode}`,
          subtitle: 'Informations du centre',
          ownerId: decodedToken.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }

      transaction.set(userRef, {
        email,
        role,
        accountStatus,
        isEmployer,
        centerCode,
        associatedCenters: [centerCode],
        activeCenters: isEmployer ? [centerCode] : [],
        pendingCenterRequests: isEmployer ? [] : [{
          centerCode,
          role,
          requestedAt: new Date()
        }],
        pendingCenterCodes: isEmployer ? [] : [centerCode],
        centerRoles: isEmployer ? { [centerCode]: 'employer' } : {},
        firstName,
        lastName,
        isOnline: false,
        lastOnlineAt: null,
        approvalRequestedAt: accountStatus === 'pending_approval' ? FieldValue.serverTimestamp() : null,
        approvedAt: accountStatus === 'active' ? FieldValue.serverTimestamp() : null,
        approvedBy: null,
        createdAt: FieldValue.serverTimestamp()
      });
    });

    return NextResponse.json({
      success: true,
      pendingApproval: accountStatus === 'pending_approval'
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'CENTER_ALREADY_EXISTS') {
        return NextResponse.json({ error: 'Ce code de centre existe déjà. Choisissez un code différent.' }, { status: 409 });
      }

      if (error.message === 'CENTER_NOT_FOUND') {
        return NextResponse.json({ error: 'Code du centre invalide' }, { status: 404 });
      }

      if (error.message === 'USER_PROFILE_EXISTS') {
        return NextResponse.json({ error: 'Ce compte existe déjà' }, { status: 409 });
      }

      if (error.message.includes('Firebase Admin credentials are missing')) {
        return NextResponse.json({
          code: 'firebase-admin-missing',
          error: 'Configuration Firebase Admin manquante. Ajoutez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.'
        }, { status: 503 });
      }
    }

    console.error('Error creating signup profile:', error);
    return NextResponse.json({ error: 'Erreur lors de la création du compte' }, { status: 500 });
  }
}
