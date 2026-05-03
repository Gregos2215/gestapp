import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

function normalizeCenterCode(code: unknown) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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

function getCenterRoles(userData: Record<string, any>, activeCenters: string[]) {
  const centerRoles = userData.centerRoles && typeof userData.centerRoles === 'object'
    ? { ...userData.centerRoles }
    : {};

  if (Object.keys(centerRoles).length === 0 && activeCenters.length > 0) {
    activeCenters.forEach((centerCode) => {
      if (userData.role === 'employer' || userData.isEmployer === true) {
        centerRoles[centerCode] = 'employer';
      } else if (userData.role === 'admin') {
        centerRoles[centerCode] = 'admin';
      }
    });
  }

  return centerRoles;
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
    const centerCode = normalizeCenterCode(body.centerCode);
    const title = normalizeText(body.title);
    const subtitle = normalizeText(body.subtitle);

    if (!centerCode) {
      return NextResponse.json({ error: 'Code du centre invalide' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'Le titre principal est requis' }, { status: 400 });
    }

    const requesterSnap = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!requesterSnap.exists) {
      return NextResponse.json({ error: 'Compte utilisateur introuvable' }, { status: 403 });
    }

    const requester = requesterSnap.data() || {};
    const activeCenters = getActiveCenters(requester);
    const centerRoles = getCenterRoles(requester, activeCenters);
    const roleForCenter = centerRoles[centerCode];
    const canEditCenter = activeCenters.includes(centerCode) &&
      (roleForCenter === 'employer' || roleForCenter === 'admin' || requester.isEmployer === true);

    if (requester.accountStatus === 'pending_approval' || !canEditCenter) {
      return NextResponse.json({ error: 'Vous ne pouvez pas modifier ce centre' }, { status: 403 });
    }

    const centerRef = adminDb.collection('centers').doc(centerCode);
    const centerSnap = await centerRef.get();
    if (!centerSnap.exists) {
      return NextResponse.json({ error: 'Centre introuvable' }, { status: 404 });
    }

    await centerRef.update({
      dashboardTitle: title,
      subtitle,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: decodedToken.uid
    });

    return NextResponse.json({ success: true, title, subtitle });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Firebase Admin credentials are missing')) {
      return NextResponse.json({
        code: 'firebase-admin-missing',
        error: 'Configuration Firebase Admin manquante. Ajoutez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.'
      }, { status: 503 });
    }

    console.error('Error updating center profile:', error);
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde du centre' }, { status: 500 });
  }
}
