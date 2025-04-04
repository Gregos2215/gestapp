import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PencilIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface Report {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: {
    toDate: () => Date;
  };
}

interface ReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: Report;
  currentUserId: string;
}

export default function ReportDetailModal({
  isOpen,
  onClose,
  report,
  currentUserId
}: ReportDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(report.content);
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = currentUserId === report.userId;

  const handleSave = async () => {
    if (!editedContent.trim()) {
      toast.error('Le contenu du rapport ne peut pas être vide');
      return;
    }

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'reports', report.id), {
        content: editedContent
      });
      toast.success('Rapport mis à jour avec succès');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating report:', error);
      toast.error('Erreur lors de la mise à jour du rapport');
    } finally {
      setIsSaving(false);
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
                    Rapport d'activité
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
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Auteur</h4>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{report.userName}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Date de création</h4>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {format(report.createdAt.toDate(), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-500">Contenu du rapport</h4>
                      {canEdit && !isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(true);
                            setEditedContent(report.content);
                          }}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-lg"
                        >
                          <PencilIcon className="h-4 w-4 mr-1.5" />
                          Modifier
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-2">
                        <textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          rows={12}
                          className="block w-full rounded-lg border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base text-gray-900 transition-colors duration-200 hover:border-indigo-300 py-2.5 px-3"
                        />
                      </div>
                    ) : (
                      <div className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="whitespace-pre-wrap text-gray-900">{report.content}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 flex-shrink-0 border-t border-gray-200">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || !editedContent.trim()}
                      className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                        (isSaving || !editedContent.trim()) && 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Fermer
                  </button>
                )}
              </div>
            </Dialog.Panel>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
} 