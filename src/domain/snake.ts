import { DomainError } from './errors.js';
import type { DraftSlot, Owner } from './types.js';

export function orderedOwners(owners: Owner[]): Owner[] {
  if (owners.length === 0) {
    throw new DomainError('INVALID_CONFIGURATION', 'At least one owner is required.');
  }

  const ids = new Set<string>();
  const positions = new Set<number>();

  for (const owner of owners) {
    if (!owner.id.trim() || !owner.name.trim()) {
      throw new DomainError('INVALID_CONFIGURATION', 'Every owner needs an id and name.');
    }
    if (!Number.isInteger(owner.draftPosition) || owner.draftPosition < 1) {
      throw new DomainError('INVALID_CONFIGURATION', 'Draft positions must be positive integers.');
    }
    if (ids.has(owner.id)) {
      throw new DomainError('INVALID_CONFIGURATION', `Duplicate owner id: ${owner.id}`);
    }
    if (positions.has(owner.draftPosition)) {
      throw new DomainError('INVALID_CONFIGURATION', `Duplicate draft position: ${owner.draftPosition}`);
    }
    ids.add(owner.id);
    positions.add(owner.draftPosition);
  }

  const sorted = [...owners].sort((a, b) => a.draftPosition - b.draftPosition);
  sorted.forEach((owner, index) => {
    if (owner.draftPosition !== index + 1) {
      throw new DomainError('INVALID_CONFIGURATION', 'Draft positions must be consecutive starting at 1.');
    }
  });

  return sorted;
}

export function generateSnakeSlots(owners: Owner[], rounds: number): DraftSlot[] {
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new DomainError('INVALID_CONFIGURATION', 'Rounds must be a positive integer.');
  }

  const sortedOwners = orderedOwners(owners);
  const slots: DraftSlot[] = [];
  let overallPick = 1;

  for (let round = 1; round <= rounds; round += 1) {
    const roundOwners = round % 2 === 1 ? sortedOwners : [...sortedOwners].reverse();

    roundOwners.forEach((owner, index) => {
      slots.push({
        id: `R${round}-P${index + 1}`,
        round,
        roundPick: index + 1,
        overallPick,
        ownerId: owner.id,
        status: 'FUTURE',
        playerId: null,
        selectedAtMs: null,
        selectionKind: null,
      });
      overallPick += 1;
    });
  }

  return slots;
}
