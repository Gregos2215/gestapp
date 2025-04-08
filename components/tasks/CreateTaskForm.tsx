'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { 
  UserGroupIcon, 
  DocumentTextIcon,
  CalendarIcon,
  ClockIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import DatePicker from 'react-datepicker';

type TaskType = 'resident' | 'general';
type RecurrenceType = 'daily' | 'twoDays' | 'weekly' | 'monthly' | 'threeDays' | 'fourDays' | 'fiveDays' | 'sixDays' | 'twoWeeks' | 'threeWeeks' | 'yearly' | 'specificDays' | 'none';
type WeekDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

interface Resident {
  id: string;
  firstName: string;
  lastName: string;
}

interface CreateTaskFormProps {
  centerCode: string;
  onClose: () => void;
  onTaskCreated: (taskId: string) => void;
  currentUserInfo: { id: string; firstName?: string; lastName?: string };
}

export default function CreateTaskForm({ centerCode, onClose, onTaskCreated, currentUserInfo }: CreateTaskFormProps) {
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedResident, setSelectedResident] = useState<string>('');
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [dueTime, setDueTime] = useState<Date>(new Date());
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('none');
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>([]);
  const [loading, setLoading] = useState(false);

  // Weekdays in French with their corresponding values
  const weekdays = [
    { label: 'Lundi', value: 'monday' as WeekDay },
    { label: 'Mardi', value: 'tuesday' as WeekDay },
    { label: 'Mercredi', value: 'wednesday' as WeekDay },
    { label: 'Jeudi', value: 'thursday' as WeekDay },
    { label: 'Vendredi', value: 'friday' as WeekDay },
    { label: 'Samedi', value: 'saturday' as WeekDay },
    { label: 'Dimanche', value: 'sunday' as WeekDay }
  ];

  // Handle weekday selection
  const toggleDaySelection = (day: WeekDay) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day) 
        : [...prev, day]
    );
  };

  // Charger la liste des résidents
  useEffect(() => {
    async function loadResidents() {
      if (!centerCode) return;

      try {
        const q = query(
          collection(db, 'residents'),
          where('centerCode', '==', centerCode)
        );
        const querySnapshot = await getDocs(q);
        const residentsData: Resident[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          residentsData.push({
            id: doc.id,
            firstName: data.firstName,
            lastName: data.lastName
          });
        });
        setResidents(residentsData);
      } catch (error) {
        console.error('Error loading residents:', error);
        toast.error('Erreur lors du chargement des résidents');
      }
    }

    if (taskType === 'resident') {
      loadResidents();
    }
  }, [centerCode, taskType]);

  // Reset selectedDays when recurrence type changes
  useEffect(() => {
    if (recurrenceType !== 'specificDays') {
      setSelectedDays([]);
    }
  }, [recurrenceType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUserInfo || !currentUserInfo.id) {
      toast.error('Informations utilisateur non disponibles');
      return;
    }
    
    if (!taskName.trim() || !description.trim() || !dueDate || !dueTime) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (taskType === 'resident' && !selectedResident) {
      toast.error('Veuillez sélectionner un résident');
      return;
    }

    if (recurrenceType === 'specificDays' && selectedDays.length === 0) {
      toast.error('Veuillez sélectionner au moins un jour de la semaine');
      return;
    }

    try {
      setLoading(true);
      
      const selectedResidentData = taskType === 'resident' 
        ? residents.find(r => r.id === selectedResident)
        : null;

      const creatorInfo = {
        id: currentUserInfo.id,
        name: `${currentUserInfo.firstName || ''} ${currentUserInfo.lastName || ''}`,
        timestamp: serverTimestamp()
      };

      const taskData = {
        type: taskType,
        name: taskName,
        description,
        dueDate: new Date(`${dueDate.toISOString().split('T')[0]}T${dueTime.toISOString().split('T')[1]}`),
        recurrenceType,
        status: 'pending',
        centerCode,
        createdAt: serverTimestamp(),
        createdBy: creatorInfo,
        lastModifiedBy: creatorInfo,
        deleted: false,
        skippedDates: [],
        ...(recurrenceType === 'specificDays' && { 
          specificDays: selectedDays 
        }),
        ...(taskType === 'resident' && {
          residentId: selectedResident,
          residentName: selectedResidentData ? `${selectedResidentData.firstName} ${selectedResidentData.lastName}` : null
        }),
      };

      const docRef = await addDoc(collection(db, 'tasks'), taskData);
      
      toast.success('Tâche créée avec succès');
      onTaskCreated(docRef.id);
      onClose();
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Erreur lors de la création de la tâche');
    } finally {
      setLoading(false);
    }
  };

  if (!taskType) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">
          Sélectionnez le type de tâche
        </h2>
        <button
          onClick={() => setTaskType('resident')}
          className="w-full p-4 sm:p-6 text-left border border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-200 group"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-purple-100 group-hover:bg-purple-200 transition-colors duration-200">
              <UserGroupIcon className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-medium text-gray-900">Tâche pour résident</h3>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Créer une tâche associée à un résident spécifique
              </p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setTaskType('general')}
          className="w-full p-4 sm:p-6 text-left border border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-200 group"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-blue-100 group-hover:bg-blue-200 transition-colors duration-200">
              <DocumentTextIcon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-medium text-gray-900">Tâche générale</h3>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Créer une tâche générale pour le centre
              </p>
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate pr-2">
          {taskType === 'resident' ? 'Nouvelle tâche pour résident' : 'Nouvelle tâche générale'}
        </h2>
        <button
          type="button"
          onClick={() => setTaskType(null)}
          className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 whitespace-nowrap"
        >
          <ArrowPathIcon className="h-3 w-3 sm:h-4 sm:w-4" />
          Changer le type
        </button>
      </div>

      {taskType === 'resident' && (
        <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
          <div>
            <label htmlFor="resident" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <UserGroupIcon className="h-5 w-5 text-gray-500" />
              Sélectionner un résident
            </label>
            <select
              id="resident"
              value={selectedResident}
              onChange={(e) => setSelectedResident(e.target.value)}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900 py-2.5"
              required
            >
              <option value="">Sélectionnez un résident</option>
              {residents.map((resident) => (
                <option key={resident.id} value={resident.id}>
                  {resident.firstName} {resident.lastName}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 space-y-4 sm:space-y-6">
        <div>
          <label htmlFor="taskName" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <PencilSquareIcon className="h-5 w-5 text-gray-500" />
            Nom de la tâche
          </label>
          <input
            type="text"
            id="taskName"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900 placeholder-gray-400 py-2.5"
            placeholder="Entrez le nom de la tâche"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <DocumentTextIcon className="h-5 w-5 text-gray-500" />
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900 placeholder-gray-400 py-2.5"
            placeholder="Décrivez la tâche en détail"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-gray-500" />
              Date d'échéance
            </label>
            <DatePicker
              selected={dueDate}
              onChange={(date: Date | null) => date && setDueDate(date)}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900 py-2.5"
            />
          </div>
          <div>
            <label htmlFor="dueTime" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-gray-500" />
              Heure d'échéance
            </label>
            <DatePicker
              selected={dueTime}
              onChange={(date: Date | null) => date && setDueTime(date)}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              dateFormat="HH:mm"
              timeFormat="HH:mm"
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900 py-2.5"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="recurrence" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <ArrowPathIcon className="h-5 w-5 text-gray-500" />
              Récurrence
            </label>
            <select
              id="recurrence"
              value={recurrenceType}
              onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900 py-2.5"
            >
              <option value="none">Pas de récurrence</option>
              <option value="daily">Quotidien</option>
              <option value="twoDays">Tous les deux jours</option>
              <option value="weekly">Hebdomadaire</option>
              <option value="monthly">Mensuel</option>
              <option value="threeDays">Tous les trois jours</option>
              <option value="fourDays">Tous les quatre jours</option>
              <option value="fiveDays">Tous les cinq jours</option>
              <option value="sixDays">Tous les six jours</option>
              <option value="twoWeeks">Toutes les deux semaines</option>
              <option value="threeWeeks">Toutes les trois semaines</option>
              <option value="yearly">Annuel</option>
              <option value="specificDays">Jours spécifiques</option>
            </select>
          </div>
          
          {recurrenceType === 'specificDays' && (
            <div className="sm:col-span-2 mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Sélectionnez les jours
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
              {selectedDays.length === 0 && recurrenceType === 'specificDays' && (
                <p className="text-xs text-amber-600 mt-2">Veuillez sélectionner au moins un jour</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3 pb-1 sm:pt-0 sticky bottom-0 bg-white">
        <button
          type="button"
          onClick={onClose}
          className="w-full sm:w-auto px-4 py-3 sm:py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading || (recurrenceType === 'specificDays' && selectedDays.length === 0)}
          className="w-full sm:w-auto inline-flex justify-center items-center px-4 py-3 sm:py-2.5 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {loading ? (
            <>
              <ArrowPathIcon className="animate-spin h-4 w-4 mr-2" />
              Création...
            </>
          ) : (
            <>
              <CheckIcon className="h-4 w-4 mr-2" />
              Créer la tâche
            </>
          )}
        </button>
      </div>
    </form>
  );
} 