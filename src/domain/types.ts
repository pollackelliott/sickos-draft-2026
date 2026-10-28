export type OwnerId = string;
export type PlayerId = string;
export type SlotId = string;

export type PlayerSource = 'IMPORTED' | 'WRITE_IN';
export type DraftLifecycle = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
export type SlotStatus = 'FUTURE' | 'ON_CLOCK' | 'OWED' | 'COMPLETE';
export type SelectionKind = 'NORMAL' | 'BACKFILL';

export interface Owner {
  id: OwnerId;
  name: string;
  draftPosition: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  school: string;
  conference: string;
  source: PlayerSource;
}

export interface DraftConfig {
  rounds: number;
  clockDurationMs: number;
}

export interface DraftSlot {
  id: SlotId;
  round: number;
  roundPick: number;
  overallPick: number;
  ownerId: OwnerId;
  status: SlotStatus;
  playerId: PlayerId | null;
  selectedAtMs: number | null;
  selectionKind: SelectionKind | null;
}

export interface DraftState {
  owners: Owner[];
  players: Player[];
  config: DraftConfig;
  slots: DraftSlot[];
  lifecycle: DraftLifecycle;
  paused: boolean;
  activeSlotId: SlotId | null;
  activeDeadlineMs: number | null;
  pausedRemainingMs: number | null;
  startedAtMs: number | null;
  completedAtMs: number | null;
}

export interface SubmitPickCommand {
  ownerId: OwnerId;
  slotId: SlotId;
  playerId: PlayerId;
  nowMs: number;
}

export interface SubmitPickAheadCommand {
  ownerId: OwnerId;
  playerId: PlayerId;
  nowMs: number;
}

export interface SubmitWriteInPickCommand {
  ownerId: OwnerId;
  slotId: SlotId;
  nowMs: number;
  player: Omit<Player, 'source'>;
}
