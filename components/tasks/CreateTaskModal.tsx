'use client';

import { Fragment, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import CreateTaskForm from './CreateTaskForm';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  centerCode: string;
  onTaskCreated: (taskId: string) => void;
  currentUserInfo: { id: string; firstName?: string; lastName?: string };
}

export default function CreateTaskModal({ isOpen, onClose, centerCode, onTaskCreated, currentUserInfo }: CreateTaskModalProps) {
  // Gestion du bouton retour arrière
  useEffect(() => {
    if (!isOpen) return;

    // Ajouter un état dans l'historique pour cette modale
    window.history.pushState({ modal: 'createTask' }, '', window.location.href);

    // Fonction pour gérer le retour en arrière
    const handlePopState = () => {
      onClose();
      // Ne pas appeler window.history.back() ici
    };

    // Ajouter l'écouteur d'événement
    window.addEventListener('popstate', handlePopState);

    // Nettoyer l'écouteur d'événement lors du démontage
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <div className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity" />

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Dialog.Panel className="relative transform rounded-xl bg-white shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg w-full max-w-[95vw] max-h-[90vh] flex flex-col">
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 sm:px-6 flex items-center justify-between rounded-t-xl">
                <Dialog.Title as="h3" className="text-base sm:text-lg font-semibold text-white">
                  Nouvelle tâche
                </Dialog.Title>
                <button
                  type="button"
                  className="text-white hover:text-gray-200 focus:outline-none"
                  onClick={onClose}
                >
                  <span className="sr-only">Fermer</span>
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <div className="overflow-y-auto p-4 sm:p-6 flex-1">
                <CreateTaskForm
                  centerCode={centerCode}
                  onClose={onClose}
                  onTaskCreated={onTaskCreated}
                  currentUserInfo={currentUserInfo}
                />
              </div>
            </Dialog.Panel>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
} 