'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userType, setUserType] = useState<'employer' | 'employee' | 'admin' | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { signUp } = useAuth() || {};

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

      const result = await signUp(email, password, userType, code, firstName, lastName);
      toast.success('Compte créé avec succès !');

      if (result.pendingApproval) {
        window.location.replace('/pending-approval');
        return;
      }

      window.location.replace('/dashboard');
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la création du compte.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gestapp-shell ga-subtle-grid min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="ga-card max-w-md w-full space-y-8 p-8 sm:p-10">
        <div className="flex flex-col items-center">
          {/* Logo GestApp */}
          <div className="flex items-center justify-center flex-col">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-tr from-emerald-900 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-200/60 mb-4">
              <span className="text-white font-bold text-5xl">G</span>
            </div>
            <span className="text-4xl font-extrabold text-emerald-900 mb-8">
              GestApp
            </span>
          </div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-950">
            Créer un compte
          </h2>
        </div>

        {/* Sélection du type de compte */}
        {!userType ? (
          <div className="mt-8 space-y-4">
            <button
              onClick={() => setUserType('employer')}
              className="ga-btn-primary w-full py-3 px-4 text-sm"
            >
              Je suis un employeur
            </button>
            <button
              onClick={() => setUserType('employee')}
              className="ga-btn-secondary w-full py-3 px-4 text-sm"
            >
              Je suis un employé
            </button>
            <button
              onClick={() => setUserType('admin')}
              className="ga-btn-secondary w-full py-3 px-4 text-sm"
            >
              Je suis un administrateur
            </button>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <h3 className="text-lg font-medium text-center mb-4">
                {userType === 'employer' ? 'Inscription Employeur' : userType === 'admin' ? 'Inscription Administrateur' : 'Inscription Employé'}
              </h3>
              <button
                type="button"
                onClick={() => setUserType(null)}
                className="ga-btn-secondary mb-6 w-full py-2.5 px-4 text-sm"
              >
                Changer le type de compte
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="first-name" className="sr-only">
                  Prénom
                </label>
                <input
                  id="first-name"
                  name="firstName"
                  type="text"
                  required
                  className="ga-input relative block w-full px-4 py-3 placeholder-gray-400 sm:text-sm"
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
                  className="ga-input relative block w-full px-4 py-3 placeholder-gray-400 sm:text-sm"
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
                  className="ga-input relative block w-full px-4 py-3 placeholder-gray-400 sm:text-sm"
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
                  className="ga-input relative block w-full px-4 py-3 placeholder-gray-400 sm:text-sm"
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
                  className="ga-input relative block w-full px-4 py-3 placeholder-gray-400 sm:text-sm"
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
                  className="ga-input relative block w-full px-4 py-3 placeholder-gray-400 sm:text-sm"
                  placeholder={userType === 'employer' ? 'Créer un code unique pour votre centre' : 'Entrer le code fourni par votre employeur'}
                  value={code}
                  onChange={(e) => setCode(e.target.value.trimStart().toUpperCase())}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="ga-btn-primary group relative w-full py-3 px-4 text-sm"
              >
                {loading ? 'Création...' : 'Créer un compte'}
              </button>
            </div>
          </form>
        )}
        <Link
          href="/login"
          className="block text-center text-sm font-bold text-emerald-800 hover:text-emerald-950"
        >
          Déjà un compte ? Se connecter
        </Link>
      </div>
    </div>
  );
}
