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
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { 
  UserIcon, 
  TrashIcon, 
  ArrowLeftIcon, 
  EnvelopeIcon, 
  PhoneIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  UserCircleIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { formatDistance } from 'date-fns';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string;
  centerCode: string;
  isEmployer: boolean;
  isOnline?: boolean;
  lastOnline?: Date;
}

interface CustomUser {
  uid: string;
  isEmployer: boolean;
  centerCode: string;
  firstName: string;
  lastName: string;
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

      // Charger les employés
      loadEmployees(userData.centerCode);
    };

    checkAccess();
  }, [router]);

  useEffect(() => {
    // Filtrer les employés en fonction du terme de recherche
    if (searchTerm.trim() === '') {
      setFilteredEmployees(employees);
    } else {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      setFilteredEmployees(
        employees.filter(
          (employee) =>
            employee.firstName.toLowerCase().includes(lowerCaseSearchTerm) ||
            employee.lastName.toLowerCase().includes(lowerCaseSearchTerm) ||
            employee.email.toLowerCase().includes(lowerCaseSearchTerm)
        )
      );
    }
  }, [searchTerm, employees]);

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
          lastOnline: userData.lastOnline ? new Date(userData.lastOnline.toDate()) : undefined
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

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* En-tête */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="mr-4 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Liste des employés</h1>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Barre de recherche */}
        <div className="mb-6">
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Rechercher un employé par nom, prénom ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Liste des employés */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <UserCircleIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">Aucun employé trouvé</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? "Aucun employé ne correspond à votre recherche." : "Aucun employé n'est associé à ce centre."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEmployees.map((employee) => (
              <div
                key={employee.id}
                className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 hover:shadow-md transition-shadow duration-200"
              >
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      {employee.avatarUrl ? (
                        <img
                          src={employee.avatarUrl}
                          alt={`${employee.firstName} ${employee.lastName}`}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <UserCircleIcon className="h-12 w-12 text-gray-400" />
                      )}
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {employee.firstName} {employee.lastName}
                        </h3>
                        <p className="text-sm text-gray-500">{employee.email}</p>
                        <div className="mt-1 flex items-center">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full mr-2 ${
                              employee.isOnline ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          ></span>
                          <span className="text-xs text-gray-500">
                            {employee.isOnline ? 'En ligne' : `Dernière connexion: ${formatLastOnline(employee.lastOnline)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="ml-2">
                      <button
                        onClick={() => {
                          setSelectedEmployee(employee);
                          setShowDeleteModal(true);
                        }}
                        className="text-gray-400 hover:text-red-600 focus:outline-none"
                        disabled={employee.isEmployer}
                        title={employee.isEmployer ? "Impossible de supprimer un compte employeur" : "Supprimer l'employé"}
                      >
                        <TrashIcon className={`h-5 w-5 ${employee.isEmployer ? 'opacity-30 cursor-not-allowed' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        setSelectedEmployee(employee);
                        setShowProfileModal(true);
                      }}
                      className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Voir le profil
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de profil */}
      {showProfileModal && selectedEmployee && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      Profil de {selectedEmployee.firstName} {selectedEmployee.lastName}
                    </h3>
                    <div className="flex flex-col items-center mb-6">
                      {selectedEmployee.avatarUrl ? (
                        <img
                          src={selectedEmployee.avatarUrl}
                          alt={`${selectedEmployee.firstName} ${selectedEmployee.lastName}`}
                          className="h-24 w-24 rounded-full object-cover mb-3"
                        />
                      ) : (
                        <UserCircleIcon className="h-24 w-24 text-gray-400 mb-3" />
                      )}
                      <h4 className="text-xl font-medium">
                        {selectedEmployee.firstName} {selectedEmployee.lastName}
                      </h4>
                      <p className="text-gray-500">{selectedEmployee.email}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <dl className="space-y-3">
                        <div className="grid grid-cols-3 gap-4">
                          <dt className="text-sm font-medium text-gray-500">Type</dt>
                          <dd className="text-sm text-gray-900 col-span-2">
                            {selectedEmployee.isEmployer ? 'Employeur' : 'Employé'}
                          </dd>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <dt className="text-sm font-medium text-gray-500">Statut</dt>
                          <dd className="text-sm text-gray-900 col-span-2">
                            <span className="flex items-center">
                              <span
                                className={`inline-block h-2.5 w-2.5 rounded-full mr-2 ${
                                  selectedEmployee.isOnline ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                              ></span>
                              {selectedEmployee.isOnline ? 'En ligne' : 'Hors ligne'}
                            </span>
                          </dd>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <dt className="text-sm font-medium text-gray-500">Dernière connexion</dt>
                          <dd className="text-sm text-gray-900 col-span-2">
                            {formatLastOnline(selectedEmployee.lastOnline)}
                          </dd>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <dt className="text-sm font-medium text-gray-500">Code centre</dt>
                          <dd className="text-sm text-gray-900 col-span-2">{selectedEmployee.centerCode}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
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
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-red-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
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
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <TrashIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Supprimer le compte
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Êtes-vous sûr de vouloir supprimer le compte de {selectedEmployee.firstName} {selectedEmployee.lastName} ? Cette action est irréversible.
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
                  className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 ${
                    deleteLoading ? 'bg-red-300' : 'bg-red-600 hover:bg-red-700'
                  } text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm`}
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
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
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