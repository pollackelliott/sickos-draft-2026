import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  D1DraftStore,
  DraftService,
  REAL_LEAGUE_CLOCK_DURATION_MS,
  REAL_LEAGUE_OWNERS,
  REAL_LEAGUE_ROUNDS,
  buildRealLeagueOwners,
  handleApi,
  initializeDraft,
  updatePreDraftOwners,
} from '../../src/server/index.js';
import { SqliteD1 } from './sqlite-d1.js';

const migrationSql = [
  readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0002_player_import_identity.sql', import.meta.url), 'utf8'),
].join('\n');

function codeMap(): Record<string, string> {
  return Object.fromEntries(
    REAL_LEAGUE_OWNERS.map((owner, index) => [owner.id, `CODE${String(index + 1).padStart(2, '0')}`]),
  );
}

async function setupRealLeague() {
  const db = new SqliteD1(migrationSql);
  const owners = buildRealLeagueOwners(codeMap());
  await initializeDraft(db, {
    owners,
    players: [],
    rounds: REAL_LEAGUE_ROUNDS,
    clockDurationMs: REAL_LEAGUE_CLOCK_DURATION_MS,
  });
  return { db, owners, store: new D1DraftStore(db), service: new DraftService(new D1DraftStore(db)) };
}

describe('Stage 6C real league setup', () => {
  it('defines the 14-manager provisional league with Elliott as commissioner', () => {
    expect(REAL_LEAGUE_OWNERS).toHaveLength(14);
    expect(REAL_LEAGUE_OWNERS.map((owner) => owner.name)).toEqual([
      'Chris Barbas',
      'Connor Hope',
      'Connor Kraus',
      'Dan Labosky',
      'Elliott Pollack',
      'Garrett Pollack',
      'Harrison Rogalski',
      'Ivetta Abramyan',
      'Jake',
      'Jason Jonesi',
      'Jordan Kuehne',
      'Nathan Levy',
      'Todd Saltzberg',
      'Werner Gunn',
    ]);
    expect(REAL_LEAGUE_OWNERS.filter((owner) => owner.isCommissioner).map((owner) => owner.name))
      .toEqual(['Elliott Pollack']);
    expect(REAL_LEAGUE_ROUNDS).toBe(18);
    expect(REAL_LEAGUE_CLOCK_DURATION_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('initializes a 252-slot provisional snake and keeps codes private from draft state', async () => {
    const { db, store } = await setupRealLeague();
    const snapshot = await store.loadSnapshot();
    expect(snapshot.state.lifecycle).toBe('NOT_STARTED');
    expect(snapshot.state.slots).toHaveLength(14 * 18);
    expect(snapshot.state.slots.slice(0, 14).map((slot) => slot.ownerId))
      .toEqual(REAL_LEAGUE_OWNERS.map((owner) => owner.id));
    expect(snapshot.state.slots.slice(14, 28).map((slot) => slot.ownerId))
      .toEqual([...REAL_LEAGUE_OWNERS].reverse().map((owner) => owner.id));
    expect(snapshot.state.owners.every((owner) => !('code' in owner))).toBe(true);
    db.close();
  });

  it('renames owners and regenerates the snake order before start without changing identity or codes', async () => {
    const { db, store } = await setupRealLeague();
    const before = await store.listOwners();
    const beforeCodes = new Map(before.map((owner) => [owner.id, owner.code]));

    const updated = REAL_LEAGUE_OWNERS.map((owner) => ({ ...owner }))
      .sort((a, b) => b.draftPosition - a.draftPosition)
      .map((owner, index) => ({
        id: owner.id,
        name: owner.id === 'owner-jake' ? 'Jake Example' : owner.name,
        draftPosition: index + 1,
      }));

    const result = await updatePreDraftOwners(db, updated, {
      nowMs: 100,
      actorOwnerId: 'owner-elliott-pollack',
    });
    expect(result).toEqual({ ownersUpdated: 14, slotsRegenerated: 252, revision: 1 });

    const ownersAfter = await store.listOwners();
    expect(ownersAfter[0].id).toBe('owner-werner-gunn');
    expect(ownersAfter.find((owner) => owner.id === 'owner-jake')?.name).toBe('Jake Example');
    expect(ownersAfter.every((owner) => beforeCodes.get(owner.id) === owner.code)).toBe(true);
    expect(ownersAfter.find((owner) => owner.id === 'owner-elliott-pollack')?.isCommissioner).toBe(true);

    const snapshot = await store.loadSnapshot();
    expect(snapshot.state.slots[0].ownerId).toBe('owner-werner-gunn');
    expect(snapshot.state.slots[13].ownerId).toBe('owner-chris-barbas');
    expect(snapshot.state.slots[14].ownerId).toBe('owner-chris-barbas');
    db.close();
  });

  it('rejects name/order changes after the draft starts', async () => {
    const { db, service } = await setupRealLeague();
    await service.start(0);

    await expect(updatePreDraftOwners(
      db,
      REAL_LEAGUE_OWNERS.map((owner) => ({
        id: owner.id,
        name: owner.name,
        draftPosition: owner.draftPosition,
      })),
      { nowMs: 1, actorOwnerId: 'owner-elliott-pollack' },
    )).rejects.toMatchObject({ code: 'DRAFT_ALREADY_STARTED' });
    db.close();
  });

  it('requires commissioner identity for prestart owner updates through the API', async () => {
    const { db } = await setupRealLeague();
    const owners = REAL_LEAGUE_OWNERS.map((owner) => ({
      id: owner.id,
      name: owner.name,
      draftPosition: owner.draftPosition,
    }));

    const denied = await handleApi(new Request('https://example.test/api/commissioner/prestart-owners', {
      method: 'POST',
      headers: { 'x-league-code': 'CODE01', 'content-type': 'application/json' },
      body: JSON.stringify({ owners }),
    }), { DB: db });
    expect(denied?.status).toBe(403);

    const allowed = await handleApi(new Request('https://example.test/api/commissioner/prestart-owners', {
      method: 'POST',
      headers: { 'x-league-code': 'CODE05', 'content-type': 'application/json' },
      body: JSON.stringify({ owners }),
    }), { DB: db });
    expect(allowed?.status).toBe(200);
    const body = await allowed?.json() as { setup: { ownersUpdated: number; slotsRegenerated: number } };
    expect(body.setup).toEqual({ ownersUpdated: 14, slotsRegenerated: 252, revision: 1 });
    db.close();
  });
});
