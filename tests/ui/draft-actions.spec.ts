import { describe, expect, it } from 'vitest';
import { createDraftState, reconcileExpiredSlots, startDraft, submitPick, type Player } from '../../src/domain/index.js';
import { defaultPickTarget, ownerPickTargets, playerDraftability } from '../../src/ui/draft-actions.js';

const HOUR = 60 * 60 * 1000;
const owners = [
  { id: 'avery', name: 'Avery', draftPosition: 1 },
  { id: 'jordan', name: 'Jordan', draftPosition: 2 },
];
const players: Player[] = [
  { id: 'acc-1', name: 'Alex Carter', school: 'North Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'acc-2', name: 'Sam Irving', school: 'South Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'b10-1', name: 'Drew Evans', school: 'Lake State', conference: 'Big Ten', source: 'IMPORTED' },
];

function fresh() {
  return createDraftState({ owners, players, rounds: 3, clockDurationMs: 24 * HOUR });
}

describe('Stage 4 drafting UI rules', () => {
  it('defaults to the live slot when an owner is simultaneously on clock and owes a pick', () => {
    let state = reconcileExpiredSlots(startDraft(fresh(), 0), 4 * 24 * HOUR + 1);
    expect(state.slots.find((slot) => slot.id === 'R1-P1')?.status).toBe('OWED');
    expect(state.activeSlotId).toBe('R3-P1');
    expect(ownerPickTargets(state, 'avery').map((slot) => slot.id)).toEqual(['R3-P1', 'R1-P1']);
    expect(defaultPickTarget(state, 'avery')?.id).toBe('R3-P1');
  });

  it('offers only the oldest owed pick when multiple owed slots exist and owner is not on clock', () => {
    const state = reconcileExpiredSlots(startDraft(fresh(), 0), 5 * 24 * HOUR + 1);
    const targets = ownerPickTargets(state, 'avery');
    expect(targets.filter((slot) => slot.status === 'OWED').length).toBe(1);
    expect(targets.find((slot) => slot.status === 'OWED')?.id).toBe('R1-P1');
  });

  it('marks already drafted players and used conferences unavailable for that owner', () => {
    let state = startDraft(fresh(), 0);
    state = submitPick(state, { ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 });
    expect(playerDraftability(state, players[0], 'jordan').available).toBe(false);
    expect(playerDraftability(state, players[1], 'avery')).toEqual({ available: false, reason: 'ACC already used' });
    expect(playerDraftability(state, players[2], 'avery').available).toBe(true);
  });

  it('returns no drafting targets while paused', () => {
    const state = { ...startDraft(fresh(), 0), paused: true };
    expect(ownerPickTargets(state, 'avery')).toEqual([]);
  });
});
