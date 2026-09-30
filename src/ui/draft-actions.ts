import type { DraftSlot, DraftState, Player } from '../domain/index.js';

export interface PlayerDraftability {
  available: boolean;
  reason: string;
}

export function ownerPickTargets(state: DraftState, ownerId: string): DraftSlot[] {
  if (state.lifecycle !== 'IN_PROGRESS' || state.paused) return [];

  const active = state.activeSlotId
    ? state.slots.find((slot) => slot.id === state.activeSlotId && slot.ownerId === ownerId && slot.status === 'ON_CLOCK')
    : undefined;

  const owed = state.slots
    .filter((slot) => slot.ownerId === ownerId && slot.status === 'OWED')
    .sort((a, b) => a.overallPick - b.overallPick)[0];

  return [active, owed].filter((slot): slot is DraftSlot => Boolean(slot));
}

export function defaultPickTarget(state: DraftState, ownerId: string): DraftSlot | undefined {
  const targets = ownerPickTargets(state, ownerId);
  return targets.find((slot) => slot.status === 'ON_CLOCK') ?? targets[0];
}

export function usedConferences(state: DraftState, ownerId: string): Set<string> {
  const draftedById = new Map(state.players.map((player) => [player.id, player]));
  const result = new Set<string>();
  for (const slot of state.slots) {
    if (slot.ownerId !== ownerId || slot.status !== 'COMPLETE' || !slot.playerId) continue;
    const player = draftedById.get(slot.playerId);
    if (player) result.add(player.conference);
  }
  return result;
}

export function playerDraftability(state: DraftState, player: Player, ownerId: string): PlayerDraftability {
  const draftedSlot = state.slots.find((slot) => slot.status === 'COMPLETE' && slot.playerId === player.id);
  if (draftedSlot) {
    const owner = state.owners.find((candidate) => candidate.id === draftedSlot.ownerId);
    return {
      available: false,
      reason: `Drafted by ${owner?.name ?? 'another owner'} · ${draftedSlot.round}.${String(draftedSlot.roundPick).padStart(2, '0')}`,
    };
  }

  if (usedConferences(state, ownerId).has(player.conference)) {
    return { available: false, reason: `${player.conference} already used` };
  }

  return { available: true, reason: 'Available' };
}
