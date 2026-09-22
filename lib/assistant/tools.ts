import { DocumentData, FieldValue, Firestore, Timestamp, UpdateData } from 'firebase-admin/firestore';
import { APP_HELP } from './knowledge';
import type { AssistantChangedEntity } from './types';

export type AssistantCenterRole = 'employee' | 'admin' | 'employer';

export interface AssistantActor {
  uid: string;
  centerCode: string;
  centerTitle: string;
  role: AssistantCenterRole;
  displayName: string;
  canManage: boolean;
}

export interface MutationPreparation {
  title: string;
  description: string;
  destructive: boolean;
  targetId?: string;
  targetVersion?: Timestamp;
}

export interface MutationResult {
  message: string;
  changedEntity: AssistantChangedEntity;
  targetId?: string;
}

type JsonRecord = Record<string, unknown>;

const RECURRENCES = new Set([
  'none', 'daily', 'twoDays', 'threeDays', 'fourDays', 'fiveDays', 'sixDays',
  'weekly', 'twoWeeks', 'threeWeeks', 'monthly', 'yearly', 'specificDays',
]);
const WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const LANGUAGES = new Set(['french', 'english', 'spanish', 'creole', 'other']);
const AUTONOMY_LEVELS = new Set(['autonomous', 'semi-autonomous', 'dependent']);
const CONDITIONS = new Set(['intellectual_disability', 'autism', 'dementia']);
const MUTATION_TOOLS = new Set([
  'create_task', 'update_task', 'delete_task',
  'create_resident', 'update_resident', 'delete_resident',
]);

const taskProperties = {
  name: { type: 'string', description: 'Nom court de la tâche.' },
  description: { type: 'string', description: 'Description précise de la tâche.' },
  dueDate: { type: 'string', description: 'Date et heure ISO 8601 avec décalage, par exemple 2026-09-23T09:00:00-04:00.' },
  type: { type: 'string', enum: ['general', 'resident'], description: 'Type de tâche.' },
  residentId: { type: 'string', description: 'Identifiant exact du résident, requis pour une tâche de type resident.' },
  recurrenceType: {
    type: 'string',
    enum: Array.from(RECURRENCES),
    description: 'Récurrence, none par défaut.',
  },
  specificDays: {
    type: 'array',
    items: { type: 'string', enum: Array.from(WEEKDAYS) },
    description: 'Jours requis lorsque recurrenceType vaut specificDays.',
  },
};

const residentProperties = {
  firstName: { type: 'string', description: 'Prénom du résident.' },
  lastName: { type: 'string', description: 'Nom du résident.' },
  gender: { type: 'string', enum: ['male', 'female'] },
  birthDate: { type: 'string', description: 'Date de naissance au format YYYY-MM-DD.' },
  language: { type: 'string', enum: Array.from(LANGUAGES) },
  description: { type: 'string', description: 'Description utile à l’accompagnement.' },
  condition: { type: 'string', enum: Array.from(CONDITIONS) },
  hasAllergies: { type: 'boolean' },
  allergies: { type: 'string', description: 'Obligatoire si hasAllergies est vrai.' },
  isIncontinent: { type: 'boolean' },
  isVerbal: { type: 'boolean' },
  autonomyLevel: { type: 'string', enum: Array.from(AUTONOMY_LEVELS) },
  hasDisability: { type: 'boolean' },
  disability: { type: 'string', description: 'Obligatoire si hasDisability est vrai.' },
};

export const ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    name: 'get_app_help',
    description: 'Explique une section ou un fonctionnement de GestApp.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', enum: Object.keys(APP_HELP) },
      },
      required: ['topic'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'list_tasks',
    description: 'Recherche les tâches du centre actif, y compris les occurrences récurrentes virtuelles sur une période bornée. Utiliser avant de modifier ou supprimer lorsque l’identifiant est inconnu.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texte recherché dans le nom, la description ou le nom du résident.' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
        residentId: { type: 'string' },
        dueFrom: { type: 'string', description: 'Borne ISO 8601 inclusive.' },
        dueTo: { type: 'string', description: 'Borne ISO 8601 inclusive.' },
        limit: { type: 'integer', minimum: 1, maximum: 30 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'list_residents',
    description: 'Recherche les profils de résidents du centre actif avec une projection minimale.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Prénom ou nom recherché.' },
        limit: { type: 'integer', minimum: 1, maximum: 30 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'list_team_members',
    description: 'Liste les membres actifs du centre. Cet outil ne crée ni ne supprime de compte.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Prénom ou nom recherché.' },
        limit: { type: 'integer', minimum: 1, maximum: 30 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'create_task',
    description: 'Prépare la création d’une tâche dans le centre actif. Une confirmation humaine sera toujours exigée.',
    parameters: {
      type: 'object',
      properties: taskProperties,
      required: ['name', 'description', 'dueDate', 'type'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'update_task',
    description: 'Prépare la modification des champs autorisés d’une tâche existante. Une confirmation humaine sera toujours exigée.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        ...taskProperties,
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'delete_task',
    description: 'Prépare la suppression d’une tâche. Réservé aux administrateurs et employeurs, avec confirmation obligatoire.',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'create_resident',
    description: 'Prépare la création d’un profil de résident. Une confirmation humaine sera toujours exigée.',
    parameters: {
      type: 'object',
      properties: residentProperties,
      required: ['firstName', 'lastName', 'gender', 'birthDate', 'description'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'update_resident',
    description: 'Prépare la modification d’un profil de résident. Une confirmation humaine sera toujours exigée.',
    parameters: {
      type: 'object',
      properties: {
        residentId: { type: 'string' },
        ...residentProperties,
      },
      required: ['residentId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'delete_resident',
    description: 'Prépare la suppression d’un profil de résident sans tâche liée. Réservé aux administrateurs et employeurs.',
    parameters: {
      type: 'object',
      properties: { residentId: { type: 'string' } },
      required: ['residentId'],
      additionalProperties: false,
    },
  },
];

export function isMutationTool(name: string) {
  return MUTATION_TOOLS.has(name);
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Paramètres d’action invalides.');
  }
  return value as JsonRecord;
}

function requiredString(args: JsonRecord, key: string, maxLength = 500) {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Le champ ${key} est obligatoire.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`Le champ ${key} est trop long.`);
  }
  return normalized;
}

function optionalString(args: JsonRecord, key: string, maxLength = 500) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`Le champ ${key} est invalide.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`Le champ ${key} est trop long.`);
  return normalized;
}

function optionalBoolean(args: JsonRecord, key: string) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`Le champ ${key} est invalide.`);
  return value;
}

function enumValue(args: JsonRecord, key: string, allowed: Set<string>, fallback?: string) {
  const value = args[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`Le champ ${key} contient une valeur invalide.`);
  }
  return value;
}

function parseDateTime(value: unknown, key: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Le champ ${key} est obligatoire.`);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim())) {
    throw new Error(`Le champ ${key} doit inclure un fuseau horaire explicite.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Le champ ${key} doit être une date ISO valide.`);
  return parsed;
}

function parseBirthDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('La date de naissance doit être au format YYYY-MM-DD.');
  }
  const parsed = new Date(`${value}T12:00:00.000Z`);
  const [year, month, day] = value.split('-').map(Number);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() + 1 !== month
    || parsed.getUTCDate() !== day
    || parsed > new Date()
  ) {
    throw new Error('La date de naissance est invalide.');
  }
  return parsed;
}

function stringArray(args: JsonRecord, key: string, allowed: Set<string>) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    throw new Error(`Le champ ${key} est invalide.`);
  }
  return Array.from(new Set(value as string[]));
}

function firestoreDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

const TORONTO_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function torontoParts(date: Date) {
  const parts = Object.fromEntries(
    TORONTO_DATE_FORMAT.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function localDateKey(date: Date) {
  const parts = torontoParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function dateKeyValue(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function torontoDateTime(dateKey: string, hour: number, minute: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let instant = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = torontoParts(new Date(instant));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const correction = desired - actualAsUtc;
    if (correction === 0) break;
    instant += correction;
  }
  return new Date(instant);
}

function recurrenceMatches(task: JsonRecord, baseKey: string, targetKey: string) {
  const recurrenceType = String(task.recurrenceType || 'none');
  const baseValue = dateKeyValue(baseKey);
  const targetValue = dateKeyValue(targetKey);
  const diffDays = Math.round((targetValue - baseValue) / 86_400_000);
  if (diffDays <= 0) return false;

  const intervals: Record<string, number> = {
    daily: 1,
    twoDays: 2,
    threeDays: 3,
    fourDays: 4,
    fiveDays: 5,
    sixDays: 6,
    weekly: 7,
    twoWeeks: 14,
    threeWeeks: 21,
  };
  if (intervals[recurrenceType]) return diffDays % intervals[recurrenceType] === 0;

  const [baseYear, baseMonth, baseDay] = baseKey.split('-').map(Number);
  const [targetYear, targetMonth, targetDay] = targetKey.split('-').map(Number);
  if (recurrenceType === 'monthly') {
    return targetDay === baseDay && (targetYear * 12 + targetMonth) > (baseYear * 12 + baseMonth);
  }
  if (recurrenceType === 'yearly') {
    return targetYear > baseYear && targetMonth === baseMonth && targetDay === baseDay;
  }
  if (recurrenceType === 'specificDays') {
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const selectedDays = Array.isArray(task.specificDays) ? task.specificDays : [];
    return selectedDays.includes(weekdays[new Date(targetValue).getUTCDay()]);
  }
  return false;
}

function isSkippedDate(task: JsonRecord, targetKey: string) {
  if (!Array.isArray(task.skippedDates)) return false;
  return task.skippedDates.some((value) => {
    const iso = firestoreDate(value);
    if (iso) return localDateKey(new Date(iso)) === targetKey;
    return typeof value === 'number' && localDateKey(new Date(value)) === targetKey;
  });
}

function boundedLimit(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(Math.max(value, 1), 30) : 15;
}

async function loadResident(db: Firestore, actor: AssistantActor, residentId: string) {
  const snap = await db.collection('residents').doc(residentId).get();
  if (!snap.exists || snap.data()?.centerCode !== actor.centerCode) {
    throw new Error('Résident introuvable dans le centre actif.');
  }
  return { ref: snap.ref, data: snap.data() as JsonRecord, updateTime: snap.updateTime };
}

async function loadTask(db: Firestore, actor: AssistantActor, taskId: string) {
  const snap = await db.collection('tasks').doc(taskId).get();
  if (!snap.exists || snap.data()?.centerCode !== actor.centerCode) {
    throw new Error('Tâche introuvable dans le centre actif.');
  }
  return { ref: snap.ref, data: snap.data() as JsonRecord, updateTime: snap.updateTime };
}

async function resolveResidentForTask(db: Firestore, actor: AssistantActor, type: string, residentId?: string) {
  if (type === 'general') return null;
  if (!residentId) throw new Error('Un résident doit être choisi pour cette tâche.');
  const resident = await loadResident(db, actor, residentId);
  return {
    id: residentId,
    name: `${resident.data.firstName || ''} ${resident.data.lastName || ''}`.trim(),
  };
}

function validateTaskInput(argsValue: unknown, partial: boolean) {
  const args = asRecord(argsValue);
  const result: JsonRecord = {};

  if (!partial || args.name !== undefined) result.name = requiredString(args, 'name', 120);
  if (!partial || args.description !== undefined) result.description = requiredString(args, 'description', 1500);
  if (!partial || args.dueDate !== undefined) result.dueDate = parseDateTime(args.dueDate, 'dueDate');
  if (!partial || args.type !== undefined) {
    result.type = enumValue(args, 'type', new Set(['general', 'resident']), partial ? undefined : 'general');
  }
  if (args.residentId !== undefined) requiredString(args, 'residentId', 160);
  if (args.recurrenceType !== undefined || !partial) {
    result.recurrenceType = enumValue(args, 'recurrenceType', RECURRENCES, 'none');
  }
  if (args.specificDays !== undefined) result.specificDays = stringArray(args, 'specificDays', WEEKDAYS);

  const recurrence = result.recurrenceType;
  if (!partial && recurrence === 'specificDays' && (!Array.isArray(result.specificDays) || result.specificDays.length === 0)) {
    throw new Error('Au moins un jour est requis pour une récurrence par jours spécifiques.');
  }
  if (!partial && recurrence !== 'specificDays' && result.specificDays !== undefined) {
    throw new Error('Les jours spécifiques ne sont permis qu’avec la récurrence correspondante.');
  }

  return { args, values: result };
}

function validateResidentInput(argsValue: unknown, partial: boolean) {
  const args = asRecord(argsValue);
  const values: JsonRecord = {};

  if (!partial || args.firstName !== undefined) values.firstName = requiredString(args, 'firstName', 80);
  if (!partial || args.lastName !== undefined) values.lastName = requiredString(args, 'lastName', 80);
  if (!partial || args.gender !== undefined) values.gender = enumValue(args, 'gender', new Set(['male', 'female']));
  if (!partial || args.birthDate !== undefined) values.birthDate = parseBirthDate(args.birthDate);
  if (args.language !== undefined || !partial) values.language = enumValue(args, 'language', LANGUAGES, 'french');
  if (!partial || args.description !== undefined) values.description = requiredString(args, 'description', 2000);
  if (args.condition !== undefined || !partial) values.condition = enumValue(args, 'condition', CONDITIONS, 'intellectual_disability');

  for (const key of ['hasAllergies', 'isIncontinent', 'isVerbal', 'hasDisability']) {
    const value = optionalBoolean(args, key);
    if (value !== undefined) values[key] = value;
  }
  if (!partial) {
    if (values.hasAllergies === undefined) values.hasAllergies = false;
    if (values.isIncontinent === undefined) values.isIncontinent = false;
    if (values.isVerbal === undefined) values.isVerbal = true;
    if (values.hasDisability === undefined) values.hasDisability = false;
  }

  if (args.autonomyLevel !== undefined || !partial) {
    values.autonomyLevel = enumValue(args, 'autonomyLevel', AUTONOMY_LEVELS, 'autonomous');
  }
  if (args.allergies !== undefined) values.allergies = optionalString(args, 'allergies', 1000) || null;
  if (args.disability !== undefined) values.disability = optionalString(args, 'disability', 1000) || null;

  if (values.hasAllergies === true && !values.allergies) throw new Error('Les allergies doivent être précisées.');
  if (values.hasAllergies === false) values.allergies = null;
  if (values.hasDisability === true && !values.disability) throw new Error('Le handicap doit être précisé.');
  if (values.hasDisability === false) values.disability = null;

  return { args, values };
}

function formatValueForConfirmation(value: unknown) {
  if (value instanceof Date) return formatForConfirmation(value);
  if (Array.isArray(value)) return value.join(', ');
  if (value === null) return 'aucune';
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  return String(value);
}

function describeChanges(values: JsonRecord) {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${formatValueForConfirmation(value)}`)
    .join('; ');
}

function assertExpectedVersion(actual: Timestamp | undefined, expected: Timestamp | undefined) {
  if (!expected || !actual || !actual.isEqual(expected)) {
    throw new Error('La donnée a changé depuis la préparation. Reformulez la demande pour vérifier la nouvelle version.');
  }
}

export async function executeReadTool(
  db: Firestore,
  actor: AssistantActor,
  toolName: string,
  rawArgs: unknown,
) {
  const args = asRecord(rawArgs);

  if (toolName === 'get_app_help') {
    const topic = requiredString(args, 'topic', 40);
    return { topic, help: APP_HELP[topic] || APP_HELP.overview };
  }

  if (toolName === 'list_tasks') {
    const snapshot = await db.collection('tasks').where('centerCode', '==', actor.centerCode).get();
    const queryText = optionalString(args, 'query', 120)?.toLocaleLowerCase('fr') || '';
    const status = optionalString(args, 'status', 30);
    const residentId = optionalString(args, 'residentId', 160);
    const dueFrom = args.dueFrom === undefined ? null : parseDateTime(args.dueFrom, 'dueFrom');
    const dueTo = args.dueTo === undefined ? null : parseDateTime(args.dueTo, 'dueTo');
    const limit = boundedLimit(args.limit);
    if (dueFrom && dueTo && dueFrom > dueTo) throw new Error('La borne dueFrom doit précéder dueTo.');
    if (dueFrom && dueTo && dueTo.getTime() - dueFrom.getTime() > 366 * 86_400_000) {
      throw new Error('La période de recherche ne peut pas dépasser un an.');
    }

    const sourceTasks = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as JsonRecord & { id: string }))
      .filter((task) => task.deleted !== true)
      .filter((task) => !status || task.status === status)
      .filter((task) => !residentId || task.residentId === residentId)
      .filter((task) => {
        if (!queryText) return true;
        return [task.name, task.description, task.residentName]
          .some((value) => typeof value === 'string' && value.toLocaleLowerCase('fr').includes(queryText));
      });

    const realSignatures = new Set(snapshot.docs.filter((doc) => doc.data().deleted !== true).map((doc) => {
      const task = doc.data();
      const dueDate = firestoreDate(task.dueDate);
      return dueDate
        ? `${String(task.name || '').toLocaleLowerCase('fr')}|${String(task.residentId || '')}|${localDateKey(new Date(dueDate))}`
        : '';
    }));
    const expandedTasks: Array<JsonRecord & { id: string; dueDateIso: string; isVirtualOccurrence: boolean }> = [];

    for (const task of sourceTasks) {
      const dueDateIso = firestoreDate(task.dueDate);
      if (!dueDateIso) continue;
      const dueDate = new Date(dueDateIso);
      if ((!dueFrom || dueDate >= dueFrom) && (!dueTo || dueDate <= dueTo)) {
        expandedTasks.push({ ...task, dueDateIso, isVirtualOccurrence: false });
      }

      if (
        !dueFrom
        || !dueTo
        || status === 'completed'
        || task.status === 'completed'
        || !task.recurrenceType
        || task.recurrenceType === 'none'
      ) continue;

      const baseKey = localDateKey(dueDate);
      const baseTime = torontoParts(dueDate);
      const startValue = dateKeyValue(localDateKey(dueFrom));
      const endValue = dateKeyValue(localDateKey(dueTo));
      for (let dayValue = startValue; dayValue <= endValue; dayValue += 86_400_000) {
        const targetKey = new Date(dayValue).toISOString().slice(0, 10);
        if (!recurrenceMatches(task, baseKey, targetKey) || isSkippedDate(task, targetKey)) continue;
        const occurrenceDate = torontoDateTime(targetKey, baseTime.hour, baseTime.minute);
        if (occurrenceDate < dueFrom || occurrenceDate > dueTo) continue;
        const signature = `${String(task.name || '').toLocaleLowerCase('fr')}|${String(task.residentId || '')}|${targetKey}`;
        if (realSignatures.has(signature)) continue;
        expandedTasks.push({
          ...task,
          id: `virtual-${task.id}-${targetKey}`,
          dueDateIso: occurrenceDate.toISOString(),
          status: 'pending',
          isVirtualOccurrence: true,
          sourceTaskId: task.id,
        });
      }
    }

    const tasks = expandedTasks
      .sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso))
      .slice(0, limit)
      .map((task) => ({
        id: task.id,
        name: task.name,
        description: typeof task.description === 'string' ? task.description.slice(0, 400) : '',
        dueDate: task.dueDateIso,
        status: task.status,
        recurrenceType: task.recurrenceType,
        residentId: task.residentId || null,
        residentName: task.residentName || null,
        isVirtualOccurrence: task.isVirtualOccurrence,
        sourceTaskId: task.sourceTaskId || null,
      }));

    return { count: tasks.length, tasks };
  }

  if (toolName === 'list_residents') {
    const snapshot = await db.collection('residents').where('centerCode', '==', actor.centerCode).get();
    const queryText = optionalString(args, 'query', 120)?.toLocaleLowerCase('fr') || '';
    const limit = boundedLimit(args.limit);
    const residents = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as JsonRecord & { id: string }))
      .filter((resident) => {
        if (!queryText) return true;
        return [resident.firstName, resident.lastName]
          .some((value) => typeof value === 'string' && value.toLocaleLowerCase('fr').includes(queryText));
      })
      .sort((a, b) => String(a.lastName || '').localeCompare(String(b.lastName || ''), 'fr'))
      .slice(0, limit)
      .map((resident) => ({
        id: resident.id,
        firstName: resident.firstName,
        lastName: resident.lastName,
        language: resident.language,
        autonomyLevel: resident.autonomyLevel,
      }));
    return { count: residents.length, residents };
  }

  if (toolName === 'list_team_members') {
    const [activeSnapshot, legacySnapshot] = await Promise.all([
      db.collection('users').where('activeCenters', 'array-contains', actor.centerCode).get(),
      db.collection('users').where('centerCode', '==', actor.centerCode).get(),
    ]);
    const queryText = optionalString(args, 'query', 120)?.toLocaleLowerCase('fr') || '';
    const limit = boundedLimit(args.limit);
    const memberMap = new Map<string, JsonRecord & { id: string }>();
    for (const doc of [...activeSnapshot.docs, ...legacySnapshot.docs]) {
      const data = doc.data();
      if (typeof data.accountStatus === 'string' && data.accountStatus !== 'active') continue;
      const activeCenters = Array.isArray(data.activeCenters) ? data.activeCenters : [];
      if (activeCenters.length > 0 && !activeCenters.includes(actor.centerCode)) continue;
      memberMap.set(doc.id, { id: doc.id, ...data });
    }
    const members = Array.from(memberMap.values())
      .filter((member) => {
        if (!queryText) return true;
        return [member.firstName, member.lastName]
          .some((value) => typeof value === 'string' && value.toLocaleLowerCase('fr').includes(queryText));
      })
      .slice(0, limit)
      .map((member) => {
        const centerRoles = member.centerRoles && typeof member.centerRoles === 'object'
          ? member.centerRoles as Record<string, unknown>
          : {};
        return {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          role: centerRoles[actor.centerCode] || member.role || 'employee',
          isOnline: member.isOnline === true,
        };
      });
    return { count: members.length, members };
  }

  throw new Error('Outil de lecture non autorisé.');
}

export async function prepareMutation(
  db: Firestore,
  actor: AssistantActor,
  toolName: string,
  rawArgs: unknown,
): Promise<MutationPreparation> {
  if (!isMutationTool(toolName)) throw new Error('Action non autorisée.');

  if (toolName === 'create_task') {
    const { args, values } = validateTaskInput(rawArgs, false);
    const type = String(values.type);
    const residentId = optionalString(args, 'residentId', 160);
    if (type === 'general' && residentId) throw new Error('Une tâche générale ne peut pas être associée à un résident.');
    const resident = await resolveResidentForTask(db, actor, type, residentId);
    return {
      title: 'Créer une tâche',
      description: `Créer « ${values.name} » pour le ${formatForConfirmation(values.dueDate)}${resident ? `, pour ${resident.name}` : ''}.`,
      destructive: false,
    };
  }

  if (toolName === 'update_task') {
    const args = asRecord(rawArgs);
    const taskId = requiredString(args, 'taskId', 160);
    const task = await loadTask(db, actor, taskId);
    const { values } = validateTaskInput(args, true);
    const requestedResidentId = optionalString(args, 'residentId', 160);
    if (Object.keys(values).length === 0 && !requestedResidentId) throw new Error('Aucune modification de tâche n’a été fournie.');
    const nextType = String(values.type || task.data.type || 'general');
    if (nextType === 'general' && requestedResidentId) {
      throw new Error('Une tâche générale ne peut pas être associée à un résident.');
    }
    if (nextType === 'resident') {
      const nextResidentId = requestedResidentId || (typeof task.data.residentId === 'string' ? task.data.residentId : undefined);
      await resolveResidentForTask(db, actor, nextType, nextResidentId);
    }
    const nextRecurrence = String(values.recurrenceType || task.data.recurrenceType || 'none');
    const nextSpecificDays = values.specificDays ?? task.data.specificDays;
    if (nextRecurrence === 'specificDays' && (!Array.isArray(nextSpecificDays) || nextSpecificDays.length === 0)) {
      throw new Error('Au moins un jour est requis pour une récurrence par jours spécifiques.');
    }
    if (nextRecurrence !== 'specificDays' && values.specificDays !== undefined) {
      throw new Error('Les jours spécifiques ne sont permis qu’avec la récurrence correspondante.');
    }
    return {
      title: 'Modifier une tâche',
      description: `Modifier « ${String(task.data.name || taskId)} » — ${describeChanges({ ...values, ...(requestedResidentId ? { residentId: requestedResidentId } : {}) })}.`,
      destructive: false,
      targetId: taskId,
      targetVersion: task.updateTime,
    };
  }

  if (toolName === 'delete_task') {
    if (!actor.canManage) throw new Error('Seuls les administrateurs et employeurs peuvent supprimer une tâche.');
    const args = asRecord(rawArgs);
    const taskId = requiredString(args, 'taskId', 160);
    const task = await loadTask(db, actor, taskId);
    const recurring = task.data.recurrenceType && task.data.recurrenceType !== 'none';
    return {
      title: 'Supprimer une tâche',
      description: recurring
        ? `Supprimer « ${String(task.data.name || taskId)} » et toutes ses occurrences futures.`
        : `Supprimer définitivement « ${String(task.data.name || taskId)} ».`,
      destructive: true,
      targetId: taskId,
      targetVersion: task.updateTime,
    };
  }

  if (toolName === 'create_resident') {
    const { values } = validateResidentInput(rawArgs, false);
    return {
      title: 'Créer un profil de résident',
      description: `Créer le profil de ${values.firstName} ${values.lastName} dans le centre ${actor.centerCode}.`,
      destructive: false,
    };
  }

  if (toolName === 'update_resident') {
    const args = asRecord(rawArgs);
    const residentId = requiredString(args, 'residentId', 160);
    const resident = await loadResident(db, actor, residentId);
    const { values } = validateResidentInput(args, true);
    if (Object.keys(values).length === 0) throw new Error('Aucune modification de résident n’a été fournie.');
    const merged = { ...resident.data, ...values };
    if (merged.hasAllergies === true && !merged.allergies) throw new Error('Les allergies doivent être précisées.');
    if (merged.hasDisability === true && !merged.disability) throw new Error('Le handicap doit être précisé.');
    return {
      title: 'Modifier un profil de résident',
      description: `Modifier le profil de ${resident.data.firstName || ''} ${resident.data.lastName || ''} — ${describeChanges(values)}.`,
      destructive: false,
      targetId: residentId,
      targetVersion: resident.updateTime,
    };
  }

  if (toolName === 'delete_resident') {
    if (!actor.canManage) throw new Error('Seuls les administrateurs et employeurs peuvent supprimer un résident.');
    const args = asRecord(rawArgs);
    const residentId = requiredString(args, 'residentId', 160);
    const resident = await loadResident(db, actor, residentId);
    const tasks = await db.collection('tasks').where('residentId', '==', residentId).get();
    const linkedTasks = tasks.docs.filter((doc) => doc.data().centerCode === actor.centerCode && doc.data().deleted !== true);
    if (linkedTasks.length > 0) {
      throw new Error(`Ce résident possède encore ${linkedTasks.length} tâche(s) liée(s). Elles doivent être supprimées ou réaffectées avant le profil.`);
    }
    return {
      title: 'Supprimer un profil de résident',
      description: `Supprimer définitivement le profil de ${resident.data.firstName || ''} ${resident.data.lastName || ''}.`,
      destructive: true,
      targetId: residentId,
      targetVersion: resident.updateTime,
    };
  }

  throw new Error('Action non autorisée.');
}

export async function executeMutation(
  db: Firestore,
  actor: AssistantActor,
  toolName: string,
  rawArgs: unknown,
  expectedTargetVersion?: Timestamp,
): Promise<MutationResult> {
  if (toolName === 'create_task') {
    const { args, values } = validateTaskInput(rawArgs, false);
    const type = String(values.type);
    const residentId = optionalString(args, 'residentId', 160);
    if (type === 'general' && residentId) throw new Error('Une tâche générale ne peut pas être associée à un résident.');
    const resident = await resolveResidentForTask(db, actor, type, residentId);
    const taskRef = db.collection('tasks').doc();
    const alertRef = db.collection('alerts').doc();
    const now = Timestamp.now();
    const creator = { id: actor.uid, name: actor.displayName, timestamp: now };
    const taskData: JsonRecord = {
      ...values,
      dueDate: Timestamp.fromDate(values.dueDate as Date),
      status: 'pending',
      centerCode: actor.centerCode,
      createdAt: now,
      createdBy: creator,
      lastModifiedBy: creator,
      deleted: false,
      skippedDates: [],
    };
    if (resident) {
      taskData.residentId = resident.id;
      taskData.residentName = resident.name;
    }
    const batch = db.batch();
    batch.set(taskRef, taskData);
    batch.set(alertRef, {
      type: 'task_created',
      title: 'Nouvelle tâche créée',
      message: `La tâche « ${values.name} » a été créée par ${actor.displayName}.`,
      createdAt: now,
      readBy: [actor.uid],
      relatedId: taskRef.id,
      centerCode: actor.centerCode,
      excludedUsers: [actor.uid],
    });
    await batch.commit();
    return { message: `La tâche « ${values.name} » a été créée.`, changedEntity: 'task', targetId: taskRef.id };
  }

  if (toolName === 'update_task') {
    const args = asRecord(rawArgs);
    const taskId = requiredString(args, 'taskId', 160);
    const task = await loadTask(db, actor, taskId);
    assertExpectedVersion(task.updateTime, expectedTargetVersion);
    const { values } = validateTaskInput(args, true);
    const requestedResidentId = optionalString(args, 'residentId', 160);
    if (Object.keys(values).length === 0 && !requestedResidentId) throw new Error('Aucune modification de tâche n’a été fournie.');

    const nextType = String(values.type || task.data.type || 'general');
    if (nextType === 'general' && requestedResidentId) {
      throw new Error('Une tâche générale ne peut pas être associée à un résident.');
    }
    const nextResidentId = requestedResidentId
      || (typeof task.data.residentId === 'string' ? task.data.residentId : undefined);
    const resident = await resolveResidentForTask(db, actor, nextType, nextResidentId);
    const updateData: JsonRecord = { ...values };
    if (values.dueDate instanceof Date) updateData.dueDate = Timestamp.fromDate(values.dueDate);
    if (nextType === 'resident' && resident) {
      updateData.residentId = resident.id;
      updateData.residentName = resident.name;
    } else if (nextType === 'general') {
      updateData.residentId = FieldValue.delete();
      updateData.residentName = FieldValue.delete();
    }
    const nextRecurrence = String(values.recurrenceType || task.data.recurrenceType || 'none');
    const nextSpecificDays = values.specificDays ?? task.data.specificDays;
    if (nextRecurrence === 'specificDays' && (!Array.isArray(nextSpecificDays) || nextSpecificDays.length === 0)) {
      throw new Error('Au moins un jour est requis pour une récurrence par jours spécifiques.');
    }
    if (nextRecurrence !== 'specificDays' && values.specificDays !== undefined) {
      throw new Error('Les jours spécifiques ne sont permis qu’avec la récurrence correspondante.');
    }
    if (values.recurrenceType && nextRecurrence !== 'specificDays') {
      updateData.specificDays = FieldValue.delete();
    }
    updateData.lastModifiedBy = { id: actor.uid, name: actor.displayName, timestamp: Timestamp.now() };

    const alertRef = db.collection('alerts').doc();
    const batch = db.batch();
    batch.update(task.ref, updateData as UpdateData<DocumentData>, { lastUpdateTime: expectedTargetVersion! });
    batch.set(alertRef, {
      centerCode: actor.centerCode,
      type: 'task_updated',
      title: 'Tâche modifiée',
      message: `La tâche « ${String(values.name || task.data.name || taskId)} » a été modifiée par ${actor.displayName}.`,
      relatedId: taskId,
      createdAt: Timestamp.now(),
      readBy: [actor.uid],
    });
    await batch.commit();
    return { message: 'La tâche a été mise à jour.', changedEntity: 'task', targetId: taskId };
  }

  if (toolName === 'delete_task') {
    if (!actor.canManage) throw new Error('Action non autorisée pour ce rôle.');
    const args = asRecord(rawArgs);
    const taskId = requiredString(args, 'taskId', 160);
    const task = await loadTask(db, actor, taskId);
    assertExpectedVersion(task.updateTime, expectedTargetVersion);
    const alerts = await db.collection('alerts').where('relatedId', '==', taskId).limit(100).get();
    const batch = db.batch();
    if (task.data.recurrenceType && task.data.recurrenceType !== 'none') {
      batch.update(task.ref, {
        deleted: true,
        deletedAt: Timestamp.now(),
        deletedBy: { id: actor.uid, name: actor.displayName },
        status: 'pending',
      }, { lastUpdateTime: expectedTargetVersion! });
    } else {
      batch.delete(task.ref, { lastUpdateTime: expectedTargetVersion! });
    }
    for (const alert of alerts.docs) {
      if (alert.data().centerCode === actor.centerCode) batch.delete(alert.ref);
    }
    await batch.commit();
    return { message: `La tâche « ${String(task.data.name || taskId)} » a été supprimée.`, changedEntity: 'task', targetId: taskId };
  }

  if (toolName === 'create_resident') {
    const { values } = validateResidentInput(rawArgs, false);
    const ref = db.collection('residents').doc();
    await ref.set({
      ...values,
      birthDate: Timestamp.fromDate(values.birthDate as Date),
      centerCode: actor.centerCode,
      createdAt: Timestamp.now(),
      createdBy: actor.uid,
    });
    return {
      message: `Le profil de ${values.firstName} ${values.lastName} a été créé.`,
      changedEntity: 'resident',
      targetId: ref.id,
    };
  }

  if (toolName === 'update_resident') {
    const args = asRecord(rawArgs);
    const residentId = requiredString(args, 'residentId', 160);
    const resident = await loadResident(db, actor, residentId);
    assertExpectedVersion(resident.updateTime, expectedTargetVersion);
    const { values } = validateResidentInput(args, true);
    if (Object.keys(values).length === 0) throw new Error('Aucune modification de résident n’a été fournie.');
    const merged = { ...resident.data, ...values };
    if (merged.hasAllergies === true && !merged.allergies) throw new Error('Les allergies doivent être précisées.');
    if (merged.hasDisability === true && !merged.disability) throw new Error('Le handicap doit être précisé.');
    if (merged.hasAllergies !== true) values.allergies = null;
    if (merged.hasDisability !== true) values.disability = null;
    if (values.birthDate instanceof Date) values.birthDate = Timestamp.fromDate(values.birthDate);
    await resident.ref.update({
      ...values,
      updatedAt: Timestamp.now(),
      updatedBy: actor.uid,
    }, { lastUpdateTime: expectedTargetVersion! });
    return {
      message: `Le profil de ${resident.data.firstName || ''} ${resident.data.lastName || ''} a été mis à jour.`,
      changedEntity: 'resident',
      targetId: residentId,
    };
  }

  if (toolName === 'delete_resident') {
    if (!actor.canManage) throw new Error('Action non autorisée pour ce rôle.');
    const args = asRecord(rawArgs);
    const residentId = requiredString(args, 'residentId', 160);
    const resident = await loadResident(db, actor, residentId);
    assertExpectedVersion(resident.updateTime, expectedTargetVersion);
    const tasks = await db.collection('tasks').where('residentId', '==', residentId).get();
    const linkedTasks = tasks.docs.filter((doc) => doc.data().centerCode === actor.centerCode && doc.data().deleted !== true);
    if (linkedTasks.length > 0) throw new Error('Ce résident possède encore des tâches liées. Suppression annulée.');
    await resident.ref.delete({ lastUpdateTime: expectedTargetVersion! });
    return {
      message: `Le profil de ${resident.data.firstName || ''} ${resident.data.lastName || ''} a été supprimé.`,
      changedEntity: 'resident',
      targetId: residentId,
    };
  }

  throw new Error('Action non autorisée.');
}

function formatForConfirmation(value: unknown) {
  if (!(value instanceof Date)) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-CA', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(value);
}
