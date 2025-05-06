import { Fragment, useEffect, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  author: {
    id: string;
    name: string;
    isEmployer: boolean;
  };
  title: string;
  content: string;
  createdAt: any; // Utiliser 'any' temporairement ou définir un type plus précis si possible
}

interface MessageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: Message;
  currentUserId: string; // Ajout de l'ID de l'utilisateur actuel
  isEmployer: boolean; // Ajout du statut employeur de l'utilisateur actuel
  onMessageDeleted?: () => void; // Callback pour la suppression
}

// Fonction utilitaire pour gérer les dates Firebase de manière sécurisée (répliquée ici pour l'instant)
const safeFirebaseDate = (firebaseDate: any): Date | null => {
  if (!firebaseDate) return null;
  if (firebaseDate instanceof Date) return firebaseDate;
  if (firebaseDate && typeof firebaseDate.toDate === 'function') {
    return firebaseDate.toDate();
  }
  if (typeof firebaseDate === 'string' || typeof firebaseDate === 'number') {
    return new Date(firebaseDate);
  }
  return null;
};

export default function MessageDetailModal({ isOpen, onClose, message, currentUserId, isEmployer, onMessageDeleted }: MessageDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(message.title);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // Vérifier si l'utilisateur peut modifier le message
  const canEdit = isEmployer || currentUserId === message.author.id;
  const canDelete = isEmployer; // Seul l'employeur peut supprimer

  // Réinitialiser les états quand le message change
  useEffect(() => {
    setEditedTitle(message.title);
    setEditedContent(message.content);
    setIsEditing(false);
  }, [message]);

  const formattedDate = safeFirebaseDate(message.createdAt)
    ? format(safeFirebaseDate(message.createdAt)!, 'dd MMMM yyyy à HH:mm', { locale: fr })
    : 'Date inconnue';

  // Gestion du bouton retour arrière
  useEffect(() => {
    if (!isOpen) return;

    // Ajouter un état dans l'historique pour cette modale
    window.history.pushState({ modal: 'messageDetail' }, '', window.location.href);

    // Fonction pour gérer le retour en arrière
    const handlePopState = () => {
      // Si en mode édition, quitter ce mode
      if (isEditing) {
        setIsEditing(false);
        // Ajouter un nouvel état pour maintenir la modale dans l'historique
        window.history.pushState({ modal: 'messageDetail' }, '', window.location.href);
      } 
      // Sinon, fermer la modale
      else if (showDeleteConfirmation) {
        setShowDeleteConfirmation(false);
        window.history.pushState({ modal: 'messageDetail' }, '', window.location.href);
      } else {
        onClose();
      }
    };

    // Ajouter l'écouteur d'événement
    window.addEventListener('popstate', handlePopState);

    // Nettoyer l'écouteur d'événement lors du démontage
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose, isEditing, showDeleteConfirmation]);

  // Fonction pour sauvegarder les modifications
  const handleSave = async () => {
    // Vérifier si le contenu n'est pas vide
    if (!editedContent.trim() && !editedTitle.trim()) {
      toast.error('Le titre ou le contenu du message ne peut pas être vide');
      return;
    }

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'messages', message.id), {
        title: editedTitle.trim(),
        content: editedContent.trim()
      });
      toast.success('Message mis à jour avec succès');
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du message:', error);
      toast.error('Erreur lors de la mise à jour du message');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMessage = async () => {
    if (!canDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'messages', message.id));
      toast.success('Message supprimé avec succès');
      setShowDeleteConfirmation(false);
      onClose(); 
      if (onMessageDeleted) {
        onMessageDeleted();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du message:', error);
      toast.error('Erreur lors de la suppression du message');
      setShowDeleteConfirmation(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => {
        if (isEditing) setIsEditing(false);
        if (showDeleteConfirmation) setShowDeleteConfirmation(false);
        onClose();
      }}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        {/* Modal Panel */}
        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all w-full max-w-[95vw] sm:max-w-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <Dialog.Title as="h3" className="text-base sm:text-lg font-semibold text-white">
                      {isEditing ? 'Modifier le message' : 'Détails du message'}
                    </Dialog.Title>
                    <button
                      type="button"
                      className="rounded-md bg-indigo-600/50 text-white hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-white p-1.5"
                      onClick={() => {
                        if (isEditing) {
                          setIsEditing(false);
                          setEditedTitle(message.title);
                          setEditedContent(message.content);
                        } else {
                          if (showDeleteConfirmation) setShowDeleteConfirmation(false);
                          onClose();
                        }
                      }}
                    >
                      <span className="sr-only">Fermer</span>
                      <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
                  {/* Titre du message */}
                  {isEditing ? (
                    <div>
                      <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">
                        Titre du message
                      </label>
                      <input
                        type="text"
                        id="edit-title"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm px-4 py-2 text-gray-900"
                        placeholder="Titre du message (optionnel)"
                      />
                    </div>
                  ) : (
                    message.title && (
                      <div>
                        <h4 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{message.title}</h4>
                      </div>
                    )
                  )}
                  
                  {/* Informations Auteur et Date */}
                  <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                     <div className={`h-10 w-10 rounded-full ${message.author.isEmployer ? 'bg-indigo-100' : 'bg-green-100'} flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-sm font-semibold ${message.author.isEmployer ? 'text-indigo-700' : 'text-green-700'}`}>
                          {message.author.name.split(' ').map(n => n.charAt(0).toUpperCase()).join('')}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{message.author.name}</p>
                        <p className="text-xs text-gray-500">{formattedDate}</p>
                      </div>
                  </div>

                  {/* Contenu du message */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-sm font-medium text-gray-500">Contenu</h5>
                      {canEdit && !isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(true);
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
                      <div className="mt-1 p-3 sm:p-4 bg-white rounded-lg border border-gray-200">
                        <p className="whitespace-pre-wrap text-sm sm:text-base text-gray-800 break-words">
                          {message.content}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
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
                  
                  <div className={`flex ${canDelete && !isEditing ? 'justify-end' : 'justify-end w-full'} gap-2 sm:gap-3 ${canDelete && !isEditing ? '' : 'ml-auto'} w-full sm:w-auto`}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(false);
                          }}
                          className="flex-1 sm:flex-none px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={isSaving || (!editedTitle.trim() && !editedContent.trim())}
                          className={`flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                            (isSaving || (!editedTitle.trim() && !editedContent.trim())) && 'opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (showDeleteConfirmation) setShowDeleteConfirmation(false);
                          onClose();
                        }}
                        className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Fermer
                      </button>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>

        {showDeleteConfirmation && (
          <div className="fixed inset-0 z-[60] overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-2 sm:px-4 pt-4 pb-20 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <div className="fixed inset-0 transition-opacity" onClick={() => setShowDeleteConfirmation(false)} aria-hidden="true">
                  <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                </div>
              </Transition.Child>
              
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all w-full max-w-[95vw] sm:max-w-lg relative z-[70]">
                  <div className="bg-white px-3 sm:px-4 pt-4 sm:pt-5 pb-3 sm:pb-4">
                    <div className="sm:flex sm:items-start">
                      <div className="mx-auto flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                        <TrashIcon className="h-5 w-5 text-red-600" aria-hidden="true" />
                      </div>
                      <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                        <Dialog.Title as="h3" className="text-base sm:text-lg leading-6 font-medium text-gray-900">
                          Confirmation de suppression
                        </Dialog.Title>
                        <div className="mt-2">
                          <p className="text-xs sm:text-sm text-gray-500">
                            Êtes-vous sûr de vouloir supprimer ce message ? Cette action est irréversible.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-3 sm:px-4 py-3 sm:flex sm:flex-row-reverse">
                    <button
                      type="button"
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-xs sm:text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto"
                      onClick={handleDeleteMessage}
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
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        )}
      </Dialog>
    </Transition.Root>
  );
} 