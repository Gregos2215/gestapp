'use client';

import RegisterForm from '@/components/auth/RegisterForm';
import Link from 'next/link';

export default function RegisterPage() {
  return (
    <div>
      <RegisterForm />
      <div className="text-center mt-4">
        <Link 
          href="/login" 
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          Déjà un compte ? Se connecter
        </Link>
      </div>
    </div>
  );
} 