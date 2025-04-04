'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userType, setUserType] = useState<'employer' | 'employee' | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { signUp } = useAuth() || {};
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!userType) {
      toast.error('Veuillez sélectionner un type de compte');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    try {
      setLoading(true);
      if (!signUp) {
        toast.error('Service d\'inscription non disponible');
        return;
      }
      await signUp(email, password, userType === 'employer', code, firstName, lastName);
      toast.success('Compte créé avec succès !');
      router.push('/dashboard');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erreur lors de la création du compte.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="flex flex-col items-center">
          {/* Logo GestApp */}
          <div className="flex items-center justify-center flex-col">
            <div className="h-24 w-24 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-200/50 mb-4">
              <span className="text-white font-bold text-5xl">G</span>
            </div>
            <span className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent mb-8">
              GestApp
            </span>
          </div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900">
            Créer un compte
          </h2>
        </div>

        {/* Sélection du type de compte */}
        {!userType ? (
          <div className="mt-8 space-y-4">
            <button
              onClick={() => setUserType('employer')}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Je suis un employeur
            </button>
            <button
              onClick={() => setUserType('employee')}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              Je suis un employé
            </button>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <h3 className="text-lg font-medium text-center mb-4">
                {userType === 'employer' ? 'Inscription Employeur' : 'Inscription Employé'}
              </h3>
              <button
                type="button"
                onClick={() => setUserType(null)}
                className="mb-6 w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Changer le type de compte
              </button>
            </div>

            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="first-name" className="sr-only">
                  Prénom
                </label>
                <input
                  id="first-name"
                  name="firstName"
                  type="text"
                  required
                  className="appearance-none rounded-t-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Prénom"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="last-name" className="sr-only">
                  Nom
                </label>
                <input
                  id="last-name"
                  name="lastName"
                  type="text"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Nom"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="email-address" className="sr-only">
                  Adresse email
                </label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Adresse email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="sr-only">
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Confirmer le mot de passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="code" className="sr-only">
                  {userType === 'employer' ? 'Créer un code unique' : 'Code du centre'}
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder={userType === 'employer' ? 'Créer un code unique pour votre centre' : 'Entrer le code fourni par votre employeur'}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                  userType === 'employer' 
                    ? 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500' 
                    : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                } focus:outline-none focus:ring-2 focus:ring-offset-2`}
              >
                {loading ? 'Création...' : 'Créer un compte'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
} 