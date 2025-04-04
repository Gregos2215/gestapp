'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp, Timestamp, getDocs, orderBy, addDoc, writeBatch, deleteDoc, limit } from 'firebase/firestore';
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

// Enregistrer la locale française pour le DatePicker
registerLocale('fr', fr);

type Tab = 'accueil' | 'taches' | 'residents' | 'rapports' | 'messages' | 'alertes';

interface OnlineUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isOnline: boolean;
  lastOnlineAt: Date | null;
  centerCode: string;
}

interface CustomUser extends Omit<FirebaseUser, 'delete' | 'reload'> {
  isEmployer: boolean;
  centerCode: string;
  firstName: string;
  lastName: string;
}

interface Task {
  id: string;
  type: 'resident' | 'general';
  name: string;
  description: string;
  dueDate: Date | { toDate: () => Date };
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
  skippedDates?: number[]; // Tableau des timestamps (en millisecondes) des dates à ignorer
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
  type: 'task_created' | 'report_created' | 'task_overdue';
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

// Move these component definitions before they are used
const renderEmployeeView = (
  isOnline: boolean,
  toggleOnlineStatus: () => Promise<void>,
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
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
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
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
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
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Combiner toutes les tâches avec la priorité souhaitée
    const nextTasks = [...yesterdayTasks, ...overdueTasks, ...todayTasks];
    
    // Limiter à 10 tâches maximum (au lieu de 5)
    return nextTasks.slice(0, 10);
  };
  
  const nextTasks = getNextTasks();
  
  return (
    <div className="space-y-6">
      {/* Section Mon statut */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Mon statut</h2>
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
      
      {/* Section Prochaines tâches */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Prochaines tâches</h2>
          <button
            onClick={() => window.location.href = '/dashboard?tab=taches'}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors duration-200"
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
              let statusBg = 'bg-indigo-100';
              let statusText = 'text-indigo-800';
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
                        : 'border-gray-200 hover:border-indigo-200 hover:bg-indigo-50 border-l-4 ' + 
                          (task.type === 'resident' ? 'border-l-purple-500' : 'border-l-blue-500')
                  }`}
                  onClick={() => {
                    // Si c'est une tâche de la veille, rediriger vers la section "Tâches non complétées de la veille"
                    if (isYesterday) {
                      window.location.href = '/dashboard?tab=taches&filter=yesterday';
                    } else {
                      // Sinon, rediriger vers la section des tâches du jour
                      window.location.href = '/dashboard?tab=taches';
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
    </div>
  );
};

const renderEmployerView = (
  onlineUsers: OnlineUser[],
  router: ReturnType<typeof useRouter>
) => (
  <>
    {/* Section Liste des employés */}
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Liste de tous les employés</h2>
        <span className="mr-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
          {onlineUsers.length} employés
        </span>
      </div>
      <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg">
        <div className="w-16 h-16 mb-4 flex items-center justify-center bg-indigo-100 rounded-full">
          <UserGroupIcon className="w-8 h-8 text-indigo-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Gérer votre équipe</h3>
        <p className="text-sm text-gray-500 text-center mb-4">
          Accédez à la liste complète de vos employés pour consulter leurs profils ou gérer les comptes.
        </p>
        <button
          onClick={() => router.push('/employees')}
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-150"
        >
          <UserGroupIcon className="-ml-1 mr-2 h-5 w-5" />
          Voir tous les employés
        </button>
      </div>
    </div>
    
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Employés en ligne</h2>
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

export default function DashboardPage() {
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
  const [isCreateReportModalOpen, setIsCreateReportModalOpen] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isReportDetailModalOpen, setIsReportDetailModalOpen] = useState(false);
  const [currentReportPage, setCurrentReportPage] = useState(1);
  const reportsPerPage = 4;
  const [alerts, setAlerts] = useState<Alert[]>([]);
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
  
  // Ajouter après ces lignes:
  const [centerTitle, setCenterTitle] = useState<string>("Information du centre");
  const [centerSubtitle, setCenterSubtitle] = useState<string>("Tableau de bord du centre actif");

  // États pour la gestion des messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageTitle, setNewMessageTitle] = useState('');
  const [newMessageContent, setNewMessageContent] = useState('');
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

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
    if (tabParam && ['accueil', 'taches', 'residents', 'rapports', 'messages', 'alertes'].includes(tabParam)) {
      setActiveTab(tabParam as Tab);
      
      // Si l'onglet est 'taches', vérifier s'il y a un paramètre de filtre
      if (tabParam === 'taches') {
        const filterParam = searchParams.get('filter');
        if (filterParam && ['all', 'resident', 'general', 'upcoming', 'past', 'completed', 'yesterday'].includes(filterParam)) {
          setTaskFilter(filterParam as TaskFilter);
        }
      }
    }
  }, [searchParams]);

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
          
          // Récupérer les paramètres du centre si disponibles
          if (userData.centerCode && typeof userData.centerCode === 'string' && userData.centerCode.trim() !== '') {
            try {
              const centerRef = doc(db, 'centers', userData.centerCode);
              const centerDoc = await getDoc(centerRef);
              if (centerDoc.exists()) {
                const centerData = centerDoc.data();
                if (centerData.title) setCenterTitle(centerData.title);
                if (centerData.subtitle) setCenterSubtitle(centerData.subtitle);
              }
            } catch (error) {
              console.error('Error fetching center document:', error);
              // Ne pas afficher de toast pour ne pas perturber l'expérience utilisateur
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
        toast.error('Erreur lors du chargement des données utilisateur');
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

    const q = query(
      collection(db, 'users'),
      where('centerCode', '==', centerCode),
      where('isEmployer', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('Received employee update, count:', snapshot.size);
      const users: OnlineUser[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        users.push({
          id: doc.id,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email,
          isOnline: data.isOnline || false,
          lastOnlineAt: data.lastOnlineAt ? data.lastOnlineAt.toDate() : null,
          centerCode: data.centerCode
        });
      });
      console.log('Updated online users:', users);
      setOnlineUsers(users);
    }, (error) => {
      console.error('Error in employee listener:', error);
      toast.error('Erreur lors de la mise à jour des employés en ligne');
    });

    return () => unsubscribe();
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
          customRecurrence: data.customRecurrence,
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
          } : undefined
        };
        
        tasksData.push(taskData);
      });
      
      console.log(`[onSnapshot] Processed ${tasksData.length} tasks.`);
      setTasks(tasksData);
    }, (error) => {
      console.error('[onSnapshot] Error:', error);
      toast.error('Erreur lors de la mise à jour des tâches.');
    });

    return () => {
      console.log('Cleaning up Firestore listener.');
      unsubscribe();
    };
  }, [customUser]);

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
      console.error('Error updating online status:', error);
      toast.error('Erreur lors de la mise à jour du statut');
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
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      toast.error('Erreur lors de la déconnexion');
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
      return new Date(dateInput);
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
            // Calculer la date d'hier
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            
            const isYesterday = taskDate.getTime() === yesterday.getTime();
            
            // Si cette tâche est marquée comme ignorée (skippedDates) pour hier,
            // on la considère comme traitée, même si elle n'a pas été explicitement marquée comme complétée
            const isSkippedYesterday = task.skippedDates?.includes(yesterday.getTime());
            
            // Console log pour débogage
            console.log(`[Filter Check Yesterday] Task ID: ${task.id}, Name: ${task.name}, isYesterday: ${isYesterday}, Status: ${task.status}, isSkippedYesterday: ${isSkippedYesterday}, Deleted: ${task.deleted}`);
            
            // Inclure seulement si c'est une tâche d'hier, non complétée, non skippée, et correspond à la recherche
            return isYesterday && task.status !== 'completed' && !isSkippedYesterday && matchesSearch;
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
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
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
          <h2 className="text-2xl font-bold text-gray-800">Gestion des tâches</h2>
          <button
            onClick={() => setIsCreateTaskModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-colors duration-200"
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
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-200'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <ClipboardDocumentListIcon className={`h-5 w-5 ${taskFilter === 'all' ? 'text-indigo-200' : 'text-gray-400'} mr-2`} />
              <span>Toutes les tâches</span>
              <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                taskFilter === 'all'
                  ? 'bg-indigo-500 text-white'
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
              <span>Tâches complétées</span>
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
              <span>Tâches non complétées de la veille</span>
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
                  
                  // Calculer la date d'hier
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);
                  
                  const taskDate = new Date(t.dueDate);
                  taskDate.setHours(0, 0, 0, 0);
                  
                  // Vérifier si la date est ignorée
                  if (isDateSkipped(t, yesterday)) return false;
                  
                  // Vérifier si c'est une tâche de la veille non complétée
                  return taskDate.getTime() === yesterday.getTime() && t.status !== 'completed';
                }).length}
              </span>
            </button>
            <button
              onClick={() => setTaskFilter('upcoming')}
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
                  customInput={
                    <input
                      className={`w-full sm:w-auto px-4 py-2 rounded-lg border ${
                        selectedDate
                          ? 'border-amber-500 text-amber-700'
                          : 'border-gray-300 text-gray-700'
                        } focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder-gray-600 text-gray-700`}
                    />
                  }
                />
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate(null)}
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
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-lg font-medium text-gray-900">
                                {task.name}
                              </h3>
                              {task.isVirtualOccurrence && (
                                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
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
                              if (task.status !== 'completed') {
                                // Au lieu d'appeler directement handleCompleteTask, ouvrir la modale de confirmation
                                setTaskToComplete(task.id);
                                setIsConfirmCompleteModalOpen(true);
                              }
                            }}
                            className={`inline-flex items-center px-3 py-2 border text-sm leading-4 font-medium rounded-md shadow-sm ${
                              task.status === 'completed'
                                ? 'border-green-200 text-green-700 bg-green-50 cursor-default'
                                : task.isVirtualOccurrence
                                ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                                : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200'
                            } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                              task.status === 'completed' ? 'focus:ring-green-500' : 'focus:ring-gray-500'
                            }`}
                            disabled={task.status === 'completed' || task.isVirtualOccurrence}
                            title={task.isVirtualOccurrence ? "Impossible de compléter une occurrence future avant d'avoir complété les occurrences précédentes" : ""}
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
      console.error('Error loading reports:', error);
      toast.error('Erreur lors du chargement des rapports');
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

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log('[loadAlerts] Snapshot reçu, nombre de documents:', querySnapshot.size);
      
      const alertsData: Alert[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log('[loadAlerts] Alerte trouvée:', doc.id, 'type:', data.type, 'excludedUsers:', data.excludedUsers);
        
        // N'ajouter l'alerte que si l'utilisateur n'est pas dans la liste des exclus
        if (!data.excludedUsers?.includes(customUser?.uid)) {
          alertsData.push({
            id: doc.id,
            ...data
          } as Alert);
        } else {
          console.log('[loadAlerts] Alerte exclue pour l\'utilisateur:', doc.id);
        }
      });
      
      console.log('[loadAlerts] Alertes chargées:', alertsData.length);
      setAlerts(alertsData);
    }, (error) => {
      console.error('[loadAlerts] Erreur lors du chargement des alertes:', error);
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
      }
    }, (error) => {
      console.error('Error listening to center document:', error);
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
      console.error('[loadMessages] Erreur lors du chargement des messages:', error);
      toast.error('Erreur lors du chargement des messages');
    });
    
    return () => unsubscribe();
  }, [customUser?.centerCode]);

  const checkOverdueTasks = async () => {
    if (!customUser?.centerCode) return;
    
    try {
      console.log('Vérification des tâches en retard...');
      
      // Rétablir la requête complète maintenant que l'index est créé
      const tasksQuery = query(
        collection(db, 'tasks'),
        where('centerCode', '==', customUser.centerCode),
        where('status', '==', 'pending'),
        where('isVirtualOccurrence', '==', false),
        where('deleted', '!=', true)
      );
      
      const tasksSnapshot = await getDocs(tasksQuery);
      const tasks = tasksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];

      // Plus besoin de filtrage manuel
      // const filteredTasks = tasks.filter(task => 
      //   !task.isVirtualOccurrence && 
      //   task.deleted !== true
      // );

      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);

      for (const task of tasks) {
        const taskDueDate = task.dueDate instanceof Date 
          ? task.dueDate 
          : 'toDate' in task.dueDate 
            ? (task.dueDate as { toDate: () => Date }).toDate()
            : new Date(task.dueDate as unknown as string | number);

        // Vérifier si la tâche est en retard de plus de 20 minutes
        if (taskDueDate < twentyMinutesAgo) {
          console.log(`Tâche en retard trouvée: ${task.name}, due le ${taskDueDate.toLocaleString()}`);

          // Vérifier si une alerte existe déjà pour cette tâche
          const alertQuery = query(
            collection(db, 'alerts'),
            where('type', '==', 'task_overdue'),
            where('relatedId', '==', task.id)
          );

          const alertSnapshot = await getDocs(alertQuery);

          if (alertSnapshot.empty) {
            // Créer une nouvelle alerte
            const alertData: Omit<Alert, 'id'> = {
              type: 'task_overdue',
              title: 'Tâche en retard',
              message: `La tâche "${task.name}" est en retard de plus de 20 minutes.`,
              createdAt: serverTimestamp() as Timestamp,
              readBy: [],
              relatedId: task.id,
              centerCode: customUser.centerCode,
            };

            await addDoc(collection(db, 'alerts'), alertData);
            console.log(`Nouvelle alerte créée pour la tâche: ${task.name}`);
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des tâches en retard:', error);
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
        console.error('Error loading user preferences:', error);
        toast.error('Erreur lors du chargement des préférences');
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

  const renderContent = () => {
    switch (activeTab) {
      case 'accueil':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <button
                onClick={() => {
                  setActiveTab('taches');
                  setTaskFilter('all');
                  setSelectedDate(null);
                  window.history.pushState({}, '', `?tab=taches&filter=all`);
                }}
                className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow duration-200"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Tâches du jour</h3>
                  <ClipboardDocumentListIcon className="h-8 w-8 opacity-75" />
                </div>
                <p className="text-3xl font-bold mt-4">
                  {(() => {
                    // Utiliser la même logique que celle utilisée dans le filteredAndSortedTasks
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
                </p>
                <p className="text-indigo-100 text-sm mt-2">
                  {(() => {
                    // Utiliser la même logique que celle utilisée dans le filteredAndSortedTasks
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // Générer les occurrences virtuelles pour aujourd'hui
                    const tasksWithVirtual = generateFutureOccurrences(tasks, today);
                    
                    // Filtrer pour les tâches d'aujourd'hui complétées
                    return tasksWithVirtual.filter(t => {
                      // Ignorer les tâches supprimées
                      if (t.deleted === true) return false;
                      
                      const taskDate = new Date(t.dueDate);
                      taskDate.setHours(0, 0, 0, 0);
                      
                      // Ne pas vérifier isDateSkipped ici car generateFutureOccurrences le fait déjà
                      
                      // Retourner les tâches complétées d'aujourd'hui
                      return taskDate.getTime() === today.getTime() && t.status === 'completed';
                    }).length;
                  })()} terminées
                </p>
              </button>
              <button
                onClick={() => setActiveTab('residents')}
                className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow duration-200"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Résidents actifs</h3>
                  <UsersIcon className="h-8 w-8 opacity-75" />
                </div>
                <p className="text-3xl font-bold mt-4">{residents.length}</p>
                <p className="text-emerald-100 text-sm mt-2">
                  {residents.filter(r => r.gender === 'male').length} hommes • {residents.filter(r => r.gender === 'female').length} femmes
                </p>
              </button>
              <button
                onClick={() => setActiveTab('rapports')}
                className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow duration-200"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Rapports d&apos;activité</h3>
                  <DocumentTextIcon className="h-8 w-8 opacity-75" />
                </div>
                <p className="text-3xl font-bold mt-4">
                  {reports.filter(r => {
                    if (!r.createdAt) return false;
                    // Vérifier que le rapport est d'aujourd'hui
                    const reportDate = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt as any);
                    return isSameDay(reportDate, new Date());
                  }).length}
                </p>
                <p className="text-amber-100 text-sm mt-2">aujourd&apos;hui</p>
              </button>
              <button
                onClick={() => setActiveTab('alertes')}
                className="bg-gradient-to-br from-rose-600 to-rose-700 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow duration-200"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Alertes</h3>
                  <div className="relative">
                    <BellIcon className="h-8 w-8 opacity-75" />
                    {alerts.filter(alert => 
                      !alert.readBy?.includes(customUser?.uid || '') && 
                      isSameDay(alert.createdAt.toDate(), new Date())
                    ).length > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-white"></span>
                    )}
                  </div>
                </div>
                <p className="text-3xl font-bold mt-4">
                  {alerts.filter(alert => 
                    !alert.readBy?.includes(customUser?.uid || '') && 
                    isSameDay(alert.createdAt.toDate(), new Date())
                  ).length}
                </p>
                <p className="text-rose-100 text-sm mt-2">non lues aujourd&apos;hui</p>
              </button>
            </div>
            
            <div className="bg-white rounded-2xl shadow-2xl p-8 border-2 border-indigo-100 overflow-hidden relative mb-14 transform transition-all duration-500 hover:scale-[1.01]">
              {/* Background elements */}
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-br from-indigo-400/10 to-purple-500/10 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-gradient-to-tr from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-40 bg-gradient-to-r from-indigo-100/20 via-purple-100/10 to-pink-100/20 -rotate-12 blur-3xl -z-10"></div>
              
              {/* Header with badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 pb-6 border-b border-indigo-100">
                <div className="flex items-center mb-4 sm:mb-0">
                  <div className="relative mr-6">
                    <span className="text-5xl filter drop-shadow-md">🏢</span>
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
                    </span>
                  </div>
                  <div>
                    <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 tracking-tight">
                      {centerTitle}
                    </h2>
                    <p className="text-indigo-400 text-sm mt-1">{centerSubtitle}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-5 py-2.5 rounded-full text-white font-semibold shadow-lg shadow-green-200 flex items-center">
                    <span className="inline-block h-3 w-3 rounded-full bg-white mr-2 animate-pulse"></span>
                    <span>Centre Actif</span>
                  </div>
                </div>
              </div>
              
              {/* Main content in 3D-like cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
                {/* Card 1: Code du centre */}
                <div className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-6 rounded-xl border border-indigo-100 shadow-lg shadow-indigo-100/30 relative overflow-hidden group transition-all duration-300 hover:shadow-xl hover:shadow-indigo-200/40 hover:-translate-y-1">
                  <div className="absolute -right-16 -top-16 w-32 h-32 bg-indigo-100 rounded-full blur-2xl opacity-70 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  <div className="flex items-center mb-6">
                    <div className="h-14 w-14 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-md shadow-indigo-200/50 mr-4">
                      <HomeIcon className="h-7 w-7" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">Code du centre</h3>
                  </div>
                  
                  <div className="relative z-10">
                    <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-indigo-100 mb-5">
                      <p className="text-3xl font-mono font-bold text-indigo-700 tracking-widest">{centerCode}</p>
                      <p className="text-xs text-indigo-400 mt-1">Utilisez ce code pour inscrire de nouveaux employés</p>
                    </div>
                    
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(centerCode || '');
                        toast.success('Code copié !', {
                          icon: '📋',
                          style: {
                            border: '1px solid #d1d5db',
                            padding: '16px',
                            color: '#4b5563',
                          },
                        });
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-indigo-200 transition-all duration-300 flex items-center justify-center group"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 transition-transform duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copier le code
                    </button>
                  </div>
                </div>
                
                {/* Card 2: Statistiques principales */}
                <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 rounded-xl border border-blue-100 shadow-lg shadow-blue-100/30 relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-blue-200/40 hover:-translate-y-1">
                  <div className="absolute -left-16 -bottom-16 w-32 h-32 bg-blue-100 rounded-full blur-2xl opacity-70"></div>
                  
                  <div className="flex items-center mb-6">
                    <div className="h-14 w-14 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-md shadow-blue-200/50 mr-4">
                      <ChartBarIcon className="h-7 w-7" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">Statistiques</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 relative z-10">
                    <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-blue-100 flex flex-col items-center justify-center">
                      <span className="text-3xl mb-2">👨‍👩‍👧‍👦</span>
                      <p className="text-3xl font-bold text-blue-700">{residents.length}</p>
                      <p className="text-xs text-blue-400 text-center">Résidents</p>
                    </div>
                    <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-blue-100 flex flex-col items-center justify-center">
                      <span className="text-3xl mb-2">📋</span>
                      <p className="text-3xl font-bold text-blue-700">{tasks.length}</p>
                      <p className="text-xs text-blue-400 text-center">Tâches</p>
                    </div>
                    <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-blue-100 flex flex-col items-center justify-center">
                      <span className="text-3xl mb-2">👥</span>
                      <p className="text-3xl font-bold text-blue-700">{onlineUsers.length}</p>
                      <p className="text-xs text-blue-400 text-center">Employés</p>
                    </div>
                    <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-blue-100 flex flex-col items-center justify-center">
                      <span className="text-3xl mb-2">📊</span>
                      <p className="text-3xl font-bold text-blue-700">{reports.length}</p>
                      <p className="text-xs text-blue-400 text-center">Rapports</p>
                    </div>
                  </div>
                </div>
                
                {/* Card 3: Activité en temps réel */}
                <div className="bg-gradient-to-br from-emerald-50 via-white to-green-50 p-6 rounded-xl border border-emerald-100 shadow-lg shadow-emerald-100/30 relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-emerald-200/40 hover:-translate-y-1">
                  <div className="absolute -right-16 -bottom-16 w-32 h-32 bg-emerald-100 rounded-full blur-2xl opacity-70"></div>
                  
                  <div className="flex items-center mb-6">
                    <div className="h-14 w-14 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shadow-md shadow-emerald-200/50 mr-4">
                      <ClockIcon className="h-7 w-7" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">Activité en direct</h3>
                  </div>
                  
                  <div className="relative z-10 space-y-4">
                    <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-emerald-100 flex items-center">
                      <div className="flex-shrink-0 mr-4 relative">
                        <span className="text-2xl">🟢</span>
                        <span className="absolute bottom-0 right-0 h-2 w-2 bg-green-500 rounded-full"></span>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-800">{onlineUsers.filter(u => u.isOnline).length} en ligne</p>
                        <p className="text-xs text-gray-500">Employés actifs actuellement</p>
                      </div>
                    </div>
                    
                    <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-emerald-100 flex items-center">
                      <div className="flex-shrink-0 mr-4 relative">
                        <span className="text-2xl">⏱️</span>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-800">
                          {tasks.filter(t => {
                            if (t.deleted === true) return false;
                            if (t.status === 'completed') return false;
                            
                            const taskDate = new Date(t.dueDate instanceof Date ? t.dueDate : t.dueDate.toDate());
                            taskDate.setHours(0, 0, 0, 0);
                            
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            return taskDate.getTime() === today.getTime();
                          }).length} tâches aujourd'hui
                        </p>
                        <p className="text-xs text-gray-500">Tâches restantes pour la journée</p>
                      </div>
                    </div>
                    
                    <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-emerald-100 flex items-center">
                      <div className="flex-shrink-0 mr-4 relative">
                        <span className="text-2xl">🔔</span>
                        {alerts.filter(alert => 
                          !alert.readBy?.includes(customUser?.uid || '') && 
                          isSameDay(alert.createdAt.toDate(), new Date())
                        ).length > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-800">{alerts.filter(alert => 
                          !alert.readBy?.includes(customUser?.uid || '') && 
                          isSameDay(alert.createdAt.toDate(), new Date())
                        ).length} alertes</p>
                        <p className="text-xs text-gray-500">Notifications non lues aujourd&apos;hui</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Insights Bar */}
              <div className="bg-gradient-to-r from-violet-50 via-purple-50 to-fuchsia-50 p-5 rounded-xl border border-violet-100 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <div className="h-11 w-11 bg-violet-100 rounded-lg flex items-center justify-center text-violet-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                      <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800">Aperçu du centre</h3>
                </div>
                
                <div className="flex flex-wrap justify-center gap-5">
                  <div className="relative overflow-hidden group">
                    <div className="bg-white/70 backdrop-blur-sm px-4 py-2.5 rounded-xl shadow-sm border border-violet-100 flex items-center transition-all duration-300 hover:bg-white hover:shadow-md">
                      <span className="text-xl mr-2.5">🏆</span>
                      <p className="text-sm font-medium text-gray-700">{residents.length > 0 ? `${residents.length} résidents pris en charge` : "Aucun résident actuellement"}</p>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-200/0 via-violet-200/30 to-violet-200/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1500"></div>
                  </div>
                  <div className="relative overflow-hidden group">
                    <div className="bg-white/70 backdrop-blur-sm px-4 py-2.5 rounded-xl shadow-sm border border-violet-100 flex items-center transition-all duration-300 hover:bg-white hover:shadow-md">
                      <span className="text-xl mr-2.5">📅</span>
                      <p className="text-sm font-medium text-gray-700">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-200/0 via-violet-200/30 to-violet-200/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1500"></div>
                  </div>
                  <div className="relative overflow-hidden group">
                    <div className="bg-white/70 backdrop-blur-sm px-4 py-2.5 rounded-xl shadow-sm border border-violet-100 flex items-center transition-all duration-300 hover:bg-white hover:shadow-md">
                      <span className="text-xl mr-2.5">💼</span>
                      <p className="text-sm font-medium text-gray-700">{customUser?.isEmployer ? 'Compte Employeur' : 'Compte Employé'}</p>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-200/0 via-violet-200/30 to-violet-200/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1500"></div>
                  </div>
                </div>
              </div>
            </div>

            {userType === 'employer' ? (
              <>
                {renderEmployerView(onlineUsers, router)}
                
                {/* Section des derniers rapports */}
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Derniers rapports</h2>
                    <button
                      onClick={() => setActiveTab('rapports')}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors duration-200"
                    >
                      Voir tous les rapports
                    </button>
                  </div>
                  <div className="space-y-4">
                    {reports.length > 0 ? (
                      reports
                        .sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime())
                        .slice(0, 3)
                        .map(report => (
                          <div
                            key={report.id}
                            className="p-4 border border-gray-200 rounded-lg hover:border-indigo-200 hover:bg-indigo-50 transition-all duration-200 cursor-pointer group"
                            onClick={() => {
                              setSelectedReport(report);
                              setIsReportDetailModalOpen(true);
                            }}
                          >
                            <div className="flex items-start">
                              <div className="flex-shrink-0 mr-4">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center text-white font-medium text-sm shadow-sm group-hover:shadow-md transition-shadow duration-200">
                                  {report.userName.split(' ').map(n => n[0]).join('')}
                                </div>
                              </div>
                              <div className="flex-grow min-w-0">
                                <p className="font-medium text-gray-900 line-clamp-2 group-hover:text-indigo-600 transition-colors duration-200">{report.content}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                  {format(report.createdAt.toDate(), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="text-center text-gray-500 py-4">Aucun rapport récent</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {renderEmployeeView(isOnline, toggleOnlineStatus, tasks, isDateSkipped)}
              </>
            )}
          </div>
        );
      case 'taches':
        return renderTasksContent();
      case 'residents':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">Gestion des résidents</h2>
              <button 
                onClick={() => setIsCreateResidentModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-colors duration-200"
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
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm shadow-sm"
                placeholder="Rechercher par nom, prénom, langue, niveau d'autonomie..."
              />
            </div>

            {/* Boutons de filtre */}
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => setResidentFilter('all')}
                className={`px-6 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center ${
                  residentFilter === 'all'
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-200'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <UsersIcon className={`h-5 w-5 ${residentFilter === 'all' ? 'text-indigo-200' : 'text-gray-400'} mr-2`} />
                <span>Tous les résidents</span>
                <span className={`ml-3 px-2.5 py-0.5 text-xs rounded-full ${
                  residentFilter === 'all'
                    ? 'bg-indigo-500 text-white'
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
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
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
                        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer"
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
              <h2 className="text-2xl font-bold text-gray-800">Rapports d&apos;activité</h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
                <DatePicker
                  selected={selectedDate}
                  onChange={(date) => setSelectedDate(date as Date)}
                  dateFormat="dd/MM/yyyy"
                  locale="fr"
                  placeholderText="Sélectionner une date"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 placeholder-gray-600 text-gray-700"
                  customInput={
                    <input
                      className="w-full sm:w-auto rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 placeholder-gray-600 text-gray-700"
                    />
                  }
                />
                <button
                  onClick={() => setIsCreateReportModalOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-colors duration-200"
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
                          className="group relative bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all duration-200 cursor-pointer"
                        >
                          <div className="p-6">
                            <div className="flex flex-col sm:flex-row items-start gap-4">
                              <div className="flex-shrink-0">
                                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center text-white font-semibold text-lg shadow-sm">
                                  {report.userName.split(' ').map(n => n[0]).join('')}
                                </div>
                              </div>

                              <div className="flex-grow space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-semibold text-gray-900">
                                      {report.userName}
                                    </h3>
                                    <span className="hidden sm:inline text-gray-300">•</span>
                                    <p className="text-sm text-gray-500 font-medium">
                                      {report.createdAt && report.createdAt.toDate ? 
                                        format(report.createdAt.toDate(), 'dd MMMM yyyy à HH:mm', { locale: fr }) :
                                        'Date non disponible'
                                      }
                                    </p>
                                  </div>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4 relative overflow-hidden group-hover:bg-white transition-colors duration-200 border border-gray-100">
                                  <p className="text-gray-600 line-clamp-3 text-sm sm:text-base">
                                    {report.content}
                                  </p>
                                  <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-gray-50 group-hover:from-white transition-colors duration-200" />
                                </div>

                                <div className="flex items-center justify-end">
                                  <span className="inline-flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700 transition-colors duration-200">
                                    Voir le rapport complet
                                    <svg className="ml-1 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-l-xl" />
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
                    <div className="flex justify-center items-center space-x-4 pt-6">
                      <button
                        onClick={() => setCurrentReportPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentReportPage === 1}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          currentReportPage === 1
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                        }`}
                      >
                        Précédent
                      </button>
                      <span className="text-sm text-gray-700">
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
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
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
                        Suivant
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 text-center py-16">
                  <div className="flex flex-col items-center">
                    <div className="h-16 w-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                      <DocumentTextIcon className="h-8 w-8 text-indigo-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Aucun rapport</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Commencez par créer un nouveau rapport d'activité pour partager les informations importantes avec votre équipe.
                    </p>
                    <button
                      onClick={() => setIsCreateReportModalOpen(true)}
                      className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-colors duration-200"
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
              />
            )}
          </div>
        );
      case 'messages':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold text-gray-800">Messages</h2>
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
                    <div key={message.id} className="bg-white rounded-lg shadow-sm border border-amber-200 p-4">
                      <div className="flex justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`h-8 w-8 rounded-full ${message.author.isEmployer ? 'bg-indigo-100' : 'bg-green-100'} flex items-center justify-center`}>
                            <span className={`text-sm font-medium ${message.author.isEmployer ? 'text-indigo-700' : 'text-green-700'}`}>
                              {message.author.name.split(' ').map(n => n.charAt(0).toUpperCase()).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{message.author.name}</p>
                            <p className="text-xs text-gray-500">
                              {format(message.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: fr })}
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
                        <p className="text-gray-700 whitespace-pre-line">{message.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Création de nouveau message */}
            {customUser?.isEmployer && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
                      className="w-full rounded-lg border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm px-4 py-2 text-gray-900"
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
                      className="w-full rounded-lg border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm px-4 py-3 text-gray-900"
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
                          
                          await addDoc(collection(db, 'messages'), messageData);
                          setNewMessageTitle('');
                          setNewMessageContent('');
                          toast.success('Message publié avec succès');
                        } catch (error) {
                          console.error('Erreur lors de la publication du message:', error);
                          toast.error('Erreur lors de la publication du message');
                        } finally {
                          setIsSubmittingMessage(false);
                        }
                      }}
                      disabled={isSubmittingMessage || (!newMessageTitle.trim() && !newMessageContent.trim())}
                      className={`inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200 ${
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
                    .filter(message => !message.isPinned) // Exclure les messages épinglés car ils sont déjà affichés
                    .map((message) => (
                      <div key={message.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div className="flex justify-between">
                          <div className="flex items-center space-x-2">
                            <div className={`h-8 w-8 rounded-full ${message.author.isEmployer ? 'bg-indigo-100' : 'bg-green-100'} flex items-center justify-center`}>
                              <span className={`text-sm font-medium ${message.author.isEmployer ? 'text-indigo-700' : 'text-green-700'}`}>
                                {message.author.name.split(' ').map(n => n.charAt(0).toUpperCase()).join('')}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{message.author.name}</p>
                              <p className="text-xs text-gray-500">
                                {format(message.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: fr })}
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
                          <p className="text-gray-700 whitespace-pre-line">{message.content}</p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
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
      case 'alertes':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold text-gray-800">Alertes</h2>
                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                  {alerts.filter(alert => isSameDay(alert.createdAt.toDate(), new Date())).length} alertes aujourd'hui
                </span>
              </div>
              {alerts.some(alert => !alert.readBy?.includes(customUser?.uid || '') && isSameDay(alert.createdAt.toDate(), new Date())) && (
                <button
                  onClick={markAllAlertsAsRead}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>

            <div className="space-y-4">
              {alerts.filter(alert => isSameDay(alert.createdAt.toDate(), new Date())).length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {alerts
                    .filter(alert => isSameDay(alert.createdAt.toDate(), new Date()))
                    .map((alert) => (
                      <div
                        key={alert.id}
                        className={`bg-white rounded-lg shadow-sm border p-4 transition-all duration-200 hover:shadow-md ${
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
                            if (alert.type === 'task_created' || alert.type === 'task_overdue') {
                              setActiveTab('taches');
                              setTaskFilter('all');
                              setSelectedDate(null);
                              window.history.pushState({}, '', `?tab=taches&filter=all`);
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
                              {format(alert.createdAt.toDate(), 'HH:mm', { locale: fr })}
                            </p>
                          </div>
                          <div className={`rounded-full p-2 ${
                            alert.type === 'task_created' ? 'bg-indigo-100 text-indigo-600' :
                            alert.type === 'report_created' ? 'bg-green-100 text-green-600' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {alert.type === 'task_created' && <ClipboardDocumentListIcon className="h-5 w-5" />}
                            {alert.type === 'report_created' && <DocumentTextIcon className="h-5 w-5" />}
                            {alert.type === 'task_overdue' && <ClockIcon className="h-5 w-5" />}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Profile Menu Button - Desktop */}
        <div className="fixed top-0 right-0 z-50 p-4 hidden lg:block">
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-3 bg-white rounded-xl px-4 py-2 shadow-sm border border-gray-200 hover:shadow-md transition-all duration-200 group"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center text-white font-medium text-sm shadow-sm group-hover:shadow-md transition-all duration-200">
                {customUser?.firstName?.charAt(0)}{customUser?.lastName?.charAt(0)}
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                  {customUser?.firstName} {customUser?.lastName}
                </span>
                <ChevronDownIcon className="ml-2 h-4 w-4 text-gray-500 group-hover:text-gray-700" />
              </div>
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsProfileMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    onClick={() => {
                      setIsProfileModalOpen(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors duration-200 group"
                  >
                    <UserCircleIcon className="h-5 w-5 text-gray-400 group-hover:text-indigo-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Profil</p>
                      <p className="text-xs text-gray-500">Voir et modifier vos informations</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setIsSettingsModalOpen(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors duration-200 group"
                  >
                    <Cog6ToothIcon className="h-5 w-5 text-gray-400 group-hover:text-indigo-600" />
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

        {/* Profile Menu Button - Mobile */}
        <div className="fixed top-0 right-0 z-50 p-4 lg:hidden">
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center text-white font-medium text-sm shadow-sm hover:shadow-md transition-all duration-200"
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
              <div className="absolute right-4 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
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
                  <UserCircleIcon className="h-5 w-5 text-gray-400 group-hover:text-indigo-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Profil</p>
                    <p className="text-xs text-gray-500">Voir et modifier vos informations</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setIsSettingsModalOpen(true);
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors duration-200 group"
                >
                  <Cog6ToothIcon className="h-5 w-5 text-gray-400 group-hover:text-indigo-600" />
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

        {/* Profile Modal */}
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity" onClick={() => setIsProfileModalOpen(false)}>
                <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
              </div>
              <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
                <div className="relative">
                  {/* Header avec avatar */}
                  <div className="px-6 pt-6 pb-12 bg-gradient-to-br from-indigo-600 to-indigo-700">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-4">
                        <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-2xl font-bold text-white shadow-lg border-4 border-white">
                          {customUser?.firstName?.charAt(0)}{customUser?.lastName?.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">Mon Profil</h3>
                          <p className="text-indigo-100 text-sm mt-1">{customUser?.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setIsProfileModalOpen(false)}
                        className="rounded-lg p-1 text-indigo-100 hover:text-white hover:bg-indigo-500 transition-colors duration-200"
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
                        <div className="mt-1 relative rounded-lg border border-gray-300 bg-white overflow-hidden group hover:border-indigo-500 transition-colors duration-200">
                          <input
                            type="text"
                            value={profileEdits.firstName}
                            className="block w-full px-4 py-3 text-base font-medium text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                        <div className="mt-1 relative rounded-lg border border-gray-300 bg-white overflow-hidden group hover:border-indigo-500 transition-colors duration-200">
                          <input
                            type="text"
                            value={profileEdits.lastName}
                            className="block w-full px-4 py-3 text-base font-medium text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                        <div className="mt-1 relative rounded-lg border border-gray-300 bg-gray-50 overflow-hidden">
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
                        <div className="mt-1 relative rounded-lg border border-gray-300 bg-gray-50 overflow-hidden">
                          <div className="px-4 py-3 flex items-center">
                            <UserCircleIcon className="h-5 w-5 text-gray-400 mr-3" />
                            <p className="text-base font-medium text-gray-900">
                              {customUser?.isEmployer ? 'Employeur' : 'Employé'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Code du centre */}
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Code du centre
                        </label>
                        <div className="mt-1 relative rounded-lg border border-gray-300 bg-gray-50 overflow-hidden group">
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
                              className="text-gray-400 hover:text-indigo-600 transition-colors duration-200"
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
                        <div className="mt-1 relative rounded-lg border border-gray-300 bg-white overflow-hidden group hover:border-indigo-500 transition-colors duration-200">
                          <input
                            type="text"
                            value={centerTitle}
                            onChange={(e) => {
                              setCenterTitle(e.target.value);
                              setIsProfileModified(true);
                            }}
                            className="block w-full px-4 py-3 text-base font-medium text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Information du centre"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                        <div className="mt-1 relative rounded-lg border border-gray-300 bg-white overflow-hidden group hover:border-indigo-500 transition-colors duration-200">
                          <input
                            type="text"
                            value={centerSubtitle}
                            onChange={(e) => {
                              setCenterSubtitle(e.target.value);
                              setIsProfileModified(true);
                            }}
                            className="block w-full px-4 py-3 text-base font-medium text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Tableau de bord du centre actif"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                              // Mise à jour du document du centre
                              const centerRef = doc(db, 'centers', customUser.centerCode);
                              await updateDoc(centerRef, {
                                title: centerTitle,
                                subtitle: centerSubtitle
                              });
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
                        className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
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
                          : 'border-transparent text-white bg-indigo-600 hover:bg-indigo-700'
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
                <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
              </div>
              <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
                <div className="relative">
                  {/* Header */}
                  <div className="px-6 pt-6 pb-8 bg-gradient-to-br from-indigo-600 to-indigo-700">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-3">
                        <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
                          <Cog6ToothIcon className="h-7 w-7 text-white" />
                        </div>
                        <h3 className="text-xl font-semibold text-white">Paramètres</h3>
                      </div>
                      <button
                        onClick={() => setIsSettingsModalOpen(false)}
                        className="rounded-lg p-1 text-indigo-100 hover:text-white hover:bg-indigo-500 transition-colors duration-200"
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
                        <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                          <BellIcon className="h-6 w-6 text-indigo-600" />
                        </div>
                        <h4 className="text-lg font-medium text-gray-900">Notifications</h4>
                      </div>
                      <div className="ml-13 space-y-3">
                        <label className="relative flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-indigo-200 transition-colors duration-200 group cursor-pointer">
                          <div className="flex items-center">
                            <svg className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Notifications par email</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={tempPreferences.emailNotifications}
                            onChange={(e) => updateTempPreferences({ emailNotifications: e.target.checked })}
                            className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
                        className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
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
                          : 'border-transparent text-white bg-indigo-600 hover:bg-indigo-700'
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


        {/* Sidebar for desktop */}
        <div className={`fixed inset-y-0 left-0 w-72 sm:w-64 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-center h-20 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('accueil')}
                className="group flex items-center space-x-3 px-4 py-2 rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 focus:outline-none"
              >
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-200/50 transition-all duration-300 group-hover:shadow-indigo-300/50 group-hover:scale-105">
                  <span className="text-white font-bold text-xl">G</span>
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent transition-all duration-300 group-hover:from-indigo-500 group-hover:via-indigo-400 group-hover:to-purple-400">
                  GestApp
                </span>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
                      window.history.pushState({}, '', `?tab=${item.tab}&filter=all`);
                    } else {
                      // Mettre à jour l'URL sans recharger la page
                      window.history.pushState({}, '', `?tab=${item.tab}`);
                    }
                  }}
                  className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    activeTab === item.tab
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className="relative">
                    {/* L'icône de l'onglet */}
                    <item.icon className={`mr-3 h-5 w-5 transition-colors duration-200 ${
                      activeTab === item.tab ? 'text-indigo-700' : 'text-gray-400'
                    }`} />
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
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-all duration-200"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="lg:pl-64 pt-16 lg:pt-20">
          <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 relative z-0">
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

        {/* Header overlay for scroll effect */}
        <div className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-sm z-20 pointer-events-none" />
        
        {/* Sidebar overlay for scroll effect */}
        <div className="fixed top-20 left-0 bottom-0 w-64 bg-white/80 backdrop-blur-sm z-20 pointer-events-none hidden lg:block" />

        {/* Mobile header avec bouton profil */}
        <div className="fixed top-0 left-0 z-50 w-full bg-white border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setActiveTab('accueil')}
              className="group flex items-center space-x-2 focus:outline-none"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-200/50 transition-all duration-300 group-hover:shadow-indigo-300/50 group-hover:scale-105">
                <span className="text-white font-bold text-lg">G</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent transition-all duration-300 group-hover:from-indigo-500 group-hover:via-indigo-400 group-hover:to-purple-400">
                GestApp
              </span>
            </button>
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center text-white font-medium text-sm shadow-sm hover:shadow-md transition-all duration-200"
            >
              {customUser?.firstName?.charAt(0)}{customUser?.lastName?.charAt(0)}
            </button>
          </div>
        </div>

        {/* Floating menu button for mobile - always visible */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center justify-center z-50 lg:hidden transition-transform duration-200 hover:scale-105"
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
                <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
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
    </ProtectedRoute>
  );
} 