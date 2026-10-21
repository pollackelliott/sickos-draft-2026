import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Player } from '../../src/domain/index.js';
import {
  D1DraftStore,
  DraftService,
  handleApi,
  initializeDraft,
  type OwnerRecord,
} from '../../src/server/index.js';
import { SqliteD1 } from './sqlite-d1.js';

const HOUR = 60 * 60 * 1000;
const migrationSql = [
  readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0003_player_sort_name.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0004_player_selectable.sql', import.meta.url), 'utf8'),
].join('\n');

const owners: OwnerRecord[] = [
  { id: 'avery', name: 'Avery', draftPosition: 1, code: 'BLUE42', isCommissioner: true },
  { id: 'jordan', name: 'Jordan', draftPosition: 2, code: 'TIGER81', isCommissioner: false },
];

const players: Player[] = [
  { id: 'acc-1', name: 'Alex Carter', school: 'North Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'b10-1', name: 'Drew Evans', school: 'Lake State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'sec-1', name: 'Jamie Foster', school: 'Central Tech', conference: 'SEC', source: 'IMPORTED' },
  { id: 'be-1', name: 'Taylor Green', school: 'Coastal College', conference: 'Big East', source: 'IMPORTED' },
];

async function setup() {
  const db = new SqliteD1(migrationSql);
  await initializeDraft(db, { owners, players, rounds: 2, clockDurationMs: 24 * HOUR });
  const store = new D1DraftStore(db);
  return { db, store, service: new DraftService(store) };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://example.test${path}`, init);
}

function commissionerRequest(path: string, body?: Record<string, unknown>, method = 'POST') {
  return request(path, {
    method,
    headers: {
      'x-league-code': 'BLUE42',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Stage 5 commissioner API', () => {
  it('requires commissioner identity for commissioner routes', async () => {
    const { db } = await setup();

    const missing = await handleApi(request('/api/commissioner/start', { method: 'POST' }), { DB: db });
    const owner = await handleApi(request('/api/commissioner/start', {
      method: 'POST',
      headers: { 'x-league-code': 'TIGER81' },
    }), { DB: db });

    expect(missing?.status).toBe(401);
    expect(owner?.status).toBe(403);
    db.close();
  });

  it('starts, pauses, resumes, and changes only the future clock duration', async () => {
    const { db, store } = await setup();

    const started = await handleApi(commissionerRequest('/api/commissioner/start'), { DB: db });
    expect(started?.status).toBe(200);
    const afterStart = await store.loadSnapshot();
    const originalDeadline = afterStart.state.activeDeadlineMs;
    expect(afterStart.state.activeSlotId).toBe('R1-P1');

    const changed = await handleApi(commissionerRequest('/api/commissioner/clock', { clockDurationMs: 12 * HOUR }), { DB: db });
    expect(changed?.status).toBe(200);
    const afterClock = await store.loadSnapshot();
    expect(afterClock.state.config.clockDurationMs).toBe(12 * HOUR);
    expect(afterClock.state.activeDeadlineMs).toBe(originalDeadline);

    const paused = await handleApi(commissionerRequest('/api/commissioner/pause'), { DB: db });
    expect(paused?.status).toBe(200);
    expect((await store.loadSnapshot()).state.paused).toBe(true);

    const resumed = await handleApi(commissionerRequest('/api/commissioner/resume'), { DB: db });
    expect(resumed?.status).toBe(200);
    expect((await store.loadSnapshot()).state.paused).toBe(false);
    db.close();
  });

  it('skips the active slot into owed status and can proxy-pick for the next owner', async () => {
    const { db, store } = await setup();
    await handleApi(commissionerRequest('/api/commissioner/start'), { DB: db });

    const skipped = await handleApi(
      commissionerRequest('/api/commissioner/skip', { slotId: 'R1-P1' }),
      { DB: db },
    );
    expect(skipped?.status).toBe(200);

    let snapshot = await store.loadSnapshot();
    expect(snapshot.state.slots.find((slot) => slot.id === 'R1-P1')?.status).toBe('OWED');
    expect(snapshot.state.activeSlotId).toBe('R1-P2');

    const proxy = await handleApi(
      commissionerRequest('/api/commissioner/proxy-pick', {
        ownerId: 'jordan',
        slotId: 'R1-P2',
        playerId: 'b10-1',
      }),
      { DB: db },
    );
    expect(proxy?.status).toBe(200);

    snapshot = await store.loadSnapshot();
    expect(snapshot.state.slots.find((slot) => slot.id === 'R1-P2')?.playerId).toBe('b10-1');
    expect(snapshot.state.slots.find((slot) => slot.id === 'R1-P1')?.status).toBe('OWED');
    db.close();
  });

  it('corrects or removes a completed pick without moving unrelated later state', async () => {
    const { db, store, service } = await setup();
    const startedAt = Date.now();
    await service.start(startedAt, 'avery');
    await service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: startedAt + 1, actorOwnerId: 'avery' });
    await service.pick({ ownerId: 'jordan', slotId: 'R1-P2', playerId: 'b10-1', nowMs: startedAt + 2, actorOwnerId: 'jordan' });

    const activeBefore = (await store.loadSnapshot()).state.activeSlotId;

    const corrected = await handleApi(
      commissionerRequest('/api/commissioner/correct-pick', { slotId: 'R1-P1', playerId: 'sec-1' }),
      { DB: db },
    );
    expect(corrected?.status).toBe(200);
    let snapshot = await store.loadSnapshot();
    expect(snapshot.state.slots.find((slot) => slot.id === 'R1-P1')?.playerId).toBe('sec-1');
    expect(snapshot.state.slots.find((slot) => slot.id === 'R1-P2')?.playerId).toBe('b10-1');
    expect(snapshot.state.activeSlotId).toBe(activeBefore);

    const removed = await handleApi(
      commissionerRequest('/api/commissioner/remove-pick', { slotId: 'R1-P1' }),
      { DB: db },
    );
    expect(removed?.status).toBe(200);
    snapshot = await store.loadSnapshot();
    const first = snapshot.state.slots.find((slot) => slot.id === 'R1-P1');
    expect(first?.status).toBe('OWED');
    expect(first?.playerId).toBeNull();
    expect(snapshot.state.slots.find((slot) => slot.id === 'R1-P2')?.playerId).toBe('b10-1');
    expect(snapshot.state.activeSlotId).toBe(activeBefore);
    db.close();
  });

  it('exports slot-ordered CSV and requires explicit reset confirmation', async () => {
    const { db, store, service } = await setup();
    const startedAt = Date.now();
    await service.start(startedAt, 'avery');
    await service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: startedAt + 1, actorOwnerId: 'avery' });
    await service.pick({ ownerId: 'jordan', slotId: 'R1-P2', playerId: 'b10-1', nowMs: startedAt + 2, actorOwnerId: 'jordan' });

    const exported = await handleApi(commissionerRequest('/api/commissioner/export', undefined, 'GET'), { DB: db });
    expect(exported?.status).toBe(200);
    expect(exported?.headers.get('content-type')).toContain('text/csv');
    const csv = await exported?.text();
    expect(csv).toContain('Overall Pick,Round,Player,User,Team,Conference');
    expect(csv).toContain('1,1,Alex Carter,Avery,North Metro,ACC');
    expect(csv).toContain('2,1,Drew Evans,Jordan,Lake State,Big Ten');

    const denied = await handleApi(
      commissionerRequest('/api/commissioner/reset', { confirmation: 'reset' }),
      { DB: db },
    );
    expect(denied?.status).toBe(400);

    const reset = await handleApi(
      commissionerRequest('/api/commissioner/reset', { confirmation: 'RESET' }),
      { DB: db },
    );
    expect(reset?.status).toBe(200);
    const snapshot = await store.loadSnapshot();
    expect(snapshot.state.lifecycle).toBe('NOT_STARTED');
    expect(snapshot.state.slots.every((slot) => slot.status === 'FUTURE' && slot.playerId === null)).toBe(true);
    db.close();
  });
});
