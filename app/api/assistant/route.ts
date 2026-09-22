import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentParameters,
  type Part,
} from '@google/genai';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { buildAssistantSystemInstruction } from '@/lib/assistant/knowledge';
import {
  ASSISTANT_TOOLS,
  executeMutation,
  executeReadTool,
  isMutationTool,
  prepareMutation,
  type AssistantActor,
  type AssistantCenterRole,
} from '@/lib/assistant/tools';
import type { AssistantMessageInput } from '@/lib/assistant/types';

export const runtime = 'nodejs';

const MODEL_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
] as const;
const PRIMARY_MODEL = MODEL_CHAIN[0];
type AssistantModel = (typeof MODEL_CHAIN)[number];
const MODEL_TIMEOUT_MS: Record<AssistantModel, number> = {
  'gemini-3.5-flash-lite': 12_000,
  'gemini-3.1-flash-lite': 35_000,
  'gemini-2.5-flash-lite': 10_000,
  'gemini-3.1-flash-lite-preview': 35_000,
};
const FALLBACK_STATUS_CODES = new Set([404, 429, 503, 504]);
const ACTION_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;
const ALLOWED_TABS = new Set(['accueil', 'taches', 'residents', 'rapports', 'messages', 'alertes', 'equipe', 'profil']);
const FUNCTION_DECLARATIONS: FunctionDeclaration[] = ASSISTANT_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.parameters,
}));

interface AssistantRequestBody {
  messages?: AssistantMessageInput[];
  pageContext?: {
    activeTab?: string;
  };
  actionId?: string;
  decision?: 'confirm' | 'cancel';
}

interface EncryptedActionArgs {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function readBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function normalizeCenterCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeCenters(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeCenterCode).filter(Boolean)));
}

function getActionEncryptionKey() {
  const secret = process.env.GEMINI_API_KEY;
  if (!secret) throw new AssistantHttpError(503, 'Configuration de l’assistant manquante.');
  return createHash('sha256').update(`gestapp-assistant-action-v1\0${secret}`).digest();
}

function encryptActionArgs(args: Record<string, unknown>): EncryptedActionArgs {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getActionEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(args), 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function decryptActionArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new AssistantHttpError(410, 'Cette action ne peut plus être confirmée.');
  const payload = value as Partial<EncryptedActionArgs>;
  if (payload.version !== 1 || !payload.iv || !payload.tag || !payload.ciphertext) {
    throw new AssistantHttpError(410, 'Cette action ne peut plus être confirmée.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', getActionEncryptionKey(), Buffer.from(payload.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const parsed = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid payload');
    return parsed as Record<string, unknown>;
  } catch {
    throw new AssistantHttpError(410, 'Cette action ne peut plus être confirmée.');
  }
}

async function authenticate(request: NextRequest): Promise<AssistantActor> {
  const token = readBearerToken(request);
  if (!token) throw new AssistantHttpError(401, 'Session invalide.');

  const adminAuth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await adminAuth.verifyIdToken(token, true);
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.exists) throw new AssistantHttpError(403, 'Profil utilisateur introuvable.');

  const profile = userSnap.data() || {};
  if (typeof profile.accountStatus === 'string' && profile.accountStatus !== 'active') {
    throw new AssistantHttpError(403, 'Ce compte n’est pas actif.');
  }
  const centerCode = normalizeCenterCode(profile.centerCode);
  const activeCenters = normalizeCenters(profile.activeCenters);
  const legacyCenters = normalizeCenters(profile.associatedCenters);
  const allowedCenters = activeCenters.length > 0
    ? activeCenters
    : profile.accountStatus === 'active'
      ? Array.from(new Set([...legacyCenters, centerCode].filter(Boolean)))
      : [];

  if (!centerCode || !allowedCenters.includes(centerCode)) {
    throw new AssistantHttpError(403, 'Aucun centre actif autorisé.');
  }

  const centerSnap = centerCode ? await db.collection('centers').doc(centerCode).get() : null;
  if (!centerSnap?.exists) throw new AssistantHttpError(403, 'Centre actif introuvable.');

  const centerRoles = profile.centerRoles && typeof profile.centerRoles === 'object'
    ? profile.centerRoles as Record<string, unknown>
    : {};
  const explicitRole = centerRoles[centerCode];
  let role: AssistantCenterRole = explicitRole === 'employer' || explicitRole === 'admin' || explicitRole === 'employee'
    ? explicitRole
    : 'employee';

  if (!explicitRole) {
    if (centerSnap.data()?.ownerId === decoded.uid) {
      role = 'employer';
    } else if (Object.keys(centerRoles).length === 0 && profile.role === 'admin') {
      role = 'admin';
    }
  }

  const displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || decoded.email || 'Utilisateur';
  return {
    uid: decoded.uid,
    centerCode,
    centerTitle: String(centerSnap.data()?.dashboardTitle || centerSnap.data()?.title || centerCode).slice(0, 160),
    role,
    displayName,
    canManage: role === 'employer' || role === 'admin',
  };
}

async function enforceRateLimit(actor: AssistantActor) {
  const db = getAdminDb();
  const now = Date.now();
  const bucketStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const bucketId = createHash('sha256')
    .update(`${actor.uid}:${actor.centerCode}:${bucketStart}`)
    .digest('hex');
  const ref = db.collection('assistantRateLimits').doc(bucketId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.data()?.count || 0);
    if (count >= RATE_LIMIT) {
      throw new AssistantHttpError(429, 'Trop de demandes rapprochées. Réessayez dans quelques minutes.');
    }
    transaction.set(ref, {
      count: count + 1,
      userId: actor.uid,
      centerCode: actor.centerCode,
      bucketStart: Timestamp.fromMillis(bucketStart),
      expiresAt: Timestamp.fromMillis(bucketStart + RATE_WINDOW_MS * 2),
    }, { merge: true });
  });
}

function validateMessages(value: unknown): AssistantMessageInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AssistantHttpError(400, 'Le message est vide.');
  }
  const messages = value.slice(-16).map((message) => {
    if (!message || typeof message !== 'object') throw new AssistantHttpError(400, 'Historique invalide.');
    const role = (message as { role?: unknown }).role;
    const content = (message as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
      throw new AssistantHttpError(400, 'Historique invalide.');
    }
    return { role: role as 'user' | 'assistant', content: content.trim().slice(0, 4000) };
  });
  const totalLength = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalLength > 16000) throw new AssistantHttpError(413, 'La conversation est trop longue. Effacez-la puis réessayez.');
  return messages;
}

function getLatestUserMessage(messages: AssistantMessageInput[]) {
  const latest = [...messages].reverse().find((message) => message.role === 'user');
  if (!latest) throw new AssistantHttpError(400, 'Le message utilisateur est vide.');
  return latest.content;
}

function apiErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) ? status : null;
}

type GenerateParametersWithoutModel = Omit<GenerateContentParameters, 'model'>;

async function generateWithFallback(
  apiKey: string,
  parameters: GenerateParametersWithoutModel,
  startIndex = 0,
) {
  for (let modelIndex = startIndex; modelIndex < MODEL_CHAIN.length; modelIndex += 1) {
    const model = MODEL_CHAIN[modelIndex];
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: MODEL_TIMEOUT_MS[model],
        retryOptions: { attempts: 1 },
      },
    });
    try {
      const response = await ai.models.generateContent({ ...parameters, model });
      return { response, model, modelIndex };
    } catch (error) {
      const status = apiErrorStatus(error);
      if (status && FALLBACK_STATUS_CODES.has(status)) {
        console.warn('Assistant Gemini fallback:', { model, status });
        continue;
      }
      throw error;
    }
  }
  throw new AssistantHttpError(
    503,
    'Les modèles Gemini sont temporairement très sollicités. Réessayez dans quelques instants.',
  );
}

async function removeExpiredActions(actor: AssistantActor) {
  const db = getAdminDb();
  const snapshot = await db.collection('assistantActions').where('userId', '==', actor.uid).get();
  const now = Date.now();
  const batch = db.batch();
  let hasDeletes = false;
  for (const doc of snapshot.docs) {
    const expiresAt = doc.data().expiresAt;
    if (expiresAt instanceof Timestamp && expiresAt.toMillis() <= now) {
      batch.delete(doc.ref);
      hasDeletes = true;
    }
  }
  if (hasDeletes) await batch.commit();
}

async function createPendingAction(
  actor: AssistantActor,
  toolName: string,
  args: Record<string, unknown>,
) {
  const db = getAdminDb();
  const preparation = await prepareMutation(db, actor, toolName, args);
  await removeExpiredActions(actor);
  const ref = db.collection('assistantActions').doc();
  const expiresAt = Timestamp.fromMillis(Date.now() + ACTION_TTL_MS);
  await ref.set({
    userId: actor.uid,
    centerCode: actor.centerCode,
    role: actor.role,
    toolName,
    encryptedArgs: encryptActionArgs(args),
    targetId: preparation.targetId || null,
    targetVersion: preparation.targetVersion || null,
    status: 'pending',
    createdAt: Timestamp.now(),
    expiresAt,
  });
  return {
    id: ref.id,
    title: preparation.title,
    description: preparation.description,
    destructive: preparation.destructive,
    expiresAt: expiresAt.toDate().toISOString(),
  };
}

async function handleConversation(actor: AssistantActor, body: AssistantRequestBody) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({
      code: 'assistant-not-configured',
      error: 'L’assistant est installé, mais la clé GEMINI_API_KEY n’est pas encore configurée.',
    }, 503);
  }

  const messages = validateMessages(body.messages);
  const pageContext = body.pageContext || {};
  const activeTab = typeof pageContext.activeTab === 'string' && ALLOWED_TABS.has(pageContext.activeTab)
    ? pageContext.activeTab
    : undefined;
  const systemInstruction = buildAssistantSystemInstruction({
    centerCode: actor.centerCode,
    centerTitle: actor.centerTitle,
    role: actor.role,
    displayName: actor.displayName,
    activeTab,
  });
  const contents: Content[] = [{ role: 'user', parts: [{ text: getLatestUserMessage(messages) }] }];
  let activeModel: AssistantModel = PRIMARY_MODEL;
  let activeModelIndex = 0;

  for (let round = 0; round < 5; round += 1) {
    const generation = await generateWithFallback(apiKey, {
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 1500,
      },
    }, activeModelIndex);
    const { response } = generation;
    activeModel = generation.model;
    activeModelIndex = generation.modelIndex;
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);
    const calls = response.functionCalls || [];
    if (calls.length === 0) {
      return json({
        message: response.text?.trim() || 'Je n’ai pas pu produire de réponse utile.',
        model: activeModel,
        fallbackUsed: activeModel !== PRIMARY_MODEL,
      });
    }

    const results: Part[] = [];
    for (const call of calls) {
      if (!call.name) continue;
      try {
        if (isMutationTool(call.name)) {
          const pendingAction = await createPendingAction(actor, call.name, call.args || {});
          return json({
            message: 'J’ai préparé cette action. Vérifiez les détails avant de la confirmer.',
            pendingAction,
            model: activeModel,
            fallbackUsed: activeModel !== PRIMARY_MODEL,
          });
        }
        const result = await executeReadTool(getAdminDb(), actor, call.name, call.args || {});
        results.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { output: result },
          },
        });
      } catch (error) {
        results.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { error: error instanceof Error ? error.message : 'Erreur d’outil.' },
          },
        });
      }
    }
    if (results.length === 0) throw new AssistantHttpError(422, 'L’assistant a demandé une action invalide.');
    contents.push({ role: 'user', parts: results });
  }

  return json({
    message: 'La demande nécessite trop d’étapes. Reformulez-la en une seule action précise.',
    model: activeModel,
    fallbackUsed: activeModel !== PRIMARY_MODEL,
  }, 422);
}

async function handleActionDecision(actor: AssistantActor, body: AssistantRequestBody) {
  const actionId = typeof body.actionId === 'string' ? body.actionId.trim() : '';
  if (!actionId || (body.decision !== 'confirm' && body.decision !== 'cancel')) {
    throw new AssistantHttpError(400, 'Décision invalide.');
  }

  const db = getAdminDb();
  const actionRef = db.collection('assistantActions').doc(actionId);
  const actionSnap = await actionRef.get();
  if (!actionSnap.exists) throw new AssistantHttpError(404, 'Cette action n’existe plus.');
  const action = actionSnap.data() || {};
  if (action.userId !== actor.uid || action.centerCode !== actor.centerCode) {
    throw new AssistantHttpError(403, 'Cette action ne vous appartient pas.');
  }
  if (!(action.expiresAt instanceof Timestamp) || action.expiresAt.toMillis() <= Date.now()) {
    await actionRef.delete();
    throw new AssistantHttpError(410, 'Cette confirmation a expiré. Reformulez la demande.');
  }
  if (action.status === 'completed') {
    return json({
      message: action.resultMessage || 'Action déjà effectuée.',
      changedEntity: action.changedEntity || null,
    });
  }
  if (action.status === 'cancelled') return json({ message: 'Action déjà annulée.' });
  if (action.status !== 'pending') throw new AssistantHttpError(409, 'Cette action est déjà en cours de traitement.');

  if (body.decision === 'cancel') {
    const batch = db.batch();
    batch.update(actionRef, {
      status: 'cancelled',
      completedAt: Timestamp.now(),
      encryptedArgs: FieldValue.delete(),
    });
    batch.set(db.collection('assistantAudit').doc(), {
      actionId,
      userId: actor.uid,
      centerCode: actor.centerCode,
      role: actor.role,
      toolName: action.toolName,
      targetId: action.targetId || null,
      outcome: 'cancelled',
      createdAt: Timestamp.now(),
    });
    await batch.commit();
    return json({ message: 'Action annulée.' });
  }

  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(actionRef);
    const currentData = current.data();
    if (!current.exists || currentData?.status !== 'pending') {
      throw new AssistantHttpError(409, 'Cette action a déjà été traitée.');
    }
    if (currentData.userId !== actor.uid || currentData.centerCode !== actor.centerCode) {
      throw new AssistantHttpError(403, 'Cette action ne vous appartient pas.');
    }
    transaction.update(actionRef, { status: 'executing', startedAt: Timestamp.now() });
  });

  let result: Awaited<ReturnType<typeof executeMutation>>;
  try {
    result = await executeMutation(
      db,
      actor,
      String(action.toolName || ''),
      decryptActionArgs(action.encryptedArgs),
      action.targetVersion instanceof Timestamp ? action.targetVersion : undefined,
    );
  } catch (error) {
    const batch = db.batch();
    batch.update(actionRef, {
      status: 'failed',
      completedAt: Timestamp.now(),
      encryptedArgs: FieldValue.delete(),
    });
    batch.set(db.collection('assistantAudit').doc(), {
      actionId,
      userId: actor.uid,
      centerCode: actor.centerCode,
      role: actor.role,
      toolName: action.toolName,
      targetId: action.targetId || null,
      outcome: 'failed',
      error: error instanceof Error ? error.message.slice(0, 300) : 'Erreur inconnue',
      createdAt: Timestamp.now(),
    });
    await batch.commit();
    throw error;
  }

  const completion = {
    status: 'completed',
    completedAt: Timestamp.now(),
    resultMessage: result.message,
    changedEntity: result.changedEntity,
    encryptedArgs: FieldValue.delete(),
  };
  const batch = db.batch();
  batch.update(actionRef, completion);
  batch.set(db.collection('assistantAudit').doc(), {
    actionId,
    userId: actor.uid,
    centerCode: actor.centerCode,
    role: actor.role,
    toolName: action.toolName,
    targetId: result.targetId || action.targetId || null,
    outcome: 'completed',
    createdAt: Timestamp.now(),
  });
  try {
    await batch.commit();
  } catch (error) {
    console.error('Assistant audit finalization error:', error);
    await actionRef.update(completion);
  }
  return json({ message: result.message, changedEntity: result.changedEntity });
}

export async function GET(request: NextRequest) {
  try {
    await authenticate(request);
    return json({
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: PRIMARY_MODEL,
      fallbackModels: MODEL_CHAIN.slice(1),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await authenticate(request);
    await enforceRateLimit(actor);
    let body: AssistantRequestBody;
    try {
      body = await request.json() as AssistantRequestBody;
    } catch {
      throw new AssistantHttpError(400, 'Le format de la demande est invalide.');
    }
    if (body.actionId || body.decision) return await handleActionDecision(actor, body);
    return await handleConversation(actor, body);
  } catch (error) {
    return handleRouteError(error);
  }
}

class AssistantHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function handleRouteError(error: unknown) {
  if (error instanceof AssistantHttpError) return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message.includes('Firebase Admin credentials are missing')) {
    return json({ error: 'Configuration Firebase Admin manquante.' }, 503);
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '');
    if (['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error'].includes(code)) {
      return json({ error: 'Votre session a expiré. Reconnectez-vous à GestApp.' }, 401);
    }
  }
  console.error('Assistant API error:', error);
  return json({ error: 'L’assistant a rencontré une erreur interne. Réessayez dans un instant.' }, 500);
}
