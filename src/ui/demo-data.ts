import {
  createDraftState,
  reconcileExpiredSlots,
  startDraft,
  submitPick,
  type DraftState,
  type Owner,
  type Player,
} from '../domain/index.js';

const HOUR = 60 * 60 * 1000;

export const demoOwners: Owner[] = [
  { id: 'avery', name: 'Avery', draftPosition: 1 },
  { id: 'jordan', name: 'Jordan', draftPosition: 2 },
  { id: 'casey', name: 'Casey', draftPosition: 3 },
  { id: 'morgan', name: 'Morgan', draftPosition: 4 },
];

export const demoPlayers: Player[] = [
  { id: 'acc-1', name: 'Alex Carter', school: 'North Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'acc-2', name: 'Sam Irving', school: 'South Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'acc-3', name: 'Noah Price', school: 'Piedmont State', conference: 'ACC', source: 'IMPORTED' },
  { id: 'b10-1', name: 'Drew Evans', school: 'Lake State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'b10-2', name: 'Cameron Jones', school: 'River State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'b10-3', name: 'Miles Turner', school: 'Prairie Tech', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'sec-1', name: 'Jamie Foster', school: 'Central Tech', conference: 'SEC', source: 'IMPORTED' },
  { id: 'sec-2', name: 'Theo Bryant', school: 'Magnolia State', conference: 'SEC', source: 'IMPORTED' },
  { id: 'sec-3', name: 'Eli Parker', school: 'Gulf University', conference: 'SEC', source: 'IMPORTED' },
  { id: 'be-1', name: 'Taylor Green', school: 'Coastal College', conference: 'Big East', source: 'IMPORTED' },
  { id: 'be-2', name: 'Max Cole', school: 'Metro University', conference: 'Big East', source: 'IMPORTED' },
  { id: 'be-3', name: 'Owen Hayes', school: 'St. Vincent', conference: 'Big East', source: 'IMPORTED' },
  { id: 'b12-1', name: 'Riley Hayes', school: 'Western University', conference: 'Big 12', source: 'IMPORTED' },
  { id: 'b12-2', name: 'Luke Warren', school: 'Plains State', conference: 'Big 12', source: 'IMPORTED' },
  { id: 'b12-3', name: 'Ben Carter', school: 'Frontier Tech', conference: 'Big 12', source: 'IMPORTED' },
  { id: 'mvc-1', name: 'Devin Nelson', school: 'Prairie State', conference: 'Missouri Valley', source: 'IMPORTED' },
  { id: 'mvc-2', name: 'Cole Martin', school: 'Heartland', conference: 'Missouri Valley', source: 'IMPORTED' },
  { id: 'a10-1', name: 'Skyler Owens', school: 'Harbor University', conference: 'Atlantic 10', source: 'IMPORTED' },
  { id: 'a10-2', name: 'Grant Ellis', school: 'Capital College', conference: 'Atlantic 10', source: 'IMPORTED' },
  { id: 'wcc-1', name: 'Parker Reed', school: 'Pacific College', conference: 'WCC', source: 'IMPORTED' },
  { id: 'wcc-2', name: 'Nico Flores', school: 'Bay University', conference: 'WCC', source: 'IMPORTED' },
  { id: 'mwc-1', name: 'Quinn Stone', school: 'Desert State', conference: 'Mountain West', source: 'IMPORTED' },
  { id: 'mwc-2', name: 'Mason Lee', school: 'Summit University', conference: 'Mountain West', source: 'IMPORTED' },
  { id: 'aac-1', name: 'Reese Young', school: 'City University', conference: 'American', source: 'IMPORTED' },
  { id: 'aac-2', name: 'Leo Grant', school: 'Coast Tech', conference: 'American', source: 'IMPORTED' },
  { id: 'ivy-1', name: 'Henry Ross', school: 'Union College', conference: 'Ivy', source: 'IMPORTED' },
  { id: 'mac-1', name: 'Caleb Moore', school: 'Great Lakes', conference: 'MAC', source: 'IMPORTED' },
  { id: 'cusa-1', name: 'Isaac Bell', school: 'Southern Tech', conference: 'CUSA', source: 'IMPORTED' },
];

export function makeDemoDraft(nowMs = Date.now()): DraftState {
  let state = createDraftState({
    owners: demoOwners,
    players: demoPlayers,
    rounds: 6,
    clockDurationMs: 12 * HOUR,
  });

  state = startDraft(state, nowMs - 16 * HOUR);
  state = submitPick(state, {
    ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: nowMs - 15 * HOUR,
  });
  state = submitPick(state, {
    ownerId: 'jordan', slotId: 'R1-P2', playerId: 'b10-1', nowMs: nowMs - 14 * HOUR,
  });
  state = submitPick(state, {
    ownerId: 'casey', slotId: 'R1-P3', playerId: 'sec-1', nowMs: nowMs - 13 * HOUR,
  });

  return reconcileExpiredSlots(state, nowMs);
}
