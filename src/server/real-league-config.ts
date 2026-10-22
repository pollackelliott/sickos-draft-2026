import type { OwnerRecord } from './store-types.js';

export const REAL_LEAGUE_ROUNDS = 18;
export const REAL_LEAGUE_CLOCK_DURATION_MS = 24 * 60 * 60 * 1000;

export interface RealLeagueOwnerDefinition {
  id: string;
  name: string;
  draftPosition: number;
  isCommissioner: boolean;
}

export const REAL_LEAGUE_OWNERS: readonly RealLeagueOwnerDefinition[] = [
  { id: 'owner-chris-barbas', name: 'Chris Barbas', draftPosition: 1, isCommissioner: false },
  { id: 'owner-connor-home', name: 'Connor Hope', draftPosition: 2, isCommissioner: false },
  { id: 'owner-connor-kraus', name: 'Connor Kraus', draftPosition: 3, isCommissioner: false },
  { id: 'owner-dan-labosky', name: 'Dan Labosky', draftPosition: 4, isCommissioner: false },
  { id: 'owner-elliott-pollack', name: 'Elliott Pollack', draftPosition: 5, isCommissioner: true },
  { id: 'owner-garrett-pollack', name: 'Garrett Pollack', draftPosition: 6, isCommissioner: true },
  { id: 'owner-harrison-rogalski', name: 'Harrison Rogalski', draftPosition: 7, isCommissioner: false },
  { id: 'owner-ivetta-abramyan', name: 'Ivetta Abramyan', draftPosition: 8, isCommissioner: false },
  { id: 'owner-jake', name: 'Jake', draftPosition: 9, isCommissioner: false },
  { id: 'owner-jason-jonesi', name: 'Jason Jonesi', draftPosition: 10, isCommissioner: false },
  { id: 'owner-jordan-kuehne', name: 'Jordan Kuehne', draftPosition: 11, isCommissioner: false },
  { id: 'owner-nathan-levy', name: 'Nathan Levy', draftPosition: 12, isCommissioner: false },
  { id: 'owner-todd-saltzberg', name: 'Todd Saltzberg', draftPosition: 13, isCommissioner: false },
  { id: 'owner-werner-gunn', name: 'Werner Gunn', draftPosition: 14, isCommissioner: false },
] as const;

export type RealLeagueOwnerCodeMap = Record<string, string>;

export function buildRealLeagueOwners(codes: RealLeagueOwnerCodeMap): OwnerRecord[] {
  const normalized = new Set<string>();

  return REAL_LEAGUE_OWNERS.map((owner) => {
    const code = codes[owner.id]?.trim().toUpperCase();
    if (!code) {
      throw new Error(`Missing league code for ${owner.name}.`);
    }
    if (normalized.has(code)) {
      throw new Error(`Duplicate league code: ${code}.`);
    }
    normalized.add(code);

    return {
      ...owner,
      code,
    };
  });
}
