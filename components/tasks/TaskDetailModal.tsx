import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
  XMarkIcon, 
  CheckIcon, 
  TrashIcon,
  ClockIcon,
  CalendarIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { doc, updateDoc, deleteDoc, Timestamp, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: {
    id: string;
    type: 'resident' | 'general';
    name: string;
    description: string;
    dueDate: Date;
    status: 'pending' | 'in_progress' | 'completed';
    residentId?: string;
    residentName?: string;
    recurrenceType: string;
    customRecurrence?: string;
    specificDays?: string[];
    completedBy?: {
      id: string;
      name: string;
      timestamp: Timestamp;
    };
    isVirtualOccurrence?: boolean;
    deleted?: boolean;
    deletedAt?: Timestamp;
    deletedBy?: {
      id: string;
      name: string;
    };
    skippedDates?: number[];
    centerCode?: string;
    createdBy?: {
      id: string;
      name: string;
      timestamp: Timestamp;
    };
    lastModifiedBy?: {
      id: string;
      name: string;
      timestamp: Timestamp;
    };
  };
  centerCode: string;
  currentUserId: string;
  currentUserName: string;
  isEmployer: boolean;
  onTaskDeleted?: () => void;
}

export default function TaskDetailModal({ 
  isOpen, 
  onClose, 
  task, 
  centerCode, 
  currentUserId, 
  currentUserName,
  isEmployer,
  onTaskDeleted 
}: TaskDetailModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [type, setType] = useState<'resident' | 'general'>('general');
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteOption, setDeleteOption] = useState<'single' | 'all'>('single');

  // Weekdays en français avec leurs valeurs correspondantes
  const weekdays = [
    { label: 'Lundi', value: 'monday' },
    { label: 'Mardi', value: 'tuesday' },
    { label: 'Mercredi', value: 'wednesday' },
    { label: 'Jeudi', value: 'thursday' },
    { label: 'Vendredi', value: 'friday' },
    { label: 'Samedi', value: 'saturday' },
    { label: 'Dimanche', value: 'sunday' }
  ];

  // Gérer la sélection des jours
  const toggleDaySelection = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day) 
        : [...prev, day]
    );
  };

  // Gestion du bouton retour arrière
  useEffect(() => {
    if (!isOpen) return;

    // Ajouter un état dans l'historique pour cette modale
    window.history.pushState({ modal: 'taskDetail' }, '', window.location.href);

    // Fonction pour gérer le retour en arrière
    const handlePopState = () => {
      // Si le mode édition est actif, simplement quitter le mode édition
      if (editMode) {
        setEditMode(false);
        // Ajouter un nouvel état pour maintenir la modale dans l'historique
        window.history.pushState({ modal: 'taskDetail' }, '', window.location.href);
      } 
      // Si la confirmation de suppression est active, fermer cette boîte de dialogue
      else if (showDeleteConfirmation) {
        setShowDeleteConfirmation(false);
        // Ajouter un nouvel état pour maintenir la modale dans l'historique
        window.history.pushState({ modal: 'taskDetail' }, '', window.location.href);
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
  }, [isOpen, onClose, editMode, showDeleteConfirmation]);

  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description);
      setDueDate(new Date(task.dueDate));
      setType(task.type);
      setRecurrenceType(task.recurrenceType);
      setSelectedDays(task.specificDays || []);
    }
  }, [task]);

  const handleSave = async () => {
    if (!task) return;

    try {
      const taskRef = doc(db, 'tasks', task.id);
      
      // Créer l'objet de mise à jour de base
      const updateData: any = {
        name,
        description,
        dueDate,
        type,
        recurrenceType,
      };
      
      // Ajouter les jours spécifiques si c'est le type de récurrence choisi
      if (recurrenceType === 'specificDays') {
        updateData.specificDays = selectedDays;
      }
      
      await updateDoc(taskRef, updateData);
      
      const updatedTaskData = { 
        ...task, 
        name, 
        description, 
        dueDate, 
        type, 
        recurrenceType,
        ...(recurrenceType === 'specificDays' && { specificDays: selectedDays })
      };
      
      // Mettre à jour lastModifiedBy
      const modifierInfo = {
        id: currentUserId,
        name: currentUserName,
        timestamp: serverTimestamp()
      };
      await updateDoc(taskRef, { lastModifiedBy: modifierInfo });

      // Créer une alerte pour la modification
      const alertData = {
        centerCode: centerCode,
        type: 'task_updated',
        message: `La tâche "${updatedTaskData.name}" a été modifiée par ${currentUserName}.`, 
        relatedId: task.id,
        createdAt: serverTimestamp(),
        readBy: [currentUserId] // L'utilisateur courant a "lu" cette alerte
      };
      await addDoc(collection(db, 'alerts'), alertData);

      toast.success('Tâche mise à jour avec succès');
      setEditMode(false);
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Erreur lors de la mise à jour de la tâche');
    }
  };

  const handleDelete = async () => {
    if (!task) return;

    try {
      const taskRef = doc(db, 'tasks', task.id);
      
      // Déterminer si c'est une tâche virtuelle et récupérer l'ID de la tâche parent si nécessaire
      const isVirtual = task.isVirtualOccurrence === true;
      let parentTaskId = task.id;
      
      if (isVirtual) {
        // L'ID est au format: virtual-[original-id]-[timestamp]
        const parts = task.id.split('-');
        if (parts.length >= 3) {
          // Extraire l'ID parent et le timestamp de l'ID virtuel
          const virtualPrefix = parts[0];
          const timestamp = parts[parts.length - 1];
          // Reconstruire l'ID parent (tout sauf le premier et dernier élément)
          parentTaskId = parts.slice(1, -1).join('-');
          
          console.log(`Tâche virtuelle détectée: prefix=${virtualPrefix}, parent=${parentTaskId}, timestamp=${timestamp}`);
        }
      }
      
      if (task.recurrenceType !== 'none' && deleteOption === 'all') {
        // Si l'utilisateur choisit de supprimer toutes les occurrences futures
        // Marquer la tâche parent comme supprimée
        const parentRef = doc(db, 'tasks', parentTaskId);
        await updateDoc(parentRef, {
          deleted: true,
          deletedAt: Timestamp.now(),
          deletedBy: {
            id: currentUserId,
            name: currentUserName
          },
          status: 'pending'
        });
        
        console.log(`Tâche récurrente ${parentTaskId} marquée comme supprimée`);
        toast.success('Toutes les occurrences futures ont été supprimées');
      } else if (task.recurrenceType !== 'none' && deleteOption === 'single') {
        // Si l'utilisateur choisit de supprimer uniquement cette occurrence
        console.log("Suppression d'une occurrence unique pour une tâche récurrente");
        
        // Vérifier si la tâche a été complétée
        if (task.status !== 'completed') {
          console.log("Impossible de supprimer une occurrence unique : la tâche n'est pas complétée");
          toast.error("Vous devez d'abord indiqué que la tache a été complétée avant de pouvoir la supprimer");
          setShowDeleteConfirmation(false);
          return;
        }
        
        // Normaliser la date à minuit pour avoir une comparaison cohérente
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        const timestamp = taskDate.getTime();
        
        console.log(`Date de la tâche: ${taskDate.toISOString()}, timestamp: ${timestamp}`);
        
        // Récupérer la tâche parent et ses métadonnées
        const parentTaskRef = doc(db, 'tasks', parentTaskId);
        const parentTaskDoc = await getDoc(parentTaskRef);
        
        if (parentTaskDoc.exists()) {
          const parentData = parentTaskDoc.data();
          let skippedDates = parentData.skippedDates || [];
          
          // Assurez-vous que skippedDates est un tableau
          if (!Array.isArray(skippedDates)) {
            skippedDates = [];
          }
          
          console.log("Dates à ignorer existantes:", skippedDates);
          
          // Ajouter cette date si elle n'est pas déjà présente
          if (!skippedDates.includes(timestamp)) {
            skippedDates.push(timestamp);
            console.log(`Ajout du timestamp ${timestamp} à la liste des dates à ignorer`);
            
            // Mettre à jour la tâche parent avec la nouvelle liste de dates à ignorer
            await updateDoc(parentTaskRef, {
              skippedDates: skippedDates
            });
            
            console.log(`Tâche ${parentTaskId} mise à jour avec les dates à ignorer:`, skippedDates);
            toast.success('Cette occurrence a été supprimée');
          } else {
            console.log(`Le timestamp ${timestamp} est déjà dans la liste des dates à ignorer`);
            toast.success('Cette occurrence était déjà ignorée');
          }
        } else if (!isVirtual) {
          // Si la tâche parent n'existe pas et n'est pas virtuelle, supprimer la tâche entière
          await deleteDoc(taskRef);
          console.log(`Tâche ${task.id} supprimée de la base de données`);
          toast.success('Tâche supprimée avec succès');
        } else {
          // Cas où la tâche est virtuelle mais nous n'avons pas trouvé de parent
          console.error(`Impossible de trouver la tâche parent ${parentTaskId} pour la tâche virtuelle ${task.id}`);
          toast.error("Erreur lors de la suppression de l'occurrence");
        }
      } else {
        // Pour une tâche non récurrente, supprimer entièrement la tâche
        await deleteDoc(taskRef);
        console.log(`Tâche ${task.id} supprimée de la base de données`);
        toast.success('Tâche supprimée avec succès');
      }
      
      // Fermer la modale de confirmation
      setShowDeleteConfirmation(false);
      
      // Fermer la modale principale et notifier le parent
      onClose();
      onTaskDeleted?.();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Erreur lors de la suppression de la tâche');
      setShowDeleteConfirmation(false);
    }
  };

  if (!task) return null;

  // Log pour débogage - à vérifier dans la console du navigateur
  console.log("[TaskDetailModal] Task data:", task);
  if (task.createdBy) {
    console.log("[TaskDetailModal] Created By:", task.createdBy);
  }
  if (task.lastModifiedBy) {
    console.log("[TaskDetailModal] Last Modified By:", task.lastModifiedBy);
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <div className="fixed inset-0 bg-gray-500/25 transition-opacity" />

        <div className="fixed inset-0 z-10">
          <div className="flex min-h-full items-center justify-center p-4">
            <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg flex flex-col max-h-[90vh]">
              {/* En-tête du modal avec dégradé */}
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                    {editMode ? 'Modifier la tâche' : 'Détails de la tâche'}
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

              {/* Contenu défilant */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-6">
                  {editMode ? (
                    <>
                      <div className="space-y-6">
                        {/* Section Résident (si tâche de type résident) */}
                        {type === 'resident' && task.residentName && (
                          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-200 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-indigo-100">
                                <UserGroupIcon className="h-6 w-6 text-indigo-600" />
                              </div>
                              <div>
                                <h3 className="text-base font-medium text-indigo-900">Résident associé</h3>
                                <p className="text-xl font-semibold text-indigo-700">{task.residentName}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Section Informations principales */}
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm space-y-5">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                            Informations principales
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Type de tâche */}
                            <div>
                              <label className="block text-base font-medium text-gray-900 mb-2 flex items-center gap-2">
                                <DocumentTextIcon className="h-5 w-5 text-indigo-600" />
                                Type de tâche
                              </label>
                              <select
                                value={type}
                                onChange={(e) => setType(e.target.value as 'resident' | 'general')}
                                className="block w-full rounded-lg border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base text-gray-900 font-medium transition-colors duration-200 hover:border-indigo-300 py-2.5"
                              >
                                <option value="resident">Résident</option>
                                <option value="general">Général</option>
                              </select>
                            </div>

                            {/* Nom de la tâche */}
                            <div>
                              <label className="block text-base font-medium text-gray-900 mb-2 flex items-center gap-2">
                                <PencilSquareIcon className="h-5 w-5 text-indigo-600" />
                                Nom de la tâche
                              </label>
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="block w-full rounded-lg border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base text-gray-900 font-medium transition-colors duration-200 hover:border-indigo-300 py-2.5"
                                placeholder="Entrez le nom de la tâche"
                              />
                            </div>
                          </div>

                          {/* Description */}
                          <div>
                            <label className="block text-base font-medium text-gray-900 mb-2 flex items-center gap-2">
                              <DocumentTextIcon className="h-5 w-5 text-indigo-600" />
                              Description
                            </label>
                            <textarea
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              rows={3}
                              className="block w-full rounded-lg border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base text-gray-900 transition-colors duration-200 hover:border-indigo-300 py-2.5"
                              placeholder="Décrivez la tâche en détail"
                            />
                          </div>
                        </div>

                        {/* Section Date et Heure */}
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                            Date et heure
                          </h4>
                          <div>
                            <label className="block text-base font-medium text-gray-900 mb-2 flex items-center gap-2">
                              <CalendarIcon className="h-5 w-5 text-indigo-600" />
                              Date et heure d&apos;échéance
                            </label>
                            <div className="relative z-30">
                              <DatePicker
                                selected={dueDate}
                                onChange={(date: Date | null) => date && setDueDate(date)}
                                showTimeSelect
                                dateFormat="dd/MM/yyyy HH:mm"
                                locale={fr}
                                className="block w-full rounded-lg border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base text-gray-900 font-medium transition-colors duration-200 hover:border-indigo-300 py-2.5"
                                popperClassName="z-50"
                                popperPlacement="bottom-start"
                                wrapperClassName="z-50 w-full"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Section Récurrence */}
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm space-y-5">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                            Configuration de la récurrence
                          </h4>
                          <div>
                            <label className="block text-base font-medium text-gray-900 mb-2 flex items-center gap-2">
                              <ArrowPathIcon className="h-5 w-5 text-indigo-600" />
                              Type de récurrence
                            </label>
                            <select
                              value={recurrenceType}
                              onChange={(e) => setRecurrenceType(e.target.value)}
                              className="block w-full rounded-lg border-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base text-gray-900 font-medium transition-colors duration-200 hover:border-indigo-300 py-2.5"
                            >
                              <option value="none">Aucune récurrence</option>
                              <option value="daily">Quotidienne</option>
                              <option value="twoDays">Tous les 2 jours</option>
                              <option value="threeDays">Tous les 3 jours</option>
                              <option value="fourDays">Tous les 4 jours</option>
                              <option value="fiveDays">Tous les 5 jours</option>
                              <option value="sixDays">Tous les 6 jours</option>
                              <option value="weekly">Hebdomadaire</option>
                              <option value="twoWeeks">Toutes les 2 semaines</option>
                              <option value="threeWeeks">Toutes les 3 semaines</option>
                              <option value="monthly">Mensuelle</option>
                              <option value="yearly">Annuelle</option>
                              <option value="specificDays">Jours spécifiques</option>
                            </select>
                          </div>
                          
                          {/* Afficher les jours spécifiques si le type de récurrence est "specificDays" */}
                          {recurrenceType === 'specificDays' && (
                            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                              <label className="block text-sm font-medium text-gray-700 mb-3">
                                Sélectionnez les jours de récurrence
                              </label>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {weekdays.map(day => (
                                  <div key={day.value} className="flex items-center">
                                    <input
                                      id={`day-${day.value}`}
                                      type="checkbox"
                                      checked={selectedDays.includes(day.value)}
                                      onChange={() => toggleDaySelection(day.value)}
                                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor={`day-${day.value}`} className="ml-2 block text-sm text-gray-700">
                                      {day.label}
                                    </label>
                                  </div>
                                ))}
                              </div>
                              {selectedDays.length === 0 && (
                                <p className="text-xs text-amber-600 mt-2">
                                  Veuillez sélectionner au moins un jour
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </> 
                  ) : (
                    <>
                      {/* En-tête avec le statut et le type */}
                      <div className="flex flex-col space-y-4">
                        {task.type === 'resident' ? (
                          task.residentName && (
                            <div className="flex items-center">
                              <span className="text-base font-semibold text-indigo-700">
                                {task.residentName}
                              </span>
                            </div>
                          )
                        ) : (
                          <div className="flex items-center">
                            <span className="text-base font-semibold text-blue-700">
                              Générale
                            </span>
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          {task.type === 'resident' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              <UserGroupIcon className="mr-1 h-4 w-4" />
                              Résident
                            </span>
                          )}
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            task.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            <CheckIcon className={`mr-1 h-4 w-4 ${
                              task.status === 'completed' ? 'text-green-500' : 'text-amber-500'
                            }`} />
                            {task.status === 'completed' ? 'Complétée' : 'En attente'}
                          </span>
                        </div>
                      </div>

                      {/* Nom de la tâche */}
                      <div className="mt-4">
                        <h4 className="text-xl font-semibold text-gray-900">{task.name}</h4>
                      </div>

                      {/* Description */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
                      </div>

                      {/* Informations de la tâche */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <div className="flex items-center text-gray-600 mb-2">
                            <CalendarIcon className="h-5 w-5 text-indigo-600 mr-2" />
                            <span className="text-sm font-medium">Date d&apos;échéance</span>
                          </div>
                          <p className="text-lg font-semibold text-gray-900">
                            {format(task.dueDate, 'dd MMMM yyyy', { locale: fr })}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <div className="flex items-center text-gray-600 mb-2">
                            <ClockIcon className="h-5 w-5 text-indigo-600 mr-2" />
                            <span className="text-sm font-medium">Heure</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">
                            {format(task.dueDate, 'HH:mm', { locale: fr })}
                          </p>
                        </div>
                      </div>

                      {/* Récurrence */}
                      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center text-gray-600 mb-2">
                          <ArrowPathIcon className="h-5 w-5 text-indigo-600 mr-2" />
                          <span className="text-sm font-medium">Récurrence</span>
                        </div>
                        <p className="text-lg font-semibold text-gray-900">
                          {task.recurrenceType === 'none'
                            ? 'Aucune'
                            : task.recurrenceType === 'specificDays'
                            ? 'Jours spécifiques'
                            : {
                                'daily': 'Quotidienne',
                                'twoDays': 'Tous les 2 jours',
                                'threeDays': 'Tous les 3 jours',
                                'fourDays': 'Tous les 4 jours',
                                'fiveDays': 'Tous les 5 jours',
                                'sixDays': 'Tous les 6 jours',
                                'weekly': 'Hebdomadaire',
                                'twoWeeks': 'Toutes les 2 semaines',
                                'threeWeeks': 'Toutes les 3 semaines',
                                'monthly': 'Mensuelle',
                                'yearly': 'Annuelle'
                              }[task.recurrenceType]}
                        </p>
                        
                        {/* Afficher les jours spécifiques si présents */}
                        {task.recurrenceType === 'specificDays' && task.specificDays && task.specificDays.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {task.specificDays.map(day => (
                              <span key={day} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800">
                                {day === 'monday' && 'Lundi'}
                                {day === 'tuesday' && 'Mardi'}
                                {day === 'wednesday' && 'Mercredi'}
                                {day === 'thursday' && 'Jeudi'}
                                {day === 'friday' && 'Vendredi'}
                                {day === 'saturday' && 'Samedi'}
                                {day === 'sunday' && 'Dimanche'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Information de complétion */}
                      {task.completedBy && (
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <div className="flex items-center text-green-700 mb-2">
                            <CheckIcon className="h-5 w-5 text-green-600 mr-2" />
                            <span className="text-sm font-medium">Complétée par</span>
                          </div>
                          <div className="flex flex-col space-y-1">
                            <span className="text-lg font-semibold text-green-800">{task.completedBy.name}</span>
                            <span className="text-sm font-medium text-green-600">
                              {format(task.completedBy.timestamp.toDate(), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Informations de création et modification --> AJOUT ICI */}
                      <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
                        {task.createdBy && (
                          <div className="bg-gray-50 rounded p-2">
                            <p className="font-medium">Créé par:</p>
                            <p>{task.createdBy.name || 'Inconnu'}</p>
                            <p>
                              {task.createdBy.timestamp?.toDate 
                                ? format(task.createdBy.timestamp.toDate(), 'dd/MM/yy HH:mm', { locale: fr })
                                : 'Date inconnue'
                              }
                            </p>
                          </div>
                        )}
                        {task.lastModifiedBy && (
                          <div className="bg-gray-50 rounded p-2">
                            <p className="font-medium">Modifié par:</p>
                            <p>{task.lastModifiedBy.name || 'Inconnu'}</p>
                            <p>
                              {task.lastModifiedBy.timestamp?.toDate
                                ? format(task.lastModifiedBy.timestamp.toDate(), 'dd/MM/yy HH:mm', { locale: fr })
                                : 'Date inconnue'
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Actions - Fixed at bottom */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 flex-shrink-0 border-t border-gray-200">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={recurrenceType === 'specificDays' && selectedDays.length === 0}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed"
                    >
                      <CheckIcon className="h-4 w-4 mr-1.5" />
                      Enregistrer
                    </button>
                  </>
                ) : (
                  <div className="flex gap-3">
                    {isEmployer && (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirmation(true)}
                        className="group inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150"
                      >
                        <TrashIcon className="h-4 w-4 mr-1.5 text-red-500" />
                        Supprimer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditMode(true)}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-150"
                    >
                      <PencilSquareIcon className="h-4 w-4 mr-1.5" />
                      Modifier
                    </button>
                  </div>
                )}
              </div>
            </Dialog.Panel>
          </div>
        </div>

        {/* Modal de confirmation de suppression */}
        {showDeleteConfirmation && (
          <div className="fixed inset-0 z-60">
            <div className="flex min-h-full items-center justify-center p-4">
              <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <TrashIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                      Supprimer la tâche
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Êtes-vous sûr de vouloir supprimer cette tâche ? Cette action est irréversible.
                      </p>
                      
                      {/* Options de suppression pour les tâches récurrentes */}
                      {task.recurrenceType !== 'none' && (
                        <div className="mt-4 border-t border-gray-200 pt-4">
                          <p className="text-sm font-medium text-gray-700 mb-2">
                            Cette tâche est récurrente. Que souhaitez-vous supprimer ?
                          </p>
                          <div className="space-y-2">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                name="deleteOption"
                                value="single"
                                checked={deleteOption === 'single'}
                                onChange={() => setDeleteOption('single')}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                              />
                              <span className="ml-2 block text-sm text-gray-700">
                                Uniquement cette occurrence
                              </span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                name="deleteOption"
                                value="all"
                                checked={deleteOption === 'all'}
                                onChange={() => setDeleteOption('all')}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                              />
                              <span className="ml-2 block text-sm text-gray-700">
                                Cette occurrence et toutes les occurrences futures
                              </span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 sm:w-auto transition-all duration-150"
                    onClick={handleDelete}
                  >
                    <TrashIcon className="h-4 w-4 mr-1.5" />
                    Supprimer
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-all duration-150"
                    onClick={() => setShowDeleteConfirmation(false)}
                  >
                    Annuler
                  </button>
                </div>
              </Dialog.Panel>
            </div>
          </div>
        )}
      </Dialog>
    </Transition.Root>
  );
} 