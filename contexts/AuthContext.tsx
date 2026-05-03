'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { 
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  AuthError
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
} from 'firebase/firestore';
import toast from 'react-hot-toast';

type AccountRole = 'employer' | 'employee' | 'admin';
type AccountStatus = 'active' | 'pending_approval';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, role: AccountRole, centerCode: string, firstName: string, lastName: string) => Promise<{ pendingApproval: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  return useContext(AuthContext);
}

function hasActiveCenter(userData: any) {
  return Array.isArray(userData?.activeCenters) && userData.activeCenters.length > 0;
}

function isExpectedPermissionError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const firebaseError = error as { code?: string; message?: string };
  return firebaseError.code === 'permission-denied' ||
    firebaseError.message?.includes('Missing or insufficient permissions') === true;
}

async function checkCenterExists(centerCode: string) {
  const response = await fetch('/api/centers/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ centerCode })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Impossible de vérifier le code du centre');
  }

  return Boolean(result.exists);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isSigningUpRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.accountStatus === 'pending_approval' && !hasActiveCenter(userData)) {
              await signOut(auth);
              setUser(null);
            } else {
              setUser({ ...user, ...userData });
            }
          } else {
            if (isSigningUpRef.current) {
              setUser(null);
              setLoading(false);
              return;
            }

            // Si l'utilisateur n'existe pas dans Firestore, le déconnecter
            await signOut(auth);
            setUser(null);
            toast.error('Compte utilisateur non trouvé');
          }
        } catch (error) {
          if (isExpectedPermissionError(error)) {
            setUser(null);
            setLoading(false);
            return;
          }

          console.error('Error fetching user data:', error);
          toast.error('Erreur lors de la récupération des données utilisateur');
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  async function signUp(
    email: string,
    password: string,
    role: AccountRole,
    centerCode: string,
    firstName: string,
    lastName: string
  ) {
    try {
      const normalizedCenterCode = centerCode.trim().toUpperCase();
      const isEmployer = role === 'employer';
      const accountStatus: AccountStatus = isEmployer ? 'active' : 'pending_approval';
      const activeCenters = isEmployer ? [normalizedCenterCode] : [];
      const pendingCenterRequests = isEmployer ? [] : [{
        centerCode: normalizedCenterCode,
        role,
        requestedAt: new Date()
      }];
      const pendingCenterCodes = isEmployer ? [] : [normalizedCenterCode];

      if (!normalizedCenterCode) {
        throw new Error('Veuillez entrer un code de centre');
      }

      const centerExists = await checkCenterExists(normalizedCenterCode);

      if (isEmployer && centerExists) {
        throw new Error('Ce code de centre existe déjà. Choisissez un code différent.');
      }

      if (!isEmployer && !centerExists) {
        throw new Error('Code du centre invalide');
      }

      isSigningUpRef.current = true;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      try {
        const centerRef = doc(db, 'centers', normalizedCenterCode);
        const centerRoles = isEmployer ? { [normalizedCenterCode]: 'employer' } : {};
        if (isEmployer) {
          await setDoc(centerRef, {
            code: normalizedCenterCode,
            title: `Centre ${normalizedCenterCode}`,
            subtitle: 'Informations du centre',
            ownerId: userCredential.user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        // Créer le document utilisateur dans Firestore
        const userProfile = {
          email,
          role,
          accountStatus,
          // Les administrateurs deviennent privilégiés seulement après approbation.
          isEmployer,
          centerCode: normalizedCenterCode,
          associatedCenters: [normalizedCenterCode],
          activeCenters,
          pendingCenterRequests,
          pendingCenterCodes,
          centerRoles,
          firstName,
          lastName,
          isOnline: false,
          lastOnlineAt: null,
          approvalRequestedAt: accountStatus === 'pending_approval' ? serverTimestamp() : null,
          approvedAt: accountStatus === 'active' ? serverTimestamp() : null,
          approvedBy: null,
          createdAt: serverTimestamp()
        };

        await setDoc(doc(db, 'users', userCredential.user.uid), userProfile);

        if (accountStatus === 'active') {
          setUser({
            ...userCredential.user,
            ...userProfile,
            approvalRequestedAt: null,
            approvedAt: new Date(),
            createdAt: new Date()
          } as User);
          setLoading(false);
        }
      } catch (firestoreError) {
        isSigningUpRef.current = false;
        await deleteUser(userCredential.user).catch((deleteError) => {
          console.warn('Unable to clean up auth user after Firestore signup failure:', deleteError);
        });
        throw firestoreError;
      }

      isSigningUpRef.current = false;
      toast.success('Compte créé avec succès');
      if (accountStatus === 'pending_approval') {
        void signOut(auth).catch((signOutError) => {
          console.warn('Unable to sign out pending account immediately:', signOutError);
        });
      }

      return { pendingApproval: accountStatus === 'pending_approval' };
    } catch (error) {
      isSigningUpRef.current = false;
      console.error('Error in signUp:', error);
      if (error instanceof Error) {
        switch ((error as AuthError).code) {
          case 'auth/email-already-in-use':
            throw new Error('Cette adresse email est déjà utilisée');
          case 'auth/invalid-email':
            throw new Error('Adresse email invalide');
          case 'auth/operation-not-allowed':
            throw new Error('La création de compte est désactivée');
          case 'auth/weak-password':
            throw new Error('Le mot de passe doit contenir au moins 6 caractères');
          default:
            if (error.message) {
              throw new Error(error.message);
            } else {
              throw new Error('Une erreur est survenue lors de la création du compte');
            }
        }
      }
      throw error;
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Vérifier si l'utilisateur existe dans Firestore
      let userDoc;
      try {
        userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      } catch (readError) {
        const firebaseError = readError as { code?: string };
        if (firebaseError.code === 'permission-denied') {
          void signOut(auth).catch((signOutError) => {
            console.warn('Unable to sign out pending account after denied profile read:', signOutError);
          });
          throw new Error('PENDING_APPROVAL');
        }
        throw readError;
      }

      if (!userDoc.exists()) {
        await signOut(auth);
        throw new Error('Compte utilisateur non trouvé');
      }

      const userData = userDoc.data();
      if (userData.accountStatus === 'pending_approval' && !hasActiveCenter(userData)) {
        await signOut(auth);
        throw new Error('PENDING_APPROVAL');
      }

      // Mettre à jour uniquement l'horodatage de la dernière connexion
      const userRef = doc(db, 'users', userCredential.user.uid);
      await updateDoc(userRef, {
        lastOnlineAt: serverTimestamp()
      });

      toast.success('Connexion réussie');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'PENDING_APPROVAL') {
          throw error;
        }

        console.error('Error in signIn:', error);

        switch ((error as AuthError).code) {
          case 'auth/invalid-credential':
            throw new Error('Email ou mot de passe incorrect');
          case 'auth/user-disabled':
            throw new Error('Ce compte a été désactivé');
          case 'auth/user-not-found':
            throw new Error('Aucun compte trouvé avec cet email');
          case 'auth/wrong-password':
            throw new Error('Mot de passe incorrect');
          case 'auth/invalid-email':
            throw new Error('Adresse email invalide');
          default:
            if (error.message) {
              throw new Error(error.message);
            } else {
              throw new Error('Une erreur est survenue lors de la connexion');
            }
        }
      }
      console.error('Error in signIn:', error);
      throw error;
    }
  }

  async function logout() {
    try {
      if (user) {
        try {
          // Mettre à jour le statut hors ligne avant la déconnexion.
          // Si Firestore refuse ou tarde, on ne bloque pas la déconnexion.
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, {
            isOnline: false,
            lastOnlineAt: serverTimestamp()
          });
        } catch (statusError) {
          if (!isExpectedPermissionError(statusError)) {
            console.warn('Unable to update offline status before logout.');
          }
        }
      }
      
      await signOut(auth);
      toast.success('Déconnexion réussie');
    } catch (error) {
      console.error('Error in logout:', error);
      toast.error('Erreur lors de la déconnexion');
      throw error;
    }
  }

  const value = {
    user,
    loading,
    signUp,
    signIn,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 
