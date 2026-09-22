export type AssistantMessageRole = 'user' | 'assistant';

export interface AssistantMessageInput {
  role: AssistantMessageRole;
  content: string;
}

export type AssistantChangedEntity = 'task' | 'resident' | null;

export interface AssistantPendingAction {
  id: string;
  title: string;
  description: string;
  destructive: boolean;
  expiresAt: string;
}

export interface AssistantApiResponse {
  message: string;
  pendingAction?: AssistantPendingAction;
  changedEntity?: AssistantChangedEntity;
}
