import type { Player } from './types.js';

export function normalizeIdentityPart(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function findPlayerByNormalizedNameSchool(
  players: Player[],
  name: string,
  school: string,
): Player | undefined {
  const normalizedName = normalizeIdentityPart(name);
  const normalizedSchool = normalizeIdentityPart(school);

  return players.find(
    (player) =>
      normalizeIdentityPart(player.name) === normalizedName &&
      normalizeIdentityPart(player.school) === normalizedSchool,
  );
}
