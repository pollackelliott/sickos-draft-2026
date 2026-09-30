import {
  DomainError,
  pauseDraft,
  reconcileExpiredSlots,
  replaceCompletedPick,
  resetDraft,
  resumeDraft,
  setClockDuration,
  startDraft,
  submitPick,
  submitWriteInPick,
  type DraftState,
  type Player,
} from '../domain/index.js';
import { D1DraftStore, RevisionConflictError } from './d1-store.js';
import type { DraftMutationEvent, PersistedDraftSnapshot } from './store-types.js';

const MAX_CONFLICT_RETRIES = 3;

function sameMutableState(a: DraftState, b: DraftState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function addPlayerIfMissing(state: DraftState, player: Player): DraftState {
  if (state.players.some((candidate) => candidate.id === player.id)) return state;
  return { ...state, players: [...state.players, player] };
}

export class DraftService {
  constructor(private readonly store: D1DraftStore) {}

  private async persistWithRetry(
    nowMs: number,
    mutate: (snapshot: PersistedDraftSnapshot) => Promise<{
      state: DraftState;
      event: DraftMutationEvent;
      insertedPlayers?: Player[];
      deleteWriteIns?: boolean;
    }>,
  ): Promise<PersistedDraftSnapshot> {
    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt += 1) {
      const snapshot = await this.store.loadSnapshot();
      const reconciled = reconcileExpiredSlots(snapshot.state, nowMs);
      const baseSnapshot = { ...snapshot, state: reconciled };
      const result = await mutate(baseSnapshot);

      const expiredChanged = !sameMutableState(snapshot.state, reconciled);
      const requestedChanged = !sameMutableState(reconciled, result.state);
      if (!expiredChanged && !requestedChanged && !(result.insertedPlayers?.length) && !result.deleteWriteIns) {
        return snapshot;
      }

      try {
        const revision = await this.store.persistMutation({
          expectedRevision: snapshot.revision,
          before: snapshot.state,
          after: result.state,
          event: result.event,
          insertedPlayers: result.insertedPlayers,
          deleteWriteIns: result.deleteWriteIns,
        });
        return { draftId: snapshot.draftId, revision, state: result.state };
      } catch (error) {
        if (!(error instanceof RevisionConflictError) || attempt === MAX_CONFLICT_RETRIES - 1) throw error;
      }
    }
    throw new Error('Unreachable mutation retry state.');
  }

  async getCurrent(nowMs: number): Promise<PersistedDraftSnapshot> {
    const snapshot = await this.store.loadSnapshot();
    const reconciled = reconcileExpiredSlots(snapshot.state, nowMs);
    if (sameMutableState(snapshot.state, reconciled)) return snapshot;

    return this.persistWithRetry(nowMs, async (fresh) => ({
      state: reconcileExpiredSlots(fresh.state, nowMs),
      event: { type: 'CLOCK_RECONCILED', createdAtMs: nowMs },
    }));
  }

  private async reconcileBeforeMutation(nowMs: number): Promise<void> {
    await this.getCurrent(nowMs);
  }

  async start(nowMs: number): Promise<PersistedDraftSnapshot> {
    await this.reconcileBeforeMutation(nowMs);
    return this.persistWithRetry(nowMs, async (snapshot) => ({
      state: startDraft(snapshot.state, nowMs),
      event: { type: 'DRAFT_STARTED', createdAtMs: nowMs },
    }));
  }

  async pick(input: { ownerId: string; slotId: string; playerId: string; nowMs: number }): Promise<PersistedDraftSnapshot> {
    await this.reconcileBeforeMutation(input.nowMs);
    const player = await this.store.getPlayer(input.playerId);
    if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'That player does not exist in the player pool.');

    return this.persistWithRetry(input.nowMs, async (snapshot) => {
      const hydrated = addPlayerIfMissing(snapshot.state, player);
      return {
        state: submitPick(hydrated, input),
        event: {
          type: 'PICK_SUBMITTED', actorOwnerId: input.ownerId, slotId: input.slotId,
          playerId: input.playerId, createdAtMs: input.nowMs,
        },
      };
    });
  }

  async writeIn(input: {
    ownerId: string;
    slotId: string;
    nowMs: number;
    player: Omit<Player, 'source'>;
  }): Promise<PersistedDraftSnapshot> {
    await this.reconcileBeforeMutation(input.nowMs);
    const duplicate = await this.store.findPlayerByNameSchool(input.player.name, input.player.school);
    if (duplicate) {
      throw new DomainError('WRITE_IN_DUPLICATE', 'That player already exists in the player pool. Select the existing player instead.');
    }
    const player: Player = { ...input.player, source: 'WRITE_IN' };

    try {
      return await this.persistWithRetry(input.nowMs, async (snapshot) => ({
        state: submitWriteInPick(snapshot.state, input),
        insertedPlayers: [player],
        event: {
          type: 'WRITE_IN_PICK_SUBMITTED', actorOwnerId: input.ownerId, slotId: input.slotId,
          playerId: input.player.id, createdAtMs: input.nowMs,
        },
      }));
    } catch (error) {
      const duplicateAfterConflict = await this.store.findPlayerByNameSchool(input.player.name, input.player.school);
      if (duplicateAfterConflict) {
        throw new DomainError('WRITE_IN_DUPLICATE', 'That player already exists in the player pool. Select the existing player instead.');
      }
      throw error;
    }
  }

  async pause(nowMs: number): Promise<PersistedDraftSnapshot> {
    await this.reconcileBeforeMutation(nowMs);
    return this.persistWithRetry(nowMs, async (snapshot) => ({
      state: pauseDraft(snapshot.state, nowMs),
      event: { type: 'DRAFT_PAUSED', createdAtMs: nowMs },
    }));
  }

  async resume(nowMs: number): Promise<PersistedDraftSnapshot> {
    await this.reconcileBeforeMutation(nowMs);
    return this.persistWithRetry(nowMs, async (snapshot) => ({
      state: resumeDraft(snapshot.state, nowMs),
      event: { type: 'DRAFT_RESUMED', createdAtMs: nowMs },
    }));
  }

  async changeClock(clockDurationMs: number, nowMs: number): Promise<PersistedDraftSnapshot> {
    await this.reconcileBeforeMutation(nowMs);
    return this.persistWithRetry(nowMs, async (snapshot) => ({
      state: setClockDuration(snapshot.state, clockDurationMs),
      event: { type: 'CLOCK_DURATION_CHANGED', createdAtMs: nowMs, details: { clockDurationMs } },
    }));
  }

  async correctPick(input: { slotId: string; playerId: string; nowMs: number }): Promise<PersistedDraftSnapshot> {
    await this.reconcileBeforeMutation(input.nowMs);
    const player = await this.store.getPlayer(input.playerId);
    if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'That player does not exist in the player pool.');

    return this.persistWithRetry(input.nowMs, async (snapshot) => ({
      state: replaceCompletedPick(addPlayerIfMissing(snapshot.state, player), {
        slotId: input.slotId,
        playerId: input.playerId,
      }),
      event: { type: 'PICK_CORRECTED', slotId: input.slotId, playerId: input.playerId, createdAtMs: input.nowMs },
    }));
  }

  async reset(nowMs: number): Promise<PersistedDraftSnapshot> {
    await this.reconcileBeforeMutation(nowMs);
    return this.persistWithRetry(nowMs, async (snapshot) => ({
      state: resetDraft(snapshot.state),
      deleteWriteIns: true,
      event: { type: 'DRAFT_RESET', createdAtMs: nowMs },
    }));
  }
}
