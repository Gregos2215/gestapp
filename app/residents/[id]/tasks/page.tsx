'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, onSnapshot, Timestamp, updateDoc, serverTimestamp, addDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  XMarkIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Task {
  id: string;
  type: 'resident' | 'general';
  name: string;
  description: string;
  dueDate: Date;
  status: 'pending' | 'completed';
  residentId?: string;
  residentName?: string;
  recurrenceType: string;
  customRecurrence?: string;
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
}

interface Resident {
  id: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
}

export default function ResidentTasksPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth() || {};
  const [resident, setResident] = useState<Resident | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(true);
  const [isConfirmCompleteModalOpen, setIsConfirmCompleteModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<string | null>(null);

  useEffect(() => {
    const fetchResident = async () => {
      if (!params.id) return;

      try {
        const residentDoc = await getDoc(doc(db, 'residents', params.id as string));
        if (residentDoc.exists()) {
          setResident({
            id: residentDoc.id,
            ...residentDoc.data()
          } as Resident);
        } else {
          toast.error('Résident non trouvé');
          router.push('/residents');
        }
      } catch (error) {
        console.error('Error fetching resident:', error);
        toast.error('Erreur lors du chargement du résident');
      }
    };

    fetchResident();
  }, [params.id, router]);

  useEffect(() => {
    if (!params.id) return;

    const q = query(
      collection(db, 'tasks'),
      where('residentId', '==', params.id),
      where('deleted', '!=', true)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const tasksData: Task[] = [];
      querySnapshot.forEach((doc) => {
        const { status: _status, completedBy: _completedBy, id: _docId, ...rest } = doc.data();
        const taskData = {
          ...rest,
          id: doc.id,
          dueDate: rest.dueDate?.toDate() || new Date(),
        };
        
        tasksData.push(taskData as Task);
      });
      setTasks(tasksData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching tasks:', error);
      toast.error('Erreur lors du chargement des tâches');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [params.id]);

  // Fonction pour vérifier si une date est ignorée
  const isDateSkipped = (task: Task, dateOrTimestamp: Date | number): boolean => {
    if (!task.skippedDates || !Array.isArray(task.skippedDates) || task.skippedDates.length === 0) {
      return false;
    }
    
    // Normaliser la date pour la comparaison (minuit)
    let normalizedDate: Date;
    if (dateOrTimestamp instanceof Date) {
      normalizedDate = new Date(dateOrTimestamp);
    } else {
      normalizedDate = new Date(dateOrTimestamp);
    }
    normalizedDate.setHours(0, 0, 0, 0);
    const dateTimestamp = normalizedDate.getTime();
    
    // Vérifier si la date est dans la liste des dates ignorées
    return task.skippedDates.some(skipTs => {
      if (typeof skipTs === 'number') {
        const skipDate = new Date(skipTs);
        skipDate.setHours(0, 0, 0, 0);
        return skipDate.getTime() === dateTimestamp;
      }
      return false;
    });
  };

  // Fonction pour normaliser une date
  const normalizeDate = (dateInput: Date | Timestamp | { toDate: () => Date }): Date => {
    if (dateInput instanceof Date) {
      return dateInput;
    } else if (dateInput && typeof (dateInput as { toDate: () => Date }).toDate === 'function') {
      return (dateInput as { toDate: () => Date }).toDate();
    }
    return new Date(dateInput as any);
  };

  // Fonction pour générer les occurrences futures des tâches récurrentes
  const generateFutureOccurrences = (tasks: Task[], targetDate: Date) => {
    // Normaliser la date cible
    const normalizedTargetDate = new Date(targetDate);
    normalizedTargetDate.setHours(0, 0, 0, 0);
    const targetTimestamp = normalizedTargetDate.getTime();
    
    // Résultats et structure pour éviter les doublons
    const result: Task[] = [];
    const existingTasksAtTargetDate = new Set();
    
    // Identifier les tâches qui existent déjà à la date cible
    tasks.forEach(task => {
      const taskDueDate = normalizeDate(task.dueDate);
      const taskDateOnly = new Date(taskDueDate);
      taskDateOnly.setHours(0, 0, 0, 0);
      
      if (taskDateOnly.getTime() === targetTimestamp) {
        existingTasksAtTargetDate.add(task.id.replace(/^virtual-.*-/, ''));
      }
    });
    
    // Filtrer pour ne traiter que les tâches récurrentes non complétées et non virtuelles
    const recurrentTasks = tasks.filter(
      task => 
        task.recurrenceType !== 'none' && 
        task.status !== 'completed' &&
        !task.isVirtualOccurrence &&
        !task.deleted
    );

    for (const task of recurrentTasks) {
      // Vérifier si cette tâche existe déjà à la date cible
      if (existingTasksAtTargetDate.has(task.id)) {
        continue;
      }
      
      // Vérifier si cette date est dans la liste des dates à ignorer
      if (isDateSkipped(task, normalizedTargetDate)) {
        continue;
      }
      
      // Normaliser la date de la tâche
      const baseDate = normalizeDate(task.dueDate);
      
      // Préserver l'heure exacte
      const originalHours = baseDate.getHours();
      const originalMinutes = baseDate.getMinutes();
      
      // Convertir à minuit pour la comparaison de dates
      const baseDateOnly = new Date(baseDate);
      baseDateOnly.setHours(0, 0, 0, 0);
      
      // Si la date de base est déjà future par rapport à la date cible, ne rien faire
      if (baseDateOnly.getTime() > targetTimestamp) {
        continue;
      }
      
      // Si la date de base est exactement la date cible, ne rien faire
      if (baseDateOnly.getTime() === targetTimestamp) {
        continue;
      }
      
      // Calculer si cette tâche récurrente doit apparaître à la date cible
      const currentDate = new Date(baseDateOnly);
      let nextOccurrence = false;
      
      while (currentDate.getTime() <= targetTimestamp) {
        // Calculer la prochaine occurrence
        switch (task.recurrenceType) {
          case 'daily':
            currentDate.setDate(currentDate.getDate() + 1);
            break;
          case 'twoDays':
            currentDate.setDate(currentDate.getDate() + 2);
            break;
          case 'threeDays':
            currentDate.setDate(currentDate.getDate() + 3);
            break;
          case 'fourDays':
            currentDate.setDate(currentDate.getDate() + 4);
            break;
          case 'fiveDays':
            currentDate.setDate(currentDate.getDate() + 5);
            break;
          case 'sixDays':
            currentDate.setDate(currentDate.getDate() + 6);
            break;
          case 'weekly':
            currentDate.setDate(currentDate.getDate() + 7);
            break;
          case 'twoWeeks':
            currentDate.setDate(currentDate.getDate() + 14);
            break;
          case 'threeWeeks':
            currentDate.setDate(currentDate.getDate() + 21);
            break;
          case 'monthly':
            currentDate.setMonth(currentDate.getMonth() + 1);
            break;
          case 'yearly':
            currentDate.setFullYear(currentDate.getFullYear() + 1);
            break;
        }
        
        // Si on atteint exactement la date cible, on devrait ajouter cette occurrence
        if (currentDate.getTime() === targetTimestamp) {
          // Mais il faut d'abord vérifier si cette date précise n'est pas ignorée
          if (!isDateSkipped(task, normalizedTargetDate)) {
            nextOccurrence = true;
          }
          break;
        }
      }
      
      // Ajouter l'occurrence virtuelle si nécessaire
      if (nextOccurrence) {
        // Créer la nouvelle date avec l'heure originale
        const newDate = new Date(normalizedTargetDate);
        newDate.setHours(originalHours, originalMinutes, 0, 0);
        
        const virtualOccurrence: Task = {
          ...task,
          id: `virtual-${task.id}-${targetTimestamp}`,
          dueDate: newDate,
          status: 'pending',
          isVirtualOccurrence: true
        };
        
        result.push(virtualOccurrence);
      }
    }
    
    return result;
  };

  const filteredTasks = tasks.filter(task => {
    // Ne pas afficher les tâches marquées comme supprimées
    if (task.deleted === true) return false;
    
    // Normaliser la date sélectionnée pour comparaison (minuit)
    const selectedDateTime = new Date(selectedDate || new Date());
    selectedDateTime.setHours(0, 0, 0, 0);
    
    // Normaliser la date de la tâche pour comparaison (minuit)
    const taskDate = new Date(task.dueDate);
    taskDate.setHours(0, 0, 0, 0);
    
    // Vérifier si cette date est ignorée pour cette tâche
    if (isDateSkipped(task, selectedDateTime)) {
      return false;
    }
    
    // Comparer les dates au niveau du jour seulement
    return taskDate.getTime() === selectedDateTime.getTime();
  });

  // Ajouter les occurrences virtuelles pour les dates futures sélectionnées
  const tasksWithVirtualOccurrences = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDay = new Date(selectedDate || new Date());
    selectedDay.setHours(0, 0, 0, 0);
    
    // Si la date sélectionnée est dans le futur ou aujourd'hui, générer des occurrences virtuelles
    if (selectedDay.getTime() >= today.getTime()) {
      const virtualOccurrences = generateFutureOccurrences(tasks, selectedDate || new Date());
      return [...filteredTasks, ...virtualOccurrences];
    }
    
    return filteredTasks;
  }, [selectedDate, tasks, filteredTasks]);

  const handleCompleteTask = async (taskId: string, isCompleted: boolean) => {
    if (!user) {
      toast.error('Vous devez être connecté pour effectuer cette action');
      return;
    }

    // Si la tâche est déjà complétée, ne rien faire
    if (isCompleted) {
      return;
    }

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      const taskData = taskDoc.data() as Task & { id: string };
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();
      
      // Marquer comme complétée
      await updateDoc(taskRef, {
        status: 'completed',
        completedBy: {
          id: user.uid,
          name: `${userData?.firstName || ''} ${userData?.lastName || ''}`,
          timestamp: serverTimestamp()
        }
      });

      // Supprimer les alertes associées à cette tâche
      const alertsRef = collection(db, 'alerts');
      const alertsQuery = query(
        alertsRef,
        where('type', '==', 'task_overdue'),
        where('relatedId', '==', taskId)
      );
      
      const alertsSnapshot = await getDocs(alertsQuery);
      const deletePromises = alertsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // Créer la prochaine occurrence si la tâche est récurrente
      if (taskData && taskData.recurrenceType !== 'none') {
        const currentDate = taskData.dueDate instanceof Date 
          ? taskData.dueDate 
          : (taskData.dueDate as any).toDate();
        const nextDate = new Date(currentDate);

        // Calculer la prochaine date selon le type de récurrence
        switch (taskData.recurrenceType) {
          case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
          case 'twoDays':
            nextDate.setDate(nextDate.getDate() + 2);
            break;
          case 'threeDays':
            nextDate.setDate(nextDate.getDate() + 3);
            break;
          case 'fourDays':
            nextDate.setDate(nextDate.getDate() + 4);
            break;
          case 'fiveDays':
            nextDate.setDate(nextDate.getDate() + 5);
            break;
          case 'sixDays':
            nextDate.setDate(nextDate.getDate() + 6);
            break;
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'twoWeeks':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
          case 'threeWeeks':
            nextDate.setDate(nextDate.getDate() + 21);
            break;
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
          case 'yearly':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
        }

        // Créer la nouvelle tâche récurrente
        const { id, completedBy, status, ...taskDataWithoutStatus } = taskData;
        const newTaskData = {
          ...taskDataWithoutStatus,
          dueDate: Timestamp.fromDate(nextDate),
          status: 'pending' as const,
          completedBy: null,
          createdAt: serverTimestamp(),
          deleted: false
        };
        
        await addDoc(collection(db, 'tasks'), newTaskData);
      }

      // Fermer la modale de confirmation
      setIsConfirmCompleteModalOpen(false);
      setTaskToComplete(null);
      
      toast.success('Tâche marquée comme complétée');
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error('Erreur lors de la mise à jour du statut de la tâche');
      
      // Fermer la modale en cas d'erreur aussi
      setIsConfirmCompleteModalOpen(false);
      setTaskToComplete(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!resident) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Résident non trouvé</h2>
          <p className="mt-2 text-gray-600">Le résident que vous recherchez n&apos;existe pas.</p>
          <button
            onClick={() => router.push('/dashboard?tab=residents')}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Retour à la gestion des résidents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* En-tête */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard?tab=residents')}
            className="mb-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Retour à la gestion des résidents
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Tâches de {resident.firstName} {resident.lastName}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Gérez les tâches associées à ce résident
              </p>
            </div>
            <div className="relative">
              <DatePicker
                selected={selectedDate}
                onChange={(date: Date | null) => setSelectedDate(date)}
                dateFormat="dd/MM/yyyy"
                locale="fr"
                placeholderText="Filtrer par date"
                className="w-full sm:w-auto px-4 py-2 pr-10 text-sm border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-600 text-gray-700"
                customInput={
                  <input
                    className="w-full sm:w-auto"
                    placeholder="Sélectionnez une date"
                  />
                }
              />
              <CalendarIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="absolute right-10 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="Revenir à aujourd'hui"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Liste des tâches */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            {tasksWithVirtualOccurrences.length > 0 ? (
              <div className="space-y-4">
                {tasksWithVirtualOccurrences.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow duration-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-grow">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">
                            {task.name}
                          </h3>
                          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                            task.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {task.status === 'completed' ? 'Complétée' : 'À faire'}
                          </span>
                          {task.isVirtualOccurrence && (
                            <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                              Occurrence future
                            </span>
                          )}
                        </div>
                        <p className="text-gray-500 mb-3">{task.description}</p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            {format(task.dueDate, 'HH:mm', { locale: fr })}
                          </div>
                          {task.recurrenceType !== 'none' && (
                            <span>
                              {task.recurrenceType === 'custom' ? task.customRecurrence : (
                                {
                                  'daily': 'Quotidien',
                                  'twoDays': 'Tous les 2 jours',
                                  'threeDays': 'Tous les 3 jours',
                                  'fourDays': 'Tous les 4 jours',
                                  'fiveDays': 'Tous les 5 jours',
                                  'sixDays': 'Tous les 6 jours',
                                  'weekly': 'Hebdomadaire',
                                  'twoWeeks': 'Tous les 2 semaines',
                                  'threeWeeks': 'Tous les 3 semaines',
                                  'monthly': 'Mensuel',
                                  'yearly': 'Annuel'
                                }[task.recurrenceType]
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (task.isVirtualOccurrence) {
                            toast('Cette tâche est une occurrence future d\'une tâche récurrente et n\'a pas encore été créée.', {
                              icon: '🔄',
                              style: {
                                borderRadius: '10px',
                                background: '#333',
                                color: '#fff',
                              },
                            });
                            return;
                          }
                          if (task.status !== 'completed') {
                            // Ouvrir la modale de confirmation au lieu de compléter directement
                            setTaskToComplete(task.id);
                            setIsConfirmCompleteModalOpen(true);
                          }
                        }}
                        className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-lg shadow-sm ${
                          task.status === 'completed'
                            ? 'border-green-200 text-green-700 bg-green-50 cursor-default'
                            : task.isVirtualOccurrence
                            ? 'border-gray-200 text-gray-500 bg-gray-50'
                            : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200'
                        }`}
                        disabled={task.status === 'completed' || task.isVirtualOccurrence}
                      >
                        <CheckIcon className={`h-4 w-4 mr-1.5 ${
                          task.status === 'completed' ? 'text-green-500' : 'text-gray-400'
                        }`} />
                        {task.status === 'completed' ? (
                          <div className="flex flex-col items-start">
                            <span>Complétée</span>
                            <span className="text-xs text-green-600">par {task.completedBy?.name}</span>
                          </div>
                        ) : task.isVirtualOccurrence ? (
                          'Occurrence future'
                        ) : (
                          'Marquer comme complétée'
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 text-gray-400">
                  <ClipboardDocumentListIcon className="h-12 w-12" />
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune tâche</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {isToday(selectedDate || new Date())
                    ? 'Aucune tâche prévue pour aujourd\'hui'
                    : `Aucune tâche prévue pour le ${format(selectedDate || new Date(), 'dd/MM/yyyy', { locale: fr })}`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Modale de confirmation pour compléter une tâche */}
      {isConfirmCompleteModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={() => {
              setIsConfirmCompleteModalOpen(false);
              setTaskToComplete(null);
            }}>
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            {/* Centrer la modale */}
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                    <CheckIcon className="h-6 w-6 text-green-600" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Confirmation
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Êtes-vous sûr d'avoir complété cette tâche correctement ?
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => {
                    if (taskToComplete) {
                      handleCompleteTask(taskToComplete, false);
                    }
                  }}
                >
                  Oui, c'est complété
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => {
                    setIsConfirmCompleteModalOpen(false);
                    setTaskToComplete(null);
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 