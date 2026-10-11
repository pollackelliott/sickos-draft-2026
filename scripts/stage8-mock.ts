import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Player } from '../src/domain/index.js';
import {
  D1DraftStore,
  handleApi,
  initializeDraft,
  type OwnerRecord,
} from '../src/server/index.js';
import { SqliteD1 } from '../tests/server/sqlite-d1.js';

const HOUR = 60 * 60 * 1000;

const migrationSql = [
  readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../migrations/0002_player_import_identity.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../migrations/0003_player_sort_name.sql', import.meta.url), 'utf8'),
].join('\n');

const owners: OwnerRecord[] = [
  { id: 'avery', name: 'Avery', draftPosition: 1, code: 'MOCK11', isCommissioner: true },
  { id: 'jordan', name: 'Jordan', draftPosition: 2, code: 'MOCK22', isCommissioner: false },
  { id: 'casey', name: 'Casey', draftPosition: 3, code: 'MOCK33', isCommissioner: false },
  { id: 'morgan', name: 'Morgan', draftPosition: 4, code: 'MOCK44', isCommissioner: false },
];

const players: Player[] = [
  { id: 'acc-1', name: 'Alex Carter', school: 'North Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'acc-2', name: 'Noah Price', school: 'Piedmont State', conference: 'ACC', source: 'IMPORTED' },
  { id: 'b10-1', name: 'Drew Evans', school: 'Lake State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'sec-1', name: 'Jamie Foster', school: 'Central Tech', conference: 'SEC', source: 'IMPORTED' },
  { id: 'be-1', name: 'Taylor Green', school: 'Coastal College', conference: 'Big East', source: 'IMPORTED' },
  { id: 'be-2', name: 'Max Cole', school: 'Metro University', conference: 'Big East', source: 'IMPORTED' },
  { id: 'b12-1', name: 'Riley Hayes', school: 'Western University', conference: 'Big 12', source: 'IMPORTED' },
  { id: 'mwc-1', name: 'Quinn Stone', school: 'Desert State', conference: 'Mountain West', source: 'IMPORTED' },
];

interface ApiOptions {
  method?: string;
  code?: string;
  body?: Record<string, unknown>;
}

async function api(db: SqliteD1, path: string, options: ApiOptions = {}): Promise<Response> {
  const headers = new Headers();
  if (options.code) headers.set('x-league-code', options.code);
  if (options.body) headers.set('content-type', 'application/json');

  const response = await handleApi(new Request(`https://stage8.local${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }), { DB: db });

  if (!response) throw new Error(`No API response for ${path}`);
  return response;
}

async function post(
  db: SqliteD1,
  path: string,
  code: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  return api(db, path, { method: 'POST', code, body });
}

describe('Stage 8 lightweight mock draft', () => {
  it('runs an eight-pick draft through the important real API flows and resets cleanly', async () => {
    const db = new SqliteD1(migrationSql);
    await initializeDraft(db, {
      owners,
      players,
      rounds: 2,
      clockDurationMs: 24 * HOUR,
    });
    const store = new D1DraftStore(db);

    try {
      const started = await post(db, '/api/commissioner/start', 'MOCK11');
      expect(started.status).toBe(200);
      expect((await store.loadSnapshot()).state.activeSlotId).toBe('R1-P1');

      const averyFirst = await post(db, '/api/pick', 'MOCK11', {
        slotId: 'R1-P1',
        playerId: 'acc-1',
      });
      expect(averyFirst.status).toBe(200);
      expect((await store.loadSnapshot()).state.activeSlotId).toBe('R1-P2');

      const skipped = await post(db, '/api/commissioner/skip', 'MOCK11', {
        slotId: 'R1-P2',
      });
      expect(skipped.status).toBe(200);

      let snapshot = await store.loadSnapshot();
      expect(snapshot.state.slots.find((slot) => slot.id === 'R1-P2')?.status).toBe('OWED');
      expect(snapshot.state.activeSlotId).toBe('R1-P3');

      const jordanBackfill = await post(db, '/api/pick', 'MOCK22', {
        slotId: 'R1-P2',
        playerId: 'sec-1',
      });
      expect(jordanBackfill.status).toBe(200);
      snapshot = await store.loadSnapshot();
      expect(snapshot.state.slots.find((slot) => slot.id === 'R1-P2')?.status).toBe('COMPLETE');
      expect(snapshot.state.activeSlotId).toBe('R1-P3');

      const caseyFirst = await post(db, '/api/pick', 'MOCK33', {
        slotId: 'R1-P3',
        playerId: 'b10-1',
      });
      expect(caseyFirst.status).toBe(200);
      expect((await store.loadSnapshot()).state.activeSlotId).toBe('R1-P4');

      const paused = await post(db, '/api/commissioner/pause', 'MOCK11');
      expect(paused.status).toBe(200);
      snapshot = await store.loadSnapshot();
      expect(snapshot.state.paused).toBe(true);
      expect(snapshot.state.activeSlotId).toBe('R1-P4');
      expect(snapshot.state.pausedRemainingMs).not.toBeNull();

      const resumed = await post(db, '/api/commissioner/resume', 'MOCK11');
      expect(resumed.status).toBe(200);
      snapshot = await store.loadSnapshot();
      expect(snapshot.state.paused).toBe(false);
      expect(snapshot.state.activeSlotId).toBe('R1-P4');

      const morganFirst = await post(db, '/api/pick', 'MOCK44', {
        slotId: 'R1-P4',
        playerId: 'be-1',
      });
      expect(morganFirst.status).toBe(200);
      expect((await store.loadSnapshot()).state.activeSlotId).toBe('R2-P1');

      const conferenceConflict = await post(db, '/api/pick', 'MOCK44', {
        slotId: 'R2-P1',
        playerId: 'be-2',
      });
      expect(conferenceConflict.status).toBe(409);
      expect((await store.loadSnapshot()).state.activeSlotId).toBe('R2-P1');

      const morganSecond = await post(db, '/api/pick', 'MOCK44', {
        slotId: 'R2-P1',
        playerId: 'acc-2',
      });
      expect(morganSecond.status).toBe(200);
      expect((await store.loadSnapshot()).state.activeSlotId).toBe('R2-P2');

      const caseyWriteIn = await post(db, '/api/write-in', 'MOCK33', {
        slotId: 'R2-P2',
        name: 'Stage Eight Walk-On',
        school: 'Mock University',
        conference: 'Ivy',
      });
      expect(caseyWriteIn.status).toBe(200);
      expect((await store.loadSnapshot()).state.activeSlotId).toBe('R2-P3');

      const jordanSecond = await post(db, '/api/pick', 'MOCK22', {
        slotId: 'R2-P3',
        playerId: 'b12-1',
      });
      expect(jordanSecond.status).toBe(200);
      expect((await store.loadSnapshot()).state.activeSlotId).toBe('R2-P4');

      const averySecond = await post(db, '/api/pick', 'MOCK11', {
        slotId: 'R2-P4',
        playerId: 'mwc-1',
      });
      expect(averySecond.status).toBe(200);

      snapshot = await store.loadSnapshot();
      expect(snapshot.state.lifecycle).toBe('COMPLETE');
      expect(snapshot.state.activeSlotId).toBeNull();
      expect(snapshot.state.slots).toHaveLength(8);
      expect(snapshot.state.slots.every((slot) => slot.status === 'COMPLETE' && Boolean(slot.playerId))).toBe(true);

      const exported = await api(db, '/api/commissioner/export', {
        code: 'MOCK11',
      });
      expect(exported.status).toBe(200);
      const csv = await exported.text();
      const rows = csv.trim().split(/\r?\n/);
      expect(rows).toHaveLength(9);
      expect(rows[0]).toBe('Overall Pick,Round,Player,User,Team,Conference');
      expect(rows.slice(1).map((row) => Number(row.split(',')[0]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(csv).toContain('Stage Eight Walk-On');

      const reset = await post(db, '/api/commissioner/reset', 'MOCK11', {
        confirmation: 'RESET',
      });
      expect(reset.status).toBe(200);

      snapshot = await store.loadSnapshot();
      expect(snapshot.state.lifecycle).toBe('NOT_STARTED');
      expect(snapshot.state.activeSlotId).toBeNull();
      expect(snapshot.state.slots.every((slot) => slot.status === 'FUTURE' && slot.playerId === null)).toBe(true);

      const writeIns = db.db.prepare("SELECT COUNT(*) AS count FROM players WHERE source = 'WRITE_IN'").get() as { count: number };
      expect(writeIns.count).toBe(0);
    } finally {
      db.close();
    }
  });
});
