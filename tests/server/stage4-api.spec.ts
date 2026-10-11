import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Player } from '../../src/domain/index.js';
import { DraftService, D1DraftStore, handleApi, initializeDraft, type OwnerRecord } from '../../src/server/index.js';
import { SqliteD1 } from './sqlite-d1.js';

const HOUR = 60 * 60 * 1000;
const migrationSql = [
  readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0003_player_sort_name.sql', import.meta.url), 'utf8'),
].join('\n');
const owners: OwnerRecord[] = [
  { id: 'avery', name: 'Avery', draftPosition: 1, code: 'BLUE42', isCommissioner: true },
  { id: 'jordan', name: 'Jordan', draftPosition: 2, code: 'TIGER81', isCommissioner: false },
];
const players: Player[] = [
  { id: 'acc-1', name: 'Alex Carter', school: 'North Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'b10-1', name: 'Drew Evans', school: 'Lake State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'sec-1', name: 'Jamie Foster', school: 'Central Tech', conference: 'SEC', source: 'IMPORTED' },
];

async function setup() {
  const db = new SqliteD1(migrationSql);
  await initializeDraft(db, { owners, players, rounds: 2, clockDurationMs: 24 * HOUR });
  return { db, store: new D1DraftStore(db), service: new DraftService(new D1DraftStore(db)) };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://example.test${path}`, init);
}

describe('Stage 4 owner-code API', () => {
  it('identifies an owner case-insensitively without returning the code', async () => {
    const { db } = await setup();
    const response = await handleApi(request('/api/me', { headers: { 'x-league-code': ' blue42 ' } }), { DB: db });
    expect(response?.status).toBe(200);
    const body = await response?.json() as { owner: Record<string, unknown> };
    expect(body.owner.name).toBe('Avery');
    expect(body.owner.isCommissioner).toBe(true);
    expect('code' in body.owner).toBe(false);
    db.close();
  });

  it('rejects a missing or invalid code', async () => {
    const { db } = await setup();
    const missing = await handleApi(request('/api/me'), { DB: db });
    const invalid = await handleApi(request('/api/me', { headers: { 'x-league-code': 'NOPE' } }), { DB: db });
    expect(missing?.status).toBe(401);
    expect(invalid?.status).toBe(401);
    db.close();
  });

  it('uses the authenticated owner rather than accepting an owner id from the browser', async () => {
    const { db, service } = await setup();
    await service.start(Date.now());
    const response = await handleApi(request('/api/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-league-code': 'TIGER81' },
      body: JSON.stringify({ slotId: 'R1-P1', playerId: 'acc-1', ownerId: 'avery' }),
    }), { DB: db });
    expect(response?.status).toBe(409);
    const snapshot = await new D1DraftStore(db).loadSnapshot();
    expect(snapshot.state.slots[0].playerId).toBeNull();
    db.close();
  });

  it('allows the authenticated current owner to submit a normal pick', async () => {
    const { db, service } = await setup();
    await service.start(Date.now());
    const response = await handleApi(request('/api/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-league-code': 'BLUE42' },
      body: JSON.stringify({ slotId: 'R1-P1', playerId: 'acc-1' }),
    }), { DB: db });
    expect(response?.status).toBe(200);
    const body = await response?.json() as { draft: { activeSlotId: string; slots: Array<{ playerId: string | null }> } };
    expect(body.draft.slots[0].playerId).toBe('acc-1');
    expect(body.draft.activeSlotId).toBe('R1-P2');
    db.close();
  });

  it('allows a write-in but rejects a normalized duplicate of an imported player', async () => {
    const { db, service } = await setup();
    await service.start(Date.now());
    const duplicate = await handleApi(request('/api/write-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-league-code': 'BLUE42' },
      body: JSON.stringify({ slotId: 'R1-P1', name: ' alex  carter ', school: 'north metro', conference: 'ACC' }),
    }), { DB: db });
    expect(duplicate?.status).toBe(409);

    const valid = await handleApi(request('/api/write-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-league-code': 'BLUE42' },
      body: JSON.stringify({ slotId: 'R1-P1', name: 'New Player', school: 'New School', conference: 'Ivy' }),
    }), { DB: db });
    expect(valid?.status).toBe(200);
    const count = db.db.prepare("SELECT COUNT(*) AS count FROM players WHERE source = 'WRITE_IN'").get() as { count: number };
    expect(count.count).toBe(1);
    db.close();
  });


  it('prevents league codes that differ only by letter case', async () => {
    const { db } = await setup();
    let failed = false;
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO owners (id, name, draft_position, code, is_commissioner)
           VALUES (?, ?, ?, ?, 0)`,
        ).bind('copy', 'Copy', 3, 'blue42'),
      ]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    db.close();
  });

  it('turns simultaneous matching write-ins into one success and one duplicate response', async () => {
    const { db, service } = await setup();
    const startedAt = Date.now() - 25 * HOUR;
    await service.start(startedAt);
    await service.getCurrent(Date.now());

    const body = JSON.stringify({ name: 'Same New Player', school: 'Same New School', conference: 'Ivy' });
    const results = await Promise.all([
      handleApi(request('/api/write-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-league-code': 'BLUE42' },
        body: JSON.stringify({ ...JSON.parse(body), slotId: 'R1-P1' }),
      }), { DB: db }),
      handleApi(request('/api/write-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-league-code': 'TIGER81' },
        body: JSON.stringify({ ...JSON.parse(body), slotId: 'R1-P2' }),
      }), { DB: db }),
    ]);

    expect(results.map((response) => response?.status).sort()).toEqual([200, 409]);
    const count = db.db.prepare("SELECT COUNT(*) AS count FROM players WHERE normalized_name = 'same new player'").get() as { count: number };
    expect(count.count).toBe(1);
    db.close();
  });

  it('returns complete conference/school filter options', async () => {
    const { db } = await setup();
    const options = await handleApi(request('/api/player-options?conference=ACC'), { DB: db });
    const body = await options?.json() as { conferences: string[]; schools: string[] };
    expect(body.conferences).toEqual(['ACC', 'Big Ten', 'SEC']);
    expect(body.schools).toEqual(['North Metro']);
    db.close();
  });
});
