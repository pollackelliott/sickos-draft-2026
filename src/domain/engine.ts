import { DomainError } from './errors.js';
import { generateSnakeSlots, orderedOwners } from './snake.js';
import { findPlayerByNormalizedNameSchool } from './writeIns.js';
import type {
  DraftSlot,
  DraftState,
  Owner,
  Player,
  PlayerId,
  SubmitPickAheadCommand,
  SubmitPickCommand,
  SubmitWriteInPickCommand,
} from './types.js';

function cloneState(state: DraftState): DraftState {
  return {
    ...state,
    owners: state.owners.map((owner) => ({ ...owner })),
    players: state.players.map((player) => ({ ...player })),
    config: { ...state.config },
    slots: state.slots.map((slot) => ({ ...slot })),
  };
}

function assertPositiveDuration(clockDurationMs: number): void {
  if (!Number.isFinite(clockDurationMs) || clockDurationMs <= 0) {
    throw new DomainError('INVALID_CONFIGURATION', 'Clock duration must be greater than zero.');
  }
}

function validatePlayers(players: Player[]): void {
  const ids = new Set<PlayerId>();
  for (const player of players) {
    if (!player.id.trim() || !player.name.trim() || !player.school.trim() || !player.conference.trim()) {
      throw new DomainError('INVALID_CONFIGURATION', 'Every player needs id, name, school, and conference.');
    }
    if (ids.has(player.id)) {
      throw new DomainError('INVALID_CONFIGURATION', `Duplicate player id: ${player.id}`);
    }
    ids.add(player.id);
  }
}

export function createDraftState(input: {
  owners: Owner[];
  players: Player[];
  rounds: number;
  clockDurationMs: number;
}): DraftState {
  assertPositiveDuration(input.clockDurationMs);
  const owners = orderedOwners(input.owners);
  validatePlayers(input.players);

  return {
    owners,
    players: input.players.map((player) => ({ ...player })),
    config: {
      rounds: input.rounds,
      clockDurationMs: input.clockDurationMs,
    },
    slots: generateSnakeSlots(owners, input.rounds),
    lifecycle: 'NOT_STARTED',
    paused: false,
    activeSlotId: null,
    activeDeadlineMs: null,
    pausedRemainingMs: null,
    startedAtMs: null,
    completedAtMs: null,
  };
}

export function getActiveSlot(state: DraftState): DraftSlot | undefined {
  return state.activeSlotId ? state.slots.find((slot) => slot.id === state.activeSlotId) : undefined;
}

export function getOldestOwedSlotForOwner(state: DraftState, ownerId: string): DraftSlot | undefined {
  return state.slots
    .filter((slot) => slot.ownerId === ownerId && slot.status === 'OWED')
    .sort((a, b) => a.overallPick - b.overallPick)[0];
}

export function getOwnerRosterPlayers(state: DraftState, ownerId: string): Player[] {
  const playerIds = state.slots
    .filter((slot) => slot.ownerId === ownerId && slot.status === 'COMPLETE' && slot.playerId)
    .map((slot) => slot.playerId as string);
  const wanted = new Set(playerIds);
  return state.players.filter((player) => wanted.has(player.id));
}

export interface PickAheadEligibility {
  eligible: boolean;
  reason: string;
  targetSlot: DraftSlot | null;
}

function ownerHasConference(state: DraftState, ownerId: string, conference: string): boolean {
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  return state.slots.some((slot) => {
    if (slot.ownerId !== ownerId || slot.status !== 'COMPLETE' || !slot.playerId) return false;
    return playersById.get(slot.playerId)?.conference === conference;
  });
}

export function getPickAheadTarget(state: DraftState, ownerId: string): DraftSlot | undefined {
  if (state.lifecycle !== 'IN_PROGRESS' || state.paused) return undefined;

  const hasImmediatePick = state.slots.some(
    (slot) => slot.ownerId === ownerId && (slot.status === 'ON_CLOCK' || slot.status === 'OWED'),
  );
  if (hasImmediatePick) return undefined;

  return state.slots
    .filter((slot) => slot.ownerId === ownerId && slot.status === 'FUTURE')
    .sort((a, b) => a.overallPick - b.overallPick)[0];
}

export function pickAheadEligibility(
  state: DraftState,
  player: Player,
  ownerId: string,
): PickAheadEligibility {
  if (state.lifecycle !== 'IN_PROGRESS') {
    return { eligible: false, reason: 'The draft is not active.', targetSlot: null };
  }
  if (state.paused) {
    return { eligible: false, reason: 'The draft is paused.', targetSlot: null };
  }
  if (!state.owners.some((owner) => owner.id === ownerId)) {
    return { eligible: false, reason: 'That owner does not exist.', targetSlot: null };
  }

  const immediate = state.slots.find(
    (slot) => slot.ownerId === ownerId && (slot.status === 'ON_CLOCK' || slot.status === 'OWED'),
  );
  if (immediate) {
    return { eligible: false, reason: 'Use your current or owed pick first.', targetSlot: null };
  }

  const targetSlot = getPickAheadTarget(state, ownerId);
  if (!targetSlot) {
    return { eligible: false, reason: 'There is no future slot available to pick ahead into.', targetSlot: null };
  }

  if (state.slots.some((slot) => slot.status === 'COMPLETE' && slot.playerId === player.id)) {
    return { eligible: false, reason: 'That player was already drafted.', targetSlot };
  }

  if (ownerHasConference(state, ownerId, player.conference)) {
    return { eligible: false, reason: `${player.conference} already used.`, targetSlot };
  }

  const blockingOwners = new Set(
    state.slots
      .filter((slot) => slot.status !== 'COMPLETE' && slot.overallPick < targetSlot.overallPick)
      .map((slot) => slot.ownerId),
  );

  for (const blockingOwnerId of blockingOwners) {
    if (!ownerHasConference(state, blockingOwnerId, player.conference)) {
      return {
        eligible: false,
        reason: `A manager who can pick before ${targetSlot.round}.${String(targetSlot.roundPick).padStart(2, '0')} can still draft from ${player.conference}.`,
        targetSlot,
      };
    }
  }

  return {
    eligible: true,
    reason: `Safe to pick ahead into ${targetSlot.round}.${String(targetSlot.roundPick).padStart(2, '0')}.`,
    targetSlot,
  };
}

function nextFutureSlot(state: DraftState): DraftSlot | undefined {
  return state.slots
    .filter((slot) => slot.status === 'FUTURE')
    .sort((a, b) => a.overallPick - b.overallPick)[0];
}

function hasOwedSlots(state: DraftState): boolean {
  return state.slots.some((slot) => slot.status === 'OWED');
}

function markCompleteIfFinished(state: DraftState, nowMs: number): void {
  const unfinished = state.slots.some((slot) => slot.status !== 'COMPLETE');
  if (!unfinished) {
    state.lifecycle = 'COMPLETE';
    state.activeSlotId = null;
    state.activeDeadlineMs = null;
    state.pausedRemainingMs = null;
    state.paused = false;
    state.completedAtMs = nowMs;
  }
}

function activateNextFuture(state: DraftState, clockStartMs: number): void {
  const next = nextFutureSlot(state);
  if (!next) {
    state.activeSlotId = null;
    state.activeDeadlineMs = null;
    return;
  }

  next.status = 'ON_CLOCK';
  state.activeSlotId = next.id;
  state.activeDeadlineMs = clockStartMs + state.config.clockDurationMs;
}

export function startDraft(state: DraftState, nowMs: number): DraftState {
  if (state.lifecycle !== 'NOT_STARTED') {
    throw new DomainError('DRAFT_ALREADY_STARTED', 'The draft has already started.');
  }

  const next = cloneState(state);
  next.lifecycle = 'IN_PROGRESS';
  next.startedAtMs = nowMs;
  activateNextFuture(next, nowMs);
  return next;
}

export function reconcileExpiredSlots(state: DraftState, nowMs: number): DraftState {
  const next = cloneState(state);

  if (next.lifecycle !== 'IN_PROGRESS' || next.paused) {
    return next;
  }

  while (next.activeSlotId && next.activeDeadlineMs !== null && next.activeDeadlineMs <= nowMs) {
    const expiredAtMs = next.activeDeadlineMs;
    const active = getActiveSlot(next);
    if (!active || active.status !== 'ON_CLOCK') {
      throw new DomainError('INVALID_CONFIGURATION', 'Draft state has an invalid active slot.');
    }

    active.status = 'OWED';
    next.activeSlotId = null;
    next.activeDeadlineMs = null;
    activateNextFuture(next, expiredAtMs);
  }

  if (!next.activeSlotId && !hasOwedSlots(next) && !nextFutureSlot(next)) {
    markCompleteIfFinished(next, nowMs);
  }

  return next;
}

function requireDraftCanAcceptPick(state: DraftState): void {
  if (state.lifecycle === 'NOT_STARTED') {
    throw new DomainError('DRAFT_NOT_STARTED', 'The draft has not started yet.');
  }
  if (state.lifecycle === 'COMPLETE') {
    throw new DomainError('DRAFT_COMPLETE', 'The draft is already complete.');
  }
  if (state.paused) {
    throw new DomainError('DRAFT_PAUSED', 'The draft is currently paused.');
  }
}

function requireEligiblePlayerForOwner(
  state: DraftState,
  ownerId: string,
  playerId: string,
  excludeSlotId?: string,
): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new DomainError('PLAYER_NOT_FOUND', 'That player does not exist in the player pool.');
  }

  const alreadyDrafted = state.slots.some(
    (slot) => slot.id !== excludeSlotId && slot.status === 'COMPLETE' && slot.playerId === playerId,
  );
  if (alreadyDrafted) {
    throw new DomainError('PLAYER_ALREADY_DRAFTED', 'That player was already drafted.');
  }

  const ownerConferenceAlreadyUsed = state.slots.some((slot) => {
    if (slot.id === excludeSlotId || slot.ownerId !== ownerId || slot.status !== 'COMPLETE' || !slot.playerId) {
      return false;
    }
    const rosteredPlayer = state.players.find((candidate) => candidate.id === slot.playerId);
    return rosteredPlayer?.conference === player.conference;
  });

  if (ownerConferenceAlreadyUsed) {
    throw new DomainError(
      'CONFERENCE_ALREADY_USED',
      `This owner already has a player from ${player.conference}.`,
    );
  }

  return player;
}

export function submitPickAhead(state: DraftState, command: SubmitPickAheadCommand): DraftState {
  const reconciled = reconcileExpiredSlots(state, command.nowMs);
  requireDraftCanAcceptPick(reconciled);

  if (!reconciled.owners.some((owner) => owner.id === command.ownerId)) {
    throw new DomainError('OWNER_NOT_FOUND', 'That owner does not exist.');
  }

  const player = reconciled.players.find((candidate) => candidate.id === command.playerId);
  if (!player) {
    throw new DomainError('PLAYER_NOT_FOUND', 'That player does not exist in the player pool.');
  }

  const eligibility = pickAheadEligibility(reconciled, player, command.ownerId);
  if (!eligibility.eligible || !eligibility.targetSlot) {
    throw new DomainError('PICK_AHEAD_NOT_AVAILABLE', eligibility.reason);
  }

  const next = cloneState(reconciled);
  const target = next.slots.find((slot) => slot.id === eligibility.targetSlot!.id)!;
  target.status = 'COMPLETE';
  target.playerId = command.playerId;
  target.selectedAtMs = command.nowMs;
  target.selectionKind = 'NORMAL';

  markCompleteIfFinished(next, command.nowMs);
  return next;
}

export function submitPick(state: DraftState, command: SubmitPickCommand): DraftState {
  const reconciled = reconcileExpiredSlots(state, command.nowMs);
  requireDraftCanAcceptPick(reconciled);

  if (!reconciled.owners.some((owner) => owner.id === command.ownerId)) {
    throw new DomainError('OWNER_NOT_FOUND', 'That owner does not exist.');
  }

  const slot = reconciled.slots.find((candidate) => candidate.id === command.slotId);
  if (!slot) {
    throw new DomainError('SLOT_NOT_FOUND', 'That draft slot does not exist.');
  }
  if (slot.ownerId !== command.ownerId) {
    throw new DomainError('NOT_YOUR_SLOT', 'That draft slot belongs to another owner.');
  }
  if (slot.status === 'COMPLETE') {
    throw new DomainError('SLOT_ALREADY_FILLED', 'That draft slot has already been filled.');
  }
  if (slot.status === 'FUTURE') {
    throw new DomainError('SLOT_NOT_AVAILABLE', 'That draft slot is not available yet.');
  }

  if (slot.status === 'OWED') {
    const oldestOwed = getOldestOwedSlotForOwner(reconciled, command.ownerId);
    if (!oldestOwed || oldestOwed.id !== slot.id) {
      throw new DomainError('OLDEST_OWED_FIRST', 'The oldest owed pick must be filled first.');
    }
  } else if (slot.status === 'ON_CLOCK' && reconciled.activeSlotId !== slot.id) {
    throw new DomainError('SLOT_NOT_AVAILABLE', 'That draft slot is not currently on the clock.');
  }

  requireEligiblePlayerForOwner(reconciled, command.ownerId, command.playerId);

  const next = cloneState(reconciled);
  const target = next.slots.find((candidate) => candidate.id === command.slotId)!;
  const wasActive = target.status === 'ON_CLOCK';
  target.status = 'COMPLETE';
  target.playerId = command.playerId;
  target.selectedAtMs = command.nowMs;
  target.selectionKind = wasActive ? 'NORMAL' : 'BACKFILL';

  if (wasActive) {
    next.activeSlotId = null;
    next.activeDeadlineMs = null;
    activateNextFuture(next, command.nowMs);
  }

  markCompleteIfFinished(next, command.nowMs);
  return next;
}

export function submitWriteInPick(state: DraftState, command: SubmitWriteInPickCommand): DraftState {
  const { player } = command;
  if (!player.id.trim() || !player.name.trim() || !player.school.trim() || !player.conference.trim()) {
    throw new DomainError('INVALID_CONFIGURATION', 'A write-in needs id, name, school, and conference.');
  }
  if (state.players.some((candidate) => candidate.id === player.id)) {
    throw new DomainError('PLAYER_ID_ALREADY_EXISTS', 'That write-in player id already exists.');
  }
  if (findPlayerByNormalizedNameSchool(state.players, player.name, player.school)) {
    throw new DomainError(
      'WRITE_IN_DUPLICATE',
      'That player already exists in the player pool. Select the existing player instead.',
    );
  }

  const withWriteIn = cloneState(state);
  withWriteIn.players.push({ ...player, source: 'WRITE_IN' });
  return submitPick(withWriteIn, {
    ownerId: command.ownerId,
    slotId: command.slotId,
    playerId: player.id,
    nowMs: command.nowMs,
  });
}

export function pauseDraft(state: DraftState, nowMs: number): DraftState {
  const reconciled = reconcileExpiredSlots(state, nowMs);
  if (reconciled.lifecycle === 'NOT_STARTED') {
    throw new DomainError('DRAFT_NOT_STARTED', 'The draft has not started yet.');
  }
  if (reconciled.lifecycle === 'COMPLETE') {
    throw new DomainError('DRAFT_COMPLETE', 'The draft is already complete.');
  }
  if (reconciled.paused) {
    return reconciled;
  }

  const next = cloneState(reconciled);
  next.paused = true;
  next.pausedRemainingMs =
    next.activeDeadlineMs === null ? null : Math.max(0, next.activeDeadlineMs - nowMs);
  next.activeDeadlineMs = null;
  return next;
}

export function resumeDraft(state: DraftState, nowMs: number): DraftState {
  if (!state.paused) {
    throw new DomainError('DRAFT_NOT_PAUSED', 'The draft is not paused.');
  }
  if (state.lifecycle !== 'IN_PROGRESS') {
    throw new DomainError('DRAFT_COMPLETE', 'The draft is not active.');
  }

  const next = cloneState(state);
  next.paused = false;
  if (next.activeSlotId && next.pausedRemainingMs !== null) {
    next.activeDeadlineMs = nowMs + next.pausedRemainingMs;
  }
  next.pausedRemainingMs = null;
  return next;
}

export function setClockDuration(state: DraftState, clockDurationMs: number): DraftState {
  assertPositiveDuration(clockDurationMs);
  const next = cloneState(state);
  next.config.clockDurationMs = clockDurationMs;
  return next;
}

export function skipActiveSlot(
  state: DraftState,
  input: { slotId: string; nowMs: number },
): DraftState {
  const reconciled = reconcileExpiredSlots(state, input.nowMs);
  requireDraftCanAcceptPick(reconciled);
  if (!reconciled.activeSlotId || reconciled.activeSlotId !== input.slotId) {
    throw new DomainError('SLOT_NOT_AVAILABLE', 'The active draft slot changed. Refresh and try again.');
  }

  const next = cloneState(reconciled);
  const active = getActiveSlot(next);
  if (!active || active.status !== 'ON_CLOCK') {
    throw new DomainError('SLOT_NOT_AVAILABLE', 'There is no active draft slot to skip.');
  }

  active.status = 'OWED';
  next.activeSlotId = null;
  next.activeDeadlineMs = null;
  activateNextFuture(next, input.nowMs);
  return next;
}

export function replaceCompletedPick(
  state: DraftState,
  input: { slotId: string; playerId: string },
): DraftState {
  const slot = state.slots.find((candidate) => candidate.id === input.slotId);
  if (!slot) {
    throw new DomainError('SLOT_NOT_FOUND', 'That draft slot does not exist.');
  }
  if (slot.status !== 'COMPLETE') {
    throw new DomainError('SLOT_NOT_AVAILABLE', 'Only a completed pick can be corrected.');
  }

  const active = getActiveSlot(state);
  if (active && slot.overallPick > active.overallPick) {
    throw new DomainError(
      'SLOT_NOT_AVAILABLE',
      'Remove this pick-ahead selection before replacing it so eligibility can be rechecked.',
    );
  }

  requireEligiblePlayerForOwner(state, slot.ownerId, input.playerId, slot.id);
  const next = cloneState(state);
  const target = next.slots.find((candidate) => candidate.id === input.slotId)!;
  target.playerId = input.playerId;
  return next;
}

export function removeCompletedPick(state: DraftState, slotId: string): DraftState {
  const slot = state.slots.find((candidate) => candidate.id === slotId);
  if (!slot) {
    throw new DomainError('SLOT_NOT_FOUND', 'That draft slot does not exist.');
  }
  if (slot.status !== 'COMPLETE') {
    throw new DomainError('SLOT_NOT_AVAILABLE', 'Only a completed pick can be removed.');
  }

  const next = cloneState(state);
  const target = next.slots.find((candidate) => candidate.id === slotId)!;
  const active = getActiveSlot(state);
  target.status = active && target.overallPick > active.overallPick ? 'FUTURE' : 'OWED';
  target.playerId = null;
  target.selectedAtMs = null;
  target.selectionKind = null;

  if (next.lifecycle === 'COMPLETE') {
    next.lifecycle = 'IN_PROGRESS';
    next.completedAtMs = null;
    next.paused = false;
    next.pausedRemainingMs = null;
  }

  return next;
}

export function resetDraft(state: DraftState): DraftState {
  const importedPlayers = state.players.filter((player) => player.source === 'IMPORTED');
  return createDraftState({
    owners: state.owners,
    players: importedPlayers,
    rounds: state.config.rounds,
    clockDurationMs: state.config.clockDurationMs,
  });
}
