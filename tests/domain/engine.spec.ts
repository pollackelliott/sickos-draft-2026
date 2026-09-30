import { describe, expect, it } from 'vitest';
import {
  DomainError,
  createDraftState,
  generateSnakeSlots,
  getActiveSlot,
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
  type Owner,
  type Player,
} from '../../src/domain/index.js';

const HOUR = 60 * 60 * 1000;
const owners: Owner[] = [
  { id: 'avery', name: 'Avery', draftPosition: 1 },
  { id: 'jordan', name: 'Jordan', draftPosition: 2 },
  { id: 'casey', name: 'Casey', draftPosition: 3 },
  { id: 'morgan', name: 'Morgan', draftPosition: 4 },
];

const players: Player[] = [
  { id: 'acc-1', name: 'Alex Carter', school: 'North Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'acc-2', name: 'Sam Irving', school: 'South Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'b10-1', name: 'Drew Evans', school: 'Lake State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'b10-2', name: 'Cameron Jones', school: 'River State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'sec-1', name: 'Jamie Foster', school: 'Central Tech', conference: 'SEC', source: 'IMPORTED' },
  { id: 'be-1', name: 'Taylor Green', school: 'Coastal College', conference: 'Big East', source: 'IMPORTED' },
  { id: 'b12-1', name: 'Riley Hayes', school: 'Western University', conference: 'Big 12', source: 'IMPORTED' },
  { id: 'mvc-1', name: 'Devin Nelson', school: 'Prairie State', conference: 'Missouri Valley', source: 'IMPORTED' },
  { id: 'a10-1', name: 'Skyler Owens', school: 'Harbor University', conference: 'Atlantic 10', source: 'IMPORTED' },
  { id: 'wcc-1', name: 'Parker Reed', school: 'Pacific College', conference: 'WCC', source: 'IMPORTED' },
  { id: 'mwc-1', name: 'Quinn Stone', school: 'Desert State', conference: 'Mountain West', source: 'IMPORTED' },
  { id: 'aac-1', name: 'Reese Young', school: 'City University', conference: 'American', source: 'IMPORTED' },
];

function fresh(rounds = 3, clockDurationMs = 24 * HOUR): DraftState {
  return createDraftState({ owners, players, rounds, clockDurationMs });
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof DomainError ? error.code : undefined;
  }
}

describe('snake generation', () => {
  it('alternates owner order each round and preserves overall picks', () => {
    const slots = generateSnakeSlots(owners, 3);
    expect(slots.map((slot) => slot.ownerId)).toEqual([
      'avery', 'jordan', 'casey', 'morgan',
      'morgan', 'casey', 'jordan', 'avery',
      'avery', 'jordan', 'casey', 'morgan',
    ]);
    expect(slots.map((slot) => slot.overallPick)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('normal drafting', () => {
  it('starts with the first owner on the clock and gives a full clock', () => {
    const state = startDraft(fresh(), 1_000);
    expect(getActiveSlot(state)?.ownerId).toBe('avery');
    expect(state.activeDeadlineMs).toBe(1_000 + 24 * HOUR);
  });

  it('only allows the owner assigned to the active slot to fill it', () => {
    const state = startDraft(fresh(), 0);
    expect(errorCode(() => submitPick(state, {
      ownerId: 'jordan', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1,
    }))).toBe('NOT_YOUR_SLOT');
  });

  it('immediately advances after a valid pick and starts a fresh clock from submission time', () => {
    let state = startDraft(fresh(), 0);
    state = submitPick(state, { ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 2 * HOUR });
    expect(getActiveSlot(state)?.ownerId).toBe('jordan');
    expect(state.activeDeadlineMs).toBe(26 * HOUR);
  });

  it('prevents a player from being drafted twice', () => {
    let state = startDraft(fresh(), 0);
    state = submitPick(state, { ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 });
    expect(errorCode(() => submitPick(state, {
      ownerId: 'jordan', slotId: 'R1-P2', playerId: 'acc-1', nowMs: 2,
    }))).toBe('PLAYER_ALREADY_DRAFTED');
  });

  it('prevents an owner from rostering two players from the same conference', () => {
    let state = startDraft(fresh(2), 0);
    state = submitPick(state, { ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 });
    state = submitPick(state, { ownerId: 'jordan', slotId: 'R1-P2', playerId: 'b10-1', nowMs: 2 });
    state = submitPick(state, { ownerId: 'casey', slotId: 'R1-P3', playerId: 'sec-1', nowMs: 3 });
    state = submitPick(state, { ownerId: 'morgan', slotId: 'R1-P4', playerId: 'be-1', nowMs: 4 });
    state = submitPick(state, { ownerId: 'morgan', slotId: 'R2-P1', playerId: 'b12-1', nowMs: 5 });
    state = submitPick(state, { ownerId: 'casey', slotId: 'R2-P2', playerId: 'mvc-1', nowMs: 6 });
    state = submitPick(state, { ownerId: 'jordan', slotId: 'R2-P3', playerId: 'a10-1', nowMs: 7 });
    expect(errorCode(() => submitPick(state, {
      ownerId: 'avery', slotId: 'R2-P4', playerId: 'acc-2', nowMs: 8,
    }))).toBe('CONFERENCE_ALREADY_USED');
  });
});

describe('expiration and backfills', () => {
  it('turns an expired slot into OWED and advances from the exact expiration time', () => {
    const started = startDraft(fresh(), 0);
    const state = reconcileExpiredSlots(started, 25 * HOUR);
    expect(state.slots.find((slot) => slot.id === 'R1-P1')?.status).toBe('OWED');
    expect(getActiveSlot(state)?.ownerId).toBe('jordan');
    expect(state.activeDeadlineMs).toBe(48 * HOUR);
  });

  it('catches up deterministically through multiple expirations after a long idle period', () => {
    const started = startDraft(fresh(), 0);
    const state = reconcileExpiredSlots(started, 73 * HOUR);
    expect(state.slots.slice(0, 3).map((slot) => slot.status)).toEqual(['OWED', 'OWED', 'OWED']);
    expect(getActiveSlot(state)?.ownerId).toBe('morgan');
    expect(state.activeDeadlineMs).toBe(96 * HOUR);
  });

  it('allows an owner to make a current normal pick even while that owner owes an older pick', () => {
    let state = reconcileExpiredSlots(startDraft(fresh(3), 0), 8 * 24 * HOUR + 1);
    // Avery owes 1.01 but is now on the clock again at the start of Round 3.
    expect(state.slots.find((slot) => slot.id === 'R1-P1')?.status).toBe('OWED');
    expect(getActiveSlot(state)?.ownerId).toBe('avery');
    state = submitPick(state, { ownerId: 'avery', slotId: 'R3-P1', playerId: 'b10-1', nowMs: 8 * 24 * HOUR + 2 });
    expect(state.slots.find((slot) => slot.id === 'R3-P1')?.status).toBe('COMPLETE');
    expect(state.slots.find((slot) => slot.id === 'R1-P1')?.status).toBe('OWED');
  });

  it('allows an owed pick to be backfilled without changing the active clock', () => {
    let state = reconcileExpiredSlots(startDraft(fresh(), 0), 25 * HOUR);
    const deadline = state.activeDeadlineMs;
    state = submitPick(state, { ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 26 * HOUR });
    expect(state.slots.find((slot) => slot.id === 'R1-P1')?.selectionKind).toBe('BACKFILL');
    expect(getActiveSlot(state)?.ownerId).toBe('jordan');
    expect(state.activeDeadlineMs).toBe(deadline);
  });

  it('requires multiple owed picks for one owner to be backfilled oldest-first', () => {
    let state = reconcileExpiredSlots(startDraft(fresh(3), 0), 9 * 24 * HOUR + 1);
    const averyOwed = state.slots.filter((slot) => slot.ownerId === 'avery' && slot.status === 'OWED');
    expect(averyOwed.length).toBeGreaterThanOrEqual(2);
    const later = averyOwed.sort((a, b) => a.overallPick - b.overallPick)[1];
    expect(errorCode(() => submitPick(state, {
      ownerId: 'avery', slotId: later.id, playerId: 'acc-1', nowMs: 9 * 24 * HOUR + 2,
    }))).toBe('OLDEST_OWED_FIRST');
  });

  it('applies the current roster conference rule when backfilling an older slot', () => {
    let state = reconcileExpiredSlots(startDraft(fresh(2), 0), 25 * HOUR);
    state = submitPick(state, { ownerId: 'jordan', slotId: 'R1-P2', playerId: 'b10-1', nowMs: 26 * HOUR });
    state = submitPick(state, { ownerId: 'casey', slotId: 'R1-P3', playerId: 'sec-1', nowMs: 27 * HOUR });
    state = submitPick(state, { ownerId: 'morgan', slotId: 'R1-P4', playerId: 'be-1', nowMs: 28 * HOUR });
    state = submitPick(state, { ownerId: 'morgan', slotId: 'R2-P1', playerId: 'b12-1', nowMs: 29 * HOUR });
    state = submitPick(state, { ownerId: 'casey', slotId: 'R2-P2', playerId: 'mvc-1', nowMs: 30 * HOUR });
    state = submitPick(state, { ownerId: 'jordan', slotId: 'R2-P3', playerId: 'a10-1', nowMs: 31 * HOUR });
    state = submitPick(state, { ownerId: 'avery', slotId: 'R2-P4', playerId: 'acc-1', nowMs: 32 * HOUR });
    expect(errorCode(() => submitPick(state, {
      ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-2', nowMs: 33 * HOUR,
    }))).toBe('CONFERENCE_ALREADY_USED');
  });
});

describe('clock controls', () => {
  it('freezes remaining time while paused and restores that amount on resume', () => {
    let state = startDraft(fresh(), 0);
    state = pauseDraft(state, 5 * HOUR);
    expect(state.pausedRemainingMs).toBe(19 * HOUR);
    expect(state.activeDeadlineMs).toBeNull();
    state = resumeDraft(state, 20 * HOUR);
    expect(state.activeDeadlineMs).toBe(39 * HOUR);
  });

  it('does not change the current deadline when future clock duration changes', () => {
    let state = startDraft(fresh(), 0);
    state = setClockDuration(state, 12 * HOUR);
    expect(state.activeDeadlineMs).toBe(24 * HOUR);
    state = submitPick(state, { ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 2 * HOUR });
    expect(state.activeDeadlineMs).toBe(14 * HOUR);
  });

  it('does not accept picks while the draft is paused', () => {
    const state = pauseDraft(startDraft(fresh(), 0), HOUR);
    expect(errorCode(() => submitPick(state, {
      ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 2 * HOUR,
    }))).toBe('DRAFT_PAUSED');
  });
});

describe('write-ins and corrections', () => {
  it('rejects a write-in that matches an existing Name + School after normalization', () => {
    const state = startDraft(fresh(), 0);
    expect(errorCode(() => submitWriteInPick(state, {
      ownerId: 'avery',
      slotId: 'R1-P1',
      nowMs: 1,
      player: { id: 'write-1', name: '  ALEX   CARTER ', school: 'north metro', conference: 'ACC' },
    }))).toBe('WRITE_IN_DUPLICATE');
  });

  it('accepts a genuinely missing write-in and marks it as a write-in player', () => {
    const state = submitWriteInPick(startDraft(fresh(), 0), {
      ownerId: 'avery',
      slotId: 'R1-P1',
      nowMs: 1,
      player: { id: 'write-1', name: 'New Player', school: 'New School', conference: 'Ivy' },
    });
    expect(state.players.find((player) => player.id === 'write-1')?.source).toBe('WRITE_IN');
    expect(state.slots[0].playerId).toBe('write-1');
  });

  it('replaces a completed pick without changing later completed selections or the active clock', () => {
    let state = startDraft(fresh(), 0);
    state = submitPick(state, { ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 });
    state = submitPick(state, { ownerId: 'jordan', slotId: 'R1-P2', playerId: 'b10-1', nowMs: 2 });
    const deadline = state.activeDeadlineMs;
    const corrected = replaceCompletedPick(state, { slotId: 'R1-P1', playerId: 'sec-1' });
    expect(corrected.slots.find((slot) => slot.id === 'R1-P1')?.playerId).toBe('sec-1');
    expect(corrected.slots.find((slot) => slot.id === 'R1-P2')?.playerId).toBe('b10-1');
    expect(corrected.activeDeadlineMs).toBe(deadline);
  });
});

describe('completion and reset', () => {
  it('does not complete after the normal sequence ends if an owed pick remains', () => {
    let state = reconcileExpiredSlots(startDraft(fresh(1), 0), 25 * HOUR);
    state = submitPick(state, { ownerId: 'jordan', slotId: 'R1-P2', playerId: 'b10-1', nowMs: 26 * HOUR });
    state = submitPick(state, { ownerId: 'casey', slotId: 'R1-P3', playerId: 'sec-1', nowMs: 27 * HOUR });
    state = submitPick(state, { ownerId: 'morgan', slotId: 'R1-P4', playerId: 'be-1', nowMs: 28 * HOUR });
    expect(state.activeSlotId).toBeNull();
    expect(state.lifecycle).toBe('IN_PROGRESS');
    expect(state.slots.find((slot) => slot.id === 'R1-P1')?.status).toBe('OWED');
    state = submitPick(state, { ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 29 * HOUR });
    expect(state.lifecycle).toBe('COMPLETE');
  });

  it('reset restores an unstarted clean draft and removes write-in players', () => {
    let state = submitWriteInPick(startDraft(fresh(1), 0), {
      ownerId: 'avery', slotId: 'R1-P1', nowMs: 1,
      player: { id: 'write-1', name: 'New Player', school: 'New School', conference: 'Ivy' },
    });
    state = resetDraft(state);
    expect(state.lifecycle).toBe('NOT_STARTED');
    expect(state.slots.every((slot) => slot.status === 'FUTURE' && slot.playerId === null)).toBe(true);
    expect(state.players.some((player) => player.source === 'WRITE_IN')).toBe(false);
  });
});
