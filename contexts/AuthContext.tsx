'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  User,
  createUserWithEmailAndPassword,
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
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, isEmployer: boolean, centerCode: string, firstName: string, lastName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUser({ ...user, ...userDoc.data() });
          } else {
            // Si l'utilisateur n'existe pas dans Firestore, le déconnecter
            await signOut(auth);
            setUser(null);
            toast.error('Compte utilisateur non trouvé');
          }
        } catch (error) {
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
    isEmployer: boolean,
    centerCode: string,
    firstName: string,
    lastName: string
  ) {
    try {
      // Pour les employés, vérifier si le code du centre existe
      if (!isEmployer) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, 
          where('centerCode', '==', centerCode),
          where('isEmployer', '==', true)
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          throw new Error('Code du centre invalide');
        }
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Créer le document utilisateur dans Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        isEmployer,
        centerCode,
        firstName,
        lastName,
        isOnline: false,
        lastOnlineAt: null,
        createdAt: serverTimestamp()
      });

      toast.success('Compte créé avec succès');
    } catch (error) {
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
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (!userDoc.exists()) {
        await signOut(auth);
        throw new Error('Compte utilisateur non trouvé');
      }

      // Mettre à jour uniquement l'horodatage de la dernière connexion
      const userRef = doc(db, 'users', userCredential.user.uid);
      await updateDoc(userRef, {
        lastOnlineAt: serverTimestamp()
      });

      toast.success('Connexion réussie');
    } catch (error) {
      console.error('Error in signIn:', error);
      if (error instanceof Error) {
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
      throw error;
    }
  }

  async function logout() {
    try {
      if (user) {
        // Mettre à jour le statut hors ligne avant la déconnexion
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          isOnline: false,
          lastOnlineAt: serverTimestamp()
        });
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
      {!loading && children}
    </AuthContext.Provider>
  );
} 