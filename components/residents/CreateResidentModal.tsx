import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect } from 'react';
import CreateResidentForm from './CreateResidentForm';

interface CreateResidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  centerCode: string;
  onResidentCreated: () => void;
}

export default function CreateResidentModal({
  isOpen,
  onClose,
  centerCode,
  onResidentCreated
}: CreateResidentModalProps) {
  // Gestion du bouton retour arrière
  useEffect(() => {
    if (!isOpen) return;

    // Ajouter un état dans l'historique pour cette modale
    window.history.pushState({ modal: 'createResident' }, '', window.location.href);

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
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500/25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 mb-6"
                >
                  Nouveau résident
                </Dialog.Title>

                <CreateResidentForm
                  centerCode={centerCode}
                  onClose={onClose}
                  onResidentCreated={onResidentCreated}
                />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
} 