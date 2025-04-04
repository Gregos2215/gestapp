import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  isEmployer: boolean;
}

interface CreateReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  centerCode: string;
  currentUserId: string;
  currentUserName: string;
  onReportCreated: (reportId: string) => void;
}

export default function CreateReportModal({
  isOpen,
  onClose,
  centerCode,
  currentUserId,
  currentUserName,
  onReportCreated
}: CreateReportModalProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setContent('');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('Le contenu du rapport ne peut pas être vide');
      return;
    }

    setIsSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'reports'), {
        centerCode,
        userId: currentUserId,
        userName: currentUserName,
        content,
        createdAt: serverTimestamp(),
      });

      toast.success('Rapport créé avec succès');
      onReportCreated(docRef.id);
      onClose();
    } catch (error) {
      console.error('Error creating report:', error);
      toast.error('Erreur lors de la création du rapport');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <div className="fixed inset-0 bg-gray-500/25 transition-opacity" />

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl flex flex-col max-h-[90vh]">
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                    Nouveau rapport d'activité
                  </Dialog.Title>
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600/50 text-white hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-white"
                    onClick={onClose}
                  >
                    <span className="sr-only">Fermer</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Information de l'auteur */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Auteur du rapport
                  </label>
                  <div className="mt-1 flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                      {currentUserName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="text-base font-medium text-gray-900">
                      {currentUserName}
                    </span>
                  </div>
                </div>

                {/* Éditeur de rapport */}
                <div>
                  <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
                    Contenu du rapport
                  </label>
                  <textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={12}
                    className="block w-full rounded-lg border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base text-gray-900 transition-colors duration-200 hover:border-indigo-300 py-2.5 px-3"
                    placeholder="Écrivez votre rapport ici..."
                  />
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 flex-shrink-0 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !content.trim()}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                    (isSubmitting || !content.trim()) && 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? 'Création...' : 'Créer le rapport'}
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
} 