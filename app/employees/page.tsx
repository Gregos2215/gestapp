'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { 
  TrashIcon, 
  ArrowLeftIcon, 
  UserCircleIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  AdjustmentsHorizontalIcon,
  CheckIcon,
  UserPlusIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Fragment } from 'react';
import { formatDistance } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string;
  centerCode: string;
  isEmployer: boolean;
  isOnline?: boolean;
  lastOnlineAt?: Date;
}

const EmployeesPage = () => {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'employer' | 'employee'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    // Vérifier si l'utilisateur actuel est un employeur
    const checkAccess = async () => {
      if (!auth.currentUser) {
        router.push('/login');
        return;
      }

      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userDoc.data();
      
      if (!userData || !userData.isEmployer) {
        router.push('/dashboard');
        return;
      }

      // Stocker l'ID de l'utilisateur actuel
      setCurrentUserId(auth.currentUser.uid);

      // Charger les employés
      loadEmployees(userData.centerCode);
    };

    checkAccess();
  }, [router]);

  useEffect(() => {
    // Filtrer les employés en fonction du terme de recherche et des filtres
    let filtered = employees;
    
    // Exclure l'utilisateur actuel (l'employeur connecté) de la liste
    filtered = filtered.filter(employee => employee.id !== currentUserId);
    
    // Filtre de recherche
    if (searchTerm.trim() !== '') {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (employee) =>
          employee.firstName.toLowerCase().includes(lowerCaseSearchTerm) ||
          employee.lastName.toLowerCase().includes(lowerCaseSearchTerm) ||
          employee.email.toLowerCase().includes(lowerCaseSearchTerm)
      );
    }
    
    // Filtre de statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(
        (employee) => statusFilter === 'online' ? employee.isOnline : !employee.isOnline
      );
    }
    
    // Filtre de type
    if (typeFilter !== 'all') {
      filtered = filtered.filter(
        (employee) => typeFilter === 'employer' ? employee.isEmployer : !employee.isEmployer
      );
    }
    
    setFilteredEmployees(filtered);
  }, [searchTerm, employees, statusFilter, typeFilter, currentUserId]);

  const loadEmployees = async (centerCode: string) => {
    try {
      setLoading(true);
      const usersQuery = query(
        collection(db, 'users'),
        where('centerCode', '==', centerCode)
      );
      
      const querySnapshot = await getDocs(usersQuery);
      const employeesList: Employee[] = [];
      
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        employeesList.push({
          id: doc.id,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
          avatarUrl: userData.avatarUrl || '',
          centerCode: userData.centerCode || '',
          isEmployer: userData.isEmployer || false,
          isOnline: userData.isOnline || false,
          lastOnlineAt: userData.lastOnlineAt ? new Date(userData.lastOnlineAt.toDate()) : undefined
        });
      });
      
      setEmployees(employeesList);
      setFilteredEmployees(employeesList);
    } catch (error) {
      console.error('Erreur lors du chargement des employés :', error);
      toast.error('Impossible de charger la liste des employés');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    
    try {
      setDeleteLoading(true);
      
      // Supprimer l'utilisateur de Firestore
      await deleteDoc(doc(db, 'users', selectedEmployee.id));
      
      // Mettre à jour la liste des employés
      setEmployees(employees.filter(emp => emp.id !== selectedEmployee.id));
      setFilteredEmployees(filteredEmployees.filter(emp => emp.id !== selectedEmployee.id));
      
      toast.success(`Le compte de ${selectedEmployee.firstName} ${selectedEmployee.lastName} a été supprimé`);
      setShowDeleteModal(false);
      setSelectedEmployee(null);
    } catch (error) {
      console.error('Erreur lors de la suppression :', error);
      toast.error('Impossible de supprimer cet employé');
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatLastOnline = (date?: Date) => {
    if (!date) return 'Jamais connecté';
    
    return formatDistance(date, new Date(), {
      addSuffix: true,
      locale: fr
    });
  };

  // Statistiques
  const totalEmployees = employees.filter(emp => emp.id !== currentUserId).length;
  const onlineCount = employees.filter(emp => emp.id !== currentUserId && emp.isOnline).length;
  const employersCount = employees.filter(emp => emp.id !== currentUserId && emp.isEmployer).length;
  const employeesCount = employees.filter(emp => emp.id !== currentUserId && !emp.isEmployer).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* En-tête */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="mr-4 text-gray-500 hover:text-gray-700 transition-colors duration-200 rounded-full p-1 hover:bg-gray-100"
                aria-label="Retour au tableau de bord"
              >
                <ArrowLeftIcon className="h-6 w-6" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Liste des employés</h1>
            </div>
            <button
              onClick={() => router.push('/register')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
            >
              <UserPlusIcon className="h-5 w-5 mr-2" />
              Ajouter un employé
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900">{totalEmployees}</p>
              </div>
              <div className="h-12 w-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <UsersIcon className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">En ligne</p>
                <p className="text-2xl font-bold text-gray-900">{onlineCount}</p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                <div className="h-6 w-6 flex items-center justify-center">
                  <span className="h-4 w-4 bg-green-500 rounded-full"></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Barre de recherche et filtres */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors duration-200"
                placeholder="Rechercher un employé par nom, prénom ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-4 py-2.5 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
            >
              <AdjustmentsHorizontalIcon className="h-5 w-5 mr-2 text-gray-500" />
              Filtres {showFilters ? '▲' : '▼'}
            </button>
          </div>
          
          {/* Filtres avancés */}
          {showFilters && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm animate-fadeIn">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Filtrer par:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Statut</label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors duration-200 ${
                        statusFilter === 'all'
                          ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Tous
                      {statusFilter === 'all' && <CheckIcon className="inline-block h-3 w-3 ml-1" />}
                    </button>
                    <button
                      onClick={() => setStatusFilter('online')}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors duration-200 ${
                        statusFilter === 'online'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      En ligne
                      {statusFilter === 'online' && <CheckIcon className="inline-block h-3 w-3 ml-1" />}
                    </button>
                    <button
                      onClick={() => setStatusFilter('offline')}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors duration-200 ${
                        statusFilter === 'offline'
                          ? 'bg-gray-100 text-gray-800 border border-gray-200'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Hors ligne
                      {statusFilter === 'offline' && <CheckIcon className="inline-block h-3 w-3 ml-1" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Type</label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setTypeFilter('all')}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors duration-200 ${
                        typeFilter === 'all'
                          ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Tous
                      {typeFilter === 'all' && <CheckIcon className="inline-block h-3 w-3 ml-1" />}
                    </button>
                    <button
                      onClick={() => setTypeFilter('employer')}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors duration-200 ${
                        typeFilter === 'employer'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Employeurs
                      {typeFilter === 'employer' && <CheckIcon className="inline-block h-3 w-3 ml-1" />}
                    </button>
                    <button
                      onClick={() => setTypeFilter('employee')}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors duration-200 ${
                        typeFilter === 'employee'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Employés
                      {typeFilter === 'employee' && <CheckIcon className="inline-block h-3 w-3 ml-1" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Liste des employés */}
        {loading ? (
          <div className="flex flex-col justify-center items-center h-64 bg-white rounded-xl shadow-sm p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
            <p className="text-gray-500 font-medium">Chargement des employés...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center border border-gray-100">
            <div className="flex flex-col items-center max-w-md mx-auto">
              <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <UserCircleIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun employé trouvé</h3>
              <p className="text-sm text-gray-500 mb-6">
                {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' 
                  ? "Aucun employé ne correspond à vos critères de recherche. Essayez de modifier vos filtres."
                  : "Aucun employé n'est associé à ce centre. Ajoutez des employés pour commencer."}
              </p>
              
              {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' ? (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setTypeFilter('all');
                  }}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                >
                  Réinitialiser les filtres
                </button>
              ) : (
                <button
                  onClick={() => router.push('/register')}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                >
                  <UserPlusIcon className="h-5 w-5 mr-2" />
                  Ajouter un employé
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-4">{filteredEmployees.length} employé(s) trouvé(s)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEmployees.map((employee) => (
                <div
                  key={employee.id}
                  className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 hover:shadow-md transition-all duration-200 transform hover:-translate-y-1 hover-lift"
                >
                  <div className="relative">
                    <div className="absolute top-0 right-0 mt-4 mr-4">
                      {employee.isEmployer ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          Employeur
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Employé
                        </span>
                      )}
                    </div>
                    <div className="px-6 py-5">
                      <div className="flex flex-col items-center sm:items-start sm:flex-row">
                        <div className="relative mb-4 sm:mb-0 sm:mr-4">
                          {employee.avatarUrl ? (
                            <img
                              src={employee.avatarUrl}
                              alt={`${employee.firstName} ${employee.lastName}`}
                              className="h-16 w-16 rounded-full object-cover border-2 border-gray-200"
                            />
                          ) : (
                            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                              <UserCircleIcon className="h-10 w-10 text-gray-400" />
                            </div>
                          )}
                          <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${
                            employee.isOnline ? 'bg-green-500' : 'bg-gray-300'
                          }`}></div>
                        </div>
                        <div className="text-center sm:text-left">
                          <h3 className="text-lg font-medium text-gray-900">
                            {employee.firstName} {employee.lastName}
                          </h3>
                          <p className="text-sm text-gray-500 mb-1">{employee.email}</p>
                          <div className="text-xs text-gray-400">
                            {employee.isOnline ? 'En ligne' : `Dernière connexion: ${formatLastOnline(employee.lastOnlineAt)}`}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-5 flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setShowProfileModal(true);
                          }}
                          className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                        >
                          Voir le profil
                        </button>
                        {!employee.isEmployer && (
                          <button
                            onClick={() => {
                              setSelectedEmployee(employee);
                              setShowDeleteModal(true);
                            }}
                            className="w-full sm:w-auto inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-red-600 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
                            title="Supprimer l'employé"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de profil */}
      {showProfileModal && selectedEmployee && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 transition-opacity" 
              aria-hidden="true"
              onClick={() => setShowProfileModal(false)}
            >
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 px-6 py-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-white">
                    Profil d&apos;{selectedEmployee.isEmployer ? 'employeur' : 'employé'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    className="rounded-md bg-indigo-600 text-gray-200 hover:text-white focus:outline-none"
                  >
                    <span className="sr-only">Fermer</span>
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="bg-white px-6 py-6">
                <div className="flex flex-col items-center mb-6">
                  <div className="relative mb-4">
                    {selectedEmployee.avatarUrl ? (
                      <img
                        src={selectedEmployee.avatarUrl}
                        alt={`${selectedEmployee.firstName} ${selectedEmployee.lastName}`}
                        className="h-24 w-24 rounded-full object-cover border-4 border-white shadow-md"
                      />
                    ) : (
                      <div className="h-24 w-24 rounded-full bg-gray-100 flex items-center justify-center border-4 border-white shadow-md">
                        <UserCircleIcon className="h-16 w-16 text-gray-400" />
                      </div>
                    )}
                    <div className={`absolute -bottom-1 right-0 h-6 w-6 rounded-full border-4 border-white ${
                      selectedEmployee.isOnline ? 'bg-green-500' : 'bg-gray-300'
                    }`}></div>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </h4>
                  <p className="text-gray-500">{selectedEmployee.email}</p>
                  <div className="mt-2 text-sm text-gray-500">
                    {selectedEmployee.isOnline ? 'En ligne' : `Dernière connexion: ${formatLastOnline(selectedEmployee.lastOnlineAt)}`}
                  </div>
                </div>
                
                <div className="mt-6 space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <h5 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Informations</h5>
                        <dl className="grid grid-cols-3 gap-4">
                          <div className="col-span-1">
                            <dt className="text-sm font-medium text-gray-500">Type</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                selectedEmployee.isEmployer ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {selectedEmployee.isEmployer ? 'Employeur' : 'Employé'}
                              </span>
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-sm font-medium text-gray-500">Code centre</dt>
                            <dd className="mt-1 text-sm text-gray-900 font-mono bg-gray-100 p-1 rounded">
                              {selectedEmployee.centerCode}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      
                      <div>
                        <h5 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Activité</h5>
                        <dl className="grid grid-cols-1 gap-4">
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Statut</dt>
                            <dd className="mt-1 flex items-center">
                              <span
                                className={`inline-block h-3 w-3 rounded-full mr-2 ${
                                  selectedEmployee.isOnline ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                              ></span>
                              <span className="text-sm text-gray-900">
                                {selectedEmployee.isOnline ? 'En ligne' : 'Hors ligne'}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Dernière connexion</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {formatLastOnline(selectedEmployee.lastOnlineAt)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="inline-flex justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                >
                  Fermer
                </button>
                {!selectedEmployee.isEmployer && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileModal(false);
                      setShowDeleteModal(true);
                    }}
                    className="inline-flex justify-center px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg shadow-sm text-red-600 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
                  >
                    <TrashIcon className="h-5 w-5 mr-2" />
                    Supprimer le compte
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmation de suppression */}
      {showDeleteModal && selectedEmployee && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 transition-opacity" 
              aria-hidden="true"
              onClick={() => setShowDeleteModal(false)}
            >
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-scaleIn">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <TrashIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Supprimer ce compte
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Êtes-vous sûr de vouloir supprimer le compte de <span className="font-medium">{selectedEmployee.firstName} {selectedEmployee.lastName}</span> ? Cette action est irréversible et supprimera toutes les données associées à cet utilisateur.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleDeleteEmployee}
                  disabled={deleteLoading}
                  className={`w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2.5 ${
                    deleteLoading ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                  } text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors duration-200`}
                >
                  {deleteLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Suppression...
                    </>
                  ) : (
                    'Supprimer'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2.5 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors duration-200"
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
};

export default EmployeesPage; 