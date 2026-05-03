'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp, Timestamp, getDocs, orderBy, addDoc, writeBatch, deleteDoc, deleteField, limit, setDoc } from 'firebase/firestore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  HomeIcon, 
  ClipboardDocumentListIcon, 
  UsersIcon, 
  DocumentTextIcon,
  BellIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  Bars3Icon,
  XMarkIcon as MenuCloseIcon,
  CheckIcon,
  CalendarIcon,
  LanguageIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  BookmarkIcon as PinIcon,
  MinusCircleIcon,
  TrashIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import DatePicker, { registerLocale } from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import TaskDetailModal from '@/components/tasks/TaskDetailModal';
import { User as FirebaseUser } from 'firebase/auth';
import CreateResidentModal from '@/components/residents/CreateResidentModal';
import ResidentDetailModal from '@/components/residents/ResidentDetailModal';
import CreateReportModal from '@/components/reports/CreateReportModal';
import ReportDetailModal from '@/components/reports/ReportDetailModal';
import MessageDetailModal from '@/components/messages/MessageDetailModal';

// Enregistrer la locale française pour le DatePicker
registerLocale('fr', fr);

type Tab = 'accueil' | 'taches' | 'residents' | 'rapports' | 'messages' | 'alertes' | 'approbations';

interface OnlineUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isOnline: boolean;
  lastOnlineAt: Date | null;
  centerCode: string;
  role: 'employee' | 'admin';
}

interface PendingAccountRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'employee' | 'admin';
  centerCode: string;
  approvalRequestedAt?: any;
}

interface CustomUser extends Omit<FirebaseUser, 'delete' | 'reload'> {
  isEmployer: boolean;
  role?: 'employer' | 'employee' | 'admin';
  accountStatus?: 'active' | 'pending_approval';
  centerCode: string;
  activeCenters?: string[];
  associatedCenters?: string[];
  pendingCenterCodes?: string[];
  pendingCenterRequests?: Array<{
    centerCode?: string;
    role?: 'employee' | 'admin';
    requestedAt?: unknown;
  }>;
  centerRoles?: Record<string, 'employer' | 'employee' | 'admin'>;
  firstName: string;
  lastName: string;
}

interface Task {
  id: string;
  type: 'resident' | 'general';
  name: string;
  description: string;
  dueDate: Date | { toDate(): Date };
  recurrenceType: 'daily' | 'twoDays' | 'weekly' | 'monthly' | 'threeDays' | 'fourDays' | 'fiveDays' | 'sixDays' | 'twoWeeks' | 'threeWeeks' | 'yearly' | 'specificDays' | 'none';
  status: 'pending' | 'completed' | 'skipped';
  centerCode: string;
  residentId?: string;
  residentName?: string;
  deleted?: boolean;
  isVirtualOccurrence?: boolean;
  skippedDates?: number[];
  createdBy?: {
    id: string;
    name: string;
    timestamp: Timestamp;
  };
  completedBy?: {
    id: string;
    name: string;
    timestamp: Timestamp;
  };
  specificDays?: string[]; // Liste des jours spécifiques où la tâche doit être répétée
}

type TaskFilter = 'all' | 'resident' | 'general' | 'upcoming' | 'past' | 'completed' | 'yesterday';

interface User extends FirebaseUser {
  firstName?: string;
  lastName?: string;
}

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

interface Report {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: {
    toDate: () => Date;
  };
}

interface Alert {
  id: string;
  type: 'task_created' | 'task_uncompleted' | 'report_created' | 'task_overdue' | 'message_created';
  title: string;
  message: string;
  createdAt: {
    toDate: () => Date;
  };
  readBy: string[]; // Array of user IDs who have read the alert
  relatedId?: string;
  centerCode: string;
  excludedUsers?: string[]; // Optional list of user IDs to exclude from notifications
}

interface Message {
  id: string;
  author: {
    id: string;
    name: string;
    isEmployer: boolean;
  };
  title: string; // Ajout du champ titre
  content: string;
  createdAt: {
    toDate: () => Date;
  };
  centerCode: string;
  isPinned?: boolean;
}

// Ajouter cette fonction juste après la définition des interfaces, avant les fonctions de rendu

// Fonction utilitaire pour gérer les dates Firebase de manière sécurisée
function safeFirebaseDate(firebaseDate: any): Date | null {
  if (!firebaseDate) return null;
  if (firebaseDate instanceof Date) return firebaseDate;
  if (firebaseDate && typeof firebaseDate.toDate === 'function') {
    return firebaseDate.toDate();
  }
  if (typeof firebaseDate === 'string' || typeof firebaseDate === 'number') {
    return new Date(firebaseDate);
  }
  return null;
}

function isExpectedFirestoreLogoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const firebaseError = error as { code?: string; message?: string };
  return firebaseError.code === 'permission-denied' ||
    firebaseError.message?.includes('Missing or insufficient permissions') === true;
}

function handleFirestoreListenerError(context: string, error: unknown, toastMessage?: string) {
  if (isExpectedFirestoreLogoutError(error)) {
    console.info(context + ': listener stopped during logout or permission change.');
    return;
  }

  console.error(context, error);
  if (toastMessage) {
    toast.error(toastMessage);
  }
}

function handleExpectedFirestoreActionError(context: string, error: unknown, toastMessage?: string) {
  if (isExpectedFirestoreLogoutError(error)) {
    console.info(context + ': action stopped during logout or permission change.');
    return;
  }

  console.error(context, error);
  if (toastMessage) {
    toast.error(toastMessage);
  }
}

const getEmployeeNextTasks = (
  tasks: Task[],
  isDateSkippedFn: (task: Task, dateOrTimestamp: Date | number) => boolean
) => {
  // Fonction pour obtenir les prochaines tâches à afficher, en priorité:
  // 1. Tâches non complétées de la veille
  // 2. Tâches en retard du jour
  // 3. Tâches du jour à faire
  const getNextTasks = () => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Date d'hier (à minuit)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // 1. Tâches non complétées de la veille
    const yesterdayTasks = tasks.filter(task => {
      if (task.deleted === true) return false;
      if (isDateSkippedFn(task, yesterday)) return false;
      
      // Convertir dueDate selon son type
      let taskDueDate: Date;
      if (task.dueDate instanceof Date) {
        taskDueDate = task.dueDate;
      } else if (task.dueDate && typeof task.dueDate.toDate === 'function') {
        taskDueDate = task.dueDate.toDate();
      } else {
        taskDueDate = new Date(task.dueDate as unknown as string | number);
      }
      
      // Normaliser la date de la tâche à minuit pour comparer avec hier
      const taskDateOnly = new Date(taskDueDate);
      taskDateOnly.setHours(0, 0, 0, 0);
      
      return taskDateOnly.getTime() === yesterday.getTime() && task.status !== 'completed';
    }).sort((a, b) => {
      // Trier par date d'échéance, les plus anciennes d'abord
      const dateA = safeFirebaseDate(a.dueDate) || new Date(0);
      const dateB = safeFirebaseDate(b.dueDate) || new Date(0);
      return dateA.getTime() - dateB.getTime();
    });
    
    // 2. Tâches en retard du jour (passées et non complétées)
    const overdueTasks = tasks.filter(task => {
      if (task.deleted === true) return false;
      if (isDateSkippedFn(task, today)) return false;
      
      // Convertir dueDate selon son type
      let taskDueDate: Date;
      if (task.dueDate instanceof Date) {
        taskDueDate = task.dueDate;
      } else if (task.dueDate && typeof task.dueDate.toDate === 'function') {
        taskDueDate = task.dueDate.toDate();
      } else {
        taskDueDate = new Date(task.dueDate as unknown as string | number);
      }
      
      // Normaliser la date de la tâche à minuit pour comparer avec aujourd'hui
      const taskDateOnly = new Date(taskDueDate);
      taskDateOnly.setHours(0, 0, 0, 0);
      
      // Tâche d'aujourd'hui qui est en retard (heure passée)
      return taskDateOnly.getTime() === today.getTime() && taskDueDate < now && task.status !== 'completed';
    }).sort((a, b) => {
      // Trier par date d'échéance, les plus anciennes d'abord
      const dateA = safeFirebaseDate(a.dueDate) || new Date(0);
      const dateB = safeFirebaseDate(b.dueDate) || new Date(0);
      return dateA.getTime() - dateB.getTime();
    });
    
    // 3. Tâches du jour à faire (pas encore passées)
    const todayTasks = tasks.filter(task => {
      if (task.deleted === true) return false;
      if (isDateSkippedFn(task, today)) return false;
      
      // Convertir dueDate selon son type
      let taskDueDate: Date;
      if (task.dueDate instanceof Date) {
        taskDueDate = task.dueDate;
      } else if (task.dueDate && typeof task.dueDate.toDate === 'function') {
        taskDueDate = task.dueDate.toDate();
      } else {
        taskDueDate = new Date(task.dueDate as unknown as string | number);
      }
      
      // Normaliser la date de la tâche à minuit pour comparer avec aujourd'hui
      const taskDateOnly = new Date(taskDueDate);
      taskDateOnly.setHours(0, 0, 0, 0);
      
      // Tâche d'aujourd'hui qui n'est pas encore passée
      return taskDateOnly.getTime() === today.getTime() && taskDueDate >= now && task.status !== 'completed';
    }).sort((a, b) => {
      // Trier par date d'échéance, les plus proches d'abord
      const dateA = safeFirebaseDate(a.dueDate) || new Date(0);
      const dateB = safeFirebaseDate(b.dueDate) || new Date(0);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Combiner toutes les tâches avec la priorité souhaitée
    const nextTasks = [...yesterdayTasks, ...overdueTasks, ...todayTasks];
    
    // Limiter à 10 tâches maximum (au lieu de 5)
    return nextTasks.slice(0, 10);
  };

  return getNextTasks();
};

const renderEmployeeNextTasks = (
  tasks: Task[],
  isDateSkippedFn: (task: Task, dateOrTimestamp: Date | number) => boolean,
  router: ReturnType<typeof useRouter>
) => {
  const nextTasks = getEmployeeNextTasks(tasks, isDateSkippedFn);

  return (
    <div className="ga-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-extrabold text-gray-950">Prochaines tâches</h2>
        <button
          onClick={() => router.push('/dashboard?tab=taches')}
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors duration-200"
        >
          Voir toutes les tâches
        </button>
      </div>

      {nextTasks.length > 0 ? (
        <div className="space-y-4">
          {nextTasks.map((task) => {
            // Vérifier si la tâche est en retard
            const now = new Date();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Date d'hier (à minuit)
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            // Convertir dueDate selon son type
            let taskDueDate: Date;
            if (task.dueDate instanceof Date) {
              taskDueDate = task.dueDate;
            } else if (task.dueDate && typeof task.dueDate.toDate === 'function') {
              taskDueDate = task.dueDate.toDate();
            } else {
              taskDueDate = new Date(task.dueDate as unknown as string | number);
            }

            // Normaliser la date de la tâche pour comparer avec hier/aujourd'hui
            const taskDateOnly = new Date(taskDueDate);
            taskDateOnly.setHours(0, 0, 0, 0);

            const isYesterday = taskDateOnly.getTime() === yesterday.getTime();
            const isToday = taskDateOnly.getTime() === today.getTime();
            const isOverdue = taskDueDate < now;

            // Définir les styles et le texte en fonction du statut
            let statusBg = 'bg-emerald-100';
            let statusText = 'text-emerald-800';
            let statusLabel = format(taskDueDate, 'HH:mm', { locale: fr });

            if (isYesterday) {
              statusBg = 'bg-orange-100';
              statusText = 'text-orange-800';
              statusLabel = 'Hier - Non complétée';
            } else if (isToday && isOverdue) {
              statusBg = 'bg-red-100';
              statusText = 'text-red-800';
              statusLabel = 'En retard';
            }

            return (
              <div
                key={task.id}
                className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                  isYesterday
                    ? 'border-l-4 border-l-orange-500 bg-orange-50'
                    : isToday && isOverdue
                      ? 'border-l-4 border-l-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50 border-l-4 ' +
                        (task.type === 'resident' ? 'border-l-purple-500' : 'border-l-blue-500')
                }`}
                onClick={() => {
                  if (isYesterday) {
                    router.push('/dashboard?tab=taches&filter=yesterday');
                  } else {
                    router.push('/dashboard?tab=taches');
                  }
                }}
              >
                <div className="flex justify-between">
                  <h3 className="font-medium text-gray-900">{task.name}</h3>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusBg} ${statusText}`}>
                    {statusLabel}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{task.description}</p>
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {format(taskDueDate, 'dd/MM/yyyy', { locale: fr })}
                  </span>
                  <span className={`text-xs font-medium ${
                    task.type === 'resident' ? 'text-purple-600' : 'text-blue-600'
                  }`}>
                    {task.type === 'resident' ? 'Résident' : 'Générale'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-gray-500 py-6">
          Aucune tâche à faire pour le moment
        </p>
      )}
    </div>
  );
};

// Move these component definitions before they are used
const renderEmployeeView = (
  isOnline: boolean,
  toggleOnlineStatus: () => Promise<void>
) => {
  return (
    <div className="space-y-6">
      {/* Section Mon statut */}
      <div className="ga-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-gray-950">Mon statut</h2>
          <button
            onClick={toggleOnlineStatus}
            className={`px-4 py-2 rounded-md text-sm font-medium text-white ${
              isOnline
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            } transition-colors duration-200`}
          >
            {isOnline ? 'Se déconnecter' : 'Se connecter en ligne'}
          </button>
        </div>
        <div className="flex items-center space-x-3">
          <div className={`h-3 w-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-sm text-gray-600">
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </span>
        </div>
      </div>
    </div>
  );
};

const renderEmployerView = (
  onlineUsers: OnlineUser[],
  router: ReturnType<typeof useRouter>
) => {
  const employeesCount = onlineUsers.filter((user) => user.role === 'employee').length;
  const adminsCount = onlineUsers.filter((user) => user.role === 'admin').length;

  return (
  <>
    {/* Section Liste des employés */}
    <div className="ga-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h2 className="text-xl font-extrabold text-gray-950">Liste de tous les employés</h2>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {employeesCount} employé{employeesCount > 1 ? 's' : ''}
          </span>
          <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
            {adminsCount} administrateur{adminsCount > 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-r from-emerald-50 to-white rounded-lg">
        <div className="w-16 h-16 mb-4 flex items-center justify-center bg-emerald-100 rounded-full">
          <UserGroupIcon className="w-8 h-8 text-emerald-700" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Gérer votre équipe</h3>
        <p className="text-sm text-gray-500 text-center mb-4">
          Accédez à la liste complète de vos employés pour consulter leurs profils ou gérer les comptes.
        </p>
        <button
          onClick={() => router.push('/employees')}
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 transition-colors duration-150"
        >
          <UserGroupIcon className="-ml-1 mr-2 h-5 w-5" />
          Voir tous les employés
        </button>
      </div>
    </div>
    
    <div className="ga-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-extrabold text-gray-950">Employés en ligne</h2>
        <span className="text-sm text-gray-500">
          {onlineUsers.filter(u => u.isOnline).length} actifs
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {onlineUsers.length > 0 ? (
          onlineUsers.map((employee) => (
            <div key={employee.id} className="py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`h-10 w-10 rounded-full ${
                  employee.isOnline ? 'bg-green-100' : 'bg-gray-100'
                } flex items-center justify-center`}>
                  <span className={`font-medium ${
                    employee.isOnline ? 'text-green-600' : 'text-gray-600'
                  }`}>
                    {employee.firstName.charAt(0).toUpperCase()}{employee.lastName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {employee.firstName} {employee.lastName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {employee.isOnline
                      ? 'En ligne'
                      : employee.lastOnlineAt
                      ? `Dernière connexion : ${format(employee.lastOnlineAt, 'dd/MM/yyyy HH:mm', { locale: fr })}`
                      : 'Jamais connecté'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`h-3 w-3 rounded-full ${
                  employee.isOnline ? 'bg-green-500' : 'bg-gray-300'
                }`}></div>
                <span className="text-sm text-gray-500">
                  {employee.isOnline ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 py-4">
            Aucun employé n'est associé à ce centre
          </p>
        )}
      </div>
    </div>
  </>
  );
};

export default function DashboardClient() {
  const { user, logout } = useAuth() || {};
  const searchParams = useSearchParams();
  const [userType, setUserType] = useState<'employer' | 'employee' | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentResidentPage, setCurrentResidentPage] = useState(1);
  const tasksPerPage = 6;
  const residentsPerPage = 9;
  const [activeTab, setActiveTab] = useState<Tab>('accueil');

  const [isOnline, setIsOnline] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [pendingAccountRequests, setPendingAccountRequests] = useState<PendingAccountRequest[]>([]);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);
  const [centerCode, setCenterCode] = useState<string | null>(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDetailModalOpen, setIsTaskDetailModalOpen] = useState(false);
  const [isCreateResidentModalOpen, setIsCreateResidentModalOpen] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [isResidentDetailModalOpen, setIsResidentDetailModalOpen] = useState(false);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [isLoadingResidents, setIsLoadingResidents] = useState(false);
  const [residentFilter, setResidentFilter] = useState<'all' | 'male' | 'female'>('all');
  const router = useRouter();
  const customUser = user as CustomUser | null;
  const canManageAccountApprovals = customUser?.role === 'employer' || (customUser?.isEmployer && !customUser?.role);
  const canRequestAnotherCenter = customUser?.role === 'employee' || customUser?.role === 'admin';
  const [isCreateReportModalOpen, setIsCreateReportModalOpen] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isReportDetailModalOpen, setIsReportDetailModalOpen] = useState(false);
  const [currentReportPage, setCurrentReportPage] = useState(1);
  const reportsPerPage = 4;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isCenterMenuOpen, setIsCenterMenuOpen] = useState(false);
  const [associatedCenters, setAssociatedCenters] = useState<string[]>([]);
  const [isCreateCenterModalOpen, setIsCreateCenterModalOpen] = useState(false);
  const [newCenterCode, setNewCenterCode] = useState('');
  const [newCenterTitle, setNewCenterTitle] = useState('');
  const [isCreatingCenter, setIsCreatingCenter] = useState(false);
  const [isJoinCenterModalOpen, setIsJoinCenterModalOpen] = useState(false);
  const [joinCenterCode, setJoinCenterCode] = useState('');
  const [isJoiningCenter, setIsJoiningCenter] = useState(false);
  const [isDeleteCenterModalOpen, setIsDeleteCenterModalOpen] = useState(false);
  const [deleteCenterCodes, setDeleteCenterCodes] = useState<string[]>([]);
  const [deleteCenterConfirmation, setDeleteCenterConfirmation] = useState('');
  const [isDeletingCenter, setIsDeletingCenter] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [profileEdits, setProfileEdits] = useState({
    firstName: '',
    lastName: ''
  });
  const [isProfileModified, setIsProfileModified] = useState(false);
  const [userPreferences, setUserPreferences] = useState({
    emailNotifications: false,
    language: 'fr' as 'fr' | 'en'
  });
  const [tempPreferences, setTempPreferences] = useState({
    emailNotifications: false,
    language: 'fr' as 'fr' | 'en'
  });
  const [isPreferencesModified, setIsPreferencesModified] = useState(false);
  const [isConfirmCompleteModalOpen, setIsConfirmCompleteModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<string | null>(null);
  const [isConfirmUncompleteModalOpen, setIsConfirmUncompleteModalOpen] = useState(false);
  const [taskToUncomplete, setTaskToUncomplete] = useState<string | null>(null);
  
  // Ajouter après ces lignes:
  const [centerTitle, setCenterTitle] = useState<string>("Information du centre");
  const [centerSubtitle, setCenterSubtitle] = useState<string>("Tableau de bord du centre actif");

  // États pour la gestion des messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageTitle, setNewMessageTitle] = useState('');
  const [newMessageContent, setNewMessageContent] = useState('');
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isMessageDetailModalOpen, setIsMessageDetailModalOpen] = useState(false);

  // Ajouter juste après:
  // Effet pour initialiser les champs d'édition du profil quand le modal s'ouvre
  useEffect(() => {
    if (isProfileModalOpen && customUser) {
      setProfileEdits({
        firstName: customUser.firstName || '',
        lastName: customUser.lastName || ''
      });
      setIsProfileModified(false);
    }
  }, [isProfileModalOpen, customUser]);

  // Ajouter du code dans le useEffect qui détecte les paramètres d'URL pour également détecter le filtre
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['accueil', 'taches', 'residents', 'rapports', 'messages', 'alertes', 'approbations'].includes(tabParam)) {
      setActiveTab(tabParam as Tab);
      
      // Si l'onglet est 'taches', vérifier s'il y a un paramètre de filtre
      if (tabParam === 'taches') {
        const filterParam = searchParams.get('filter');
        if (filterParam && ['all', 'resident', 'general', 'upcoming', 'past', 'completed', 'yesterday'].includes(filterParam)) {
          setTaskFilter(filterParam as TaskFilter);
          if (filterParam === 'upcoming' || filterParam === 'past') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            setSelectedDate(today);
          }
        }
      }
    } else if (!tabParam && router) {
      // Si aucun paramètre de tab n'est présent, s'assurer que nous avons une entrée d'historique correcte
      // pour l'onglet d'accueil par défaut
      router.replace('/dashboard?tab=accueil');
    }
  }, [searchParams, router]);

  useEffect(() => {
    async function getUserInfo() {
      if (!user) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserType(userData.isEmployer ? 'employer' : 'employee');
          setCenterCode(userData.centerCode);
          setIsOnline(userData.isOnline || false);

          const normalizedCurrentCenter = typeof userData.centerCode === 'string' ? userData.centerCode.trim().toUpperCase() : '';
          const savedActiveCenters = Array.isArray(userData.activeCenters)
            ? userData.activeCenters
                .filter((code: unknown): code is string => typeof code === 'string' && code.trim() !== '')
                .map((code: string) => code.trim().toUpperCase())
            : [];
          const savedAssociatedCenters = Array.isArray(userData.associatedCenters)
            ? userData.associatedCenters
                .filter((code: unknown): code is string => typeof code === 'string' && code.trim() !== '')
                .map((code: string) => code.trim().toUpperCase())
            : [];
          const uniqueCenters = savedActiveCenters.length > 0
            ? Array.from(new Set(savedActiveCenters))
            : Array.from(new Set([normalizedCurrentCenter, ...savedAssociatedCenters].filter(Boolean)));
          setAssociatedCenters(uniqueCenters);

          if (
            uniqueCenters.length > 0 &&
            userData.accountStatus === 'active' &&
            (!Array.isArray(userData.activeCenters) ||
              userData.activeCenters.length !== uniqueCenters.length ||
              uniqueCenters.some((code) => !userData.activeCenters.includes(code)) ||
              !Array.isArray(userData.associatedCenters) ||
              userData.associatedCenters.length !== uniqueCenters.length ||
              uniqueCenters.some((code) => !userData.associatedCenters.includes(code)))
          ) {
            await updateDoc(doc(db, 'users', user.uid), {
              activeCenters: uniqueCenters,
              associatedCenters: uniqueCenters
            });
          }
          
          // Récupérer les paramètres du centre si disponibles
          if (userData.centerCode && typeof userData.centerCode === 'string' && userData.centerCode.trim() !== '') {
            try {
              const centerRef = doc(db, 'centers', userData.centerCode);
              const centerDoc = await getDoc(centerRef);
              if (centerDoc.exists()) {
                const centerData = centerDoc.data();
                if (centerData.title) setCenterTitle(centerData.title);
                if (centerData.subtitle) setCenterSubtitle(centerData.subtitle);
              } else {
                setCenterTitle("Centre " + userData.centerCode);
                setCenterSubtitle("Informations du centre");
              }
            } catch (error) {
              handleExpectedFirestoreActionError('Error fetching center document', error);
            }
          }
        }
      } catch (error) {
        handleExpectedFirestoreActionError('Error fetching user info', error, 'Erreur lors du chargement des données utilisateur');
      } finally {
        // Fin du chargement initial
        setLoading(false);
      }
    }

    getUserInfo();
  }, [user]);

  useEffect(() => {
    if (!centerCode || !userType || userType !== 'employer') return;

    console.log('Setting up employee listener for center:', centerCode);

    const normalizedCenterCode = centerCode.trim().toUpperCase();
    const usersByActiveCenterQuery = query(
      collection(db, 'users'),
      where('activeCenters', 'array-contains', normalizedCenterCode)
    );
    const usersByLegacyCenterQuery = query(
      collection(db, 'users'),
      where('centerCode', '==', normalizedCenterCode)
    );

    let modernUsers: OnlineUser[] = [];
    let legacyUsers: OnlineUser[] = [];

    const normalizeUsers = (docs: Array<{ id: string; data: () => any }>) => {
      const users: OnlineUser[] = [];
      docs.forEach((userDoc) => {
        const data = userDoc.data();
        const activeCenters = Array.isArray(data.activeCenters)
          ? data.activeCenters
              .filter((code: unknown): code is string => typeof code === 'string' && code.trim() !== '')
              .map((code: string) => code.trim().toUpperCase())
          : data.accountStatus === 'active'
            ? Array.from(new Set([
                ...(Array.isArray(data.associatedCenters) ? data.associatedCenters : []),
                data.centerCode
              ].filter((code): code is string => typeof code === 'string' && code.trim() !== '').map((code) => code.trim().toUpperCase())))
            : [];

        if (data.accountStatus === 'pending_approval' && activeCenters.length === 0) {
          return;
        }

        if (!activeCenters.includes(normalizedCenterCode) && data.centerCode !== normalizedCenterCode) {
          return;
        }

        const centerRoles = data.centerRoles && typeof data.centerRoles === 'object' ? data.centerRoles : {};
        const centerRole = centerRoles[normalizedCenterCode] || data.role || (data.isEmployer ? 'employer' : 'employee');

        if (centerRole === 'employer') {
          return;
        }

        users.push({
          id: userDoc.id,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email,
          isOnline: data.isOnline || false,
          lastOnlineAt: data.lastOnlineAt ? data.lastOnlineAt.toDate() : null,
          centerCode: normalizedCenterCode,
          role: centerRole === 'admin' ? 'admin' : 'employee'
        });
      });
      return users;
    };

    const publishUsers = () => {
      const usersMap = new Map<string, OnlineUser>();
      [...modernUsers, ...legacyUsers].forEach((onlineUser) => {
        usersMap.set(onlineUser.id, onlineUser);
      });
      const users = Array.from(usersMap.values());
      console.log('Updated online users:', users);
      setOnlineUsers(users);
    };

    const unsubscribeModern = onSnapshot(usersByActiveCenterQuery, (snapshot) => {
      console.log('Received modern employee update, count:', snapshot.size);
      modernUsers = normalizeUsers(snapshot.docs);
      publishUsers();
    }, (error) => {
      handleFirestoreListenerError('Error in employee listener', error, 'Erreur lors de la mise à jour des employés en ligne');
    });

    const unsubscribeLegacy = onSnapshot(usersByLegacyCenterQuery, (snapshot) => {
      console.log('Received legacy employee update, count:', snapshot.size);
      legacyUsers = normalizeUsers(snapshot.docs);
      publishUsers();
    }, (error) => {
      handleFirestoreListenerError('Error in employee listener', error, 'Erreur lors de la mise à jour des employés en ligne');
    });

    return () => {
      unsubscribeModern();
      unsubscribeLegacy();
    };
  }, [centerCode, userType]);

  useEffect(() => {
    if (!customUser) {
      setTasks([]);
      return;
    }

    console.log(`Setting up Firestore listener for center: ${customUser.centerCode}`);

    const tasksRef = collection(db, 'tasks');
    // Les index sont maintenant créés, on peut utiliser le filtre complet
    const q = query(
      tasksRef,
      where('centerCode', '==', customUser.centerCode),
      where('deleted', '!=', true)
    );

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      try {
        console.log('[onSnapshot] Received update');
        const tasksData: Task[] = [];
      
      // Récupérer tous les résidents en une seule fois
      const residentsRef = collection(db, 'residents');
      const residentsQuery = query(residentsRef, where('centerCode', '==', customUser.centerCode));
      const residentsSnapshot = await getDocs(residentsQuery);
      const residentsMap = new Map();
      residentsSnapshot.forEach((doc) => {
        residentsMap.set(doc.id, doc.data());
      });

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Plus besoin de filtrer côté client
        // if (data.deleted === true) return;
        
        const residentData = data.residentId ? residentsMap.get(data.residentId) : null;
        
        const taskData: Task = {
          id: doc.id,
          type: data.type,
          name: data.name,
          description: data.description,
          dueDate: data.dueDate?.toDate ? data.dueDate.toDate() : new Date(),
          status: data.status,
          recurrenceType: data.recurrenceType,
          completedBy: data.completedBy ? {
            id: data.completedBy.id || '',
            name: data.completedBy.name || 'Inconnu',
            timestamp: data.completedBy.timestamp || Timestamp.now()
          } : undefined,
          residentId: data.residentId,
          residentName: residentData ? `${residentData.firstName} ${residentData.lastName}` : undefined,
          isVirtualOccurrence: data.isVirtualOccurrence,
          deleted: data.deleted,
          deletedAt: data.deletedAt,
          deletedBy: data.deletedBy,
          skippedDates: data.skippedDates ? data.skippedDates.map((timestamp: any) => typeof timestamp === 'number' ? timestamp : timestamp.toMillis ? timestamp.toMillis() : Number(timestamp)) : undefined,
          createdBy: data.createdBy ? {
            id: data.createdBy.id || '',
            name: data.createdBy.name || 'Inconnu',
            timestamp: data.createdBy.timestamp || Timestamp.now()
          } : undefined,
          lastModifiedBy: data.lastModifiedBy ? {
            id: data.lastModifiedBy.id || '',
            name: data.lastModifiedBy.name || 'Inconnu',
            timestamp: data.lastModifiedBy.timestamp || Timestamp.now()
          } : undefined,
          specificDays: data.specificDays
        };
        
        tasksData.push(taskData);
      });
      
        console.log(`[onSnapshot] Processed ${tasksData.length} tasks.`);
        setTasks(tasksData);
      } catch (error) {
        handleFirestoreListenerError('[onSnapshot] Error while processing tasks', error, 'Erreur lors de la mise à jour des tâches.');
      }
    }, (error) => {
      handleFirestoreListenerError('[onSnapshot] Error', error, 'Erreur lors de la mise à jour des tâches.');
    });

    return () => {
      console.log('Cleaning up Firestore listener.');
      unsubscribe();
    };
  }, [customUser]);

  useEffect(() => {
    if (!centerCode || !canManageAccountApprovals) {
      setPendingAccountRequests([]);
      return;
    }

    const normalizeRequest = (requestDoc: any, data: any, pendingRequest?: any): PendingAccountRequest | null => {
      const requestCenterCode = typeof pendingRequest?.centerCode === 'string'
        ? pendingRequest.centerCode.trim().toUpperCase()
        : typeof data.centerCode === 'string'
          ? data.centerCode.trim().toUpperCase()
          : '';

      if (requestCenterCode !== centerCode) return null;

      return {
        id: requestDoc.id,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        role: pendingRequest?.role === 'admin' || data.role === 'admin' ? 'admin' : 'employee',
        centerCode: requestCenterCode,
        approvalRequestedAt: pendingRequest?.requestedAt || data.approvalRequestedAt
      };
    };

    let modernRequests: PendingAccountRequest[] = [];
    let legacyRequests: PendingAccountRequest[] = [];
    const publishRequests = () => {
      const requestMap = new Map<string, PendingAccountRequest>();
      [...modernRequests, ...legacyRequests].forEach((request) => {
        requestMap.set(`${request.id}:${request.centerCode}`, request);
      });
      setPendingAccountRequests(Array.from(requestMap.values()));
    };

    const modernPendingQuery = query(
      collection(db, 'users'),
      where('pendingCenterCodes', 'array-contains', centerCode)
    );

    const legacyPendingQuery = query(
      collection(db, 'users'),
      where('centerCode', '==', centerCode),
      where('accountStatus', '==', 'pending_approval')
    );

    const unsubscribeModern = onSnapshot(modernPendingQuery, (snapshot) => {
      modernRequests = [];
      snapshot.docs.forEach((requestDoc) => {
        const data = requestDoc.data();
        const pendingCenterRequests = Array.isArray(data.pendingCenterRequests) ? data.pendingCenterRequests : [];
        pendingCenterRequests.forEach((pendingRequest: any) => {
          const request = normalizeRequest(requestDoc, data, pendingRequest);
          if (request) modernRequests.push(request);
        });
      });
      publishRequests();
    }, (error) => {
      handleFirestoreListenerError('Error loading pending account requests', error);
    });

    const unsubscribeLegacy = onSnapshot(legacyPendingQuery, (snapshot) => {
      legacyRequests = snapshot.docs
        .map((requestDoc) => normalizeRequest(requestDoc, requestDoc.data()))
        .filter((request): request is PendingAccountRequest => request !== null);
      publishRequests();
    }, (error) => {
      handleFirestoreListenerError('Error loading legacy pending account requests', error);
    });

    return () => {
      unsubscribeModern();
      unsubscribeLegacy();
    };
  }, [centerCode, canManageAccountApprovals]);

  const handleAccountApproval = async (targetUid: string, action: 'approve' | 'reject') => {
    const approvalCenterCode = centerCode;
    if (!approvalCenterCode) {
      toast.error('Aucun centre actif sélectionné.');
      return;
    }

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      toast.error('Session expirée. Veuillez vous reconnecter.');
      return;
    }

    try {
      setIsProcessingApproval(true);
      const response = await fetch('/api/account-approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ targetUid, action })
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (result.code === 'firebase-admin-missing') {
          const request = pendingAccountRequests.find((pendingRequest) => pendingRequest.id === targetUid);
          const targetRef = doc(db, 'users', targetUid);
          const targetSnapshot = await getDoc(targetRef);

          if (!targetSnapshot.exists()) {
            toast.error('Demande introuvable');
            return;
          }

          const targetData = targetSnapshot.data();
          const activeCenters = Array.isArray(targetData.activeCenters)
            ? targetData.activeCenters.filter((code: unknown): code is string => typeof code === 'string' && code.trim() !== '').map((code: string) => code.trim().toUpperCase())
            : targetData.accountStatus === 'active'
              ? Array.from(new Set([
                  ...(Array.isArray(targetData.associatedCenters) ? targetData.associatedCenters : []),
                  targetData.centerCode
                ].filter((code): code is string => typeof code === 'string' && code.trim() !== '').map((code) => code.trim().toUpperCase())))
              : [];
          const pendingCenterRequests = Array.isArray(targetData.pendingCenterRequests)
            ? targetData.pendingCenterRequests
            : targetData.accountStatus === 'pending_approval' && targetData.centerCode
              ? [{
                  centerCode: targetData.centerCode,
                  role: targetData.role === 'admin' ? 'admin' : 'employee',
                  requestedAt: targetData.approvalRequestedAt
                }]
              : [];
          const remainingRequests = pendingCenterRequests.filter((pendingRequest: any) => {
            const requestCenter = typeof pendingRequest.centerCode === 'string' ? pendingRequest.centerCode.trim().toUpperCase() : '';
            return requestCenter !== approvalCenterCode;
          });
          const remainingPendingCodes = remainingRequests
            .map((pendingRequest: any) => typeof pendingRequest.centerCode === 'string' ? pendingRequest.centerCode.trim().toUpperCase() : '')
            .filter(Boolean);

          if (action === 'approve' && request) {
            const nextActiveCenters = Array.from(new Set([...activeCenters, approvalCenterCode].filter((code): code is string => typeof code === 'string' && code.trim() !== '').map((code) => code.trim().toUpperCase())));
            const centerRoles = {
              ...(targetData.centerRoles && typeof targetData.centerRoles === 'object' ? targetData.centerRoles : {}),
              [approvalCenterCode]: request.role
            };
            const primaryRole = Object.values(centerRoles).includes('admin') ? 'admin' : 'employee';

            await updateDoc(targetRef, {
              role: primaryRole,
              accountStatus: 'active',
              isEmployer: primaryRole === 'admin',
              centerCode: activeCenters.length > 0 ? targetData.centerCode || approvalCenterCode : approvalCenterCode,
              associatedCenters: Array.from(new Set([
                ...(Array.isArray(targetData.associatedCenters) ? targetData.associatedCenters : []),
                ...nextActiveCenters
              ])),
              activeCenters: nextActiveCenters,
              pendingCenterRequests: remainingRequests,
              pendingCenterCodes: remainingPendingCodes,
              centerRoles,
              approvedAt: serverTimestamp(),
              approvedBy: customUser?.uid || null
            });
            toast.success('Compte activé avec succès');
            return;
          }

          if (action === 'reject') {
            if (activeCenters.length === 0) {
              await deleteDoc(targetRef);
              toast.success('Demande supprimée avec succès');
              return;
            }

            await updateDoc(targetRef, {
              accountStatus: 'active',
              activeCenters,
              associatedCenters: Array.from(new Set([
                ...(Array.isArray(targetData.associatedCenters) ? targetData.associatedCenters : []),
                ...activeCenters
              ])),
              pendingCenterRequests: remainingRequests,
              pendingCenterCodes: remainingPendingCodes,
              centerCode: targetData.centerCode || activeCenters[0],
              updatedAt: serverTimestamp()
            });
            toast.success('Demande supprimée avec succès');
            return;
          }
        }

        toast.error(result.error || 'Impossible de traiter cette demande');
        return;
      }

      toast.success(action === 'approve' ? 'Compte activé avec succès' : 'Demande supprimée avec succès');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors du traitement de la demande');
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const toggleOnlineStatus = async () => {
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const newStatus = !isOnline;
      await updateDoc(userRef, {
        isOnline: newStatus,
        lastOnlineAt: serverTimestamp()
      });
      setIsOnline(newStatus);
      toast.success(newStatus ? 'Vous êtes maintenant en ligne' : 'Vous êtes maintenant hors ligne');
    } catch (error) {
      handleExpectedFirestoreActionError('Error updating online status', error, 'Erreur lors de la mise à jour du statut');
    }
  };

  const handleLogout = async () => {
    if (!logout) {
      toast.error("Service de déconnexion non disponible.");
      return;
    }
    try {
      await logout();
      toast.success('Déconnexion réussie');
      router.replace('/login');
    } catch (error) {
      handleExpectedFirestoreActionError('Error logging out', error, 'Erreur lors de la déconnexion');
    }
  };

  const normalizeCenterCode = (value: string) => value.trim().toUpperCase();

  const handleSwitchCenter = async (nextCenterCode: string) => {
    if (!customUser?.uid) return;

    const normalizedCode = normalizeCenterCode(nextCenterCode);
    if (!normalizedCode || normalizedCode === centerCode?.toUpperCase()) {
      setIsCenterMenuOpen(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'users', customUser.uid), {
        centerCode: normalizedCode,
        updatedAt: serverTimestamp()
      });
      toast.success(`Centre ${normalizedCode} activé`);
      setIsCenterMenuOpen(false);
      window.location.href = '/dashboard?tab=accueil';
    } catch (error) {
      console.error('Error switching center:', error);
      toast.error('Impossible de changer de centre pour le moment');
    }
  };

  const handleCreateCenter = async () => {
    if (!customUser?.uid || !canManageAccountApprovals) {
      toast.error('Seuls les comptes employeurs peuvent créer un centre');
      return;
    }

    const normalizedCode = normalizeCenterCode(newCenterCode);
    const title = newCenterTitle.trim() || `Centre ${normalizedCode}`;

    if (!normalizedCode) {
      toast.error('Veuillez entrer un code de centre');
      return;
    }

    if (associatedCenters.includes(normalizedCode)) {
      toast.error('Ce centre est déjà associé à votre compte');
      return;
    }

    setIsCreatingCenter(true);
    try {
      const centerRef = doc(db, 'centers', normalizedCode);
      const centerDoc = await getDoc(centerRef);

      if (centerDoc.exists()) {
        toast.error('Ce code de centre existe déjà. Choisissez un code différent.');
        return;
      }

      const nextCenters = Array.from(new Set([...associatedCenters, normalizedCode]));

      await setDoc(centerRef, {
        code: normalizedCode,
        title,
        subtitle: 'Informations du centre',
        ownerId: customUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'users', customUser.uid), {
        centerCode: normalizedCode,
        associatedCenters: nextCenters,
        activeCenters: nextCenters,
        centerRoles: {
          ...(customUser.centerRoles || {}),
          [normalizedCode]: 'employer'
        },
        updatedAt: serverTimestamp()
      });

      toast.success(`Centre ${normalizedCode} créé`);
      setIsCreateCenterModalOpen(false);
      setNewCenterCode('');
      setNewCenterTitle('');
      window.location.href = '/dashboard?tab=accueil';
    } catch (error) {
      console.error('Error creating center:', error);
      toast.error('Impossible de créer le centre pour le moment');
    } finally {
      setIsCreatingCenter(false);
    }
  };

  const openDeleteCenterModal = () => {
    const centers = associatedCenters.length > 0 ? associatedCenters : [centerCode].filter(Boolean);
    const normalizedCenters = Array.from(new Set(centers.map((code) => normalizeCenterCode(code)).filter(Boolean)));
    setDeleteCenterCodes(centerCode ? [normalizeCenterCode(centerCode)] : normalizedCenters.slice(0, 1));
    setDeleteCenterConfirmation('');
    setIsDeleteCenterModalOpen(true);
    setIsProfileMenuOpen(false);
  };

  const toggleDeleteCenterCode = (centerToToggle: string) => {
    const normalizedCode = normalizeCenterCode(centerToToggle);
    setDeleteCenterCodes((currentCodes) => {
      if (currentCodes.includes(normalizedCode)) {
        return currentCodes.filter((code) => code !== normalizedCode);
      }

      return [...currentCodes, normalizedCode];
    });
  };

  const handleDeleteCenters = async () => {
    if (!customUser?.uid || !canManageAccountApprovals) {
      toast.error('Action réservée aux employeurs');
      return;
    }

    const normalizedCodes = Array.from(new Set(deleteCenterCodes.map((code) => normalizeCenterCode(code)).filter(Boolean)));
    if (normalizedCodes.length === 0) {
      toast.error('Sélectionnez au moins un centre');
      return;
    }

    if (deleteCenterConfirmation.trim().toUpperCase() !== 'SUPPRIMER') {
      toast.error('Écrivez SUPPRIMER pour confirmer');
      return;
    }

    setIsDeletingCenter(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast.error('Session expirée. Veuillez vous reconnecter.');
        return;
      }

      const response = await fetch('/api/centers/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ centerCodes: normalizedCodes })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(result.error || 'Impossible de supprimer le centre');
        return;
      }

      toast.success(normalizedCodes.length > 1 ? 'Centres supprimés avec succès' : 'Centre supprimé avec succès');
      setIsDeleteCenterModalOpen(false);

      if (result.accountDeleted) {
        await auth.signOut().catch(() => undefined);
        router.replace('/login');
        return;
      }

      window.location.href = '/dashboard?tab=accueil';
    } catch (error) {
      console.error('Error deleting centers:', error);
      toast.error('Erreur lors de la suppression du centre');
    } finally {
      setIsDeletingCenter(false);
    }
  };

  const handleJoinCenterRequest = async () => {
    if (!customUser?.uid || !canRequestAnotherCenter) {
      toast.error('Cette action est réservée aux employés et administrateurs');
      return;
    }

    const normalizedCode = normalizeCenterCode(joinCenterCode);
    if (!normalizedCode) {
      toast.error('Veuillez entrer un code de centre');
      return;
    }

    setIsJoiningCenter(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast.error('Session expirée. Veuillez vous reconnecter.');
        return;
      }

      const response = await fetch('/api/center-join-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ centerCode: normalizedCode })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (result.code === 'firebase-admin-missing') {
          const centerSnapshot = await getDoc(doc(db, 'centers', normalizedCode));
          if (!centerSnapshot.exists()) {
            toast.error('Ce centre n’existe pas');
            return;
          }

          const userRef = doc(db, 'users', customUser.uid);
          const userSnapshot = await getDoc(userRef);
          if (!userSnapshot.exists()) {
            toast.error('Compte introuvable');
            return;
          }

          const userData = userSnapshot.data();
          const activeCenters = Array.isArray(userData.activeCenters)
            ? userData.activeCenters
                .filter((code: unknown): code is string => typeof code === 'string' && code.trim() !== '')
                .map((code: string) => code.trim().toUpperCase())
            : userData.accountStatus === 'active'
              ? Array.from(new Set([
                  ...(Array.isArray(userData.associatedCenters) ? userData.associatedCenters : []),
                  userData.centerCode
                ].filter((code): code is string => typeof code === 'string' && code.trim() !== '').map((code) => code.trim().toUpperCase())))
              : [];

          if (activeCenters.length === 0) {
            toast.error('Votre compte doit déjà être actif dans au moins un centre');
            return;
          }

          if (activeCenters.includes(normalizedCode)) {
            toast.error('Votre compte est déjà associé à ce centre');
            return;
          }

          const pendingCenterRequests = Array.isArray(userData.pendingCenterRequests)
            ? userData.pendingCenterRequests
            : userData.accountStatus === 'pending_approval' && userData.centerCode
              ? [{
                  centerCode: userData.centerCode,
                  role: userData.role === 'admin' ? 'admin' : 'employee',
                  requestedAt: userData.approvalRequestedAt
                }]
              : [];
          const hasPendingRequest = pendingCenterRequests.some((pendingRequest: any) => {
            const pendingCenterCode = typeof pendingRequest.centerCode === 'string' ? pendingRequest.centerCode.trim().toUpperCase() : '';
            return pendingCenterCode === normalizedCode;
          });

          if (hasPendingRequest) {
            toast.error('Une demande est déjà en attente pour ce centre');
            return;
          }

          const requestedRole = customUser.role === 'admin' ? 'admin' : 'employee';
          const nextPendingRequests = [
            ...pendingCenterRequests,
            {
              centerCode: normalizedCode,
              role: requestedRole,
              requestedAt: new Date()
            }
          ];
          const nextPendingCodes = Array.from(new Set(nextPendingRequests
            .map((pendingRequest: any) => typeof pendingRequest.centerCode === 'string' ? pendingRequest.centerCode.trim().toUpperCase() : '')
            .filter(Boolean)));

          await updateDoc(userRef, {
            accountStatus: 'active',
            activeCenters,
            pendingCenterRequests: nextPendingRequests,
            pendingCenterCodes: nextPendingCodes,
            updatedAt: serverTimestamp()
          });

          toast.success('Demande envoyée à l’employeur du centre');
          setIsJoinCenterModalOpen(false);
          setJoinCenterCode('');
          return;
        }

        toast.error(result.error || 'Impossible d’envoyer la demande');
        return;
      }

      toast.success('Demande envoyée à l’employeur du centre');
      setIsJoinCenterModalOpen(false);
      setJoinCenterCode('');
    } catch (error) {
      console.error('Error requesting center access:', error);
      toast.error('Impossible d’envoyer la demande pour le moment');
    } finally {
      setIsJoiningCenter(false);
    }
  };

  const handleTaskCreated = async (taskId: string) => {
    if (!customUser?.centerCode) return;
    
    try {
      console.log('[handleTaskCreated] taskId:', taskId);
      console.log('[handleTaskCreated] centerCode:', customUser.centerCode);
      
      // Récupérer tous les utilisateurs du centre sauf l'auteur de la tâche
      const usersQuery = query(
        collection(db, 'users'),
        where('centerCode', '==', customUser.centerCode)
      );
      const usersSnapshot = await getDocs(usersQuery);
      const otherUsers = usersSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.id !== customUser.uid);

      console.log('[handleTaskCreated] Nombre d\'autres utilisateurs:', otherUsers.length);
      
      // Créer une alerte pour la nouvelle tâche seulement si d'autres utilisateurs existent
      if (otherUsers.length > 0) {
        console.log('[handleTaskCreated] Création d\'une alerte...');
        
        const alertData = {
          type: 'task_created',
          title: 'Nouvelle tâche créée',
          message: 'Une nouvelle tâche a été ajoutée à la liste.',
          createdAt: serverTimestamp(),
          readBy: [],
          relatedId: taskId,
          centerCode: customUser.centerCode,
          excludedUsers: [customUser.uid] // Exclure l'utilisateur qui a créé la tâche
        };
        
        console.log('[handleTaskCreated] Données de l\'alerte:', alertData);
        
        const alertRef = await addDoc(collection(db, 'alerts'), alertData);
        console.log('[handleTaskCreated] Alerte créée avec ID:', alertRef.id);
      } else {
        console.log('[handleTaskCreated] Aucun autre utilisateur trouvé, pas d\'alerte créée');
      }
      
      toast.success('Tâche créée avec succès');
    } catch (error) {
      console.error('[handleTaskCreated] Error creating task alert:', error);
      toast.error('Erreur lors de la création de l\'alerte');
    }
  };

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
      // Vérifier si c'est une tâche virtuelle
      const isVirtualTask = taskId.startsWith('virtual-');
      let parentTaskId = taskId;
      let timestamp: number | null = null;
      
      if (isVirtualTask) {
        // L'ID est au format: virtual-[original-id]-[timestamp]
        const parts = taskId.split('-');
        if (parts.length >= 3) {
          // Extraire l'ID parent et le timestamp
          const virtualPrefix = parts[0];
          timestamp = parseInt(parts[parts.length - 1]);
          // Reconstruire l'ID parent (tout sauf le premier et dernier élément)
          parentTaskId = parts.slice(1, -1).join('-');
          
          console.log(`Tâche virtuelle détectée: prefix=${virtualPrefix}, parent=${parentTaskId}, timestamp=${timestamp}`);
        }
      }
      
      const taskRef = doc(db, 'tasks', parentTaskId);
      let taskDoc;
      let taskData;
      
      try {
        taskDoc = await getDoc(taskRef);
        
        if (!taskDoc.exists()) {
          // La tâche parent n'existe pas - probablement supprimée
          console.log(`La tâche parent ${parentTaskId} n'existe pas dans la base de données`);
          
          if (isVirtualTask && timestamp) {
            // Pour les tâches virtuelles dont le parent n'existe plus, on va les marquer comme "skipped"
            // dans le stockage local pour ne plus les afficher
            
            const skippedVirtualTasks = JSON.parse(localStorage.getItem('skippedVirtualTasks') || '[]');
            if (!skippedVirtualTasks.includes(taskId)) {
              skippedVirtualTasks.push(taskId);
              localStorage.setItem('skippedVirtualTasks', JSON.stringify(skippedVirtualTasks));
            }
            
            toast.success('Cette tâche a été marquée comme complétée localement');
            setIsConfirmCompleteModalOpen(false);
            setTaskToComplete(null);
            return;
          } else {
            toast.error('Cette tâche n\'existe pas dans la base de données');
            setIsConfirmCompleteModalOpen(false);
            setTaskToComplete(null);
            return;
          }
        }
        
        taskData = taskDoc.data() as Task & { id: string };
      } catch (err) {
        console.error('Erreur lors de la récupération de la tâche:', err);
        
        if (isVirtualTask) {
          // Gestion spéciale pour les tâches virtuelles en cas d'erreur
          toast.success('Cette tâche a été marquée comme complétée localement');
          setIsConfirmCompleteModalOpen(false);
          setTaskToComplete(null);
          return;
        } else {
          toast.error('Erreur lors de la récupération de la tâche');
          setIsConfirmCompleteModalOpen(false);
          setTaskToComplete(null);
          return;
        }
      }
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();
      
      if (isVirtualTask && timestamp) {
        // Pour une tâche virtuelle, nous allons marquer cette occurrence comme complétée
        // en l'ajoutant à un tableau de dates complétées dans la tâche parent ou en l'ignorant
        let skippedDates = taskData.skippedDates || [];
        
        // Assurez-vous que skippedDates est un tableau
        if (!Array.isArray(skippedDates)) {
          skippedDates = [];
        }
        
        // Ajouter cette date si elle n'est pas déjà présente
        if (!skippedDates.includes(timestamp)) {
          skippedDates.push(timestamp);
          
          // Mettre à jour la tâche parent avec la nouvelle liste de dates ignorées
          await updateDoc(taskRef, {
            skippedDates: skippedDates
          });
          
          console.log(`Tâche ${parentTaskId} mise à jour avec les dates ignorées:`, skippedDates);
          toast.success('Cette occurrence de la tâche a été marquée comme complétée');
        } else {
          console.log(`Le timestamp ${timestamp} est déjà dans la liste des dates ignorées`);
          toast.success('Cette occurrence était déjà marquée comme complétée');
        }
      } else {
        // Pour une tâche normale (non virtuelle), marquer comme complétée
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
          where('relatedId', '==', parentTaskId),
          where('centerCode', '==', customUser?.centerCode)
        );
        
        const alertsSnapshot = await getDocs(alertsQuery);
        const deletePromises = alertsSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

        // Créer la prochaine occurrence si la tâche est récurrente
        if (taskData && taskData.recurrenceType !== 'none') {
          const currentDate = taskData.dueDate instanceof Date 
            ? taskData.dueDate 
            : (taskData.dueDate as { toDate(): Date }).toDate();
          const nextDate = new Date(currentDate);

          // Calculer la prochaine date selon le type de récurrence
          switch (taskData.recurrenceType) {
            case 'specificDays':
              if (taskData.specificDays && taskData.specificDays.length > 0) {
                const weekDayMap: { [key: string]: number } = {
                  'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
                  'thursday': 4, 'friday': 5, 'saturday': 6
                };
                
                // Obtenir le jour actuel et les jours spécifiques en nombres (0-6)
                const currentDayOfWeek = nextDate.getDay();
                const selectedDayNumbers = taskData.specificDays.map(day => weekDayMap[day]);
                
                // Trouver le prochain jour valide
                const futureDays = selectedDayNumbers.filter(day => day > currentDayOfWeek);
                const daysUntilNext = futureDays.length > 0
                  ? futureDays[0] - currentDayOfWeek
                  : 7 - currentDayOfWeek + selectedDayNumbers[0];
                
                nextDate.setDate(nextDate.getDate() + daysUntilNext);
              }
              break;
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
          // Utiliser _ préfixe pour ignorer les variables non utilisées
          const { id: _id, completedBy: _completedBy, status: _status, ...taskDataWithoutStatus } = taskData;
          const newTaskData = {
            ...taskDataWithoutStatus,
            dueDate: Timestamp.fromDate(nextDate),
            status: 'pending' as const,
            // completedBy est déjà géré par la déstructuration ou est null
            createdAt: serverTimestamp(),
            deleted: false // Explicitement marquer comme non supprimée
          };
          
          await addDoc(collection(db, 'tasks'), newTaskData);
        }

        toast.success('Tâche marquée comme complétée');
      }

      // Fermer la modale de confirmation
      setIsConfirmCompleteModalOpen(false);
      setTaskToComplete(null);
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error('Erreur lors de la mise à jour du statut de la tâche');
      
      // Fermer la modale en cas d'erreur aussi
      setIsConfirmCompleteModalOpen(false);
      setTaskToComplete(null);
    }
  };

  const handleUncompleteTask = async (taskId: string) => {
    if (!user || !customUser?.isEmployer) {
      toast.error("Seuls les comptes employeurs peuvent exécuter cette action");
      setIsConfirmUncompleteModalOpen(false);
      setTaskToUncomplete(null);
      return;
    }

    if (taskId.startsWith('virtual-')) {
      toast.error("Impossible de modifier directement une occurrence future");
      setIsConfirmUncompleteModalOpen(false);
      setTaskToUncomplete(null);
      return;
    }

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);

      if (!taskDoc.exists()) {
        toast.error("Cette tâche n'existe pas dans la base de données");
        setIsConfirmUncompleteModalOpen(false);
        setTaskToUncomplete(null);
        return;
      }

      await updateDoc(taskRef, {
        status: 'pending',
        completedBy: deleteField()
      });

      const taskData = taskDoc.data() as Task;
      await addDoc(collection(db, 'alerts'), {
        type: 'task_uncompleted',
        title: 'Tâche remise à compléter',
        message: `La tâche "${taskData.name}" a été remise dans les tâches à compléter.`,
        createdAt: serverTimestamp(),
        readBy: [],
        relatedId: taskId,
        centerCode: customUser.centerCode,
        excludedUsers: [customUser.uid]
      });

      toast.success("La tâche a été remise dans les tâches à compléter");
      setTaskFilter('all');
      setSelectedDate(null);
      router.push('/dashboard?tab=taches&filter=all');
    } catch (error) {
      console.error('Error reverting completed task:', error);
      toast.error("Erreur lors de la remise en attente de la tâche");
    } finally {
      setIsConfirmUncompleteModalOpen(false);
      setTaskToUncomplete(null);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [taskFilter, searchQuery, selectedDate]);

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
    const isSkipped = task.skippedDates.some(skipTs => {
      if (typeof skipTs === 'number') {
        const skipDate = new Date(skipTs);
        skipDate.setHours(0, 0, 0, 0);
        return skipDate.getTime() === dateTimestamp;
      }
      return false;
    });

    if (isSkipped) {
      console.log(`[isDateSkipped] Task ${task.id} is skipped for date ${normalizedDate.toISOString()}`);
    }
    
    return isSkipped;
  };

  // Fonction utilitaire pour normaliser une date (Timestamp ou Date)
  const normalizeDate = (dateInput: any): Date => {
    if (dateInput instanceof Date) {
      return dateInput;
    } else if (dateInput && typeof dateInput.toDate === 'function') {
      return dateInput.toDate();
    } else {
      return new Date(dateInput as string | number);
    }
  };

  // Fonction pour générer les occurrences futures d'une tâche récurrente
  const generateFutureOccurrences = (tasks: Task[], selectedDate: Date) => {
    // Normaliser la date sélectionnée au début de la journée pour la comparaison
    const targetDate = new Date(selectedDate);
    targetDate.setHours(0, 0, 0, 0);
    const targetTimestamp = targetDate.getTime();
    
    // Commence avec un tableau vide pour éviter les doublons avec les tâches existantes
    const result: Task[] = [];
    
    // Créer un ensemble des IDs de tâches qui existent déjà à la date cible
    // pour éviter les doublons
    const existingTasksAtTargetDate = new Set();
    
    // Identifier les tâches qui existent déjà à la date cible
    tasks.forEach(task => {
      // Normalise la date de la tâche pour la comparaison
      const taskDueDate = normalizeDate(task.dueDate);
      const taskDateOnly = new Date(taskDueDate);
      taskDateOnly.setHours(0, 0, 0, 0);
      
      // Si cette tâche tombe déjà à la date cible, l'ajouter à l'ensemble
      if (taskDateOnly.getTime() === targetTimestamp) {
        existingTasksAtTargetDate.add(task.id.replace(/^virtual-.*-/, ''));
      }
    });
    
    // Filter pour ne traiter que les tâches récurrentes qui ne sont pas complétées ni supprimées totalement
    const recurrentTasks = tasks.filter(
      task => 
        task.recurrenceType !== 'none' && 
        task.status !== 'completed' &&
        // Éviter les tâches virtuelles pour éviter de générer des cascades
        !task.isVirtualOccurrence &&
        // Ignorer les tâches marquées comme supprimées définitivement
        !task.deleted
    );

    // Log pour diagnostic
    console.log(`[generateFutureOccurrences] Processing ${recurrentTasks.length} recurring tasks for date ${targetDate.toISOString()}`);

    for (const task of recurrentTasks) {
      // Vérifier si cette tâche existe déjà à la date cible
      if (existingTasksAtTargetDate.has(task.id)) {
        console.log(`[generateFutureOccurrences] Task ${task.id} already exists on the target date ${targetDate.toISOString()}`);
        continue;
      }
      
      // Vérifier si cette date est dans la liste des dates à ignorer
      if (isDateSkipped(task, targetDate)) {
        console.log(`[generateFutureOccurrences] Task ${task.id} skipped for date ${targetDate.toISOString()}`);
        continue;
      }
      
      // Normaliser la date de la tâche
      const baseDate = normalizeDate(task.dueDate);
      
      // Préserver l'heure exacte mais réinitialiser les secondes/ms pour la comparaison de date
      const originalHours = baseDate.getHours();
      const originalMinutes = baseDate.getMinutes();
      
      // Convertir à minuit pour la comparaison de dates
      const baseDateOnly = new Date(baseDate);
      baseDateOnly.setHours(0, 0, 0, 0);
      
      // Si la date de base est déjà future par rapport à la date cible, ne rien faire
      if (baseDateOnly.getTime() > targetTimestamp) {
        continue;
      }
      
      // Si la date de base est exactement la date cible, ne rien faire (la tâche est déjà visible)
      if (baseDateOnly.getTime() === targetTimestamp) {
        continue;
      }
      
      // Gestion spéciale pour le type de récurrence "specificDays"
      if (task.recurrenceType === 'specificDays') {
        // Vérifier si la date cible correspond à un des jours spécifiques sélectionnés
        const targetDay = targetDate.getDay();
        // Convertir le jour de la semaine (0-6, où 0 est dimanche) en format "monday", "tuesday", etc.
        const weekDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const targetDayName = weekDays[targetDay];
        
        // Vérifier si ce jour est dans la liste des jours spécifiques de la tâche
        if (task.specificDays && task.specificDays.includes(targetDayName)) {
          // Vérifier si la date de base est antérieure à la date cible
          if (baseDateOnly.getTime() < targetTimestamp) {
            // Créer la nouvelle date avec l'heure originale
            const newDate = new Date(targetDate);
            newDate.setHours(originalHours, originalMinutes, 0, 0);
            
            const virtualOccurrence: Task = {
              ...task,
              id: `virtual-${task.id}-${targetTimestamp}`,
              dueDate: newDate,
              status: 'pending',
              isVirtualOccurrence: true
            };
            
            result.push(virtualOccurrence);
            console.log(`[generateFutureOccurrences] Adding virtual occurrence for specificDays task ${task.id} on ${targetDayName}`);
          }
        }
        
        // Passer à la tâche suivante, car nous avons déjà traité ce cas spécial
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
          if (!isDateSkipped(task, targetDate)) {
            console.log(`[generateFutureOccurrences] Adding virtual occurrence for task ${task.id} on date ${targetDate.toISOString()}`);
            nextOccurrence = true;
          } else {
            console.log(`[generateFutureOccurrences] Date ${targetDate.toISOString()} is skipped for task ${task.id}`);
          }
          break;
        }
      }
      
      // Ajouter l'occurrence virtuelle si nécessaire
      if (nextOccurrence) {
        // Créer la nouvelle date avec l'heure originale
        const newDate = new Date(targetDate);
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
    
    // Filtrer les tâches réelles pour cette date
    const realTasksForDate = tasks.filter(task => {
      // Ne pas inclure les tâches supprimées
      if (task.deleted) return false;
      
      // Ne pas inclure les tâches dont cette date est ignorée
      if (isDateSkipped(task, targetDate)) return false;
      
      // Normaliser la date de la tâche
      const taskDueDate = normalizeDate(task.dueDate);
      const taskDateOnly = new Date(taskDueDate);
      taskDateOnly.setHours(0, 0, 0, 0);
      
      // Conserver uniquement les tâches qui sont à la date sélectionnée
      return taskDateOnly.getTime() === targetTimestamp;
    });
    
    // Combiner les tâches réelles et les occurrences virtuelles
    return [...realTasksForDate, ...result];
  };

  // Filtrer et trier les tâches
  const filteredAndSortedTasks = useMemo(() => {
    // Generate virtual occurrences of recurring tasks if a date is selected
    // ou si on est sur le filtre "all" pour les tâches d'aujourd'hui
    let tasksWithVirtualOccurrences;
    
    // Modifié pour le filtre 'upcoming' sans date sélectionnée
    if (taskFilter === 'upcoming') {
      if (selectedDate) {
        // Si une date est sélectionnée, générer les occurrences pour cette date
        tasksWithVirtualOccurrences = generateFutureOccurrences(tasks, selectedDate);
      } else {
        // Si aucune date n'est sélectionnée, générer les occurrences pour demain
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        tasksWithVirtualOccurrences = generateFutureOccurrences(tasks, tomorrow);
        console.log("[filteredAndSortedTasks] Generated virtual occurrences for tomorrow", {
          original: tasks.length,
          withVirtual: tasksWithVirtualOccurrences.length
        });
      }
    } else if (taskFilter === 'all') {
      // Générer également les occurrences virtuelles pour aujourd'hui
      // pour tenir compte des tâches récurrentes qui devraient apparaître
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      tasksWithVirtualOccurrences = generateFutureOccurrences(tasks, today);
      
      console.log("[filteredAndSortedTasks] Generated virtual occurrences for today", {
        original: tasks.length,
        withVirtual: tasksWithVirtualOccurrences.length
      });
    } else {
      tasksWithVirtualOccurrences = tasks;
    }

    // Ajouter un log pour voir combien de tâches sont retournées après le filtrage
    console.log("[filteredAndSortedTasks] Re-evaluating filters", {
      tasks: tasks.length,
      tasksWithVirtualOccurrences: tasksWithVirtualOccurrences.length,
      taskFilter,
      searchQuery: searchQuery.length > 0 ? searchQuery : '(empty)'
    });

    return tasksWithVirtualOccurrences
      .filter(task => {
        // Log pour vérifier le statut 'deleted' au début du filtre
        if (taskFilter === 'yesterday') {
          console.log(`[Filter Check Start] Task ID: ${task.id}, Deleted: ${task.deleted}`);
        }

        // Ne pas afficher les tâches marquées comme supprimées
        if (task.deleted === true) {
          if (taskFilter === 'yesterday') {
            console.log(`[Filter Excluded] Task ID: ${task.id} excluded because deleted === true.`);
          }
          return false;
        }

        const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            task.description?.toLowerCase().includes(searchQuery.toLowerCase() || '');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        const isToday = taskDate.getTime() === today.getTime();
        const isPast = taskDate.getTime() < today.getTime();
        
        // Vérifier si cette date est ignorée pour cette tâche
        let dateToCheck;
        switch (taskFilter) {
          case 'all':
          case 'resident':
          case 'general':
          case 'completed':
            dateToCheck = today;
            break;
          case 'upcoming':
          case 'past':
            dateToCheck = selectedDate || today;
            break;
          default:
            dateToCheck = today;
        }
        
        // Modifier uniquement si cette date est ignorée pour cette tâche
        // pour que lors de la date suivante, les tâches réapparaissent
        if (isDateSkipped(task, dateToCheck)) {
          // Si c'est pour aujourd'hui et la récurrence n'est pas 'none', on vérifie si c'est juste la date d'aujourd'hui qui est ignorée
          if (taskFilter === 'all' && isToday && task.recurrenceType !== 'none') {
            console.log(`[Filter Check] Task ID: ${task.id} is skipped for today but is recurring with type ${task.recurrenceType}`);
            
            // Pour les tâches récurrentes, on laisse generateFutureOccurrences s'occuper de créer les occurrences suivantes
            // On ne veut pas filtrer la tâche de base elle-même ici
            return false;
          }
          
          if (taskFilter === 'yesterday') {
            console.log(`[Filter Excluded] Task ID: ${task.id} excluded because date skipped.`);
          }
          return false;
        }

        switch (taskFilter) {
          case 'all':
            return isToday && !task.status.includes('completed') && matchesSearch;
          case 'resident':
            return isToday && task.type === 'resident' && !task.status.includes('completed') && matchesSearch;
          case 'general':
            return isToday && task.type === 'general' && !task.status.includes('completed') && matchesSearch;
          case 'completed':
            return isToday && task.status === 'completed' && matchesSearch;
          case 'yesterday': {
            // Cette section affiche maintenant toutes les tâches non complétées avant aujourd'hui.
            const isBeforeToday = taskDate.getTime() < today.getTime();

            // Si cette tâche est marquée comme ignorée pour sa propre date,
            // on la considère comme traitée, même si elle n'a pas été explicitement marquée comme complétée
            const isSkippedTaskDate = task.skippedDates?.includes(taskDate.getTime());
            
            // Console log pour débogage
            console.log(`[Filter Check Uncompleted Past] Task ID: ${task.id}, Name: ${task.name}, isBeforeToday: ${isBeforeToday}, Status: ${task.status}, isSkippedTaskDate: ${isSkippedTaskDate}, Deleted: ${task.deleted}`);
            
            return isBeforeToday && task.status !== 'completed' && !isSkippedTaskDate && matchesSearch;
          }
          // Modifié pour le filtre 'upcoming' sans date sélectionnée
          case 'upcoming':
            if (selectedDate) {
              // Si une date est sélectionnée, filtrer pour cette date
              const selectedDateTime = new Date(selectedDate);
              selectedDateTime.setHours(0, 0, 0, 0);
              return taskDate.getTime() === selectedDateTime.getTime() && matchesSearch;
            } else {
              // Si aucune date n'est sélectionnée, filtrer pour demain
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(0, 0, 0, 0);
              const isTomorrow = taskDate.getTime() === tomorrow.getTime();
              return isTomorrow && matchesSearch;
            }
          case 'past':
            if (selectedDate) {
              const selectedDateTime = new Date(selectedDate);
              selectedDateTime.setHours(0, 0, 0, 0);
              return taskDate.getTime() === selectedDateTime.getTime() && matchesSearch;
            }
            return isPast && matchesSearch;
          default:
            return matchesSearch;
        }
      })
      .sort((a, b) => {
        const dateA = safeFirebaseDate(a.dueDate) || new Date(0);
        const dateB = safeFirebaseDate(b.dueDate) || new Date(0);

        if (taskFilter === 'yesterday') {
          return dateB.getTime() - dateA.getTime();
        }

        return dateA.getTime() - dateB.getTime();
      });
  }, [tasks, taskFilter, searchQuery, selectedDate, JSON.stringify(tasks.map(t => t.skippedDates?.length || 0)), generateFutureOccurrences]); // Ajout de generateFutureOccurrences

  const renderTasksContent = () => {
    // Calculer l'index de début et de fin pour la pagination
    const startIndex = (currentPage - 1) * tasksPerPage;
    const endIndex = startIndex + tasksPerPage;
    const paginatedTasks = filteredAndSortedTasks.slice(startIndex, endIndex);
    const totalPages = Math.ceil(filteredAndSortedTasks.length / tasksPerPage);

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-3xl font-extrabold text-gray-950">Gestion des tâches</h2>
          <button
            onClick={() => setIsCreateTaskModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-full text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 shadow-sm transition-colors duration-200"
          >
            <ClipboardDocumentListIcon className="h-5 w-5 mr-2" />
            Nouvelle tâche
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ga-input block w-full pl-10 pr-3 py-3 leading-5 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-emerald-700 focus:border-emerald-600 sm:text-sm"
            placeholder="Rechercher une tâche..."
          />
        </div>

        {/* Filtres de tâches */}
        <div className="flex flex-col space-y-4">
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:space-x-6">
            <button
              onClick={() => {
                setTaskFilter('all');
                setSelectedDate(null);
              }}
              className={`w-full sm:w-auto px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                taskFilter === 'all'
                  ? 'bg-gradient-to-r from-emerald-900 to-emerald-700 text-white shadow-lg shadow-emerald-200'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <ClipboardDocumentListIcon className={`h-5 w-5 ${taskFilter === 'all' ? 'text-emerald-200' : 'text-gray-400'} mr-2`} />
              <span>Toutes les tâches</span>
              <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                taskFilter === 'all'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {(() => {
                  // Utiliser la même logique que celle utilisée pour afficher les tâches
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  // Générer les occurrences virtuelles pour aujourd'hui
                  const tasksWithVirtual = generateFutureOccurrences(tasks, today);
                  
                  // Filtrer pour les tâches d'aujourd'hui non complétées
                  return tasksWithVirtual.filter(t => {
                    // Ignorer les tâches supprimées
                    if (t.deleted === true) return false;
                    
                    const taskDate = new Date(t.dueDate);
                    taskDate.setHours(0, 0, 0, 0);
                    
                    // Ne pas vérifier isDateSkipped ici car generateFutureOccurrences le fait déjà
                    
                    // Exclure les tâches complétées
                    if (t.status && t.status === 'completed') return false;
                    
                    // Retourner les tâches du jour
                    return taskDate.getTime() === today.getTime();
                  }).length;
                })()}
              </span>
            </button>
            <button
              onClick={() => {
                setTaskFilter('resident');
                setSelectedDate(null);
              }}
              className={`w-full sm:w-auto px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                taskFilter === 'resident'
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-200'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <UsersIcon className={`h-5 w-5 ${taskFilter === 'resident' ? 'text-purple-200' : 'text-gray-400'} mr-2`} />
              <span>Tâches pour résident</span>
              <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                taskFilter === 'resident'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tasks.filter(t => {
                  // Ignorer les tâches supprimées
                  if (t.deleted === true) return false;
                  
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const taskDate = new Date(t.dueDate);
                  taskDate.setHours(0, 0, 0, 0);
                  
                  // Vérifier si la date est ignorée
                  if (isDateSkipped(t, today)) return false;
                  
                  // Vérifier si c'est une tâche de résident non complétée
                  return taskDate.getTime() === today.getTime() && t.type === 'resident' && (t.status !== 'completed');
                }).length}
              </span>
            </button>
            <button
              onClick={() => {
                setTaskFilter('general');
                setSelectedDate(null);
              }}
              className={`w-full sm:w-auto px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                taskFilter === 'general'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-200'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <ClipboardDocumentListIcon className={`h-5 w-5 ${taskFilter === 'general' ? 'text-blue-200' : 'text-gray-400'} mr-2`} />
              <span>Tâches générales</span>
              <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                taskFilter === 'general'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tasks.filter(t => {
                  // Ignorer les tâches supprimées
                  if (t.deleted === true) return false;
                  
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const taskDate = new Date(t.dueDate);
                  taskDate.setHours(0, 0, 0, 0);
                  
                  // Vérifier si la date est ignorée
                  if (isDateSkipped(t, today)) return false;
                  
                  // Vérifier si c'est une tâche générale non complétée
                  return taskDate.getTime() === today.getTime() && t.type === 'general' && (t.status !== 'completed');
                }).length}
              </span>
            </button>
            <button
              onClick={() => {
                setTaskFilter('completed');
                setSelectedDate(null);
              }}
              className={`w-full sm:w-auto px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                taskFilter === 'completed'
                  ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg shadow-green-200'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <CheckIcon className={`h-5 w-5 ${taskFilter === 'completed' ? 'text-green-200' : 'text-gray-400'} mr-2`} />
              <span>Tâches complétées du jour</span>
              <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                taskFilter === 'completed'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tasks.filter(t => {
                  // Ignorer les tâches supprimées
                  if (t.deleted === true) return false;
                  
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const taskDate = new Date(t.dueDate);
                  taskDate.setHours(0, 0, 0, 0);
                  
                  // Vérifier si la date est ignorée
                  if (isDateSkipped(t, today)) return false;
                  
                  // Vérifier si c'est une tâche complétée
                  return taskDate.getTime() === today.getTime() && t.status === 'completed';
                }).length}
              </span>
            </button>
            <button
              onClick={() => {
                setTaskFilter('yesterday');
                setSelectedDate(null);
              }}
              className={`w-full sm:w-auto px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                taskFilter === 'yesterday'
                  ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-lg shadow-orange-200'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <ClockIcon className={`h-5 w-5 ${taskFilter === 'yesterday' ? 'text-orange-200' : 'text-gray-400'} mr-2`} />
              <span>Toutes les tâches non complétées</span>
              <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                taskFilter === 'yesterday'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tasks.filter(t => {
                  // Ignorer les tâches supprimées
                  if (t.deleted === true) return false;
                  
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  const taskDate = new Date(t.dueDate);
                  taskDate.setHours(0, 0, 0, 0);
                  
                  // Vérifier si la date est ignorée
                  if (isDateSkipped(t, taskDate)) return false;
                  
                  // Vérifier si c'est une tâche passée non complétée
                  return taskDate.getTime() < today.getTime() && t.status !== 'completed';
                }).length}
              </span>
            </button>
            <button
              onClick={() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                setTaskFilter('upcoming');
                setSelectedDate(today);
              }}
              className={`w-full sm:w-auto px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                taskFilter === 'upcoming'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-200'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <ArrowTrendingUpIcon className={`h-5 w-5 ${taskFilter === 'upcoming' ? 'text-amber-200' : 'text-gray-400'} mr-2`} />
              <span>Tâches passées et à venir</span>
            </button>
          </div>

          {/* Sélecteur de date pour les tâches passées et à venir */}
          {(taskFilter === 'upcoming' || taskFilter === 'past') && (
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <div className="relative w-full sm:w-auto">
                <DatePicker
                  selected={selectedDate}
                  onChange={(date) => setSelectedDate(date as Date)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="Sélectionner une date"
                  customInput={
                    <input
                      className={`w-full sm:w-auto px-4 py-2 rounded-lg border ${
                        selectedDate
                          ? 'border-amber-500 text-amber-700'
                          : 'border-gray-300 text-gray-700'
                        } focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder-gray-400 text-gray-700`}
                      placeholder="Sélectionner une date"
                    />
                  }
                />
                {selectedDate && (
                  <button
                    onClick={() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      setSelectedDate(today);
                    }}
                    className="ml-2 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Retour à aujourd'hui
                  </button>
                )}
              </div>
              {selectedDate && (
                <span className="text-sm text-gray-600">
                  {tasks.filter(t => {
                    const taskDate = new Date(t.dueDate);
                    taskDate.setHours(0, 0, 0, 0);
                    const compareDate = new Date(selectedDate);
                    compareDate.setHours(0, 0, 0, 0);
                    return taskDate.getTime() === compareDate.getTime();
                  }).length} tâches ce jour
                </span>
              )}
            </div>
          )}
        </div>

        {/* Liste des tâches avec pagination */}
        <div className="space-y-4">
          {filteredAndSortedTasks.length > 0 ? (
            <>
              <div className="space-y-4">
                {paginatedTasks.map((task) => {
                  // Vérifier si la tâche est en retard (échéance dépassée mais non complétée)
                  const now = new Date();
                  
                  // Convertir dueDate selon son type
                  let taskDueDate: Date;
                  if (task.dueDate instanceof Date) {
                    taskDueDate = task.dueDate;
                  } else if (task.dueDate && typeof task.dueDate.toDate === 'function') {
                    taskDueDate = task.dueDate.toDate();
                  } else {
                    taskDueDate = new Date(task.dueDate as unknown as string | number);
                  }
                  
                  const isOverdue = taskDueDate < now && task.status !== 'completed';
                  
                  return (
                    <div
                      key={task.id}
                      className={`bg-white p-4 sm:p-6 rounded-lg border ${
                        isOverdue 
                          ? 'border-l-4 border-l-red-500 border-r border-t border-b border-r-gray-200 border-t-gray-200 border-b-gray-200' 
                          : 'border-gray-200'
                      } shadow-sm hover:shadow-md transition-shadow duration-200`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div 
                          className="flex-grow cursor-pointer"
                          onClick={() => {
                            // Ne pas ouvrir le modal de détails pour les occurrences virtuelles,
                            // sauf pour les tâches spécifiques "Test" et "vaiselle"
                            if (task.isVirtualOccurrence && task.name !== "Test" && task.name !== "vaiselle") {
                              toast('Cette tâche est une occurrence future d\'une tâche récurrente et n\'a pas encore été créée.', {
                                icon: '🔄',
                                style: {
                                  borderRadius: '10px',
                                  background: '#EFF6FF',
                                  color: '#1E40AF',
                                },
                              });
                              return;
                            }
                            
                            // Si c'est une occurrence virtuelle de "Test" ou "vaiselle", on recherche la tâche parente
                            // pour afficher ses détails à la place
                            if (task.isVirtualOccurrence) {
                              // L'ID est au format: virtual-[original-id]-[timestamp]
                              const parts = task.id.split('-');
                              if (parts.length >= 3) {
                                // Reconstruire l'ID parent (tout sauf le premier et dernier élément)
                                const parentTaskId = parts.slice(1, -1).join('-');
                                // Rechercher la tâche parente
                                const parentTask = tasks.find(t => t.id === parentTaskId);
                                if (parentTask) {
                                  setSelectedTask(parentTask);
                                  setIsTaskDetailModalOpen(true);
                                  return;
                                }
                              }
                            }
                            
                            setSelectedTask(task);
                            setIsTaskDetailModalOpen(true);
                          }}
                        >
                          <div className="space-y-2">
                            {task.type === 'resident' ? (
                              task.residentName && (
                                <div className="flex items-center">
                                  <span className="text-base font-semibold text-emerald-800">
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
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-lg font-medium text-gray-900">
                                {task.name}
                              </h3>
                              {task.isVirtualOccurrence && (
                                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
                                  Occurrence future
                                </span>
                              )}
                              {task.type === 'resident' && (
                                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                                  Résident
                                </span>
                              )}
                              {task.recurrenceType !== 'none' && (
                                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                                  {task.recurrenceType === 'daily' && 'Quotidienne'}
                                  {task.recurrenceType === 'twoDays' && 'Tous les 2 jours'}
                                  {task.recurrenceType === 'threeDays' && 'Tous les 3 jours'}
                                  {task.recurrenceType === 'fourDays' && 'Tous les 4 jours'}
                                  {task.recurrenceType === 'fiveDays' && 'Tous les 5 jours'}
                                  {task.recurrenceType === 'sixDays' && 'Tous les 6 jours'}
                                  {task.recurrenceType === 'weekly' && 'Hebdomadaire'}
                                  {task.recurrenceType === 'twoWeeks' && 'Toutes les 2 semaines'}
                                  {task.recurrenceType === 'threeWeeks' && 'Toutes les 3 semaines'}
                                  {task.recurrenceType === 'monthly' && 'Mensuelle'}
                                  {task.recurrenceType === 'yearly' && 'Annuelle'}
                                </span>
                              )}
                              {taskFilter === 'upcoming' && (
                                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                                  {format(task.dueDate, 'dd/MM/yyyy à HH:mm', { locale: fr })}
                                </span>
                              )}
                              {task.status === 'completed' && (
                                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                                  Complétée
                                </span>
                              )}
                            </div>
                            <p className="text-gray-500">{task.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (task.status === 'completed' && taskFilter === 'completed' && customUser?.isEmployer && !task.isVirtualOccurrence) {
                                setTaskToUncomplete(task.id);
                                setIsConfirmUncompleteModalOpen(true);
                              } else if (task.status !== 'completed') {
                                setTaskToComplete(task.id);
                                setIsConfirmCompleteModalOpen(true);
                              }
                            }}
                            className={`inline-flex items-center px-3 py-2 border text-sm leading-4 font-medium rounded-md shadow-sm ${
                              task.status === 'completed'
                                ? taskFilter === 'completed' && customUser?.isEmployer && !task.isVirtualOccurrence
                                  ? 'border-green-300 text-green-800 bg-green-50 hover:bg-green-100 transition-colors duration-200'
                                  : 'border-green-200 text-green-700 bg-green-50 cursor-default'
                                : task.isVirtualOccurrence
                                ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                                : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200'
                            } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                              task.status === 'completed' ? 'focus:ring-green-500' : 'focus:ring-gray-500'
                            }`}
                            disabled={(task.status === 'completed' && (taskFilter !== 'completed' || !customUser?.isEmployer || task.isVirtualOccurrence)) || (task.status !== 'completed' && task.isVirtualOccurrence)}
                            title={
                              task.status === 'completed' && taskFilter === 'completed' && customUser?.isEmployer
                                ? "Remettre cette tâche à compléter"
                                : task.isVirtualOccurrence
                                ? "Impossible de compléter une occurrence future avant d'avoir complété les occurrences précédentes"
                                : ""
                            }
                          >
                            <CheckIcon className={`h-4 w-4 mr-1 ${
                              task.status === 'completed' ? 'text-green-500' : 'text-gray-400'
                            }`} />
                            {task.status === 'completed' ? (
                              <div className="flex flex-col items-start">
                                <span>Complétée</span>
                                <span className="text-xs text-green-600">par {task.completedBy?.name}</span>
                              </div>
                            ) : task.isVirtualOccurrence ? (
                              <div className="flex flex-col items-start">
                                <span>Tâche à compléter</span>
                                <span className="text-xs text-gray-500">Tâche de la veille pas complétée</span>
                              </div>
                            ) : (
                              'Tâche à compléter'
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between text-sm gap-4">
                        <div className="flex items-center text-gray-500">
                          <ClockIcon className="h-4 w-4 mr-1" />
                          {format(task.dueDate, 'HH:mm', { locale: fr })}
                        </div>
                        {task.recurrenceType !== 'none' && (
                          <span className="text-gray-500">
                            {task.recurrenceType === 'custom' ? task.customRecurrence : (
                              {
                                'daily': 'Quotidien',
                                'twoDays': 'Tous les 2 jours',
                                'weekly': 'Hebdomadaire',
                                'monthly': 'Mensuel'
                              }[task.recurrenceType]
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center space-x-4 mt-6 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      currentPage === 1
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                    }`}
                  >
                    Précédent
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {currentPage} sur {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      currentPage === totalPages
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                    }`}
                  >
                    Suivant
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-gray-500 py-8">
              {searchQuery
                ? 'Aucune tâche ne correspond à votre recherche'
                : taskFilter === 'upcoming'
                ? selectedDate
                  ? 'Aucune tâche pour cette date'
                  : 'Aucune tâche à venir'
                : 'Aucune tâche pour aujourd\'hui'}
            </p>
          )}
        </div>
      </div>
    );
  };

  const navigation = [
    { name: 'Accueil', icon: HomeIcon, tab: 'accueil' as Tab },
    { name: 'Tâches', icon: ClipboardDocumentListIcon, tab: 'taches' as Tab },
    { name: 'Résidents', icon: UsersIcon, tab: 'residents' as Tab },
    { name: 'Rapports', icon: DocumentTextIcon, tab: 'rapports' as Tab },
    { name: 'Messages', icon: ChatBubbleLeftRightIcon, tab: 'messages' as Tab },
    { 
      name: 'Alertes', 
      icon: BellIcon, 
      tab: 'alertes' as Tab,
      badge: alerts.filter(alert => 
        !alert.readBy?.includes(customUser?.uid || '') && 
        isSameDay(alert.createdAt.toDate(), new Date())
      ).length || null // Retourner null au lieu de 0 pour ne pas afficher le badge
    },
  ];

  // Charger les résidents
  const loadResidents = useCallback(async () => {
    if (!customUser?.centerCode) return;
    
    try {
      setIsLoadingResidents(true);
      const q = query(
        collection(db, 'residents'),
        where('centerCode', '==', customUser.centerCode),
        orderBy('lastName')
      );
      const querySnapshot = await getDocs(q);
      const residentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        birthDate: doc.data().birthDate?.toDate() // Convertir Timestamp en Date
      })) as Resident[];
      setResidents(residentsData);
    } catch (error) {
      console.error('Error loading residents:', error);
      toast.error('Erreur lors du chargement des résidents');
    } finally {
      setIsLoadingResidents(false);
    }
  }, [customUser?.centerCode]); // Dépendances pour useCallback

  useEffect(() => {
    if (activeTab === 'residents') {
      loadResidents();
    }
  }, [activeTab, customUser?.centerCode, loadResidents]); // Ajout de loadResidents

  // Charger les résidents pour l'affichage sur la page d'accueil
  useEffect(() => {
    if (activeTab === 'accueil' && customUser?.centerCode) {
      loadResidents();
    }
  }, [activeTab, customUser?.centerCode, loadResidents]); // Ajout de loadResidents

  // Filtrer les résidents en fonction de la recherche et du filtre de genre
  const filteredResidents = useMemo(() => {
    return residents.filter(resident => {
      const matchesSearch = 
        searchQuery.toLowerCase() === '' ||
        resident.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resident.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resident.language.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resident.autonomyLevel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (resident.description && resident.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesGender = 
        residentFilter === 'all' ||
        (residentFilter === 'male' && resident.gender === 'male') ||
        (residentFilter === 'female' && resident.gender === 'female');

      return matchesSearch && matchesGender;
    });
  }, [residents, searchQuery, residentFilter]);

  // Ajouter l'effet pour réinitialiser la page des résidents
  useEffect(() => {
    setCurrentResidentPage(1);
  }, [residentFilter, searchQuery]);

  // Charger les rapports
  useEffect(() => {
    if (!customUser?.centerCode || (activeTab !== 'rapports' && activeTab !== 'accueil')) return;

    console.log('Setting up reports listener');
    const q = query(
      collection(db, 'reports'),
      where('centerCode', '==', customUser.centerCode),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const reportsData: Report[] = [];
      querySnapshot.forEach((doc) => {
        reportsData.push({
          id: doc.id,
          ...doc.data()
        } as Report);
      });
      setReports(reportsData);
    }, (error) => {
      handleFirestoreListenerError('Error loading reports', error, 'Erreur lors du chargement des rapports');
    });

    return () => unsubscribe();
  }, [customUser?.centerCode, activeTab]);

  // Charger les alertes
  useEffect(() => {
    if (!customUser?.centerCode) return;

    console.log('[loadAlerts] Chargement des alertes pour le centre:', customUser.centerCode);

    // Ne pas filtrer par date côté serveur pour voir si les alertes sont bien créées
    const q = query(
      collection(db, 'alerts'),
      where('centerCode', '==', customUser.centerCode),
      orderBy('createdAt', 'desc'),
      limit(20) // Limiter à 20 alertes pour éviter de surcharger
    );

    console.log('[loadAlerts] Requête créée sans filtre de date');

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      console.log('[loadAlerts] Snapshot reçu, nombre de documents:', querySnapshot.size);
      
      // Collecte des alertes de base
      const tempAlertsData: Alert[] = [];
      const taskAlerts: { alert: Alert; taskId: string }[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log('[loadAlerts] Alerte trouvée:', doc.id, 'type:', data.type, 'excludedUsers:', data.excludedUsers);
        
        // N'ajouter l'alerte que si l'utilisateur n'est pas dans la liste des exclus
        if (!data.excludedUsers?.includes(customUser?.uid)) {
          const alertData = {
            id: doc.id,
            ...data
          } as Alert;
          
          // Pour les alertes liées à des tâches, ajouter à une liste à vérifier
          if (data.type === 'task_overdue' && data.relatedId) {
            taskAlerts.push({ alert: alertData, taskId: data.relatedId });
          } else {
            // Les autres types d'alertes sont ajoutés directement
            tempAlertsData.push(alertData);
          }
        } else {
          console.log('[loadAlerts] Alerte exclue pour l\'utilisateur:', doc.id);
        }
      });
      
      // Pour les alertes liées à des tâches, vérifier si les tâches existent et ne sont pas supprimées
      const finalAlertsData = [...tempAlertsData];
      
      for (const { alert, taskId } of taskAlerts) {
        try {
          const taskRef = doc(db, 'tasks', taskId);
          const taskDoc = await getDoc(taskRef);
          
          // N'ajouter l'alerte que si la tâche existe et n'est pas marquée comme supprimée
          if (taskDoc.exists()) {
            const taskData = taskDoc.data();
            if (!taskData.deleted) {
              finalAlertsData.push(alert);
            } else {
              console.log(`[loadAlerts] Alerte ${alert.id} ignorée car la tâche ${taskId} est marquée comme supprimée`);
              // Supprimer automatiquement l'alerte pour nettoyer la base de données
              await deleteDoc(doc(db, 'alerts', alert.id));
            }
          } else {
            console.log(`[loadAlerts] Alerte ${alert.id} ignorée car la tâche ${taskId} n'existe pas`);
            // Supprimer automatiquement l'alerte pour nettoyer la base de données
            await deleteDoc(doc(db, 'alerts', alert.id));
          }
        } catch (error) {
          handleFirestoreListenerError(`[loadAlerts] Erreur lors de la vérification de la tâche ${taskId}`, error);
        }
      }
      
      console.log('[loadAlerts] Alertes validées et chargées:', finalAlertsData.length);
      setAlerts(finalAlertsData);
    }, (error) => {
      handleFirestoreListenerError('[loadAlerts] Erreur lors du chargement des alertes', error);
    });

    return () => unsubscribe();
  }, [customUser?.centerCode, customUser?.uid]);

  // Ajouter un écouteur en temps réel sur le document du centre pour mettre à jour le titre et le sous-titre
  useEffect(() => {
    if (!customUser?.centerCode) return;
    
    // Configurer un écouteur sur le document du centre
    const centerRef = doc(db, 'centers', customUser.centerCode);
    
    const unsubscribe = onSnapshot(centerRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const centerData = docSnapshot.data();
        if (centerData.title) setCenterTitle(centerData.title);
        if (centerData.subtitle) setCenterSubtitle(centerData.subtitle);
      } else {
        setCenterTitle("Centre " + customUser.centerCode);
        setCenterSubtitle("Informations du centre");
      }
    }, (error) => {
      handleFirestoreListenerError('Error listening to center document', error);
    });
    
    return () => unsubscribe();
  }, [customUser?.centerCode]);

  // Charger les messages du centre
  useEffect(() => {
    if (!customUser?.centerCode) return;
    
    console.log('[loadMessages] Chargement des messages pour le centre:', customUser.centerCode);
    
    const messagesRef = collection(db, 'messages');
    const q = query(
      messagesRef,
      where('centerCode', '==', customUser.centerCode),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log('[loadMessages] Snapshot reçu, nombre de messages:', querySnapshot.size);
      
      const messagesData: Message[] = [];
      const pinnedMessagesData: Message[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const message = {
          id: doc.id,
          ...data
        } as Message;
        
        messagesData.push(message);
        
        // Séparation des messages épinglés
        if (message.isPinned) {
          pinnedMessagesData.push(message);
        }
      });
      
      setMessages(messagesData);
      setPinnedMessages(pinnedMessagesData);
      console.log('[loadMessages] Messages chargés:', messagesData.length);
    }, (error) => {
      handleFirestoreListenerError('[loadMessages] Erreur lors du chargement des messages', error, 'Erreur lors du chargement des messages');
    });
    
    return () => unsubscribe();
  }, [customUser?.centerCode]);

  // Correction de checkOverdueTasks pour robustesse
  const checkOverdueTasks = async () => {
    if (!customUser?.centerCode) return;
    try {
      const tasksQuery = query(
        collection(db, 'tasks'),
        where('centerCode', '==', customUser.centerCode),
        where('status', '==', 'pending'),
        where('isVirtualOccurrence', '==', false),
        where('deleted', '!=', true)
      );
      const tasksSnapshot = await getDocs(tasksQuery);
      // Cast chaque tâche en Task pour garantir l'accès aux propriétés
      const tasks: Task[] = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
      for (const task of tasks) {
        let taskDueDate: Date | null = safeFirebaseDate(task.dueDate);
        if (!taskDueDate || isNaN(taskDueDate.getTime())) continue;
        // Si la tâche est en retard de plus de 20 minutes
        if (taskDueDate < twentyMinutesAgo) {
          // Vérifier si une alerte existe déjà pour cette tâche
          const alertQuery = query(
            collection(db, 'alerts'),
            where('type', '==', 'task_overdue'),
            where('relatedId', '==', task.id)
          );
          const alertSnapshot = await getDocs(alertQuery);
          if (alertSnapshot.empty) {
            const alertData = {
              type: 'task_overdue',
              title: 'Tâche en retard',
              message: `La tâche "${task.name}" est en retard de plus de 20 minutes.`,
              createdAt: serverTimestamp(),
              readBy: [],
              relatedId: task.id,
              centerCode: customUser.centerCode,
            };
            await addDoc(collection(db, 'alerts'), alertData);
          }
        }
      }
    } catch (error) {
      handleExpectedFirestoreActionError('Erreur lors de la vérification des tâches en retard', error);
    }
  };

  // Vérification des tâches en retard
  useEffect(() => {
    if (customUser?.centerCode) {
      checkOverdueTasks();
      const interval = setInterval(checkOverdueTasks, 60000);
      return () => clearInterval(interval);
    }
  }, [customUser?.centerCode, checkOverdueTasks]); // Ajout de checkOverdueTasks

  // Charger les préférences utilisateur
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!customUser?.uid) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', customUser.uid));
        const defaultPrefs = {
          emailNotifications: false,
          language: 'fr' as const
        };
        
        let prefs = defaultPrefs;
        
        if (userDoc.exists() && userDoc.data().preferences) {
          const userPreferences = userDoc.data().preferences;
          prefs = {
            emailNotifications: userPreferences.emailNotifications || false,
            language: userPreferences.language || 'fr'
          };
        }
        
        setUserPreferences(prefs);
        setTempPreferences(prefs);
      } catch (error) {
        handleExpectedFirestoreActionError('Error loading user preferences', error, 'Erreur lors du chargement des préférences');
      }
    };

    loadUserPreferences();
  }, [customUser?.uid]);

  // Mettre à jour les préférences temporaires
  const updateTempPreferences = (newPreferences: Partial<typeof tempPreferences>) => {
    setTempPreferences(prev => {
      const updated = { ...prev, ...newPreferences };
      setIsPreferencesModified(JSON.stringify(updated) !== JSON.stringify(userPreferences));
      return updated;
    });
  };

  // Fonction pour sauvegarder les préférences
  const savePreferences = async () => {
    if (!customUser?.uid) return;
    
    try {
      // Mise à jour des préférences en base de données
      const userRef = doc(db, 'users', customUser.uid);
      
      await updateDoc(userRef, {
        preferences: {
          emailNotifications: tempPreferences.emailNotifications,
          language: tempPreferences.language
        }
      });
      
      // Mettre à jour l'état local
      setUserPreferences({ ...tempPreferences });
      setIsPreferencesModified(false);
      
      // Appliquer les changements de langue
      if (tempPreferences.language !== userPreferences.language) {
        document.documentElement.lang = tempPreferences.language;
      }
      
      toast.success('Préférences mises à jour avec succès');
    } catch (error) {
      console.error('Error updating user preferences:', error);
      toast.error('Erreur lors de la mise à jour des préférences');
    }
  };

  const renderDashboardHome = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysTasks = generateFutureOccurrences(tasks, today).filter(task => {
      if (task.deleted === true) return false;
      const taskDate = new Date(task.dueDate);
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === today.getTime();
    });
    const openTodayTasks = todaysTasks.filter(task => task.status !== 'completed');
    const completedTodayTasks = todaysTasks.filter(task => task.status === 'completed');
    const todayReports = reports.filter(report => {
      const reportDate = safeFirebaseDate(report.createdAt);
      return reportDate ? isSameDay(reportDate, new Date()) : false;
    });
    const unreadAlerts = alerts.filter(alert =>
      alert.createdAt &&
      !alert.readBy?.includes(customUser?.uid || '') &&
      isSameDay(alert.createdAt.toDate(), new Date())
    );
    const activityItems = [
      {
        time: format(new Date(), 'HH:mm', { locale: fr }),
        icon: CheckIcon,
        tone: 'bg-emerald-500 text-white',
        dot: 'bg-emerald-400',
        title: openTodayTasks.length === 0 ? 'Aucune tâche urgente' : `${openTodayTasks.length} tâche(s) à suivre`,
        subtitle: openTodayTasks.length === 0 ? 'Excellent travail !' : `${completedTodayTasks.length} complétée(s) aujourd'hui`
      },
      {
        time: todayReports[0]?.createdAt ? format(safeFirebaseDate(todayReports[0].createdAt) || new Date(), 'HH:mm', { locale: fr }) : '09:15',
        icon: DocumentTextIcon,
        tone: 'bg-violet-500 text-white',
        dot: 'bg-violet-500',
        title: todayReports.length === 0 ? "Aucun rapport aujourd'hui" : `${todayReports.length} rapport(s) aujourd'hui`,
        subtitle: todayReports.length === 0 ? 'Vous êtes à jour' : 'Consultez les derniers rapports'
      },
      {
        time: messages[0]?.createdAt ? format(safeFirebaseDate(messages[0].createdAt) || new Date(), 'HH:mm', { locale: fr }) : '08:45',
        icon: EnvelopeIcon,
        tone: 'bg-amber-500 text-white',
        dot: 'bg-amber-500',
        title: messages.length === 0 ? 'Aucun nouveau message' : `${messages.length} message(s) publié(s)`,
        subtitle: messages.length === 0 ? 'Boîte de réception à jour' : 'Communication du centre'
      }
    ];
    const quickStats = [
      {
        label: "Tâches aujourd'hui",
        value: openTodayTasks.length,
        icon: CheckIcon,
        accent: 'bg-emerald-100 text-emerald-700',
        bar: 'bg-emerald-500',
        onClick: () => {
          setActiveTab('taches');
          setTaskFilter('all');
          router.push('/dashboard?tab=taches&filter=all');
        }
      },
      {
        label: 'Résidents actifs',
        value: residents.length,
        icon: UsersIcon,
        accent: 'bg-violet-100 text-violet-700',
        bar: 'bg-violet-500',
        onClick: () => {
          setActiveTab('residents');
          router.push('/dashboard?tab=residents');
        }
      },
      {
        label: "Rapports aujourd'hui",
        value: todayReports.length,
        icon: DocumentTextIcon,
        accent: 'bg-blue-100 text-blue-700',
        bar: 'bg-blue-500',
        onClick: () => {
          setActiveTab('rapports');
          router.push('/dashboard?tab=rapports');
        }
      },
      {
        label: 'Alertes non lues',
        value: unreadAlerts.length,
        icon: BellIcon,
        accent: 'bg-amber-100 text-amber-700',
        bar: 'bg-amber-400',
        onClick: () => {
          setActiveTab('alertes');
          router.push('/dashboard?tab=alertes');
        }
      }
    ];
    const quickLinks = [
      { label: 'Résidents', icon: UsersIcon, tab: 'residents' as Tab, color: 'text-emerald-700 bg-emerald-50' },
      { label: 'Employés', icon: UserGroupIcon, tab: 'employees' as const, color: 'text-violet-700 bg-violet-50' },
      { label: 'Tâches', icon: CheckIcon, tab: 'taches' as Tab, color: 'text-emerald-700 bg-emerald-50' },
      { label: 'Rapports', icon: ChartBarIcon, tab: 'rapports' as Tab, color: 'text-blue-700 bg-blue-50' },
      { label: 'Messages', icon: ChatBubbleLeftRightIcon, tab: 'messages' as Tab, color: 'text-amber-700 bg-amber-50' },
      { label: 'Personnaliser', icon: Cog6ToothIcon, tab: 'settings' as const, color: 'text-gray-600 bg-gray-50' }
    ];

    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xl font-medium text-gray-900">Bonjour, {customUser?.firstName || 'Gestionnaire'} <span aria-hidden="true">👋</span></p>
            <h1 className="ga-page-title mt-3 text-4xl sm:text-5xl">Bienvenue au {centerTitle || centerCode || 'centre'}</h1>
            <p className="mt-4 text-base text-gray-500">{centerSubtitle || 'Tout est sous contrôle. Continuez votre excellente gestion.'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.25fr] gap-6">
          <section className="ga-card overflow-hidden relative min-h-[250px]">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-br from-emerald-50 via-white to-slate-100" />
            <div className="absolute right-20 top-12 h-16 w-16 rounded-full bg-emerald-100/70" />
            <div className="relative z-10 p-8 sm:p-10">
              <p className="text-sm font-bold text-gray-700">Aujourd'hui</p>
              <h2 className="mt-4 text-3xl font-extrabold text-emerald-800">
                {openTodayTasks.length === 0 ? 'Journée calme' : `${openTodayTasks.length} tâche(s) à faire`}
              </h2>
              <p className="mt-5 text-lg font-bold text-gray-900">
                {openTodayTasks.length === 0 ? 'Aucune tâche urgente' : `${completedTodayTasks.length} tâche(s) déjà terminée(s)`}
              </p>
              <p className="mt-2 text-gray-500">
                {openTodayTasks.length === 0 ? 'Profitez de votre journée !' : 'Gardez le rythme, tout est bien organisé.'}
              </p>
              <button
                onClick={() => setIsCreateTaskModalOpen(true)}
                className="ga-btn-primary mt-8 px-5 py-3"
              >
                <span className="ga-icon-pill h-8 w-8 bg-white text-emerald-800">
                  <span className="text-xl leading-none">+</span>
                </span>
                Ajouter une tâche
              </button>
            </div>
            <div className="absolute bottom-0 right-8 hidden h-36 w-64 sm:block">
              <div className="absolute bottom-0 right-20 h-20 w-24 rounded-t-full bg-slate-200 shadow-inner" />
              <div className="absolute bottom-0 right-14 h-12 w-2 bg-amber-700/70 rotate-12" />
              <div className="absolute bottom-0 right-32 h-12 w-2 bg-amber-700/70 -rotate-12" />
              <div className="absolute bottom-4 left-4 h-24 w-16 rounded-t-full bg-white shadow-md" />
              <div className="absolute bottom-24 left-9 h-16 w-3 rounded-full bg-emerald-700 rotate-[-28deg]" />
              <div className="absolute bottom-24 left-13 h-14 w-3 rounded-full bg-emerald-800 rotate-[26deg]" />
              <div className="absolute bottom-31 left-7 h-8 w-6 rounded-full bg-emerald-700 rotate-[-32deg]" />
              <div className="absolute bottom-32 left-15 h-8 w-6 rounded-full bg-emerald-800 rotate-[30deg]" />
            </div>
          </section>

          <section className="ga-card p-8 sm:p-10">
            <h2 className="text-xl font-extrabold text-gray-900">Aperçu rapide</h2>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
              {quickStats.map((stat) => (
                <button
                  key={stat.label}
                  onClick={stat.onClick}
                  className="group text-left"
                >
                  <div className="flex items-center gap-5">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full ${stat.accent}`}>
                      <stat.icon className="h-6 w-6" />
                    </span>
                    <span className="text-3xl font-extrabold text-gray-950">{stat.value}</span>
                  </div>
                  <p className="mt-7 text-sm font-bold text-gray-500">{stat.label}</p>
                  <span className="mt-5 block h-1 rounded-full bg-gray-100">
                    <span className={`block h-1 w-2/3 rounded-full ${stat.bar} transition-all group-hover:w-full`} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>

        {userType !== 'employer' && (
          <section>
            {renderEmployeeNextTasks(tasks, isDateSkipped, router)}
          </section>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.25fr] gap-6">
          <section className="ga-activity-card p-8 sm:p-10">
            <div className="flex items-center gap-4">
              <svg className="h-8 w-8 text-white/85" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M2.5 16h5.6l2.4-6.2 4.6 13.5 3.2-16.6 3.4 9.3h7.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2 className="text-2xl font-extrabold tracking-tight text-white">Activités récentes</h2>
            </div>
            <div className="ga-activity-list mt-10">
              {activityItems.map((item) => (
                <div key={`${item.time}-${item.title}`} className="ga-activity-row">
                  <span className="ga-activity-time">{item.time}</span>
                  <span className={`ga-activity-dot ${item.dot}`} />
                  <span className={`ga-activity-icon ${item.tone}`}>
                    <item.icon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-extrabold leading-tight text-white drop-shadow-sm sm:whitespace-nowrap sm:text-base">{item.title}</p>
                    <p className="mt-1.5 break-words text-xs font-semibold leading-snug text-white/78 sm:mt-2 sm:whitespace-nowrap sm:text-base">{item.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setActiveTab('alertes');
                router.push('/dashboard?tab=alertes');
              }}
              className="ga-activity-button mx-auto mt-12 px-8 py-3 text-lg"
            >
              Voir toute l'activité
            </button>
          </section>

          <section className="ga-card p-8 sm:p-10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-gray-900">Accès rapide</h2>
              <Cog6ToothIcon className="h-6 w-6 text-gray-400" />
            </div>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {quickLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => {
                    if (link.tab === 'employees') {
                      router.push('/employees');
                    } else if (link.tab === 'settings') {
                      setIsSettingsModalOpen(true);
                    } else {
                      setActiveTab(link.tab);
                      router.push(`/dashboard?tab=${link.tab}`);
                    }
                  }}
                  className="ga-card-flat group flex min-h-28 items-center justify-center gap-5 px-6 py-5 font-extrabold text-gray-800 transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${link.color}`}>
                    <link.icon className="h-7 w-7" />
                  </span>
                  {link.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="ga-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="ga-icon-pill h-14 w-14">
              <PinIcon className="h-7 w-7" />
            </span>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-10">
              <p className="font-extrabold text-emerald-800">Astuce du jour</p>
              <p className="text-sm text-gray-500">Planifiez vos tâches à l'avance pour une journée encore plus productive.</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('taches')}
            className="inline-flex items-center justify-end gap-3 font-bold text-emerald-800"
          >
            Voir plus
            <ChevronDownIcon className="h-5 w-5 -rotate-90" />
          </button>
        </section>

        {userType === 'employer' ? (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {renderEmployerView(onlineUsers, router)}
          </section>
        ) : (
          <section>
            {renderEmployeeView(isOnline, toggleOnlineStatus)}
          </section>
        )}

        {userType === 'employer' && (
          <section className="ga-card p-8 sm:p-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-gray-950">Derniers rapports</h2>
                <p className="mt-1 text-sm text-gray-500">Les plus récents rapports d'activité du centre.</p>
              </div>
              <button
                onClick={() => {
                  setActiveTab('rapports');
                  router.push('/dashboard?tab=rapports');
                  window.scrollTo(0, 0);
                }}
                className="ga-btn-secondary px-5 py-2.5 text-sm"
              >
                Voir tous les rapports
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
              {reports.length > 0 ? (
                [...reports]
                  .sort((a, b) => {
                    const dateA = safeFirebaseDate(a.createdAt) || new Date(0);
                    const dateB = safeFirebaseDate(b.createdAt) || new Date(0);
                    return dateB.getTime() - dateA.getTime();
                  })
                  .slice(0, 3)
                  .map((report) => (
                    <button
                      key={report.id}
                      onClick={() => {
                        setSelectedReport(report);
                        setActiveTab('rapports');
                        router.push('/dashboard?tab=rapports');
                        window.scrollTo(0, 0);
                        setIsReportDetailModalOpen(true);
                      }}
                      className="ga-card-flat group p-5 text-left transition hover:-translate-y-1 hover:shadow-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-sm font-extrabold text-emerald-800">
                          {report.userName.split(' ').map(n => n[0]).join('')}
                        </span>
                        <div>
                          <p className="font-extrabold text-gray-950">{report.userName}</p>
                          <p className="text-xs font-medium text-gray-500">
                            {format(safeFirebaseDate(report.createdAt) || new Date(0), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 line-clamp-3 text-sm text-gray-600 group-hover:text-gray-900">
                        {report.content}
                      </p>
                      <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-800">
                        Voir le rapport
                        <ChevronDownIcon className="h-4 w-4 -rotate-90" />
                      </span>
                    </button>
                  ))
              ) : (
                <div className="lg:col-span-3 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center">
                  <DocumentTextIcon className="mx-auto h-10 w-10 text-emerald-700" />
                  <h3 className="mt-3 font-extrabold text-gray-950">Aucun rapport récent</h3>
                  <p className="mt-1 text-sm text-gray-500">Les rapports créés s'afficheront ici.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'accueil':
        return renderDashboardHome();
      case 'taches':
        return renderTasksContent();
      case 'residents':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-extrabold text-gray-950">Gestion des résidents</h2>
              <button 
                onClick={() => setIsCreateResidentModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 shadow-sm transition-colors duration-200"
              >
                <UsersIcon className="h-5 w-5 mr-2" />
                Nouveau résident
              </button>
            </div>

            {/* Section de recherche */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ga-input block w-full pl-10 pr-3 py-3 leading-5 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-emerald-700 focus:border-emerald-600 sm:text-sm shadow-sm"
                placeholder="Rechercher par nom, prénom, langue, niveau d'autonomie..."
              />
            </div>

            {/* Boutons de filtre */}
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => setResidentFilter('all')}
                className={`px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                  residentFilter === 'all'
                    ? 'bg-gradient-to-r from-emerald-900 to-emerald-700 text-white shadow-lg shadow-emerald-200'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <UsersIcon className={`h-5 w-5 ${residentFilter === 'all' ? 'text-emerald-200' : 'text-gray-400'} mr-2`} />
                <span>Tous les résidents</span>
                <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                  residentFilter === 'all'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {residents.length}
                </span>
              </button>
              <button
                onClick={() => setResidentFilter('male')}
                className={`px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                  residentFilter === 'male'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-200'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <UsersIcon className={`h-5 w-5 ${residentFilter === 'male' ? 'text-blue-200' : 'text-gray-400'} mr-2`} />
                <span>Résidents hommes</span>
                <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                  residentFilter === 'male'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {residents.filter(r => r.gender === 'male').length}
                </span>
              </button>
              <button
                onClick={() => setResidentFilter('female')}
                className={`px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                  residentFilter === 'female'
                    ? 'bg-gradient-to-r from-pink-600 to-pink-700 text-white shadow-lg shadow-pink-200'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <UsersIcon className={`h-5 w-5 ${residentFilter === 'female' ? 'text-pink-200' : 'text-gray-400'} mr-2`} />
                <span>Résidentes femmes</span>
                <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                  residentFilter === 'female'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {residents.filter(r => r.gender === 'female').length}
                </span>
              </button>
            </div>

            {isLoadingResidents ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-700"></div>
              </div>
            ) : filteredResidents.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredResidents
                    .slice(
                      (currentResidentPage - 1) * residentsPerPage,
                      currentResidentPage * residentsPerPage
                    )
                    .map((resident) => (
                      <div
                        key={resident.id}
                        onClick={() => {
                          setSelectedResident(resident);
                          setIsResidentDetailModalOpen(true);
                        }}
                        className="ga-card hover:shadow-md transition-shadow duration-200 cursor-pointer"
                      >
                        <div className="p-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium text-gray-900">
                              {resident.firstName} {resident.lastName}
                            </h3>
                            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                              resident.gender === 'male'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-pink-100 text-pink-800'
                            }`}>
                              {resident.gender === 'male' ? 'Homme' : 'Femme'}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center text-sm text-gray-500">
                              <CalendarIcon className="h-4 w-4 mr-2" />
                              {format(resident.birthDate, 'dd MMMM yyyy', { locale: fr })}
                            </div>
                            <div className="flex items-center text-sm text-gray-500">
                              <LanguageIcon className="h-4 w-4 mr-2" />
                              {resident.language === 'french' && 'Français'}
                              {resident.language === 'english' && 'Anglais'}
                              {resident.language === 'spanish' && 'Espagnol'}
                              {resident.language === 'creole' && 'Créole'}
                              {resident.language === 'other' && 'Autre'}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
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
                            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                              resident.isVerbal
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {resident.isVerbal ? 'Verbal' : 'Non verbal'}
                            </span>
                            <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                              {resident.condition === 'intellectual_disability' && 'Déficient intellectuel'}
                              {resident.condition === 'autism' && 'TSA'}
                              {resident.condition === 'dementia' && 'Démence'}
                            </span>
                          </div>

                          <p className="text-sm text-gray-500 line-clamp-2">
                            {resident.description}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Pagination des résidents */}
                {Math.ceil(filteredResidents.length / residentsPerPage) > 1 && (
                  <div className="flex justify-center items-center space-x-4 mt-6 pt-6 border-t border-gray-200">
                    <button
                      onClick={() => setCurrentResidentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentResidentPage === 1}
                      className={`px-4 py-2 text-sm font-medium rounded-md ${
                        currentResidentPage === 1
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      Précédent
                    </button>
                    <span className="text-sm text-gray-700">
                      Page {currentResidentPage} sur {Math.ceil(filteredResidents.length / residentsPerPage)}
                    </span>
                    <button
                      onClick={() => setCurrentResidentPage(prev => Math.min(prev + 1, Math.ceil(filteredResidents.length / residentsPerPage)))}
                      disabled={currentResidentPage === Math.ceil(filteredResidents.length / residentsPerPage)}
                      className={`px-4 py-2 text-sm font-medium rounded-md ${
                        currentResidentPage === Math.ceil(filteredResidents.length / residentsPerPage)
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      Suivant
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun résident</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Commencez par créer un nouveau résident.
                </p>
              </div>
            )}

            <CreateResidentModal
              isOpen={isCreateResidentModalOpen}
              onClose={() => setIsCreateResidentModalOpen(false)}
              centerCode={customUser?.centerCode || ''}
              onResidentCreated={() => {
                loadResidents();
                setIsCreateResidentModalOpen(false);
              }}
            />

            {selectedResident && (
              <ResidentDetailModal
                isOpen={isResidentDetailModalOpen}
                onClose={() => {
                  setIsResidentDetailModalOpen(false);
                  setSelectedResident(null);
                }}
                resident={selectedResident}
                onResidentUpdated={() => {
                  loadResidents();
                }}
                onResidentDeleted={() => {
                  loadResidents();
                  setIsResidentDetailModalOpen(false);
                  setSelectedResident(null);
                }}
                isEmployer={customUser?.isEmployer || false}
              />
            )}
          </div>
        );
      case 'rapports':
        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-3xl font-extrabold text-gray-950">Rapports d&apos;activité</h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
                <DatePicker
                  selected={selectedDate}
                  onChange={(date) => setSelectedDate(date as Date)}
                  dateFormat="dd/MM/yyyy"
                  locale="fr"
                  placeholderText="Sélectionner une date"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg border-gray-300 shadow-sm focus:border-emerald-600 focus:ring-emerald-700 placeholder-gray-400 text-gray-700"
                  customInput={
                    <input
                      className="w-full sm:w-auto rounded-lg border-gray-300 shadow-sm focus:border-emerald-600 focus:ring-emerald-700 placeholder-gray-400 text-gray-700"
                    />
                  }
                />
                <button
                  onClick={() => setIsCreateReportModalOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-full text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 shadow-sm transition-colors duration-200"
                >
                  <DocumentTextIcon className="h-5 w-5 mr-2" />
                  Nouveau rapport
                </button>
              </div>
            </div>

            {/* Liste des rapports */}
            <div className="bg-transparent space-y-6">
              {reports.length > 0 ? (
                <>
                  <div className="space-y-6">
                    {reports
                      .filter(report => {
                        if (!selectedDate) return true;
                        if (!report.createdAt || !report.createdAt.toDate) return false;
                        const reportDate = report.createdAt.toDate();
                        const compareDate = new Date(selectedDate);
                        return (
                          reportDate.getDate() === compareDate.getDate() &&
                          reportDate.getMonth() === compareDate.getMonth() &&
                          reportDate.getFullYear() === compareDate.getFullYear()
                        );
                      })
                      .slice((currentReportPage - 1) * reportsPerPage, currentReportPage * reportsPerPage)
                      .map((report) => (
                        <div
                          key={report.id}
                          onClick={() => {
                            setSelectedReport(report);
                            setIsReportDetailModalOpen(true);
                          }}
                          className="group relative ga-card hover:shadow-md border border-gray-200 transition-all duration-200 cursor-pointer"
                        >
                          <div className="p-4 sm:p-6">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                              <div className="flex-shrink-0">
                                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-gradient-to-br from-emerald-900 to-emerald-700 flex items-center justify-center text-white font-semibold text-lg shadow-sm">
                                  {report.userName.split(' ').map(n => n[0]).join('')}
                                </div>
                              </div>

                              <div className="flex-grow space-y-3 sm:space-y-4 w-full">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <h3 className="text-lg font-semibold text-gray-900 break-words">
                                      {report.userName}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
                                      {report.createdAt && report.createdAt.toDate ? 
                                        format(report.createdAt.toDate(), 'dd MMMM yyyy à HH:mm', { locale: fr }) :
                                        'Date non disponible'
                                      }
                                    </p>
                                  </div>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 relative overflow-hidden group-hover:bg-white transition-colors duration-200 border border-gray-100">
                                  <p className="text-gray-600 line-clamp-3 text-sm">
                                    {report.content}
                                  </p>
                                  <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-gray-50 group-hover:from-white transition-colors duration-200" />
                                </div>

                                <div className="flex items-center justify-end">
                                  <span className="inline-flex items-center text-xs sm:text-sm font-medium text-emerald-700 group-hover:text-emerald-800 transition-colors duration-200">
                                    Voir le rapport complet
                                    <svg className="ml-1 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-800 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-l-xl" />
                        </div>
                      ))}
                  </div>

                  {/* Pagination */}
                  {Math.ceil(reports.filter(report => {
                    if (!selectedDate) return true;
                    if (!report.createdAt || !report.createdAt.toDate) return false;
                    const reportDate = report.createdAt.toDate();
                    const compareDate = new Date(selectedDate);
                    return (
                      reportDate.getDate() === compareDate.getDate() &&
                      reportDate.getMonth() === compareDate.getMonth() &&
                      reportDate.getFullYear() === compareDate.getFullYear()
                    );
                  }).length / reportsPerPage) > 1 && (
                    <div className="flex justify-center items-center space-x-2 sm:space-x-4 pt-6">
                      <button
                        onClick={() => setCurrentReportPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentReportPage === 1}
                        className={`px-3 sm:px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          currentReportPage === 1
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                        }`}
                      >
                        <span className="hidden sm:inline">Précédent</span>
                        <span className="inline sm:hidden">←</span>
                      </button>
                      <span className="text-xs sm:text-sm text-gray-700">
                        Page {currentReportPage} sur {Math.ceil(reports.filter(report => {
                          if (!selectedDate) return true;
                          if (!report.createdAt || !report.createdAt.toDate) return false;
                          const reportDate = report.createdAt.toDate();
                          const compareDate = new Date(selectedDate);
                          return (
                            reportDate.getDate() === compareDate.getDate() &&
                            reportDate.getMonth() === compareDate.getMonth() &&
                            reportDate.getFullYear() === compareDate.getFullYear()
                          );
                        }).length / reportsPerPage)}
                      </span>
                      <button
                        onClick={() => setCurrentReportPage(prev => prev + 1)}
                        disabled={currentReportPage === Math.ceil(reports.filter(report => {
                          if (!selectedDate) return true;
                          if (!report.createdAt || !report.createdAt.toDate) return false;
                          const reportDate = report.createdAt.toDate();
                          const compareDate = new Date(selectedDate);
                          return (
                            reportDate.getDate() === compareDate.getDate() &&
                            reportDate.getMonth() === compareDate.getMonth() &&
                            reportDate.getFullYear() === compareDate.getFullYear()
                          );
                        }).length / reportsPerPage)}
                        className={`px-3 sm:px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          currentReportPage === Math.ceil(reports.filter(report => {
                            if (!selectedDate) return true;
                            if (!report.createdAt || !report.createdAt.toDate) return false;
                            const reportDate = report.createdAt.toDate();
                            const compareDate = new Date(selectedDate);
                            return (
                              reportDate.getDate() === compareDate.getDate() &&
                              reportDate.getMonth() === compareDate.getMonth() &&
                              reportDate.getFullYear() === compareDate.getFullYear()
                            );
                          }).length / reportsPerPage)
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                        }`}
                      >
                        <span className="hidden sm:inline">Suivant</span>
                        <span className="inline sm:hidden">→</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="ga-card text-center py-10 sm:py-16 px-4">
                  <div className="flex flex-col items-center">
                    <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                      <DocumentTextIcon className="h-7 w-7 sm:h-8 sm:w-8 text-emerald-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Aucun rapport</h3>
                    <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
                      Commencez par créer un nouveau rapport d&apos;activité pour partager les informations importantes avec votre équipe.
                    </p>
                    <button
                      onClick={() => setIsCreateReportModalOpen(true)}
                      className="mt-6 inline-flex items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-full text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 shadow-sm transition-colors duration-200"
                    >
                      <DocumentTextIcon className="h-5 w-5 mr-2" />
                      Créer un rapport
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modals */}
            <CreateReportModal
              isOpen={isCreateReportModalOpen}
              onClose={() => setIsCreateReportModalOpen(false)}
              centerCode={customUser?.centerCode || ''}
              currentUserId={customUser?.uid || ''}
              currentUserName={`${customUser?.firstName || ''} ${customUser?.lastName || ''}`}
              onReportCreated={async (reportId: string) => {
                if (!customUser?.centerCode) return;
                
                try {
                  // Récupérer tous les utilisateurs du centre sauf l'auteur du rapport
                  const usersQuery = query(
                    collection(db, 'users'),
                    where('centerCode', '==', customUser.centerCode)
                  );
                  const usersSnapshot = await getDocs(usersQuery);
                  const otherUsers = usersSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(user => user.id !== customUser.uid);

                  // Créer l'alerte seulement si d'autres utilisateurs existent
                  if (otherUsers.length > 0) {
                    await addDoc(collection(db, 'alerts'), {
                      type: 'report_created',
                      title: 'Nouveau rapport créé',
                      message: 'Un nouveau rapport d\'activité a été ajouté.',
                      createdAt: serverTimestamp(),
                      readBy: [],
                      relatedId: reportId,
                      centerCode: customUser.centerCode,
                      excludedUsers: [customUser.uid] // Liste des utilisateurs à exclure des notifications
                    });
                  }
                } catch (error) {
                  console.error('Error creating report alert:', error);
                  toast.error('Erreur lors de la création de l\'alerte');
                }
                
                setIsCreateReportModalOpen(false);
              }}
            />

            {selectedReport && (
              <ReportDetailModal
                isOpen={isReportDetailModalOpen}
                onClose={() => {
                  setIsReportDetailModalOpen(false);
                  setSelectedReport(null);
                }}
                report={selectedReport}
                currentUserId={customUser?.uid || ''}
                isEmployer={customUser?.isEmployer || false}
                onReportDeleted={() => {
                  // Mettre à jour la liste des rapports après suppression
                  // en filtrant le rapport supprimé
                  setReports(prevReports => 
                    prevReports.filter(r => r.id !== selectedReport.id)
                  );
                  setSelectedReport(null);
                  setIsReportDetailModalOpen(false); // Explicitly close modal after state update
                }}
              />
            )}
          </div>
        );
      case 'messages':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h2 className="text-3xl font-extrabold text-gray-950">Messages</h2>
                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                  {messages.length} messages
                </span>
              </div>
            </div>

            {/* Section des messages épinglés */}
            {pinnedMessages.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <div className="flex items-center mb-3">
                  <PinIcon className="h-5 w-5 text-amber-600 mr-2" />
                  <h3 className="text-md font-medium text-amber-900">Messages épinglés</h3>
                </div>
                <div className="space-y-3">
                  {pinnedMessages.map((message) => (
                    <div 
                      key={message.id} 
                      className="ga-card-flat border border-amber-200 p-4 cursor-pointer hover:shadow-md transition-shadow duration-200" 
                      onClick={() => {
                        setSelectedMessage(message);
                        setIsMessageDetailModalOpen(true);
                      }}
                    >
                      <div className="flex justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`h-8 w-8 rounded-full ${message.author.isEmployer ? 'bg-emerald-100' : 'bg-green-100'} flex items-center justify-center`}>
                            <span className={`text-sm font-medium ${message.author.isEmployer ? 'text-emerald-800' : 'text-green-700'}`}>
                              {message.author.name.split(' ').map(n => n.charAt(0).toUpperCase()).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{message.author.name}</p>
                            <p className="text-xs text-gray-500">
                              {safeFirebaseDate(message.createdAt) 
                                ? format(safeFirebaseDate(message.createdAt)!, 'dd/MM/yyyy HH:mm', { locale: fr }) 
                                : 'Date inconnue'}
                            </p>
                          </div>
                        </div>
                        {(message.author.id === customUser?.uid || customUser?.isEmployer) && (
                          <button
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'messages', message.id), {
                                  isPinned: false
                                });
                                toast.success('Message désépinglé');
                              } catch (error) {
                                console.error('Erreur lors du désépinglage du message:', error);
                                toast.error('Erreur lors du désépinglage du message');
                              }
                            }}
                            className="text-amber-600 hover:text-amber-800"
                          >
                            <MinusCircleIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-3">
                        {message.title && (
                          <h4 className="text-base font-semibold text-gray-900 mb-1">
                            {message.title}
                          </h4>
                        )}
                        <p className="text-gray-700 whitespace-pre-line break-words overflow-hidden max-h-24 sm:max-h-32 overflow-y-auto">{message.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Création de nouveau message */}
            {(customUser?.role === 'employer' || (customUser?.isEmployer && !customUser?.role)) && (
              <div className="ga-card p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Nouveau message</h3>
                <div className="space-y-4">
                  {/* Champ pour le titre */}
                  <div>
                    <label htmlFor="message-title" className="block text-sm font-medium text-gray-700 mb-1">
                      Titre du message
                    </label>
                    <input
                      type="text"
                      id="message-title"
                      value={newMessageTitle}
                      onChange={(e) => setNewMessageTitle(e.target.value)}
                      placeholder="Entrez un titre pour votre message..."
                      className="w-full rounded-xl border border-gray-200 focus:ring-emerald-700 focus:border-emerald-600 shadow-sm px-4 py-2 text-gray-900"
                    />
                  </div>
                  
                  {/* Champ pour le contenu */}
                  <div>
                    <label htmlFor="message-content" className="block text-sm font-medium text-gray-700 mb-1">
                      Contenu du message
                    </label>
                    <textarea
                      id="message-content"
                      value={newMessageContent}
                      onChange={(e) => setNewMessageContent(e.target.value)}
                      placeholder="Écrivez votre message ici..."
                      rows={5}
                      className="w-full rounded-xl border border-gray-200 focus:ring-emerald-700 focus:border-emerald-600 shadow-sm px-4 py-3 text-gray-900"
                    />
                  </div>
                  
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={async () => {
                        // Vérifier qu'au moins un titre ou un contenu est fourni
                        if ((!newMessageTitle.trim() && !newMessageContent.trim()) || !customUser) return;
                        
                        try {
                          setIsSubmittingMessage(true);
                          
                          const messageData = {
                            author: {
                              id: customUser.uid,
                              name: `${customUser.firstName} ${customUser.lastName}`,
                              isEmployer: customUser.isEmployer
                            },
                            title: newMessageTitle.trim(),
                            content: newMessageContent.trim(),
                            createdAt: serverTimestamp(),
                            centerCode: customUser.centerCode,
                            isPinned: false
                          };
                          
                          // Création du message
                          const messageRef = await addDoc(collection(db, 'messages'), messageData);
                          setNewMessageTitle('');
                          setNewMessageContent('');
                          toast.success('Message publié avec succès');

                          // Création de l'alerte pour tous les autres utilisateurs du centre
                          try {
                            const usersQuery = query(
                              collection(db, 'users'),
                              where('centerCode', '==', customUser.centerCode)
                            );
                            const usersSnapshot = await getDocs(usersQuery);
                            const otherUsers = usersSnapshot.docs
                              .map(doc => ({ id: doc.id, ...doc.data() }))
                              .filter(user => user.id !== customUser.uid);
                            if (otherUsers.length > 0) {
                              await addDoc(collection(db, 'alerts'), {
                                type: 'message_created',
                                title: 'Nouveau message',
                                message: 'Un nouveau message a été publié.',
                                createdAt: serverTimestamp(),
                                readBy: [],
                                relatedId: messageRef.id,
                                centerCode: customUser.centerCode,
                                excludedUsers: [customUser.uid]
                              });
                            }
                          } catch (err) {
                            console.error('Erreur lors de la création de l\'alerte message:', err);
                          }
                        } catch (error) {
                          console.error('Erreur lors de la publication du message:', error);
                          toast.error('Erreur lors de la publication du message');
                        } finally {
                          setIsSubmittingMessage(false);
                        }
                      }}
                      disabled={isSubmittingMessage || (!newMessageTitle.trim() && !newMessageContent.trim())}
                      className={`inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 transition-colors duration-200 ${
                        isSubmittingMessage || (!newMessageTitle.trim() && !newMessageContent.trim()) ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {isSubmittingMessage ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Publication...
                        </>
                      ) : (
                        <>
                          <PaperAirplaneIcon className="h-5 w-5 mr-2" />
                          Publier le message
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Liste des messages */}
            <div className="space-y-4">
              {messages.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {messages
                    .filter(message => !message.isPinned)
                    .map((message) => (
                      <div 
                        key={message.id} 
                        className="ga-card-flat p-4 cursor-pointer hover:shadow-md transition-shadow duration-200" 
                        onClick={() => {
                          setSelectedMessage(message);
                          setIsMessageDetailModalOpen(true);
                        }}
                      >
                        <div className="flex justify-between">
                          <div className="flex items-center space-x-2">
                            <div className={`h-8 w-8 rounded-full ${message.author.isEmployer ? 'bg-emerald-100' : 'bg-green-100'} flex items-center justify-center`}>
                              <span className={`text-sm font-medium ${message.author.isEmployer ? 'text-emerald-800' : 'text-green-700'}`}>
                                {message.author.name.split(' ').map(n => n.charAt(0).toUpperCase()).join('')}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{message.author.name}</p>
                              <p className="text-xs text-gray-500">
                                {safeFirebaseDate(message.createdAt) 
                                  ? format(safeFirebaseDate(message.createdAt)!, 'dd/MM/yyyy HH:mm', { locale: fr }) 
                                  : 'Date inconnue'}
                              </p>
                            </div>
                          </div>
                          {(message.author.id === customUser?.uid || customUser?.isEmployer) && (
                            <div className="flex space-x-2">
                              <button
                                onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, 'messages', message.id), {
                                      isPinned: true
                                    });
                                    toast.success('Message épinglé');
                                  } catch (error) {
                                    console.error('Erreur lors de l\'épinglage du message:', error);
                                    toast.error('Erreur lors de l\'épinglage du message');
                                  }
                                }}
                                className="text-gray-400 hover:text-amber-600"
                              >
                                <PinIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (window.confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) {
                                    try {
                                      await deleteDoc(doc(db, 'messages', message.id));
                                      toast.success('Message supprimé');
                                      // Update local state to remove the message from the list
                                      setMessages(prevMessages => prevMessages.filter(m => m.id !== message.id));
                                    } catch (error) {
                                      console.error('Erreur lors de la suppression du message:', error);
                                      toast.error('Erreur lors de la suppression du message');
                                    }
                                  }
                                }}
                                className="text-gray-400 hover:text-red-600"
                              >
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          {message.title && (
                            <h4 className="text-base font-semibold text-gray-900 mb-1">
                              {message.title}
                            </h4>
                          )}
                          <p className="text-gray-700 whitespace-pre-line break-words overflow-hidden max-h-24 sm:max-h-32 overflow-y-auto">{message.content}</p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-12 ga-card-flat">
                  <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun message</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {customUser?.isEmployer 
                      ? 'Créez votre premier message pour communiquer avec votre équipe.'
                      : 'Aucun message n\'a été envoyé pour le moment.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      case 'approbations':
        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-3xl font-extrabold text-gray-950">Comptes en attente d’approbation</h2>
                <p className="mt-1 text-sm text-gray-500">Demandes associées au centre actif {centerCode || ''}.</p>
              </div>
              <button
                onClick={() => {
                  setActiveTab('accueil');
                  router.push('/dashboard?tab=accueil');
                }}
                className="ga-btn-secondary px-5 py-2.5 text-sm"
              >
                Retour à l’accueil
              </button>
            </div>

            {pendingAccountRequests.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {pendingAccountRequests.map((request) => (
                  <div key={request.id} className="ga-card-flat border border-gray-200 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-extrabold text-gray-950">{request.firstName} {request.lastName}</h3>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                            {request.role === 'admin' ? 'Administrateur' : 'Employé'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{request.email}</p>
                        <p className="mt-2 text-xs text-gray-500">
                          Demande reçue {safeFirebaseDate(request.approvalRequestedAt)?.toLocaleString('fr-CA') || 'récemment'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          onClick={() => handleAccountApproval(request.id, 'approve')}
                          disabled={isProcessingApproval}
                          className="ga-btn-primary px-5 py-2.5 text-sm disabled:opacity-60"
                        >
                          Activer le compte
                        </button>
                        <button
                          onClick={() => handleAccountApproval(request.id, 'reject')}
                          disabled={isProcessingApproval}
                          className="rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          Supprimer la demande
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ga-card p-10 text-center">
                <UserGroupIcon className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-extrabold text-gray-950">Aucune demande en attente</h3>
                <p className="mt-2 text-sm text-gray-500">Les nouveaux comptes employés et administrateurs apparaîtront ici.</p>
              </div>
            )}
          </div>
        );

      case 'alertes':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h2 className="text-3xl font-extrabold text-gray-950">Alertes</h2>
                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                  {alerts.filter(alert => isSameDay(alert.createdAt.toDate(), new Date())).length} alertes aujourd'hui
                </span>
              </div>
              {alerts.some(alert => alert.createdAt && !alert.readBy?.includes(customUser?.uid || '') && isSameDay(alert.createdAt.toDate(), new Date())) && (
                <button
                  onClick={markAllAlertsAsRead}
                  className="ga-btn-secondary px-5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 transition-colors duration-200"
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>

            <div className="space-y-4">
              {alerts.filter(alert => isSameDay(alert.createdAt.toDate(), new Date())).length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {alerts
                    .filter(alert => alert.createdAt && isSameDay(alert.createdAt.toDate(), new Date()))
                    .map((alert) => (
                      <div
                        key={alert.id}
                        className={`ga-card-flat border p-4 transition-all duration-200 hover:shadow-md ${
                          !alert.readBy?.includes(customUser?.uid || '') ? 'border-l-4 border-l-red-500' : 'border-gray-200'
                        }`}
                        onClick={async () => {
                          if (!alert.readBy?.includes(customUser?.uid || '')) {
                            await updateDoc(doc(db, 'alerts', alert.id), {
                              readBy: [...(alert.readBy || []), customUser?.uid]
                            });
                          }
                          
                          // Rediriger vers la tâche ou le rapport concerné
                          if (alert.relatedId) {
                            if (alert.type === 'task_created' || alert.type === 'task_overdue' || alert.type === 'task_uncompleted') {
                              setActiveTab('taches');
                              setTaskFilter('all');
                              setSelectedDate(null);
                              router.push('/dashboard?tab=taches&filter=all');
                              const task = tasks.find(t => t.id === alert.relatedId);
                              if (task) {
                                setSelectedTask(task);
                                setIsTaskDetailModalOpen(true);
                              }
                            } else if (alert.type === 'report_created') {
                              setActiveTab('rapports');
                              const report = reports.find(r => r.id === alert.relatedId);
                              if (report) {
                                setSelectedReport(report);
                                setIsReportDetailModalOpen(true);
                              }
                            } else if (alert.type === 'message_created') {
                              setActiveTab('messages');
                              router.push('/dashboard?tab=messages');

                              const existingMessage = messages.find(message => message.id === alert.relatedId);
                              if (existingMessage) {
                                setSelectedMessage(existingMessage);
                                setIsMessageDetailModalOpen(true);
                              } else {
                                const messageDoc = await getDoc(doc(db, 'messages', alert.relatedId));
                                if (messageDoc.exists()) {
                                  setSelectedMessage({
                                    id: messageDoc.id,
                                    ...messageDoc.data()
                                  } as Message);
                                  setIsMessageDetailModalOpen(true);
                                } else {
                                  toast.error("Ce message n'existe plus.");
                                }
                              }
                            }
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-900">{alert.title}</span>
                              {!alert.readBy?.includes(customUser?.uid || '') && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                                  Nouveau
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600">{alert.message}</p>
                            <p className="text-sm text-gray-500">
                              {alert.createdAt ? format(alert.createdAt.toDate(), 'HH:mm', { locale: fr }) : 'Heure inconnue'}
                            </p>
                          </div>
                          <div className={`rounded-full p-2 ${
                            alert.type === 'task_created' || alert.type === 'task_uncompleted' ? 'bg-emerald-100 text-emerald-700' :
                            alert.type === 'report_created' ? 'bg-green-100 text-green-600' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {alert.type === 'task_created' && <ClipboardDocumentListIcon className="h-5 w-5" />}
                            {alert.type === 'task_uncompleted' && <ClipboardDocumentListIcon className="h-5 w-5" />}
                            {alert.type === 'report_created' && <DocumentTextIcon className="h-5 w-5" />}
                            {alert.type === 'task_overdue' && <ClockIcon className="h-5 w-5" />}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-12 ga-card-flat">
                  <BellIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune alerte</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Vous n'avez aucune alerte pour aujourd'hui.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  const markAllAlertsAsRead = async () => {
    if (!customUser?.centerCode || !customUser?.uid) return;

    try {
      const batch = writeBatch(db);
      const unreadAlerts = alerts.filter(alert => 
        alert.createdAt &&
        !alert.readBy?.includes(customUser.uid) && 
        isSameDay(alert.createdAt.toDate(), new Date())
      );

      unreadAlerts.forEach(alert => {
        const alertRef = doc(db, 'alerts', alert.id);
        batch.update(alertRef, { 
          readBy: [...(alert.readBy || []), customUser.uid]
        });
      });

      await batch.commit();
      toast.success('Toutes les alertes ont été marquées comme lues');
    } catch (error) {
      console.error('Error marking all alerts as read:', error);
      toast.error('Erreur lors de la mise à jour des alertes');
    }
  };

  const visibleCenterCodes = associatedCenters.length > 0 ? associatedCenters : [centerCode || 'GKC'];
  const normalizedVisibleCenterCodes = Array.from(new Set(visibleCenterCodes.map((code) => normalizeCenterCode(code)).filter(Boolean)));
  const remainingCentersAfterDeletion = normalizedVisibleCenterCodes.filter((code) => !deleteCenterCodes.includes(code));
  const deleteWillRemoveCurrentEmployerAccount = canManageAccountApprovals && deleteCenterCodes.length > 0 && remainingCentersAfterDeletion.length === 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gestapp-shell">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-700"></div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="gestapp-shell min-h-screen">
        {/* Profile Menu Button - Desktop */}
        <div className="fixed top-0 right-0 z-50 p-4 hidden lg:block">
          <div className="relative">
            <div className="ga-card flex items-center overflow-hidden rounded-[1.35rem]">
              <button
                onClick={() => {
                  setIsCenterMenuOpen(!isCenterMenuOpen);
                  setIsProfileMenuOpen(false);
                }}
                className="flex items-center gap-4 px-6 py-4 text-left transition-all duration-200 hover:bg-emerald-50/70"
              >
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                <span>
                  <span className="block text-sm font-bold text-gray-500">Centre actif</span>
                  <span className="block text-lg font-extrabold text-gray-950">{centerCode || 'RTF GKC'}</span>
                </span>
                <ChevronDownIcon className="h-5 w-5 text-gray-700" />
              </button>
              <div className="h-14 w-px bg-gray-200" />
              <button
                onClick={() => {
                  setIsProfileMenuOpen(!isProfileMenuOpen);
                  setIsCenterMenuOpen(false);
                }}
                className="flex items-center gap-4 px-6 py-4 transition-all duration-200 group hover:bg-emerald-50/70"
              >
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-emerald-900 to-emerald-700 flex items-center justify-center text-white font-bold text-sm shadow-sm group-hover:shadow-md transition-all duration-200">
                  {customUser?.firstName?.charAt(0)}{customUser?.lastName?.charAt(0)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-left">
                    <span className="block text-sm font-extrabold text-gray-900">
                      {customUser?.firstName} {customUser?.lastName}
                    </span>
                    <span className="text-xs font-medium text-gray-500">Voir le profil</span>
                  </div>
                  <ChevronDownIcon className="h-4 w-4 -rotate-90 text-gray-500 group-hover:text-emerald-800" />
                </div>
              </button>
              </div>

            {/* Center Dropdown Menu */}
            {isCenterMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsCenterMenuOpen(false)}
                />
                <div className="ga-card absolute right-56 mt-3 w-80 py-3 z-50">
                  <div className="px-4 pb-3">
                    <p className="text-sm font-extrabold text-gray-950">Centres associés</p>
                    <p className="text-xs font-medium text-gray-500">Choisissez le centre actif de ce tableau de bord.</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto px-2">
                    {visibleCenterCodes.map((code) => {
                      const isActive = code === centerCode?.toUpperCase();
                      return (
                        <button
                          key={code}
                          onClick={() => handleSwitchCenter(code)}
                          className={`w-full rounded-2xl px-3 py-3 text-left transition-colors duration-200 ${
                            isActive ? 'bg-emerald-50 text-emerald-950' : 'hover:bg-gray-50 text-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className={`h-3 w-3 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                              <div>
                                <p className="text-sm font-extrabold">{code}</p>
                                <p className="text-xs font-medium text-gray-500">{isActive ? 'Centre actif' : 'Accéder à ce centre'}</p>
                              </div>
                            </div>
                            {isActive && <CheckIcon className="h-5 w-5 text-emerald-700" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {canManageAccountApprovals && (
                    <>
                      <div className="my-2 border-t border-gray-100" />
                      <button
                        onClick={() => {
                          setIsCenterMenuOpen(false);
                          setIsCreateCenterModalOpen(true);
                        }}
                        className="mx-2 flex w-[calc(100%-1rem)] items-center justify-center rounded-full bg-emerald-900 px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-emerald-800"
                      >
                        Créer un nouveau centre
                      </button>
                      {canManageAccountApprovals && (
                        <button
                          onClick={() => {
                            setIsCenterMenuOpen(false);
                            setActiveTab('approbations');
                            router.push('/dashboard?tab=approbations');
                          }}
                          className="mx-2 mt-2 flex w-[calc(100%-1rem)] items-center justify-between rounded-full border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-900 transition-colors hover:bg-amber-100"
                        >
                          <span>Voir les comptes en attente d’approbation</span>
                          <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs text-white">{pendingAccountRequests.length}</span>
                        </button>
                      )}
                    </>
                  )}
                  {canRequestAnotherCenter && (
                    <>
                      <div className="my-2 border-t border-gray-100" />
                      <button
                        onClick={() => {
                          setIsCenterMenuOpen(false);
                          setIsJoinCenterModalOpen(true);
                        }}
                        className="mx-2 flex w-[calc(100%-1rem)] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-900 transition-colors hover:bg-emerald-100"
                      >
                        Inscription à un autre centre
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsProfileMenuOpen(false)}
                />
                <div className="ga-card absolute right-0 mt-3 w-72 py-2 z-50">
                  <button
                    onClick={() => {
                      setIsProfileModalOpen(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors duration-200 group"
                  >
                      <UserCircleIcon className="h-5 w-5 text-gray-400 group-hover:text-emerald-700" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Profil</p>
                      <p className="text-xs text-gray-500">Voir et modifier vos informations</p>
                    </div>
                  </button>
                  {canManageAccountApprovals && (
                    <button
                      onClick={openDeleteCenterModal}
                      className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-red-50 transition-colors duration-200 group"
                    >
                      <TrashIcon className="h-5 w-5 text-red-500" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-red-600">Supprimer votre centre</p>
                        <p className="text-xs text-red-500">Effacer un centre définitivement</p>
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsSettingsModalOpen(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors duration-200 group"
                  >
                      <Cog6ToothIcon className="h-5 w-5 text-gray-400 group-hover:text-emerald-700" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Paramètres</p>
                      <p className="text-xs text-gray-500">Configurer l&apos;application</p>
                    </div>
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-red-50 text-red-600 transition-colors duration-200 group"
                  >
                    <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <div className="text-left">
                      <p className="text-sm font-medium">Déconnexion</p>
                      <p className="text-xs text-red-500">Quitter l&apos;application</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Profile and Center Menu Buttons - Mobile */}
        <div className="fixed top-0 right-0 z-[60] flex items-center gap-3 px-4 py-2 lg:hidden">
          <div className="relative z-10">
            <button
              onClick={() => {
                setIsCenterMenuOpen(!isCenterMenuOpen);
                setIsProfileMenuOpen(false);
              }}
              className="flex h-9 items-center gap-2 rounded-full border border-emerald-100 bg-white/95 px-3 text-left backdrop-blur transition-all duration-200 hover:bg-emerald-50"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="max-w-[6rem] truncate text-sm font-extrabold text-emerald-950">{centerCode || 'GKC'}</span>
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            </button>

            {isCenterMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-white/50 backdrop-blur-sm"
                  onClick={() => setIsCenterMenuOpen(false)}
                />
                <div className="fixed left-3 right-3 top-14 z-50 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-3xl border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="px-2 pb-3">
                    <p className="text-sm font-extrabold text-gray-950">Centre actif</p>
                    <p className="text-xs font-medium text-gray-500">Choisissez le centre de ce tableau de bord.</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {visibleCenterCodes.map((code) => {
                      const isActive = code === centerCode?.toUpperCase();
                      return (
                        <button
                          key={code}
                          onClick={() => handleSwitchCenter(code)}
                          className={`w-full rounded-2xl px-3 py-3 text-left transition-colors duration-200 ${
                            isActive ? 'bg-emerald-50 text-emerald-950' : 'hover:bg-gray-50 text-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className={`h-3 w-3 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                              <div>
                                <p className="text-sm font-extrabold">{code}</p>
                                <p className="text-xs font-medium text-gray-500">{isActive ? 'Centre actif' : 'Accéder à ce centre'}</p>
                              </div>
                            </div>
                            {isActive && <CheckIcon className="h-5 w-5 text-emerald-700" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {canManageAccountApprovals && (
                    <>
                      <div className="my-2 border-t border-gray-100" />
                      <button
                        onClick={() => {
                          setIsCenterMenuOpen(false);
                          setIsCreateCenterModalOpen(true);
                        }}
                        className="flex w-full items-center justify-center rounded-full bg-emerald-900 px-4 py-3 text-center text-sm font-extrabold text-white transition-colors hover:bg-emerald-800"
                      >
                        Créer un nouveau centre
                      </button>
                      <button
                        onClick={() => {
                          setIsCenterMenuOpen(false);
                          setActiveTab('approbations');
                          router.push('/dashboard?tab=approbations');
                        }}
                        className="mt-2 flex w-full items-center justify-between gap-3 rounded-full border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-900 transition-colors hover:bg-amber-100"
                      >
                        <span>Comptes en attente</span>
                        <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs text-white">{pendingAccountRequests.length}</span>
                      </button>
                    </>
                  )}
                  {canRequestAnotherCenter && (
                    <>
                      <div className="my-2 border-t border-gray-100" />
                      <button
                        onClick={() => {
                          setIsCenterMenuOpen(false);
                          setIsJoinCenterModalOpen(true);
                        }}
                        className="flex w-full items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-900 transition-colors hover:bg-emerald-100"
                      >
                        Inscription à un autre centre
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="relative z-20 rounded-full bg-white p-0.5">
            <button
              onClick={() => {
                setIsProfileMenuOpen(!isProfileMenuOpen);
                setIsCenterMenuOpen(false);
              }}
              className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-900 to-emerald-700 flex items-center justify-center text-white font-medium text-sm shadow-sm transition-all duration-200"
            >
              {customUser?.firstName?.charAt(0)}{customUser?.lastName?.charAt(0)}
            </button>

            {/* Mobile Profile Menu */}
            {isProfileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 bg-white/50 backdrop-blur-sm z-40"
                  onClick={() => setIsProfileMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{customUser?.firstName} {customUser?.lastName}</p>
                    <p className="text-xs text-gray-500">{customUser?.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setIsProfileModalOpen(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors duration-200 group"
                  >
                    <UserCircleIcon className="h-5 w-5 text-gray-400 group-hover:text-emerald-700" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Profil</p>
                      <p className="text-xs text-gray-500">Voir et modifier vos informations</p>
                    </div>
                  </button>
                  {canManageAccountApprovals && (
                    <button
                      onClick={openDeleteCenterModal}
                      className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-red-50 transition-colors duration-200 group"
                    >
                      <TrashIcon className="h-5 w-5 text-red-500" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-red-600">Supprimer votre centre</p>
                        <p className="text-xs text-red-500">Effacer un centre définitivement</p>
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsSettingsModalOpen(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors duration-200 group"
                  >
                    <Cog6ToothIcon className="h-5 w-5 text-gray-400 group-hover:text-emerald-700" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Paramètres</p>
                      <p className="text-xs text-gray-500">Configurer l&apos;application</p>
                    </div>
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-red-50 text-red-600 transition-colors duration-200 group"
                  >
                    <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <div className="text-left">
                      <p className="text-sm font-medium">Déconnexion</p>
                      <p className="text-xs text-red-500">Quitter l&apos;application</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Create Center Modal */}
        {isCreateCenterModalOpen && (
          <div className="fixed inset-0 z-[60] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-emerald-950/28 backdrop-blur-sm transition-opacity"
                onClick={() => !isCreatingCenter && setIsCreateCenterModalOpen(false)}
              />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCreateCenter();
                }}
                className="ga-modal-panel relative w-full max-w-lg bg-white"
              >
                <div className="ga-modal-header px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Créer un nouveau centre</h3>
                      <p className="mt-1 text-sm text-emerald-50/80">Ce centre sera ajouté à votre compte employeur.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => !isCreatingCenter && setIsCreateCenterModalOpen(false)}
                      className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-5 px-6 py-6">
                  <div>
                    <label htmlFor="new-center-code" className="block text-sm font-extrabold text-gray-800">
                      Code du centre
                    </label>
                    <input
                      id="new-center-code"
                      type="text"
                      value={newCenterCode}
                      onChange={(event) => setNewCenterCode(event.target.value.toUpperCase())}
                      className="ga-input mt-2 block w-full px-4 py-3"
                      placeholder="Ex.: GKC2"
                      disabled={isCreatingCenter}
                    />
                    <p className="mt-2 text-xs font-medium text-gray-500">Le code doit être différent de vos autres centres.</p>
                  </div>
                  <div>
                    <label htmlFor="new-center-title" className="block text-sm font-extrabold text-gray-800">
                      Nom affiché
                    </label>
                    <input
                      id="new-center-title"
                      type="text"
                      value={newCenterTitle}
                      onChange={(event) => setNewCenterTitle(event.target.value)}
                      className="ga-input mt-2 block w-full px-4 py-3"
                      placeholder="Ex.: RTF GKC Est"
                      disabled={isCreatingCenter}
                    />
                    <p className="mt-2 text-xs font-medium text-gray-500">Si ce champ est vide, GestApp utilisera le code du centre.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 bg-emerald-50/50 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setIsCreateCenterModalOpen(false)}
                    className="ga-btn-secondary px-5 py-2.5 text-sm"
                    disabled={isCreatingCenter}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="ga-btn-primary px-5 py-2.5 text-sm"
                    disabled={isCreatingCenter}
                  >
                    {isCreatingCenter ? 'Création...' : 'Créer le centre'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join Center Modal */}
        {isJoinCenterModalOpen && (
          <div className="fixed inset-0 z-[60] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-emerald-950/28 backdrop-blur-sm transition-opacity"
                onClick={() => !isJoiningCenter && setIsJoinCenterModalOpen(false)}
              />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleJoinCenterRequest();
                }}
                className="ga-modal-panel relative w-full max-w-lg bg-white"
              >
                <div className="ga-modal-header px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Inscription à un autre centre</h3>
                      <p className="mt-1 text-sm text-emerald-50/80">Une demande sera envoyée à l’employeur du centre.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => !isJoiningCenter && setIsJoinCenterModalOpen(false)}
                      className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-5 px-6 py-6">
                  <div>
                    <label htmlFor="join-center-code" className="block text-sm font-extrabold text-gray-800">
                      Code du centre
                    </label>
                    <input
                      id="join-center-code"
                      type="text"
                      value={joinCenterCode}
                      onChange={(event) => setJoinCenterCode(event.target.value.toUpperCase())}
                      className="ga-input mt-2 block w-full px-4 py-3"
                      placeholder="Ex.: ABC"
                      disabled={isJoiningCenter}
                    />
                    <p className="mt-2 text-xs font-medium text-gray-500">
                      Votre rôle demandé sera le même que votre rôle actuel.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 bg-emerald-50/50 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsJoinCenterModalOpen(false);
                      setJoinCenterCode('');
                    }}
                    className="ga-btn-secondary px-5 py-2.5 text-sm"
                    disabled={isJoiningCenter}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="ga-btn-primary px-5 py-2.5 text-sm"
                    disabled={isJoiningCenter}
                  >
                    {isJoiningCenter ? 'Envoi...' : 'Envoyer la demande'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Center Modal */}
        {isDeleteCenterModalOpen && (
          <div className="fixed inset-0 z-[60] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-emerald-950/35 backdrop-blur-sm transition-opacity"
                onClick={() => !isDeletingCenter && setIsDeleteCenterModalOpen(false)}
              />
              <div className="ga-modal-panel relative w-full max-w-xl bg-white">
                <div className="ga-modal-header px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Supprimer un centre</h3>
                      <p className="mt-1 text-sm text-emerald-50/80">Cette action efface définitivement les données du centre.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => !isDeletingCenter && setIsDeleteCenterModalOpen(false)}
                      className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-5 px-6 py-6">
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                    Les tâches, résidents, rapports, messages, alertes et associations de comptes liés aux centres sélectionnés seront supprimés.
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-extrabold text-gray-900">Centres à supprimer</p>
                    <div className="space-y-2">
                      {normalizedVisibleCenterCodes.map((code) => {
                        const isSelected = deleteCenterCodes.includes(code);

                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => toggleDeleteCenterCode(code)}
                            disabled={isDeletingCenter}
                            className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                              isSelected
                                ? 'border-red-300 bg-red-50 text-red-800'
                                : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-extrabold">{code}</p>
                                <p className="text-xs font-medium text-gray-500">
                                  {code === normalizeCenterCode(centerCode) ? 'Centre actif' : 'Centre associé'}
                                </p>
                              </div>
                              <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                                isSelected ? 'border-red-500 bg-red-600 text-white' : 'border-gray-300 text-transparent'
                              }`}>
                                <CheckIcon className="h-4 w-4" />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {deleteWillRemoveCurrentEmployerAccount && (
                    <div className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700">
                      Vous supprimez tous vos centres actifs. Votre compte employeur sera aussi supprimé complètement.
                    </div>
                  )}

                  <div>
                    <label htmlFor="delete-center-confirmation" className="block text-sm font-extrabold text-gray-800">
                      Confirmation
                    </label>
                    <input
                      id="delete-center-confirmation"
                      type="text"
                      value={deleteCenterConfirmation}
                      onChange={(event) => setDeleteCenterConfirmation(event.target.value)}
                      className="ga-input mt-2 block w-full px-4 py-3"
                      placeholder="Écrivez SUPPRIMER"
                      disabled={isDeletingCenter}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 bg-emerald-50/50 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setIsDeleteCenterModalOpen(false)}
                    className="ga-btn-secondary px-5 py-2.5 text-sm"
                    disabled={isDeletingCenter}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCenters}
                    className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                    disabled={isDeletingCenter || deleteCenterCodes.length === 0 || deleteCenterConfirmation.trim().toUpperCase() !== 'SUPPRIMER'}
                  >
                    {isDeletingCenter ? 'Suppression...' : 'Supprimer définitivement'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profile Modal */}
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity" onClick={() => setIsProfileModalOpen(false)}>
                <div className="absolute inset-0 bg-emerald-950 opacity-30"></div>
              </div>
              <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
                <div className="relative">
                  {/* Header avec avatar */}
                  <div className="px-6 pt-6 pb-12 bg-gradient-to-br from-emerald-900 to-emerald-700">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-4">
                        <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-emerald-900 to-emerald-700 flex items-center justify-center text-2xl font-bold text-white shadow-lg border-4 border-white">
                          {customUser?.firstName?.charAt(0)}{customUser?.lastName?.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">Mon Profil</h3>
                          <p className="text-emerald-100 text-sm mt-1">{customUser?.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setIsProfileModalOpen(false)}
                        className="rounded-lg p-1 text-emerald-100 hover:text-white hover:bg-emerald-700 transition-colors duration-200"
                      >
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>
                  </div>

                  {/* Contenu du profil */}
                  <div className="px-8 py-6 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      {/* Prénom */}
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Prénom
                        </label>
                        <div className="mt-1 relative rounded-xl border border-gray-200 bg-white overflow-hidden group hover:border-emerald-600 transition-colors duration-200">
                          <input
                            type="text"
                            value={profileEdits.firstName}
                            className="block w-full px-4 py-3 text-base font-medium text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent"
                            placeholder="Votre prénom"
                            onChange={(e) => {
                              setProfileEdits(prev => ({
                                ...prev,
                                firstName: e.target.value
                              }));
                              setIsProfileModified(true);
                            }}
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Nom */}
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Nom
                        </label>
                        <div className="mt-1 relative rounded-xl border border-gray-200 bg-white overflow-hidden group hover:border-emerald-600 transition-colors duration-200">
                          <input
                            type="text"
                            value={profileEdits.lastName}
                            className="block w-full px-4 py-3 text-base font-medium text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent"
                            placeholder="Votre nom"
                            onChange={(e) => {
                              setProfileEdits(prev => ({
                                ...prev,
                                lastName: e.target.value
                              }));
                              setIsProfileModified(true);
                            }}
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Email */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Email
                        </label>
                        <div className="mt-1 relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                          <div className="px-4 py-3 flex items-center">
                            <svg className="h-5 w-5 text-gray-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <p className="text-base font-medium text-gray-900">
                              {customUser?.email || '-'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Rôle */}
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Rôle
                        </label>
                        <div className="mt-1 relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                          <div className="px-4 py-3 flex items-center">
                            <UserCircleIcon className="h-5 w-5 text-gray-400 mr-3" />
                            <p className="text-base font-medium text-gray-900">
                              {customUser?.role === 'admin' ? 'Administrateur' : customUser?.isEmployer ? 'Employeur' : 'Employé'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Code du centre */}
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Code du centre
                        </label>
                        <div className="mt-1 relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden group">
                          <div className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center">
                              <HomeIcon className="h-5 w-5 text-gray-400 mr-3" />
                              <p className="text-base font-medium text-gray-900">
                                {customUser?.centerCode || '-'}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(customUser?.centerCode || '');
                                toast.success('Code copié !');
                              }}
                              className="text-gray-400 hover:text-emerald-700 transition-colors duration-200"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ajouter après la fin des blocs existants dans la section de profil (après col-span-1 pour le code du centre) */}
                  
                  {/* Section paramètres du centre (uniquement pour les employeurs) */}
                  {customUser?.isEmployer && (
                    <div className="col-span-2 mt-6 pt-6 border-t border-gray-200 px-6"> {/* Ajout de padding horizontal ici */}
                      <h4 className="text-lg font-semibold text-gray-800 mb-4">Personnalisation du centre</h4>
                      
                      {/* Titre principal du centre */}
                      <div className="mb-5">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Titre principal
                        </label>
                        <div className="mt-1 relative rounded-xl border border-gray-200 bg-white overflow-hidden group hover:border-emerald-600 transition-colors duration-200">
                          <input
                            type="text"
                            value={centerTitle}
                            onChange={(e) => {
                              setCenterTitle(e.target.value);
                              setIsProfileModified(true);
                            }}
                            className="block w-full px-4 py-3 text-base font-medium text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent"
                            placeholder="Information du centre"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">Ce titre apparaîtra en haut de la section d&apos;information du centre.</p>
                      </div>
                      
                      {/* Sous-titre du centre */}
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Sous-titre
                        </label>
                        <div className="mt-1 relative rounded-xl border border-gray-200 bg-white overflow-hidden group hover:border-emerald-600 transition-colors duration-200">
                          <input
                            type="text"
                            value={centerSubtitle}
                            onChange={(e) => {
                              setCenterSubtitle(e.target.value);
                              setIsProfileModified(true);
                            }}
                            className="block w-full px-4 py-3 text-base font-medium text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent"
                            placeholder="Tableau de bord du centre actif"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">Ce sous-titre apparaîtra sous le titre principal.</p>
                      </div>
                      
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                    {isProfileModified && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!customUser?.uid || !customUser?.centerCode) return;
                          
                          try {
                            // Mise à jour du profil utilisateur avec validation
                            const userUpdates: { [key: string]: string } = {
                              firstName: profileEdits.firstName.trim(),
                              lastName: profileEdits.lastName.trim()
                            };
                            
                            // Mise à jour en base de données pour l'utilisateur
                            await updateDoc(doc(db, 'users', customUser.uid), userUpdates);
                            
                            // Mise à jour du document du centre si l'utilisateur est un employeur
                            // et que les informations du centre ont été modifiées
                            if (customUser.isEmployer && customUser.centerCode) {
                              // Ne pas recréer automatiquement un centre supprimé depuis le dashboard.
                              const centerRef = doc(db, 'centers', customUser.centerCode);
                              const centerDoc = await getDoc(centerRef);
                              
                              if (centerDoc.exists()) {
                                // Mise à jour du document du centre existant
                                await updateDoc(centerRef, {
                                  title: centerTitle,
                                  subtitle: centerSubtitle
                                });
                              }
                              console.log('Centre mis à jour avec succès');
                            }
                            
                            // Forcer la mise à jour des données dans l'UI
                            if (customUser) {
                              customUser.firstName = userUpdates.firstName;
                              customUser.lastName = userUpdates.lastName;
                            }
                            
                            toast.success('Modifications enregistrées avec succès');
                            setIsProfileModified(false);
                            // Ne pas réinitialiser profileEdits mais conserver les valeurs actuelles
                            // pour qu'elles restent visibles dans le formulaire
                          } catch (error) {
                            console.error('Error updating profile or center:', error);
                            toast.error('Erreur lors de la sauvegarde des modifications');
                          }
                        }}
                        className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-full text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 transition-colors duration-200"
                      >
                        Sauvegarder les modifications
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileModalOpen(false);
                        setIsProfileModified(false);
                        // Ne pas réinitialiser les champs à vide
                      }}
                      className={`w-full inline-flex justify-center items-center px-4 py-2.5 border text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isProfileModified 
                          ? 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                          : 'border-transparent text-white bg-emerald-800 hover:bg-emerald-900'
                      }`}
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {isSettingsModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity" onClick={() => setIsSettingsModalOpen(false)}>
                <div className="absolute inset-0 bg-emerald-950 opacity-30"></div>
              </div>
              <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
                <div className="relative">
                  {/* Header */}
                  <div className="px-6 pt-6 pb-8 bg-gradient-to-br from-emerald-900 to-emerald-700">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-3">
                        <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
                          <Cog6ToothIcon className="h-7 w-7 text-white" />
                        </div>
                        <h3 className="text-xl font-semibold text-white">Paramètres</h3>
                      </div>
                      <button
                        onClick={() => setIsSettingsModalOpen(false)}
                        className="rounded-lg p-1 text-emerald-100 hover:text-white hover:bg-emerald-700 transition-colors duration-200"
                      >
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>
                  </div>

                  {/* Contenu des paramètres */}
                  <div className="px-8 py-6 space-y-8">
                    {/* Section Notifications */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <BellIcon className="h-6 w-6 text-emerald-700" />
                        </div>
                        <h4 className="text-lg font-medium text-gray-900">Notifications</h4>
                      </div>
                      <div className="ml-13 space-y-3">
                        <label className="relative flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-emerald-200 transition-colors duration-200 group cursor-pointer">
                          <div className="flex items-center">
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-emerald-700 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Notifications par email</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={tempPreferences.emailNotifications}
                            onChange={(e) => updateTempPreferences({ emailNotifications: e.target.checked })}
                            className="h-5 w-5 rounded border-gray-300 text-emerald-700 focus:ring-emerald-700"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Section Langue */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <LanguageIcon className="h-6 w-6 text-emerald-600" />
                        </div>
                        <h4 className="text-lg font-medium text-gray-900">Langue</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => updateTempPreferences({ language: 'fr' })}
                          className={`flex items-center justify-center space-x-2 p-4 rounded-lg border-2 ${
                            tempPreferences.language === 'fr'
                              ? 'border-emerald-600 bg-white'
                              : 'border-gray-200 hover:border-gray-300'
                          } transition-colors duration-200`}
                        >
                          <span className="text-lg">🇫🇷</span>
                          <span className="text-sm font-medium text-gray-900">Français</span>
                        </button>
                        <button
                          onClick={() => updateTempPreferences({ language: 'en' })}
                          className={`flex items-center justify-center space-x-2 p-4 rounded-lg border-2 ${
                            tempPreferences.language === 'en'
                              ? 'border-emerald-600 bg-white'
                              : 'border-gray-200 hover:border-gray-300'
                          } transition-colors duration-200`}
                        >
                          <span className="text-lg">🇬🇧</span>
                          <span className="text-sm font-medium text-gray-700">English</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                    {isPreferencesModified && (
                      <button
                        type="button"
                        onClick={savePreferences}
                        className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-full text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 transition-colors duration-200"
                      >
                        Sauvegarder les modifications
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsModalOpen(false);
                        if (isPreferencesModified) {
                          setTempPreferences(userPreferences);
                          setIsPreferencesModified(false);
                        }
                      }}
                      className={`w-full inline-flex justify-center items-center px-4 py-2.5 border text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isPreferencesModified 
                          ? 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                          : 'border-transparent text-white bg-emerald-800 hover:bg-emerald-900'
                      }`}
                    >
                      {isPreferencesModified ? 'Annuler' : 'Fermer'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 w-72 sm:w-64 bg-white/88 backdrop-blur-xl border-r border-emerald-900/5 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}>
          <div className="flex flex-col h-full pt-20 lg:pt-0">
            <div className="hidden lg:flex items-center justify-center h-28">
              <button
                onClick={() => {
                  setActiveTab('accueil');
                  router.push(`/dashboard?tab=accueil`);
                }}
                className="group flex items-center space-x-3 px-4 py-2 rounded-2xl transition-all duration-300 hover:bg-emerald-50 focus:outline-none"
              >
                <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-emerald-900 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-200/60 transition-all duration-300 group-hover:shadow-emerald-300/60 group-hover:scale-105">
                  <span className="text-white font-bold text-xl">G</span>
                </div>
                <span className="text-2xl font-extrabold text-emerald-900 transition-all duration-300">
                  GestApp
                </span>
              </button>
            </div>
            <nav className="flex-1 px-7 py-6 space-y-4 overflow-y-auto">
              {navigation.map((item) => (
                <button
                  key={item.name}
                  onClick={() => {
                    setActiveTab(item.tab);
                    setIsMobileMenuOpen(false);
                    // Si on clique sur l'onglet tâches, définir le filtre sur "all"
                    if (item.tab === 'taches') {
                      setTaskFilter('all');
                      setSelectedDate(null);
                      // Utiliser router.push à la place de window.history pour une meilleure gestion de l'historique
                      router.push(`/dashboard?tab=${item.tab}&filter=all`);
                    } else {
                      // Utiliser router.push pour créer une entrée dans l'historique
                      router.push(`/dashboard?tab=${item.tab}`);
                    }
                  }}
                  className={`w-full flex items-center px-2 py-2.5 text-base font-bold rounded-full transition-all duration-200 ${
                    activeTab === item.tab
                      ? 'bg-emerald-50 text-emerald-800 shadow-sm'
                      : 'text-gray-800 hover:bg-emerald-50/70 hover:text-emerald-900'
                  }`}
                >
                  <div className="relative">
                    {/* L'icône de l'onglet */}
                    <span className={`mr-4 flex h-12 w-12 items-center justify-center rounded-full border transition-colors duration-200 ${
                      activeTab === item.tab ? 'border-emerald-100 bg-emerald-100 text-emerald-800' : 'border-gray-100 bg-white text-gray-900 shadow-sm'
                    }`}>
                      <item.icon className="h-6 w-6" />
                    </span>
                    {/* Afficher le badge seulement s'il existe et est supérieur à 0 */}
                    {item.badge && item.badge > 0 && (
                      <span className="absolute -top-2 right-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-medium text-white ring-2 ring-white">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.name}
                </button>
              ))}
            </nav>
            <div className="p-7">
              <button
                onClick={handleLogout}
                className="ga-card-flat w-full inline-flex items-center justify-center gap-3 px-5 py-4 text-sm font-extrabold text-gray-800 transition-all duration-200 hover:bg-emerald-50 hover:text-emerald-900"
              >
                <XMarkIcon className="h-5 w-5" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className={`lg:pl-64 pt-20 ${activeTab === 'accueil' ? 'lg:pt-20' : 'lg:pt-28'}`}>
          <main className={`max-w-[104rem] mx-auto px-4 sm:px-8 lg:px-12 relative z-0 ${activeTab === 'accueil' ? 'py-5 sm:py-6' : 'py-10'}`}>
            {/* Overlay for mobile menu */}
            {isMobileMenuOpen && (
              <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              />
            )}
            {renderContent()}
          </main>
        </div>

        {/* Mobile header avec bouton profil */}
        <div className="fixed top-0 left-0 z-50 w-full bg-white border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => {
                setActiveTab('accueil');
                router.push(`/dashboard?tab=accueil`);
              }}
              className="group flex items-center space-x-2 focus:outline-none"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-900 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-200/50 transition-all duration-300 group-hover:shadow-emerald-300/60 group-hover:scale-105">
                <span className="text-white font-bold text-lg">G</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-900 to-emerald-700 bg-clip-text text-transparent transition-all duration-300 group-hover:from-emerald-800 group-hover:to-emerald-600">
                GestApp
              </span>
            </button>
            <div className="w-48" aria-hidden="true" />
          </div>
        </div>

        {/* Floating menu button for mobile - always visible */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="fixed bottom-4 right-4 h-14 w-14 rounded-full bg-emerald-800 text-white shadow-xl hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 flex items-center justify-center z-50 lg:hidden transition-transform duration-200 hover:scale-105 border-2 border-white"
          aria-label="Menu principal"
        >
          {isMobileMenuOpen ? (
            <MenuCloseIcon className="h-7 w-7" aria-hidden="true" />
          ) : (
            <Bars3Icon className="h-7 w-7" aria-hidden="true" />
          )}
        </button>

        <CreateTaskModal
          isOpen={isCreateTaskModalOpen}
          onClose={() => setIsCreateTaskModalOpen(false)}
          centerCode={centerCode || ''}
          onTaskCreated={handleTaskCreated}
          currentUserInfo={{ // Passer l'objet currentUserInfo
            id: customUser?.uid || '',
            firstName: customUser?.firstName,
            lastName: customUser?.lastName
          }}
        />
        {selectedTask && (
          <TaskDetailModal
            isOpen={isTaskDetailModalOpen}
            onClose={() => {
              setIsTaskDetailModalOpen(false);
              setSelectedTask(null);
            }}
            task={selectedTask}
            centerCode={customUser?.centerCode || ''}
            currentUserId={customUser?.uid || ''}
            currentUserName={`${customUser?.firstName || ''} ${customUser?.lastName || ''}`}
            isEmployer={customUser?.isEmployer || false}
            onTaskDeleted={() => {
              setIsTaskDetailModalOpen(false);
              setSelectedTask(null);
            }}
          />
        )}

        {/* Modale de confirmation pour compléter une tâche */}
        {isConfirmCompleteModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity" onClick={() => {
                setIsConfirmCompleteModalOpen(false);
                setTaskToComplete(null);
              }}>
                <div className="absolute inset-0 bg-emerald-950 opacity-30"></div>
              </div>
              
              {/* Centrer la modale */}
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
              
              <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
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
                <div className="bg-emerald-50/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
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
                    className="mt-3 w-full inline-flex justify-center rounded-full border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
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
        {isConfirmUncompleteModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity" onClick={() => {
                setIsConfirmUncompleteModalOpen(false);
                setTaskToUncomplete(null);
              }}>
                <div className="absolute inset-0 bg-emerald-950 opacity-30"></div>
              </div>

              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

              <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 sm:mx-0 sm:h-10 sm:w-10">
                      <ClockIcon className="h-6 w-6 text-amber-600" aria-hidden="true" />
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-lg leading-6 font-medium text-gray-900">
                        Confirmation
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          Êtes-vous sûr de vouloir exécuter cette action ?
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-50/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-amber-600 text-base font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => {
                      if (taskToUncomplete) {
                        handleUncompleteTask(taskToUncomplete);
                      }
                    }}
                  >
                    Oui, remettre à compléter
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-full border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-700 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => {
                      setIsConfirmUncompleteModalOpen(false);
                      setTaskToUncomplete(null);
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {selectedMessage && (
          <MessageDetailModal
            isOpen={isMessageDetailModalOpen}
            onClose={() => {
              setIsMessageDetailModalOpen(false);
              setSelectedMessage(null);
            }}
            message={selectedMessage}
            currentUserId={customUser?.uid || ''}
            isEmployer={customUser?.isEmployer || false}
          />
        )}
      </div>
    </ProtectedRoute>
  );
} 
