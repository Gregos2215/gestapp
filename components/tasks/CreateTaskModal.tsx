'use client';

import { Fragment } from 'react';
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
  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <div className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity" />

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
            <Dialog.Panel className="relative transform rounded-xl bg-white shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg w-full max-w-[95vw] max-h-[90vh] flex flex-col">
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <Dialog.Title as="h3" className="text-base sm:text-lg font-semibold text-white">
                    Nouvelle tâche
                  </Dialog.Title>
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600/50 text-white hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-white p-1.5"
                    onClick={onClose}
                  >
                    <span className="sr-only">Fermer</span>
                    <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 overflow-y-auto flex-1">
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