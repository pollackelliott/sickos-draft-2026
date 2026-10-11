import type { DraftSlot, DraftState, Owner, Player } from '../domain/index.js';

export interface BoardCell {
  owner: Owner;
  slot: DraftSlot;
  player?: Player;
}

export interface BoardRound {
  round: number;
  cells: BoardCell[];
}

export interface PlayerRowModel {
  player: Player;
  available: boolean;
  statusText: string;
  draftedBy?: string;
  slotLabel?: string;
}

export type PlayerSort = 'name' | 'school' | 'conference';

function ownerMap(state: DraftState): Map<string, Owner> {
  return new Map(state.owners.map((owner) => [owner.id, owner]));
}

function playerMap(players: Player[]): Map<string, Player> {
  return new Map(players.map((player) => [player.id, player]));
}

export function formatSlot(slot: DraftSlot): string {
  return `${slot.round}.${String(slot.roundPick).padStart(2, '0')}`;
}

export function buildBoard(state: DraftState, allPlayers: Player[]): BoardRound[] {
  const playersById = playerMap(allPlayers);
  const owners = [...state.owners].sort((a, b) => a.draftPosition - b.draftPosition);
  const rounds: BoardRound[] = [];

  for (let round = 1; round <= state.config.rounds; round += 1) {
    const roundSlots = state.slots.filter((slot) => slot.round === round);
    rounds.push({
      round,
      cells: owners.map((owner) => {
        const slot = roundSlots.find((candidate) => candidate.ownerId === owner.id);
        if (!slot) throw new Error(`Missing slot for round ${round}, owner ${owner.id}`);
        return {
          owner,
          slot,
          player: slot.playerId ? playersById.get(slot.playerId) : undefined,
        };
      }),
    });
  }

  return rounds;
}


export function roundPicks(state: DraftState, allPlayers: Player[], round: number): BoardCell[] {
  const owners = ownerMap(state);
  const players = playerMap(allPlayers);
  return state.slots
    .filter((slot) => slot.round === round)
    .sort((a, b) => a.roundPick - b.roundPick)
    .map((slot) => {
      const owner = owners.get(slot.ownerId);
      if (!owner) throw new Error(`Missing owner ${slot.ownerId} for round ${round}`);
      return {
        owner,
        slot,
        player: slot.playerId ? players.get(slot.playerId) : undefined,
      };
    });
}

export function nextScheduledSlots(state: DraftState, count = 3): DraftSlot[] {
  const active = state.activeSlotId
    ? state.slots.find((slot) => slot.id === state.activeSlotId)
    : undefined;
  if (!active) return [];

  return state.slots
    .filter((slot) => slot.status === 'FUTURE' && slot.overallPick > active.overallPick)
    .sort((a, b) => a.overallPick - b.overallPick)
    .slice(0, count);
}

export function owedSlots(state: DraftState): DraftSlot[] {
  return state.slots
    .filter((slot) => slot.status === 'OWED')
    .sort((a, b) => a.overallPick - b.overallPick);
}

export function recentPicks(state: DraftState, allPlayers: Player[], count = 5) {
  const owners = ownerMap(state);
  const players = playerMap(allPlayers);
  return state.slots
    .filter((slot) => slot.status === 'COMPLETE' && slot.playerId && slot.selectedAtMs !== null)
    .sort((a, b) => (b.selectedAtMs ?? 0) - (a.selectedAtMs ?? 0))
    .slice(0, count)
    .map((slot) => ({
      slot,
      owner: owners.get(slot.ownerId),
      player: players.get(slot.playerId as string),
    }));
}

export function playerRows(
  state: DraftState,
  allPlayers: Player[],
  filters: {
    search: string;
    conference: string;
    school: string;
    availableOnly: boolean;
    sort: PlayerSort;
  },
): PlayerRowModel[] {
  const owners = ownerMap(state);
  const drafted = new Map<string, DraftSlot>();
  for (const slot of state.slots) {
    if (slot.status === 'COMPLETE' && slot.playerId) drafted.set(slot.playerId, slot);
  }

  const search = filters.search.trim().toLocaleLowerCase('en-US');
  return allPlayers
    .map((player) => {
      const slot = drafted.get(player.id);
      const owner = slot ? owners.get(slot.ownerId) : undefined;
      return {
        player,
        available: !slot,
        statusText: slot && owner ? `Drafted by ${owner.name} · ${formatSlot(slot)}` : 'Available',
        draftedBy: owner?.name,
        slotLabel: slot ? formatSlot(slot) : undefined,
      } satisfies PlayerRowModel;
    })
    .filter((row) => !filters.availableOnly || row.available)
    .filter((row) => !filters.conference || row.player.conference === filters.conference)
    .filter((row) => !filters.school || row.player.school === filters.school)
    .filter((row) => {
      if (!search) return true;
      return `${row.player.name} ${row.player.school} ${row.player.conference}`
        .toLocaleLowerCase('en-US')
        .includes(search);
    })
    .sort((a, b) => {
      const left = a.player[filters.sort];
      const right = b.player[filters.sort];
      return left.localeCompare(right, 'en-US', { sensitivity: 'base' });
    });
}

export function rosterForOwner(state: DraftState, allPlayers: Player[], ownerId: string) {
  const players = playerMap(allPlayers);
  return state.slots
    .filter((slot) => slot.ownerId === ownerId && slot.status === 'COMPLETE' && slot.playerId)
    .sort((a, b) => a.overallPick - b.overallPick)
    .map((slot) => ({ slot, player: players.get(slot.playerId as string) }))
    .filter((item): item is { slot: DraftSlot; player: Player } => Boolean(item.player));
}

export function conferenceChecklist(state: DraftState, allPlayers: Player[], ownerId: string) {
  const filled = new Set(rosterForOwner(state, allPlayers, ownerId).map((item) => item.player.conference));
  return [...new Set(allPlayers.map((player) => player.conference))]
    .sort((a, b) => a.localeCompare(b, 'en-US'))
    .map((conference) => ({ conference, filled: filled.has(conference) }));
}

export function formatCountdown(deadlineMs: number | null, nowMs: number): string {
  if (deadlineMs === null) return 'No active clock';
  const remaining = Math.max(0, deadlineMs - nowMs);
  const totalMinutes = Math.floor(remaining / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h ${minutes}m remaining`;
}

export function formatDeadline(deadlineMs: number | null): string {
  if (deadlineMs === null) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(deadlineMs));
}
