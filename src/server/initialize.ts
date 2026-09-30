import { createDraftState, normalizeIdentityPart, type Player } from '../domain/index.js';
import type { D1Database, D1PreparedStatement } from './d1-types.js';
import { ACTIVE_DRAFT_ID, type OwnerRecord } from './store-types.js';

export async function initializeDraft(
  db: D1Database,
  input: {
    owners: OwnerRecord[];
    players: Player[];
    rounds: number;
    clockDurationMs: number;
  },
): Promise<void> {
  const state = createDraftState({
    owners: input.owners,
    players: input.players,
    rounds: input.rounds,
    clockDurationMs: input.clockDurationMs,
  });

  const commissionerCount = input.owners.filter((owner) => owner.isCommissioner).length;
  if (commissionerCount !== 1) {
    throw new Error('Exactly one owner must be marked as commissioner.');
  }

  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO drafts
       (id, rounds, clock_duration_ms, lifecycle, paused, revision)
       VALUES (?, ?, ?, 'NOT_STARTED', 0, 0)`,
    ).bind(ACTIVE_DRAFT_ID, state.config.rounds, state.config.clockDurationMs),
  ];

  for (const owner of input.owners) {
    statements.push(
      db.prepare(
        `INSERT INTO owners (id, name, draft_position, code, is_commissioner)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(owner.id, owner.name, owner.draftPosition, owner.code, owner.isCommissioner ? 1 : 0),
    );
  }

  for (const player of input.players) {
    statements.push(
      db.prepare(
        `INSERT INTO players
         (id, name, school, conference, normalized_name, normalized_school, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        player.id,
        player.name,
        player.school,
        player.conference,
        normalizeIdentityPart(player.name),
        normalizeIdentityPart(player.school),
        player.source,
      ),
    );
  }

  for (const slot of state.slots) {
    statements.push(
      db.prepare(
        `INSERT INTO draft_slots
         (id, draft_id, round, round_pick, overall_pick, owner_id, status)
         VALUES (?, ?, ?, ?, ?, ?, 'FUTURE')`,
      ).bind(slot.id, ACTIVE_DRAFT_ID, slot.round, slot.roundPick, slot.overallPick, slot.ownerId),
    );
  }

  await db.batch(statements);
}
