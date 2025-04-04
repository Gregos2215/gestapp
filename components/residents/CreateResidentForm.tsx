import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import DatePicker, { registerLocale } from 'react-datepicker';
import { fr } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import { 
  UserIcon,
  CalendarIcon,
  DocumentTextIcon,
  HeartIcon,
  ArrowTrendingUpIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

// Enregistrer la locale française pour le DatePicker
registerLocale('fr', fr);

type Gender = 'male' | 'female';
type Language = 'french' | 'english' | 'spanish' | 'creole' | 'other';
type Autonomy = 'autonomous' | 'semi-autonomous' | 'dependent';
type Condition = 'intellectual_disability' | 'autism' | 'dementia';

interface CreateResidentFormProps {
  centerCode: string;
  onClose: () => void;
  onResidentCreated: () => void;
}

export default function CreateResidentForm({ centerCode, onClose, onResidentCreated }: CreateResidentFormProps) {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [language, setLanguage] = useState<Language>('french');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<Condition>('intellectual_disability');
  const [hasAllergies, setHasAllergies] = useState<boolean | null>(null);
  const [allergies, setAllergies] = useState('');
  const [isIncontinent, setIsIncontinent] = useState<boolean>(false);
  const [isVerbal, setIsVerbal] = useState<boolean>(true);
  const [autonomyLevel, setAutonomyLevel] = useState<Autonomy>('autonomous');
  const [hasDisability, setHasDisability] = useState<boolean>(false);
  const [disability, setDisability] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim() || !birthDate || !description.trim()) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (hasAllergies === true && !allergies.trim()) {
      toast.error('Veuillez préciser les allergies');
      return;
    }

    if (hasDisability && !disability.trim()) {
      toast.error('Veuillez préciser le handicap');
      return;
    }

    try {
      setLoading(true);
      
      const residentData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        birthDate,
        language,
        description: description.trim(),
        condition,
        hasAllergies,
        allergies: hasAllergies ? allergies.trim() : null,
        isIncontinent,
        isVerbal,
        autonomyLevel,
        hasDisability,
        disability: hasDisability ? disability.trim() : null,
        centerCode,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'residents'), residentData);
      
      toast.success('Résident créé avec succès');
      onResidentCreated();
      onClose();
    } catch (error) {
      console.error('Error creating resident:', error);
      toast.error('Erreur lors de la création du résident');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* En-tête du formulaire */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white p-6 rounded-xl shadow-lg mb-8">
        <h2 className="text-xl font-semibold">Informations du résident</h2>
        <p className="text-indigo-100 mt-2">Remplissez les informations ci-dessous pour créer un nouveau résident.</p>
      </div>

      <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm space-y-8">
        {/* Informations de base */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <UserIcon className="h-6 w-6 text-indigo-500" />
            Informations personnelles
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                Prénom
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="block w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-500 shadow-sm transition-all duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 hover:border-gray-400"
                placeholder="Entrez le prénom"
                required
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                Nom
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="block w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-500 shadow-sm transition-all duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 hover:border-gray-400"
                placeholder="Entrez le nom"
                required
              />
            </div>
          </div>
        </div>

        {/* Genre et Date de naissance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Genre
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  checked={gender === 'male'}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className="sr-only"
                />
                <span className={`text-sm font-medium ${gender === 'male' ? 'text-indigo-600' : 'text-gray-900'}`}>
                  Homme
                </span>
                {gender === 'male' && (
                  <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                )}
              </label>
              <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  checked={gender === 'female'}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className="sr-only"
                />
                <span className={`text-sm font-medium ${gender === 'female' ? 'text-indigo-600' : 'text-gray-900'}`}>
                  Femme
                </span>
                {gender === 'female' && (
                  <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                )}
              </label>
            </div>
          </div>
          <div>
            <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-2">
              Date de naissance
            </label>
            <div className="relative">
              <DatePicker
                selected={birthDate}
                onChange={(date: Date | null) => setBirthDate(date)}
                dateFormat="dd/MM/yyyy"
                locale="fr"
                showYearDropdown
                scrollableYearDropdown
                yearDropdownItemNumber={100}
                placeholderText="Sélectionner une date"
                className="block w-full cursor-pointer rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm transition-all duration-200 hover:border-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
              <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Langue */}
        <div>
          <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
            Langue parlée
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm transition-all duration-200 hover:border-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="french">Français</option>
            <option value="english">Anglais</option>
            <option value="spanish">Espagnol</option>
            <option value="creole">Créole</option>
            <option value="other">Autre</option>
          </select>
        </div>

        {/* État du résident */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <UserIcon className="h-6 w-6 text-indigo-500" />
            État du résident
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
              <input
                type="radio"
                name="condition"
                value="intellectual_disability"
                checked={condition === 'intellectual_disability'}
                onChange={(e) => setCondition(e.target.value as Condition)}
                className="sr-only"
              />
              <span className={`text-sm font-medium ${condition === 'intellectual_disability' ? 'text-indigo-600' : 'text-gray-900'}`}>
                Déficient intellectuel
              </span>
              {condition === 'intellectual_disability' && (
                <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
              )}
            </label>
            <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
              <input
                type="radio"
                name="condition"
                value="autism"
                checked={condition === 'autism'}
                onChange={(e) => setCondition(e.target.value as Condition)}
                className="sr-only"
              />
              <span className={`text-sm font-medium ${condition === 'autism' ? 'text-indigo-600' : 'text-gray-900'}`}>
                TSA
              </span>
              {condition === 'autism' && (
                <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
              )}
            </label>
            <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
              <input
                type="radio"
                name="condition"
                value="dementia"
                checked={condition === 'dementia'}
                onChange={(e) => setCondition(e.target.value as Condition)}
                className="sr-only"
              />
              <span className={`text-sm font-medium ${condition === 'dementia' ? 'text-indigo-600' : 'text-gray-900'}`}>
                Démence
              </span>
              {condition === 'dementia' && (
                <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
              )}
            </label>
          </div>
        </div>

        {/* Description */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <DocumentTextIcon className="h-6 w-6 text-indigo-500" />
            Description
          </h3>
          <div className="rounded-lg border-2 border-gray-300 bg-white shadow-sm transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500 hover:border-gray-400">
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="block w-full rounded-lg border-0 px-4 py-3 text-base text-gray-900 placeholder-gray-500 focus:ring-0"
              placeholder="Décrivez le résident, ses habitudes, ses préférences, ses besoins particuliers..."
              required
            />
          </div>
        </div>

        {/* Santé et Communication */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <HeartIcon className="h-6 w-6 text-indigo-500" />
            Santé et Communication
          </h3>
          
          {/* Allergies */}
          <div className="space-y-6">
            <div className="rounded-lg bg-gray-50 p-6">
              <label className="block text-sm font-medium text-gray-900 mb-4">
                Allergies
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                  <input
                    type="radio"
                    name="hasAllergies"
                    checked={hasAllergies === true}
                    onChange={() => setHasAllergies(true)}
                    className="sr-only"
                  />
                  <span className={`text-sm font-medium ${hasAllergies === true ? 'text-indigo-600' : 'text-gray-900'}`}>
                    A des allergies
                  </span>
                  {hasAllergies === true && (
                    <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                  )}
                </label>
                <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                  <input
                    type="radio"
                    name="hasAllergies"
                    checked={hasAllergies === false}
                    onChange={() => setHasAllergies(false)}
                    className="sr-only"
                  />
                  <span className={`text-sm font-medium ${hasAllergies === false ? 'text-indigo-600' : 'text-gray-900'}`}>
                    Pas d'allergies
                  </span>
                  {hasAllergies === false && (
                    <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                  )}
                </label>
              </div>
              {hasAllergies && (
                <div className="mt-4">
                  <textarea
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    rows={3}
                    className="block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-500 shadow-sm transition-all duration-200 hover:border-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                    placeholder="Décrivez les allergies en détail..."
                    required
                  />
                </div>
              )}
            </div>

            {/* Communication et Incontinence */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="rounded-lg bg-gray-50 p-6">
                <label className="block text-sm font-medium text-gray-900 mb-4">
                  Communication
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                    <input
                      type="radio"
                      name="isVerbal"
                      checked={isVerbal}
                      onChange={() => setIsVerbal(true)}
                      className="sr-only"
                    />
                    <span className={`text-sm font-medium ${isVerbal ? 'text-indigo-600' : 'text-gray-900'}`}>
                      Verbal
                    </span>
                    {isVerbal && (
                      <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                    )}
                  </label>
                  <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                    <input
                      type="radio"
                      name="isVerbal"
                      checked={!isVerbal}
                      onChange={() => setIsVerbal(false)}
                      className="sr-only"
                    />
                    <span className={`text-sm font-medium ${!isVerbal ? 'text-indigo-600' : 'text-gray-900'}`}>
                      Non verbal
                    </span>
                    {!isVerbal && (
                      <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                    )}
                  </label>
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-6">
                <label className="block text-sm font-medium text-gray-900 mb-4">
                  Incontinence
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                    <input
                      type="radio"
                      name="isIncontinent"
                      checked={isIncontinent}
                      onChange={() => setIsIncontinent(true)}
                      className="sr-only"
                    />
                    <span className={`text-sm font-medium ${isIncontinent ? 'text-indigo-600' : 'text-gray-900'}`}>
                      Oui
                    </span>
                    {isIncontinent && (
                      <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                    )}
                  </label>
                  <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                    <input
                      type="radio"
                      name="isIncontinent"
                      checked={!isIncontinent}
                      onChange={() => setIsIncontinent(false)}
                      className="sr-only"
                    />
                    <span className={`text-sm font-medium ${!isIncontinent ? 'text-indigo-600' : 'text-gray-900'}`}>
                      Non
                    </span>
                    {!isIncontinent && (
                      <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                    )}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Autonomie et Handicap */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <ArrowTrendingUpIcon className="h-6 w-6 text-indigo-500" />
            Autonomie et Handicap
          </h3>

          {/* Niveau d'autonomie */}
          <div className="rounded-lg bg-gray-50 p-6 mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-4">
              Niveau d'autonomie
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                <input
                  type="radio"
                  name="autonomyLevel"
                  value="autonomous"
                  checked={autonomyLevel === 'autonomous'}
                  onChange={(e) => setAutonomyLevel(e.target.value as Autonomy)}
                  className="sr-only"
                />
                <span className={`text-sm font-medium ${autonomyLevel === 'autonomous' ? 'text-indigo-600' : 'text-gray-900'}`}>
                  Autonome
                </span>
                {autonomyLevel === 'autonomous' && (
                  <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                )}
              </label>
              <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                <input
                  type="radio"
                  name="autonomyLevel"
                  value="semi-autonomous"
                  checked={autonomyLevel === 'semi-autonomous'}
                  onChange={(e) => setAutonomyLevel(e.target.value as Autonomy)}
                  className="sr-only"
                />
                <span className={`text-sm font-medium ${autonomyLevel === 'semi-autonomous' ? 'text-indigo-600' : 'text-gray-900'}`}>
                  Semi-autonome
                </span>
                {autonomyLevel === 'semi-autonomous' && (
                  <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                )}
              </label>
              <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                <input
                  type="radio"
                  name="autonomyLevel"
                  value="dependent"
                  checked={autonomyLevel === 'dependent'}
                  onChange={(e) => setAutonomyLevel(e.target.value as Autonomy)}
                  className="sr-only"
                />
                <span className={`text-sm font-medium ${autonomyLevel === 'dependent' ? 'text-indigo-600' : 'text-gray-900'}`}>
                  Dépendant
                </span>
                {autonomyLevel === 'dependent' && (
                  <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                )}
              </label>
            </div>
          </div>

          {/* Handicap */}
          <div className="rounded-lg bg-gray-50 p-6">
            <label className="block text-sm font-medium text-gray-900 mb-4">
              Handicap
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                <input
                  type="radio"
                  name="hasDisability"
                  checked={hasDisability}
                  onChange={() => setHasDisability(true)}
                  className="sr-only"
                />
                <span className={`text-sm font-medium ${hasDisability ? 'text-indigo-600' : 'text-gray-900'}`}>
                  A un handicap
                </span>
                {hasDisability && (
                  <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                )}
              </label>
              <label className="relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 focus-within:ring-2 focus-within:ring-indigo-500">
                <input
                  type="radio"
                  name="hasDisability"
                  checked={!hasDisability}
                  onChange={() => setHasDisability(false)}
                  className="sr-only"
                />
                <span className={`text-sm font-medium ${!hasDisability ? 'text-indigo-600' : 'text-gray-900'}`}>
                  Pas de handicap
                </span>
                {!hasDisability && (
                  <CheckIcon className="absolute right-2 top-2 h-5 w-5 text-indigo-600" />
                )}
              </label>
            </div>
            {hasDisability && (
              <div className="mt-4">
                <textarea
                  value={disability}
                  onChange={(e) => setDisability(e.target.value)}
                  rows={3}
                  className="block w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-500 shadow-sm transition-all duration-200 hover:border-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  placeholder="Décrivez le handicap en détail..."
                  required
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Boutons d'action */}
      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <XMarkIcon className="h-5 w-5 mr-2" />
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border-2 border-transparent bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <ArrowPathIcon className="animate-spin h-5 w-5 mr-2" />
              Création en cours...
            </>
          ) : (
            <>
              <CheckIcon className="h-5 w-5 mr-2" />
              Créer le résident
            </>
          )}
        </button>
      </div>
    </form>
  );
} 