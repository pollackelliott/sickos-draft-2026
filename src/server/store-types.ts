import type { DraftState, Owner, Player } from '../domain/index.js';

export const ACTIVE_DRAFT_ID = 'active';

export interface PersistedDraftSnapshot {
  draftId: string;
  revision: number;
  state: DraftState;
}

export interface OwnerRecord extends Owner {
  code: string;
  isCommissioner: boolean;
}

export interface PlayerSearchQuery {
  search?: string;
  conference?: string;
  school?: string;
  limit?: number;
  offset?: number;
}

export interface PlayerSearchResult {
  players: Player[];
  total: number;
}

export interface DraftMutationEvent {
  type: string;
  actorOwnerId?: string | null;
  slotId?: string | null;
  playerId?: string | null;
  createdAtMs: number;
  details?: Record<string, unknown> | null;
}

export interface PersistMutationOptions {
  expectedRevision: number;
  before: DraftState;
  after: DraftState;
  event: DraftMutationEvent;
  insertedPlayers?: Player[];
  deleteWriteIns?: boolean;
}
