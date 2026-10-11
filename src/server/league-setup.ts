import { DomainError, generateSnakeSlots, orderedOwners } from '../domain/index.js';
import type { D1Database, D1PreparedStatement, D1Result } from './d1-types.js';
import { ACTIVE_DRAFT_ID } from './store-types.js';

export interface PreDraftOwnerUpdate {
  id: string;
  name: string;
  draftPosition: number;
}

interface DraftSetupRow {
  lifecycle: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  rounds: number;
  revision: number;
}

interface ExistingOwnerRow {
  id: string;
  name: string;
  draft_position: number;
  code: string;
  is_commissioner: number;
}

function requireRows<T>(result: D1Result<T>): T[] {
  if (!result.success) throw new Error(result.error ?? 'D1 query failed.');
  return result.results ?? [];
}

export interface PreDraftOwnerUpdateSummary {
  ownersUpdated: number;
  slotsRegenerated: number;
  revision: number;
}

export async function updatePreDraftOwners(
  db: D1Database,
  owners: PreDraftOwnerUpdate[],
  options: { nowMs: number; actorOwnerId?: string | null },
): Promise<PreDraftOwnerUpdateSummary> {
  const draft = await db.prepare(
    'SELECT lifecycle, rounds, revision FROM drafts WHERE id = ?',
  ).bind(ACTIVE_DRAFT_ID).first<DraftSetupRow>();

  if (!draft) {
    throw new DomainError('INVALID_CONFIGURATION', 'The active draft has not been initialized.');
  }
  if (draft.lifecycle !== 'NOT_STARTED') {
    throw new DomainError('DRAFT_ALREADY_STARTED', 'Draft order and owner names can only be changed before the draft starts.');
  }

  const existingResult = await db.prepare(
    'SELECT id, name, draft_position, code, is_commissioner FROM owners ORDER BY draft_position',
  ).all<ExistingOwnerRow>();
  const existing = requireRows(existingResult);

  if (owners.length !== existing.length) {
    throw new DomainError('INVALID_CONFIGURATION', 'Pre-draft owner updates must preserve the existing owner set.');
  }

  const existingIds = new Set(existing.map((owner) => owner.id));
  const incomingIds = new Set(owners.map((owner) => owner.id));
  if (existingIds.size !== incomingIds.size || [...existingIds].some((id) => !incomingIds.has(id))) {
    throw new DomainError('INVALID_CONFIGURATION', 'Pre-draft owner updates must preserve every owner identity.');
  }

  const normalized = orderedOwners(owners.map((owner) => ({
    id: owner.id,
    name: owner.name.trim(),
    draftPosition: owner.draftPosition,
  })));
  const slots = generateSnakeSlots(normalized, draft.rounds);

  const statements: D1PreparedStatement[] = [];

  existing.forEach((owner, index) => {
    statements.push(
      db.prepare('UPDATE owners SET draft_position = ? WHERE id = ?')
        .bind(10_000 + index, owner.id),
    );
  });

  for (const owner of normalized) {
    statements.push(
      db.prepare('UPDATE owners SET name = ?, draft_position = ? WHERE id = ?')
        .bind(owner.name, owner.draftPosition, owner.id),
    );
  }

  for (const slot of slots) {
    statements.push(
      db.prepare(
        "UPDATE draft_slots SET owner_id = ? WHERE draft_id = ? AND id = ? AND status = 'FUTURE' AND player_id IS NULL",
      ).bind(slot.ownerId, ACTIVE_DRAFT_ID, slot.id),
    );
  }

  statements.push(
    db.prepare('UPDATE drafts SET revision = revision + 1 WHERE id = ? AND revision = ?')
      .bind(ACTIVE_DRAFT_ID, draft.revision),
  );

  statements.push(
    db.prepare(
      'INSERT INTO draft_events (draft_id, event_type, actor_owner_id, created_at_ms, details_json) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      ACTIVE_DRAFT_ID,
      'PRESTART_OWNERS_UPDATED',
      options.actorOwnerId ?? null,
      options.nowMs,
      JSON.stringify({
        ownerCount: normalized.length,
        firstRoundOrder: normalized.map((owner) => owner.id),
      }),
    ),
  );

  await db.batch(statements);

  return {
    ownersUpdated: normalized.length,
    slotsRegenerated: slots.length,
    revision: draft.revision + 1,
  };
}
