import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Player } from '../../src/domain/index.js';
import { D1DraftStore, initializeDraft, type OwnerRecord } from '../../src/server/index.js';
import { playerSortKey } from '../../src/server/player-sort.js';
import { SqliteD1 } from './sqlite-d1.js';

const migrationSql = [
  readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0003_player_sort_name.sql', import.meta.url), 'utf8'),
].join('\n');

const owners: OwnerRecord[] = [
  { id: 'avery', name: 'Avery', draftPosition: 1, code: 'BLUE42', isCommissioner: true },
];

const players: Player[] = [
  { id: 'p1', name: 'Aaron Zimmerman', school: 'Zeta', conference: 'ACC', source: 'IMPORTED' },
  { id: 'p2', name: 'Zoe Adams', school: 'Alpha', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'p3', name: 'Amy Brown', school: 'Beta', conference: 'SEC', source: 'IMPORTED' },
  { id: 'p4', name: 'Ben Carter Jr.', school: 'Gamma', conference: 'Big 12', source: 'IMPORTED' },
];

describe('player surname ordering', () => {
  it('derives a stable surname-first key', () => {
    expect(playerSortKey('Ben Carter Jr.')).toBe('carter ben jr.');
    expect(playerSortKey('A.J. Wright, Jr.')).toBe('wright a.j. jr.');
    expect(playerSortKey('Doe, John')).toBe('doe john');
  });

  it('returns player searches in global last-name order', async () => {
    const db = new SqliteD1(migrationSql);
    await initializeDraft(db, { owners, players, rounds: 1, clockDurationMs: 1_000 });
    const result = await new D1DraftStore(db).searchPlayers({ limit: 100 });
    expect(result.players.map((player) => player.name)).toEqual([
      'Zoe Adams',
      'Amy Brown',
      'Ben Carter Jr.',
      'Aaron Zimmerman',
    ]);
    db.close();
  });
});
