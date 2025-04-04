import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PencilSquareIcon, TrashIcon, CheckIcon, UserIcon, LanguageIcon, CalendarIcon, HeartIcon, ClockIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { useRouter } from 'next/navigation';

interface Resident {
  id: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  birthDate: Date;
  language: 'french' | 'english' | 'spanish' | 'creole' | 'other';
  description: string;
  condition: 'intellectual_disability' | 'autism' | 'dementia';
  hasAllergies: boolean;
  allergies: string | null;
  isIncontinent: boolean;
  isVerbal: boolean;
  autonomyLevel: 'autonomous' | 'semi-autonomous' | 'dependent';
  hasDisability: boolean;
  disability: string | null;
  centerCode: string;
}

interface ResidentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  resident: Resident;
  onResidentUpdated: () => void;
  onResidentDeleted: () => void;
  isEmployer: boolean;
}

export default function ResidentDetailModal({
  isOpen,
  onClose,
  resident,
  onResidentUpdated,
  onResidentDeleted,
  isEmployer
}: ResidentDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [editedResident, setEditedResident] = useState<Resident>(resident);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const residentRef = doc(db, 'residents', resident.id);
      await updateDoc(residentRef, {
        ...editedResident,
        birthDate: editedResident.birthDate
      });
      toast.success('Résident mis à jour avec succès');
      onResidentUpdated();
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating resident:', error);
      toast.error('Erreur lors de la mise à jour du résident');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const residentRef = doc(db, 'residents', resident.id);
      await deleteDoc(residentRef);
      toast.success('Résident supprimé avec succès');
      onResidentDeleted();
      onClose();
    } catch (error) {
      console.error('Error deleting resident:', error);
      toast.error('Erreur lors de la suppression du résident');
    }
  };

  const handleViewTasks = () => {
    router.push(`/residents/${resident.id}/tasks`);
    onClose();
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
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
          <div className="fixed inset-0 bg-gray-500/25 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform rounded-xl bg-white shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                {/* Header avec gradient */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-t-xl px-4 py-5 sm:px-6">
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-xl font-semibold leading-6 text-white">
                      {isEditing ? 'Modifier le résident' : 'Détails du résident'}
                    </Dialog.Title>
                    <div className="flex items-center space-x-4">
                      {!isEditing && (
                        <>
                          <button
                            onClick={handleViewTasks}
                            className="rounded-md bg-indigo-500 px-3 py-2 text-white hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-white flex items-center space-x-2"
                            title="Voir les tâches du résident"
                          >
                            <ClipboardDocumentListIcon className="h-5 w-5" />
                            <span className="text-sm">Tâches à faire</span>
                          </button>
                          <button
                            onClick={() => setIsEditing(true)}
                            className="rounded-md bg-indigo-500 p-2 text-white hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-white"
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={onClose}
                        className="rounded-md bg-indigo-500 p-2 text-white hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-white"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-5 sm:p-6">
                  {isConfirmingDelete ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                          <TrashIcon className="h-6 w-6 text-red-600" />
                        </div>
                        <h3 className="mt-4 text-lg font-medium text-gray-900">
                          Supprimer le résident
                        </h3>
                        <p className="mt-2 text-sm text-gray-500">
                          Êtes-vous sûr de vouloir supprimer ce résident ? Cette action est irréversible.
                        </p>
                      </div>
                      <div className="mt-5 flex justify-center space-x-3">
                        <button
                          onClick={() => setIsConfirmingDelete(false)}
                          className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={handleDelete}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Informations de base */}
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-4 py-5 sm:p-6 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex-grow space-y-4">
                              {isEditing ? (
                                <>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-base font-semibold text-gray-900 mb-2">
                                        Prénom
                                      </label>
                                      <input
                                        type="text"
                                        value={editedResident.firstName}
                                        onChange={(e) => setEditedResident({
                                          ...editedResident,
                                          firstName: e.target.value
                                        })}
                                        className="mt-1 block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:ring-2 transition-all duration-200"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-base font-semibold text-gray-900 mb-2">
                                        Nom
                                      </label>
                                      <input
                                        type="text"
                                        value={editedResident.lastName}
                                        onChange={(e) => setEditedResident({
                                          ...editedResident,
                                          lastName: e.target.value
                                        })}
                                        className="mt-1 block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:ring-2 transition-all duration-200"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-base font-semibold text-gray-900 mb-2">
                                        Genre
                                      </label>
                                      <select
                                        value={editedResident.gender}
                                        onChange={(e) => setEditedResident({
                                          ...editedResident,
                                          gender: e.target.value as 'male' | 'female'
                                        })}
                                        className="mt-1 block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:ring-2 transition-all duration-200"
                                      >
                                        <option value="male">Homme</option>
                                        <option value="female">Femme</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-base font-semibold text-gray-900 mb-2">
                                        Date de naissance
                                      </label>
                                      <DatePicker
                                        selected={editedResident.birthDate}
                                        onChange={(date: Date | null) => date && setEditedResident({
                                          ...editedResident,
                                          birthDate: date
                                        })}
                                        dateFormat="dd/MM/yyyy"
                                        locale={fr}
                                        className="mt-1 block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:ring-2 transition-all duration-200"
                                      />
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <h3 className="text-2xl font-bold text-gray-900">
                                    {resident.firstName} {resident.lastName}
                                  </h3>
                                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                                    <div className="flex items-center">
                                      <UserIcon className="h-5 w-5 mr-2 text-gray-400" />
                                      {resident.gender === 'male' ? 'Homme' : 'Femme'}
                                    </div>
                                    <div className="flex items-center">
                                      <CalendarIcon className="h-5 w-5 mr-2 text-gray-400" />
                                      {format(resident.birthDate, 'dd MMMM yyyy', { locale: fr })}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Informations détaillées */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                          <div className="px-4 py-5 sm:p-6 space-y-4">
                            <h4 className="text-lg font-medium text-gray-900">État du résident</h4>
                            {isEditing ? (
                              <div>
                                <label className="block text-base font-semibold text-gray-900 mb-2">
                                  État
                                </label>
                                <select
                                  value={editedResident.condition}
                                  onChange={(e) => setEditedResident({
                                    ...editedResident,
                                    condition: e.target.value as 'intellectual_disability' | 'autism' | 'dementia'
                                  })}
                                  className="mt-1 block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:ring-2 transition-all duration-200"
                                >
                                  <option value="intellectual_disability">Déficient intellectuel</option>
                                  <option value="autism">TSA</option>
                                  <option value="dementia">Démence</option>
                                </select>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-100 text-purple-800">
                                  {resident.condition === 'intellectual_disability' && 'Déficient intellectuel'}
                                  {resident.condition === 'autism' && 'TSA'}
                                  {resident.condition === 'dementia' && 'Démence'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                          <div className="px-4 py-5 sm:p-6 space-y-4">
                            <h4 className="text-lg font-medium text-gray-900">Communication</h4>
                            {isEditing ? (
                              <>
                                <div>
                                  <label className="block text-base font-semibold text-gray-900 mb-2">
                                    Langue
                                  </label>
                                  <select
                                    value={editedResident.language}
                                    onChange={(e) => setEditedResident({
                                      ...editedResident,
                                      language: e.target.value as 'french' | 'english' | 'spanish' | 'creole' | 'other'
                                    })}
                                    className="mt-1 block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:ring-2 transition-all duration-200"
                                  >
                                    <option value="french">Français</option>
                                    <option value="english">Anglais</option>
                                    <option value="spanish">Espagnol</option>
                                    <option value="creole">Créole</option>
                                    <option value="other">Autre</option>
                                  </select>
                                </div>
                                <div className="mt-4">
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Communication verbale
                                  </label>
                                  <div className="mt-2">
                                    <label className="inline-flex items-center bg-gray-50 px-4 py-2 rounded-lg border border-gray-300">
                                      <input
                                        type="checkbox"
                                        checked={editedResident.isVerbal}
                                        onChange={(e) => setEditedResident({
                                          ...editedResident,
                                          isVerbal: e.target.checked
                                        })}
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="ml-2 text-sm text-gray-700">
                                        Communication verbale
                                      </span>
                                    </label>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="space-y-3">
                                <div className="flex items-center text-sm text-gray-600">
                                  <LanguageIcon className="h-5 w-5 mr-2 text-gray-400" />
                                  {resident.language === 'french' && 'Français'}
                                  {resident.language === 'english' && 'Anglais'}
                                  {resident.language === 'spanish' && 'Espagnol'}
                                  {resident.language === 'creole' && 'Créole'}
                                  {resident.language === 'other' && 'Autre'}
                                </div>
                                <div className="flex items-center">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    resident.isVerbal
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {resident.isVerbal ? 'Communication verbale' : 'Communication non verbale'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                          <div className="px-4 py-5 sm:p-6 space-y-4">
                            <h4 className="text-lg font-medium text-gray-900">Autonomie</h4>
                            {isEditing ? (
                              <div>
                                <label className="block text-base font-semibold text-gray-900 mb-2">
                                  Niveau d'autonomie
                                </label>
                                <select
                                  value={editedResident.autonomyLevel}
                                  onChange={(e) => setEditedResident({
                                    ...editedResident,
                                    autonomyLevel: e.target.value as 'autonomous' | 'semi-autonomous' | 'dependent'
                                  })}
                                  className="mt-1 block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:ring-2 transition-all duration-200"
                                >
                                  <option value="autonomous">Autonome</option>
                                  <option value="semi-autonomous">Semi-autonome</option>
                                  <option value="dependent">Dépendant</option>
                                </select>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  resident.autonomyLevel === 'autonomous'
                                    ? 'bg-green-100 text-green-800'
                                    : resident.autonomyLevel === 'semi-autonomous'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {resident.autonomyLevel === 'autonomous' && 'Autonome'}
                                  {resident.autonomyLevel === 'semi-autonomous' && 'Semi-autonome'}
                                  {resident.autonomyLevel === 'dependent' && 'Dépendant'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                          <div className="px-4 py-5 sm:p-6 space-y-4">
                            <h4 className="text-lg font-medium text-gray-900">Santé</h4>
                            {isEditing ? (
                              <>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Allergies
                                  </label>
                                  <div className="mt-2">
                                    <label className="inline-flex items-center bg-gray-50 px-4 py-2 rounded-lg border border-gray-300">
                                      <input
                                        type="checkbox"
                                        checked={editedResident.hasAllergies}
                                        onChange={(e) => setEditedResident({
                                          ...editedResident,
                                          hasAllergies: e.target.checked,
                                          allergies: e.target.checked ? editedResident.allergies : null
                                        })}
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="ml-2 text-sm text-gray-700">
                                        A des allergies
                                      </span>
                                    </label>
                                  </div>
                                  {editedResident.hasAllergies && (
                                    <textarea
                                      value={editedResident.allergies || ''}
                                      onChange={(e) => setEditedResident({
                                        ...editedResident,
                                        allergies: e.target.value
                                      })}
                                      rows={3}
                                      className="mt-2 block w-full rounded-lg border-gray-300 bg-gray-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:bg-white transition-colors duration-200 sm:text-sm"
                                      placeholder="Détails des allergies..."
                                    />
                                  )}
                                </div>
                                <div className="mt-4">
                                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Handicap
                                  </label>
                                  <div className="mt-2">
                                    <label className="inline-flex items-center bg-gray-50 px-4 py-2 rounded-lg border border-gray-300">
                                      <input
                                        type="checkbox"
                                        checked={editedResident.hasDisability}
                                        onChange={(e) => setEditedResident({
                                          ...editedResident,
                                          hasDisability: e.target.checked,
                                          disability: e.target.checked ? editedResident.disability : null
                                        })}
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="ml-2 text-sm text-gray-700">
                                        A un handicap
                                      </span>
                                    </label>
                                  </div>
                                  {editedResident.hasDisability && (
                                    <textarea
                                      value={editedResident.disability || ''}
                                      onChange={(e) => setEditedResident({
                                        ...editedResident,
                                        disability: e.target.value
                                      })}
                                      rows={3}
                                      className="mt-2 block w-full rounded-lg border-gray-300 bg-gray-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:bg-white transition-colors duration-200 sm:text-sm"
                                      placeholder="Détails du handicap..."
                                    />
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="space-y-3">
                                {resident.hasAllergies && (
                                  <div>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                      Allergies
                                    </span>
                                    <p className="mt-1 text-sm text-gray-600">{resident.allergies}</p>
                                  </div>
                                )}
                                {resident.hasDisability && (
                                  <div>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                      Handicap
                                    </span>
                                    <p className="mt-1 text-sm text-gray-600">{resident.disability}</p>
                                  </div>
                                )}
                                {!resident.hasAllergies && !resident.hasDisability && (
                                  <p className="text-sm text-gray-500">Aucun problème de santé signalé</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200 sm:col-span-2">
                          <div className="px-4 py-5 sm:p-6 space-y-4">
                            <h4 className="text-lg font-semibold text-gray-900">Description</h4>
                            {isEditing ? (
                              <div>
                                <label className="block text-base font-semibold text-gray-900 mb-2">
                                  Informations complémentaires sur le résident
                                </label>
                                <p className="text-sm text-gray-600 mb-4">
                                  Ajoutez ici toute information importante concernant le résident : ses habitudes, ses préférences, ses besoins particuliers, etc.
                                </p>
                                <textarea
                                  value={editedResident.description}
                                  onChange={(e) => setEditedResident({
                                    ...editedResident,
                                    description: e.target.value
                                  })}
                                  rows={8}
                                  className="mt-1 block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:ring-2 transition-all duration-200"
                                  placeholder="Exemple : Marie aime particulièrement les activités artistiques, notamment la peinture. Elle préfère manger dans un environnement calme. Elle a besoin d'aide pour..."
                                />
                              </div>
                            ) : (
                              <div className="bg-gray-50 rounded-lg p-4">
                                <p className="text-base text-gray-900 whitespace-pre-wrap">{resident.description || "Aucune description ajoutée."}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer avec actions */}
                {!isConfirmingDelete && (
                  <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 rounded-b-xl">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={isSaving}
                          className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
                        >
                          {isSaving ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Enregistrement...
                            </>
                          ) : (
                            <>
                              <CheckIcon className="h-5 w-5 mr-2 -ml-1" />
                              Enregistrer
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(false);
                            setEditedResident(resident);
                          }}
                          className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      isEmployer && (
                        <button
                          type="button"
                          onClick={() => setIsConfirmingDelete(true)}
                          className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
                        >
                          <TrashIcon className="h-5 w-5 mr-2 -ml-1" />
                          Supprimer
                        </button>
                      )
                    )}
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
} 