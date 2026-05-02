'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth() || {};
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!signIn) {
      toast.error('Service d\'authentification non disponible');
      return;
    }

    try {
      setLoading(true);
      await signIn(email, password);
      router.replace('/dashboard');
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Une erreur est survenue lors de la connexion');
      }
    } finally {
      setLoading(false);
    }
  };

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
            Connexion à votre compte
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-3">
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
                autoComplete="current-password"
                required
                className="ga-input relative block w-full px-4 py-3 placeholder-gray-400 sm:text-sm"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col space-y-4">
            <button
              type="submit"
              disabled={loading}
              className={`ga-btn-primary group relative w-full py-3 px-4 text-sm ${
                loading ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connexion en cours...
                </>
              ) : (
                'Se connecter'
              )}
            </button>
            
            <Link 
              href="/register" 
              className="text-center text-sm text-emerald-800 hover:text-emerald-950 font-bold"
            >
              Pas encore de compte ? S'inscrire
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
} 
