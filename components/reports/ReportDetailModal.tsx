import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
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
  isEmployer: boolean;
  onReportDeleted?: () => void;
}

export default function ReportDetailModal({
  isOpen,
  onClose,
  report,
  currentUserId,
  isEmployer,
  onReportDeleted
}: ReportDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(report.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const canEdit = currentUserId === report.userId;
  const canDelete = isEmployer;
  
  // Gestion du bouton retour arrière
  useEffect(() => {
    if (!isOpen) return;

    // Ajouter un état dans l'historique pour cette modale
    window.history.pushState({ modal: 'reportDetail' }, '', window.location.href);

    // Fonction pour gérer le retour en arrière
    const handlePopState = () => {
      // Si en mode édition, quitter ce mode
      if (isEditing) {
        setIsEditing(false);
        // Ajouter un nouvel état pour maintenir la modale dans l'historique
        window.history.pushState({ modal: 'reportDetail' }, '', window.location.href);
      } 
      // Si la confirmation de suppression est active, fermer cette boîte de dialogue
      else if (showDeleteConfirmation) {
        setShowDeleteConfirmation(false);
        // Ajouter un nouvel état pour maintenir la modale dans l'historique
        window.history.pushState({ modal: 'reportDetail' }, '', window.location.href);
      } 
      // Sinon, fermer la modale
      else {
        onClose();
        // Ne pas appeler window.history.back() ici
      }
    };

    // Ajouter l'écouteur d'événement
    window.addEventListener('popstate', handlePopState);

    // Nettoyer l'écouteur d'événement lors du démontage
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose, isEditing, showDeleteConfirmation]);

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

  const handleDelete = async () => {
    if (!canDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'reports', report.id));
      toast.success('Rapport supprimé avec succès');
      
      onClose();
      if (onReportDeleted) {
        onReportDeleted();
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Erreur lors de la suppression du rapport');
      setShowDeleteConfirmation(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <div className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity" />

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
            <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all w-full max-w-[95vw] sm:max-w-2xl flex flex-col max-h-[95vh]">
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <Dialog.Title as="h3" className="text-base sm:text-lg font-semibold text-white">
                    Rapport d&apos;activité
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

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <h4 className="text-xs sm:text-sm font-medium text-gray-500">Auteur</h4>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-gray-900">{report.userName}</p>
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-medium text-gray-500">Date de création</h4>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-gray-900">
                      {format(report.createdAt.toDate(), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs sm:text-sm font-medium text-gray-500">Contenu du rapport</h4>
                      {canEdit && !isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(true);
                            setEditedContent(report.content);
                          }}
                          className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-lg"
                        >
                          <PencilIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
                          Modifier
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-2">
                        <textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          rows={8}
                          className="block w-full rounded-lg border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm sm:text-base text-gray-900 transition-colors duration-200 hover:border-indigo-300 py-2 sm:py-2.5 px-2 sm:px-3"
                        />
                      </div>
                    ) : (
                      <div className="mt-2 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-[50vh] overflow-y-auto">
                        <p className="whitespace-pre-wrap text-sm sm:text-base text-gray-900 break-words">{report.content}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-3 flex-shrink-0 border-t border-gray-200">
                {canDelete && !isEditing && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirmation(true)}
                    className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 inline-flex items-center justify-center sm:justify-start"
                  >
                    <TrashIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
                    Supprimer
                  </button>
                )}
                
                <div className="flex justify-end gap-2 sm:gap-3 ml-auto w-full sm:w-auto">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="flex-1 sm:flex-none px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !editedContent.trim()}
                        className={`flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
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
                      className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Fermer
                    </button>
                  )}
                </div>
              </div>
            </Dialog.Panel>
          </div>
        </div>

        {showDeleteConfirmation && (
          <div className="fixed inset-0 z-60 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-2 sm:px-4 pt-4 pb-20 text-center">
              <div className="fixed inset-0 transition-opacity" onClick={() => setShowDeleteConfirmation(false)}>
                <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
              </div>
              <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all w-full max-w-[95vw] sm:max-w-lg">
                <div className="bg-white px-3 sm:px-4 pt-4 sm:pt-5 pb-3 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                      <TrashIcon className="h-5 w-5 text-red-600" aria-hidden="true" />
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-base sm:text-lg leading-6 font-medium text-gray-900">
                        Confirmation de suppression
                      </h3>
                      <div className="mt-2">
                        <p className="text-xs sm:text-sm text-gray-500">
                          Êtes-vous sûr de vouloir supprimer ce rapport ? Cette action est irréversible.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-3 sm:px-4 py-3 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-xs sm:text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Suppression...' : 'Supprimer'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto"
                    onClick={() => setShowDeleteConfirmation(false)}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </Transition.Root>
  );
} 