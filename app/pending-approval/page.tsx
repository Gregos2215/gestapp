'use client';

import Link from 'next/link';

export default function PendingApprovalPage() {
  return (
    <div className="gestapp-shell ga-subtle-grid min-h-screen flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="ga-card max-w-xl w-full p-8 sm:p-10 text-center space-y-6">
        <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-to-tr from-emerald-900 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-200/60">
          <span className="text-white font-bold text-5xl">G</span>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-gray-950">Demande envoyée</h1>
          <p className="mt-4 text-base leading-7 text-gray-600">
            Merci d’avoir créé votre compte avec GestApp. Votre demande a été envoyée à l’employeur pour approbation.
          </p>
          <p className="mt-3 text-sm text-gray-500">
            Vous aurez accès au site dès que l’employeur aura activé votre compte.
          </p>
        </div>
        <Link href="/login" className="ga-btn-primary inline-flex px-6 py-3 text-sm">
          Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
