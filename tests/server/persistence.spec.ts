import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DomainError, type Player } from '../../src/domain/index.js';
import { D1DraftStore, DraftService, handleReadApi, initializeDraft, type OwnerRecord } from '../../src/server/index.js';
import { SqliteD1 } from './sqlite-d1.js';

const HOUR = 60 * 60 * 1000;
const migrationSql = [
  readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0003_player_sort_name.sql', import.meta.url), 'utf8'),
].join('\n');

const owners: OwnerRecord[] = [
  { id: 'avery', name: 'Avery', draftPosition: 1, code: 'BLUE42', isCommissioner: true },
  { id: 'jordan', name: 'Jordan', draftPosition: 2, code: 'TIGER81', isCommissioner: false },
  { id: 'casey', name: 'Casey', draftPosition: 3, code: 'ORANGE7', isCommissioner: false },
  { id: 'morgan', name: 'Morgan', draftPosition: 4, code: 'ZONE24', isCommissioner: false },
];

const players: Player[] = [
  { id: 'acc-1', name: 'Alex Carter', school: 'North Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'acc-2', name: 'Sam Irving', school: 'South Metro', conference: 'ACC', source: 'IMPORTED' },
  { id: 'b10-1', name: 'Drew Evans', school: 'Lake State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'b10-2', name: 'Cameron Jones', school: 'River State', conference: 'Big Ten', source: 'IMPORTED' },
  { id: 'sec-1', name: 'Jamie Foster', school: 'Central Tech', conference: 'SEC', source: 'IMPORTED' },
  { id: 'be-1', name: 'Taylor Green', school: 'Coastal College', conference: 'Big East', source: 'IMPORTED' },
  { id: 'b12-1', name: 'Riley Hayes', school: 'Western University', conference: 'Big 12', source: 'IMPORTED' },
  { id: 'mvc-1', name: 'Devin Nelson', school: 'Prairie State', conference: 'Missouri Valley', source: 'IMPORTED' },
];

async function setup(rounds = 3) {
  const db = new SqliteD1(migrationSql);
  await initializeDraft(db, { owners, players, rounds, clockDurationMs: 24 * HOUR });
  const store = new D1DraftStore(db);
  const service = new DraftService(store);
  return { db, store, service };
}

function domainCode(error: unknown): string | undefined {
  return error instanceof DomainError ? error.code : undefined;
}

describe('D1 persistence', () => {
  it('initializes the draft, owners, players, and snake slots durably', async () => {
    const { db, store } = await setup(2);
    const snapshot = await store.loadSnapshot();
    expect(snapshot.revision).toBe(0);
    expect(snapshot.state.slots.length).toBe(8);
    expect(snapshot.state.slots.map((slot) => slot.ownerId)).toEqual([
      'avery', 'jordan', 'casey', 'morgan', 'morgan', 'casey', 'jordan', 'avery',
    ]);
    expect((await store.listOwners())[0].isCommissioner).toBe(true);
    db.close();
  });

  it('persists start and ordinary picks across fresh store/service instances', async () => {
    const { db, service } = await setup();
    await service.start(1_000);
    await service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 2_000 });

    const reloaded = await new D1DraftStore(db).loadSnapshot();
    expect(reloaded.revision).toBe(2);
    expect(reloaded.state.slots[0].playerId).toBe('acc-1');
    expect(reloaded.state.activeSlotId).toBe('R1-P2');
    expect(reloaded.state.activeDeadlineMs).toBe(2_000 + 24 * HOUR);
    db.close();
  });

  it('persists clock reconciliation after a no-traffic gap', async () => {
    const { db, service } = await setup();
    await service.start(0);
    const snapshot = await service.getCurrent(49 * HOUR);
    expect(snapshot.state.slots.slice(0, 2).map((slot) => slot.status)).toEqual(['OWED', 'OWED']);
    expect(snapshot.state.activeSlotId).toBe('R1-P3');
    expect(snapshot.state.activeDeadlineMs).toBe(72 * HOUR);

    const reloaded = await new D1DraftStore(db).loadSnapshot();
    expect(reloaded.state.slots.slice(0, 2).map((slot) => slot.status)).toEqual(['OWED', 'OWED']);
    db.close();
  });


  it('persists elapsed deadlines even when the attempted pick is invalid', async () => {
    const { db, service } = await setup();
    await service.start(0);
    let rejected = false;
    try {
      await service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'missing-player', nowMs: 25 * HOUR });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    const snapshot = await new D1DraftStore(db).loadSnapshot();
    expect(snapshot.state.slots[0].status).toBe('OWED');
    expect(snapshot.state.activeSlotId).toBe('R1-P2');
    db.close();
  });

  it('allows exactly one of two concurrent attempts to claim the same player', async () => {
    const { db, service } = await setup();
    await service.start(0);

    const results = await Promise.allSettled([
      service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 }),
      service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled').length).toBe(1);
    expect(results.filter((result) => result.status === 'rejected').length).toBe(1);
    const final = await new D1DraftStore(db).loadSnapshot();
    expect(final.state.slots.filter((slot) => slot.playerId === 'acc-1').length).toBe(1);
    db.close();
  });

  it('database constraints independently reject duplicate player ownership', async () => {
    const { db, service } = await setup(2);
    await service.start(0);
    await service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 });

    let failed = false;
    try {
      await db.batch([
        db.prepare(
          `UPDATE draft_slots SET status = 'COMPLETE', player_id = ?, selected_conference = ?, selected_at_ms = 2
            WHERE id = ?`,
        ).bind('acc-1', 'ACC', 'R1-P2'),
      ]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    db.close();
  });

  it('database constraints independently reject two conferences for one owner', async () => {
    const { db } = await setup(2);
    let failed = false;
    try {
      await db.batch([
        db.prepare(
          `UPDATE draft_slots SET status = 'COMPLETE', player_id = ?, selected_conference = ?, selected_at_ms = 1
            WHERE id = ?`,
        ).bind('acc-1', 'ACC', 'R1-P1'),
        db.prepare(
          `UPDATE draft_slots SET status = 'COMPLETE', player_id = ?, selected_conference = ?, selected_at_ms = 2
            WHERE id = ?`,
        ).bind('acc-2', 'ACC', 'R2-P4'),
      ]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    const count = db.db.prepare("SELECT COUNT(*) AS count FROM draft_slots WHERE player_id IS NOT NULL").get() as { count: number };
    expect(count.count).toBe(0);
    db.close();
  });

  it('persists write-ins and rejects a normalized duplicate', async () => {
    const { db, service } = await setup();
    await service.start(0);
    await service.writeIn({
      ownerId: 'avery', slotId: 'R1-P1', nowMs: 1,
      player: { id: 'write-1', name: 'New Player', school: 'New School', conference: 'Ivy' },
    });
    const stored = db.db.prepare("SELECT source FROM players WHERE id = 'write-1'").get() as { source: string };
    expect(stored.source).toBe('WRITE_IN');

    let duplicateCode: string | undefined;
    try {
      await service.writeIn({
        ownerId: 'jordan', slotId: 'R1-P2', nowMs: 2,
        player: { id: 'write-2', name: '  ALEX CARTER ', school: 'north metro', conference: 'ACC' },
      });
    } catch (error) {
      duplicateCode = domainCode(error);
    }
    expect(duplicateCode).toBe('WRITE_IN_DUPLICATE');
    db.close();
  });

  it('reset clears picks and deletes write-in player records without deleting event history', async () => {
    const { db, service } = await setup(1);
    await service.start(0);
    await service.writeIn({
      ownerId: 'avery', slotId: 'R1-P1', nowMs: 1,
      player: { id: 'write-1', name: 'New Player', school: 'New School', conference: 'Ivy' },
    });
    await service.reset(2);

    const snapshot = await new D1DraftStore(db).loadSnapshot();
    expect(snapshot.state.lifecycle).toBe('NOT_STARTED');
    expect(snapshot.state.slots.every((slot) => slot.status === 'FUTURE' && slot.playerId === null)).toBe(true);
    const writeInCount = db.db.prepare("SELECT COUNT(*) AS count FROM players WHERE source = 'WRITE_IN'").get() as { count: number };
    expect(writeInCount.count).toBe(0);
    const eventCount = db.db.prepare('SELECT COUNT(*) AS count FROM draft_events').get() as { count: number };
    expect(eventCount.count).toBeGreaterThanOrEqual(3);
    db.close();
  });

  it('searches the persisted player pool without loading all players into draft state', async () => {
    const { db, store } = await setup();
    const result = await store.searchPlayers({ search: 'carter' });
    expect(result.total).toBe(1);
    expect(result.players[0].id).toBe('acc-1');
    const snapshot = await store.loadSnapshot();
    expect(snapshot.state.players.length).toBe(0);
    db.close();
  });
});


describe('read API', () => {
  it('serves health, durable draft state, and player search without exposing owner codes', async () => {
    const { db, service } = await setup();
    const now = Date.now();
    await service.start(now);

    const health = await handleReadApi(new Request('https://example.test/api/health'), { DB: db });
    expect(health?.status).toBe(200);
    expect((await health?.json() as { ok: boolean }).ok).toBe(true);

    const draft = await handleReadApi(new Request('https://example.test/api/draft'), { DB: db });
    const draftBody = await draft?.json() as { owners: Array<Record<string, unknown>>; activeSlotId: string };
    expect(draftBody.activeSlotId).toBe('R1-P1');
    expect('code' in draftBody.owners[0]).toBe(false);

    const playerResponse = await handleReadApi(
      new Request('https://example.test/api/players?search=carter&limit=not-a-number'),
      { DB: db },
    );
    const playerBody = await playerResponse?.json() as { total: number; players: Player[] };
    expect(playerBody.total).toBe(1);
    expect(playerBody.players[0].id).toBe('acc-1');
    db.close();
  });
});
