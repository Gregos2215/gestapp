'use client';

import { Fragment, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowPathIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import type {
  AssistantApiResponse,
  AssistantChangedEntity,
  AssistantMessageInput,
  AssistantPendingAction,
} from '@/lib/assistant/types';

interface GestAppAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  centerTitle: string;
  onDataChanged?: (entity: AssistantChangedEntity) => void;
}

interface DisplayMessage extends AssistantMessageInput {
  id: string;
}

const INITIAL_MESSAGE: DisplayMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Bonjour. Je peux vous expliquer GestApp, retrouver des informations et préparer des actions dans votre centre actif.',
};

const QUICK_PROMPTS = [
  'Quelles tâches sont les plus urgentes ?',
  'Comment fonctionne la gestion des résidents ?',
  'Aide-moi à créer une tâche',
];

class AssistantRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function fallbackErrorMessage(status: number) {
  if (status === 400) return 'La demande envoyée à l’assistant est invalide.';
  if (status === 401) return 'Votre session a expiré. Reconnectez-vous à GestApp.';
  if (status === 403) return 'Votre compte n’est pas autorisé à utiliser l’assistant dans ce centre.';
  if (status === 408 || status === 504) return 'La réponse a pris trop de temps. Réessayez avec une question plus courte.';
  if (status === 429) return 'Trop de demandes ont été envoyées. Attendez quelques instants avant de réessayer.';
  if (status === 502 || status === 503) return 'Le service Gemini est temporairement indisponible. Réessayez dans quelques instants.';
  return `Le serveur de l’assistant a rencontré une erreur (${status}).`;
}

export default function GestAppAssistant({
  isOpen,
  onClose,
  activeTab,
  centerTitle,
  onDataChanged,
}: GestAppAssistantProps) {
  const { user } = useAuth() || {};
  const [messages, setMessages] = useState<DisplayMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingAction, setPendingAction] = useState<AssistantPendingAction | null>(null);
  const [configurationState, setConfigurationState] = useState<'checking' | 'ready' | 'missing' | 'unknown'>('unknown');
  const messageEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;

    async function checkConfiguration() {
      setConfigurationState('checking');
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Session Firebase indisponible.');
        const response = await fetch('/api/assistant', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!cancelled) setConfigurationState(result.configured ? 'ready' : 'missing');
      } catch {
        if (!cancelled) setConfigurationState('unknown');
      }
    }

    void checkConfiguration();
    return () => { cancelled = true; };
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isOpen, messages, pendingAction, isSending]);

  useEffect(() => {
    if (isOpen) window.setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  async function callAssistant(payload: Record<string, unknown>) {
    if (!user || !auth.currentUser) throw new AssistantRequestError('Votre session a expiré. Reconnectez-vous à GestApp.', 401);
    let token: string;
    try {
      token = await auth.currentUser.getIdToken(true);
    } catch {
      throw new AssistantRequestError('Impossible de vérifier votre session. Vérifiez votre connexion Internet.', 401);
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    try {
      response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AssistantRequestError('Gemini a dépassé le délai de 45 secondes. Réessayez dans quelques instants.', 504);
      }
      throw new AssistantRequestError('Connexion au serveur impossible. Vérifiez Internet ou le déploiement Netlify.', 0);
    } finally {
      window.clearTimeout(timeout);
    }

    const result = await response.json().catch(() => null) as (AssistantApiResponse & { error?: string }) | null;
    if (!response.ok) throw new AssistantRequestError(
      result?.error || fallbackErrorMessage(response.status),
      response.status,
    );
    if (!result || typeof result.message !== 'string') {
      throw new AssistantRequestError('Le serveur a retourné une réponse illisible. Réessayez après avoir actualisé la page.', 502);
    }
    return result as AssistantApiResponse;
  }

  async function sendMessage(content: string) {
    const cleanContent = content.trim();
    if (!cleanContent || isSending || pendingAction) return;

    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: cleanContent,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const result = await callAssistant({
        messages: [{ role: 'user', content: cleanContent }],
        pageContext: {
          activeTab,
        },
      });
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.message,
      }]);
      setPendingAction(result.pendingAction || null);
      setConfigurationState('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Une erreur est survenue.';
      if (message.includes('GEMINI_API_KEY')) setConfigurationState('missing');
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: message,
      }]);
    } finally {
      setIsSending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  async function decideAction(decision: 'confirm' | 'cancel') {
    if (!pendingAction || isSending) return;
    setIsSending(true);
    try {
      const result = await callAssistant({ actionId: pendingAction.id, decision });
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.message,
      }]);
      setPendingAction(null);
      if (result.changedEntity) onDataChanged?.(result.changedEntity);
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'L’action n’a pas pu être traitée.',
      }]);
      if (error instanceof AssistantRequestError && [404, 409, 410].includes(error.status)) {
        setPendingAction(null);
      }
    } finally {
      setIsSending(false);
    }
  }

  async function clearConversation() {
    if (isSending) return;
    if (pendingAction) {
      setIsSending(true);
      try {
        await callAssistant({ actionId: pendingAction.id, decision: 'cancel' });
      } catch (error) {
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'L’action en attente n’a pas pu être annulée.',
        }]);
        setIsSending(false);
        return;
      }
      setIsSending(false);
    }
    setMessages([INITIAL_MESSAGE]);
    setInput('');
    setPendingAction(null);
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[60]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-emerald-950/20 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in duration-200"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto flex h-full w-screen flex-col bg-white shadow-2xl sm:w-[28rem]">
                  <header className="flex h-20 shrink-0 items-center justify-between border-b border-emerald-900/10 bg-emerald-900 px-5 text-white">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12">
                        <SparklesIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <Dialog.Title className="truncate text-base font-bold">Assistant GestApp</Dialog.Title>
                        <p className="truncate text-xs text-emerald-100">{centerTitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void clearConversation()}
                        disabled={isSending}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-emerald-50 hover:bg-white/10"
                        title="Effacer la conversation"
                      >
                        <TrashIcon className="h-5 w-5" aria-hidden="true" />
                        <span className="sr-only">Effacer la conversation</span>
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-emerald-50 hover:bg-white/10"
                        title="Fermer l’assistant"
                      >
                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                        <span className="sr-only">Fermer l’assistant</span>
                      </button>
                    </div>
                  </header>

                  {configurationState === 'missing' && (
                    <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
                      La clé Gemini doit encore être ajoutée côté serveur avant l’utilisation.
                    </div>
                  )}

                  <div
                    className="flex-1 space-y-4 overflow-y-auto bg-[#f8faf7] px-4 py-5"
                    aria-live="polite"
                    aria-busy={isSending}
                  >
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[88%] px-4 py-3 text-sm leading-6 shadow-sm ${
                          message.role === 'user'
                            ? 'rounded-2xl rounded-br-md bg-emerald-800 text-white'
                            : 'rounded-2xl rounded-bl-md border border-emerald-900/10 bg-white text-gray-800'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                      </div>
                    ))}

                    {messages.length === 1 && !pendingAction && (
                      <div className="grid gap-2 pt-1">
                        {QUICK_PROMPTS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => void sendMessage(prompt)}
                            disabled={isSending || configurationState === 'missing'}
                            className="rounded-lg border border-emerald-900/10 bg-white px-3 py-2.5 text-left text-sm font-medium text-emerald-900 hover:border-emerald-700/30 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}

                    {pendingAction && (
                      <section className={`border bg-white p-4 shadow-sm ${pendingAction.destructive ? 'border-red-200' : 'border-amber-200'}`}>
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            pendingAction.destructive ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <h3 className="text-sm font-bold text-gray-950">{pendingAction.title}</h3>
                            <p className="mt-1 text-sm leading-5 text-gray-600">{pendingAction.description}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void decideAction('cancel')}
                            disabled={isSending}
                            className="ga-btn-secondary px-4 py-2 text-sm disabled:opacity-50"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => void decideAction('confirm')}
                            disabled={isSending}
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                              pendingAction.destructive ? 'bg-red-700 hover:bg-red-800' : 'bg-emerald-800 hover:bg-emerald-900'
                            }`}
                          >
                            <CheckIcon className="h-4 w-4" aria-hidden="true" />
                            Confirmer
                          </button>
                        </div>
                      </section>
                    )}

                    {isSending && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-emerald-900/10 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                          <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Analyse en cours
                        </div>
                      </div>
                    )}
                    <div ref={messageEndRef} />
                  </div>

                  <form onSubmit={submit} className="shrink-0 border-t border-emerald-900/10 bg-white p-4">
                    <div className="flex items-end gap-2">
                      <label htmlFor="assistant-message" className="sr-only">Message à l’assistant</label>
                      <textarea
                        ref={inputRef}
                        id="assistant-message"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={2}
                        maxLength={4000}
                        disabled={isSending || Boolean(pendingAction) || configurationState === 'missing'}
                        placeholder={pendingAction ? 'Confirmez ou annulez l’action en attente' : 'Posez une question ou demandez une action'}
                        className="ga-input min-h-12 flex-1 resize-none px-4 py-3 text-sm disabled:bg-gray-50"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || isSending || Boolean(pendingAction) || configurationState === 'missing'}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-gray-300"
                        title="Envoyer"
                      >
                        <PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />
                        <span className="sr-only">Envoyer</span>
                      </button>
                    </div>
                    <p className="mt-2 text-center text-[11px] text-gray-500">
                      Les actions sont vérifiées et doivent être confirmées.
                    </p>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
