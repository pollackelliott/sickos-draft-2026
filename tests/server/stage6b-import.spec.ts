import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Player } from '../../src/domain/index.js';
import {
  D1DraftStore,
  DraftService,
  handleApi,
  initializeDraft,
  parsePlayerUniverseCsv,
  planPlayerUniverseReconciliation,
  PlayerUniverseImportError,
  refreshPlayerUniverseFromCsv,
  type OwnerRecord,
} from '../../src/server/index.js';
import { SqliteD1 } from './sqlite-d1.js';

const HOUR = 60 * 60 * 1000;
const migrationSql = [
  readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0002_player_import_identity.sql', import.meta.url), 'utf8'),
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
  return { db, store: new D1DraftStore(db), service: new DraftService(new D1DraftStore(db)) };
}

function csv(rows: string[]): string {
  return [
    'internal_id,espn_id,name,school,conference,year,position,height,source_status',
    ...rows,
    '',
  ].join('\n');
}

describe('Stage 6B player-universe import', () => {
  it('parses the October ESPN export format with player_id as durable ESPN identity', () => {
    const parsed = parsePlayerUniverseCsv([
      'player_id,number,name,position,height,weight,class,hometown,School,Conference',
      '5176569,0,Vasean Allette,G,6-3,180 lbs,SR,Toronto ON,Long Island University,NEC',
      '',
    ].join('\n'));

    expect(parsed).toEqual([{
      id: 'espn:5176569',
      espnId: '5176569',
      name: 'Vasean Allette',
      school: 'Long Island University',
      conference: 'NEC',
      year: 'SR',
      position: 'G',
      height: '6-3',
      importStatus: null,
    }]);
  });

  it('parses quoted canonical CSV and rejects missing durable identity', () => {
    const parsed = parsePlayerUniverseCsv(csv([
      'espn:123,123,"Doe, John","North ""Metro""",ACC,Sr,G,"6\' 4""",TORVIK_ESPN_ID',
    ]));
    expect(parsed).toEqual([{
      id: 'espn:123',
      espnId: '123',
      name: 'Doe, John',
      school: 'North "Metro"',
      conference: 'ACC',
      year: 'Sr',
      position: 'G',
      height: '6\' 4"',
      importStatus: 'TORVIK_ESPN_ID',
    }]);

    expect(() => parsePlayerUniverseCsv(csv([
      ',,No Durable Id,Some School,ACC,,,,TORVIK_ONLY',
    ]))).toThrow(PlayerUniverseImportError);
  });

  it('replaces the undrafted imported pool while preserving durable IDs and metadata', async () => {
    const { db } = await setup();
    const summary = await refreshPlayerUniverseFromCsv(db, csv([
      'acc-1,100,Alex Carter,New Metro,ACC,Sr,G,"6\' 5""",TORVIK_ESPN_NAME',
      'new-1,200,New Player,New School,Big 12,Jr,F,"6\' 8""",TORVIK_ONLY',
    ]), { nowMs: 100 });

    expect(summary).toMatchObject({
      incomingRows: 2,
      appliedRows: 2,
      inserted: 1,
      updated: 1,
      removed: 3,
      finalPlayerCount: 2,
    });

    const alex = db.db.prepare(
      `SELECT id, espn_id, school, year, position, height, import_status
         FROM players WHERE id = 'acc-1'`,
    ).get() as Record<string, unknown>;
    expect(alex).toMatchObject({
      id: 'acc-1',
      espn_id: '100',
      school: 'New Metro',
      year: 'Sr',
      position: 'G',
      height: '6\' 5"',
      import_status: 'TORVIK_ESPN_NAME',
    });
    expect(db.db.prepare(`SELECT id FROM players WHERE id = 'b10-1'`).get()).toBeUndefined();
    db.close();
  });

  it('freezes referenced players, preserves write-ins, and refreshes only safe rows mid-draft', async () => {
    const { db, service } = await setup();
    await service.start(0);
    await service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 });
    await service.writeIn({
      ownerId: 'jordan',
      slotId: 'R1-P2',
      nowMs: 2,
      player: { id: 'write-1', name: 'Late Add', school: 'Fresh U', conference: 'Ivy' },
    });

    const summary = await refreshPlayerUniverseFromCsv(db, csv([
      'acc-1,100,Alex Carter,Transfer U,Big Ten,Sr,G,"6\' 5""",TORVIK_ESPN_NAME',
      'sec-1,300,Jamie Foster,Central Updated,SEC,Sr,F,"6\' 7""",TORVIK_ESPN_ID',
      'new-1,400,New Player,New School,Big 12,Jr,G,"6\' 3""",TORVIK_ONLY',
      'canon-late,500,Late Add,Fresh U,Ivy,Sr,G,"6\' 2""",TORVIK_ONLY',
    ]), { nowMs: 3, actorOwnerId: 'avery' });

    expect(summary).toMatchObject({
      referencedPlayersProtected: 1,
      referencedChangesIgnored: 1,
      writeInsPreserved: 1,
      writeInMatchesSkipped: 1,
      removed: 2,
      finalPlayerCount: 4,
    });

    const drafted = db.db.prepare(
      `SELECT school, conference FROM players WHERE id = 'acc-1'`,
    ).get() as { school: string; conference: string };
    expect(drafted).toEqual({ school: 'North Metro', conference: 'ACC' });

    const slot = db.db.prepare(
      `SELECT selected_conference FROM draft_slots WHERE id = 'R1-P1'`,
    ).get() as { selected_conference: string };
    expect(slot.selected_conference).toBe('ACC');

    expect((db.db.prepare(`SELECT school FROM players WHERE id = 'sec-1'`).get() as { school: string }).school)
      .toBe('Central Updated');
    expect(db.db.prepare(`SELECT id FROM players WHERE id = 'b10-1'`).get()).toBeUndefined();
    expect(db.db.prepare(`SELECT id FROM players WHERE id = 'write-1'`).get()).toBeTruthy();
    expect(db.db.prepare(`SELECT id FROM players WHERE id = 'canon-late'`).get()).toBeUndefined();
    db.close();
  });

  it('protects players referenced only by historical draft events', async () => {
    const { db, service } = await setup();
    await service.start(0);
    await service.pick({ ownerId: 'avery', slotId: 'R1-P1', playerId: 'acc-1', nowMs: 1 });
    await service.correctPick({ slotId: 'R1-P1', playerId: 'b10-1', nowMs: 2, actorOwnerId: 'avery' });

    const summary = await refreshPlayerUniverseFromCsv(db, csv([
      'new-1,400,New Player,New School,Big 12,Jr,G,"6\' 3""",TORVIK_ONLY',
    ]), { nowMs: 3, actorOwnerId: 'avery' });

    expect(summary.referencedPlayersProtected).toBe(2);
    expect(summary.referencedChangesIgnored).toBe(2);
    expect(db.db.prepare(`SELECT id FROM players WHERE id = 'acc-1'`).get()).toBeTruthy();
    expect(db.db.prepare(`SELECT id FROM players WHERE id = 'b10-1'`).get()).toBeTruthy();
    db.close();
  });

  it('rejects an ESPN identity remap before mutating the pool', async () => {
    const { db } = await setup();
    await refreshPlayerUniverseFromCsv(db, csv([
      'acc-1,111,Alex Carter,North Metro,ACC,Sr,G,"6\' 5""",TORVIK_ESPN_ID',
    ]), { nowMs: 1 });

    await expect(refreshPlayerUniverseFromCsv(db, csv([
      'different-id,111,Alex Carter,Other School,ACC,Sr,G,"6\' 5""",TORVIK_ESPN_ID',
    ]), { nowMs: 2 })).rejects.toMatchObject({ code: 'IDENTITY_CONFLICT' });

    expect(db.db.prepare(`SELECT id FROM players WHERE id = 'acc-1'`).get()).toBeTruthy();
    expect(db.db.prepare(`SELECT id FROM players WHERE id = 'different-id'`).get()).toBeUndefined();
    db.close();
  });


  it('plans safe and protected ESPN identity attachments without mutating players', async () => {
    const { db, service } = await setup();

    await service.start(0);
    await service.pick({
      ownerId: 'avery',
      slotId: 'R1-P1',
      playerId: 'acc-1',
      nowMs: 1,
    });

    const before = db.db.prepare(
      `SELECT id, espn_id, name, school, conference
         FROM players
        ORDER BY id`,
    ).all();

    const plan = await planPlayerUniverseReconciliation(db, [
      {
        id: 'espn:100',
        espnId: '100',
        name: 'Alex Carter',
        school: 'North Metro',
        conference: 'ACC',
        year: null,
        position: null,
        height: null,
        importStatus: null,
      },
      {
        id: 'espn:200',
        espnId: '200',
        name: 'Drew Evans',
        school: 'Lake State',
        conference: 'Big Ten',
        year: null,
        position: null,
        height: null,
        importStatus: null,
      },
    ]);

    expect(plan.counts.ATTACH_ESPN_ID_PROTECTED).toBe(1);
    expect(plan.counts.ATTACH_ESPN_ID).toBe(1);

    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'ATTACH_ESPN_ID_PROTECTED',
        storedId: 'acc-1',
        espnId: '100',
      }),
      expect.objectContaining({
        action: 'ATTACH_ESPN_ID',
        storedId: 'b10-1',
        espnId: '200',
      }),
    ]));

    const after = db.db.prepare(
      `SELECT id, espn_id, name, school, conference
         FROM players
        ORDER BY id`,
    ).all();

    expect(after).toEqual(before);
    db.close();
  });

  it('plans identity collisions for review instead of treating them as updates', async () => {
    const { db } = await setup();

    db.db.prepare(
      `UPDATE players SET espn_id = '999' WHERE id = 'b10-1'`,
    ).run();

    const plan = await planPlayerUniverseReconciliation(db, [
      {
        id: 'acc-1',
        espnId: '999',
        name: 'Alex Carter',
        school: 'North Metro',
        conference: 'ACC',
        year: null,
        position: null,
        height: null,
        importStatus: null,
      },
    ]);

    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'IDENTITY_CONFLICT_REVIEW',
        storedId: 'acc-1',
        espnId: '999',
      }),
    ]));

    db.close();
  });

  it('plans retired and protected omitted players for review without mutation', async () => {
    const { db, service } = await setup();

    await service.start(0);
    await service.pick({
      ownerId: 'avery',
      slotId: 'R1-P1',
      playerId: 'acc-1',
      nowMs: 1,
    });

    db.db.prepare(
      `UPDATE players SET selectable = 0 WHERE id = 'sec-1'`,
    ).run();

    const plan = await planPlayerUniverseReconciliation(db, [
      {
        id: 'sec-1',
        espnId: null,
        name: 'Jamie Foster',
        school: 'Central Tech',
        conference: 'SEC',
        year: null,
        position: null,
        height: null,
        importStatus: null,
      },
    ]);

    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'RETIRED_REVIEW',
        storedId: 'sec-1',
      }),
      expect.objectContaining({
        action: 'OMISSION_PROTECTED',
        storedId: 'acc-1',
      }),
    ]));

    expect(
      db.db.prepare(`SELECT selectable FROM players WHERE id = 'sec-1'`).get(),
    ).toEqual({ selectable: 0 });

    db.close();
  });

  it('requires commissioner identity for the reconciliation-plan API and does not mutate players', async () => {
    const { db } = await setup();

    const body = [
      'internal_id,espn_id,name,school,conference,year,position,height,source_status',
      'acc-1,111,Alex Carter,North Metro,ACC,Sr,G,6-5,TORVIK_ESPN_ID',
      '',
    ].join('\n');

    const denied = await handleApi(
      new Request('https://example.test/api/commissioner/player-universe/plan', {
        method: 'POST',
        headers: {
          'x-league-code': 'TIGER81',
          'content-type': 'text/csv',
        },
        body,
      }),
      { DB: db },
    );

    expect(denied?.status).toBe(403);

    const before = db.db.prepare(
      `SELECT id, espn_id, name, school, conference
         FROM players
        ORDER BY id`,
    ).all();

    const allowed = await handleApi(
      new Request('https://example.test/api/commissioner/player-universe/plan', {
        method: 'POST',
        headers: {
          'x-league-code': 'BLUE42',
          'content-type': 'text/csv',
        },
        body,
      }),
      { DB: db },
    );

    expect(allowed?.status).toBe(200);

    const payload = await allowed?.json() as {
      plan: {
        incomingRows: number;
        counts: Record<string, number>;
      };
    };

    expect(payload.plan.incomingRows).toBe(1);

    const after = db.db.prepare(
      `SELECT id, espn_id, name, school, conference
         FROM players
        ORDER BY id`,
    ).all();

    expect(after).toEqual(before);

    db.close();
  });

  it('requires commissioner identity for the refresh API', async () => {
    const { db } = await setup();
    const body = csv([
      'acc-1,111,Alex Carter,North Metro,ACC,Sr,G,"6\' 5""",TORVIK_ESPN_ID',
    ]);

    const denied = await handleApi(new Request('https://example.test/api/commissioner/player-universe', {
      method: 'POST',
      headers: { 'x-league-code': 'TIGER81', 'content-type': 'text/csv' },
      body,
    }), { DB: db });
    expect(denied?.status).toBe(403);

    const allowed = await handleApi(new Request('https://example.test/api/commissioner/player-universe', {
      method: 'POST',
      headers: { 'x-league-code': 'BLUE42', 'content-type': 'text/csv' },
      body,
    }), { DB: db });
    expect(allowed?.status).toBe(200);
    const payload = await allowed?.json() as { refresh: { finalPlayerCount: number } };
    expect(payload.refresh.finalPlayerCount).toBe(1);
    db.close();
  });
});
