import { normalizeIdentityPart } from '../domain/index.js';
import type { D1Database, D1PreparedStatement, D1Result } from './d1-types.js';
import {
  parsePlayerUniverseCsv,
  planPlayerUniverseReconciliation,
  type ImportedPlayerRecord,
} from './player-import.js';
import { playerSortKey } from './player-sort.js';
import { ACTIVE_DRAFT_ID } from './store-types.js';

const JSON_ROWS_PER_STATEMENT = 1_000;

interface StoredRow {
  id: string;
  espn_id: string | null;
  name: string;
  school: string;
  conference: string;
  normalized_name: string;
  normalized_school: string;
  source: 'IMPORTED' | 'WRITE_IN';
  year: string | null;
  position: string | null;
  height: string | null;
  import_status: string | null;
  selectable: number;
  referenced: number;
  currently_drafted: number;
}

export interface PlayerUniverseReconciliationApplyOptions {
  nowMs: number;
  actorOwnerId?: string | null;
}

export interface PlayerUniverseReconciliationApplySummary {
  incomingRows: number;
  safeUpdates: number;
  espnIdsAttached: number;
  protectedEspnIdsAttached: number;
  inserted: number;
  duplicateRecordsRemoved: number;
  espnIdsReplaced: number;
  historicalTransfersVersioned: number;
  nameMismatchesPreserved: number;
  protectedRowsSkipped: number;
  retiredRowsPreserved: number;
  omissionsPreserved: number;
  writeInCollisionsPreserved: number;
}

function requireRows<T>(result: D1Result<T>): T[] {
  if (!result.success) {
    throw new Error(result.error ?? 'D1 query failed.');
  }
  return result.results ?? [];
}

function identityKey(name: string, school: string): string {
  return `${normalizeIdentityPart(name)}\u0000${normalizeIdentityPart(school)}`;
}

function canonicalRow(
  incoming: ImportedPlayerRecord,
  id: string,
  prior?: StoredRow,
): ImportedPlayerRecord {
  return {
    ...incoming,
    id,
    importStatus: incoming.importStatus ?? prior?.import_status ?? null,
  };
}

function preserveExistingCanonicalData(
  incoming: ImportedPlayerRecord,
  stored: StoredRow,
): ImportedPlayerRecord {
  return {
    id: stored.id,
    espnId: incoming.espnId ?? stored.espn_id,
    name: stored.name,
    school: incoming.school,
    conference: incoming.conference,
    year: stored.year,
    position: stored.position,
    height: stored.height,
    importStatus: stored.import_status,
  };
}

function bulkUpsert(
  db: D1Database,
  rows: ImportedPlayerRecord[],
  generation: string,
): D1PreparedStatement {
  const payload = rows.map((row) => ({
    id: row.id,
    espnId: row.espnId,
    name: row.name,
    school: row.school,
    conference: row.conference,
    normalizedName: normalizeIdentityPart(row.name),
    normalizedSchool: normalizeIdentityPart(row.school),
    sortName: playerSortKey(row.name),
    year: row.year,
    position: row.position,
    height: row.height,
    importStatus: row.importStatus,
  }));

  return db.prepare(
    `INSERT INTO players
       (id, espn_id, name, school, conference,
        normalized_name, normalized_school, sort_name,
        year, position, height, import_status,
        import_generation, source, selectable)
     SELECT
       json_extract(value, '$.id'),
       json_extract(value, '$.espnId'),
       json_extract(value, '$.name'),
       json_extract(value, '$.school'),
       json_extract(value, '$.conference'),
       json_extract(value, '$.normalizedName'),
       json_extract(value, '$.normalizedSchool'),
       json_extract(value, '$.sortName'),
       json_extract(value, '$.year'),
       json_extract(value, '$.position'),
       json_extract(value, '$.height'),
       json_extract(value, '$.importStatus'),
       ?,
       'IMPORTED',
       1
     FROM json_each(?)
     WHERE 1
     ON CONFLICT(id) DO UPDATE SET
       espn_id = excluded.espn_id,
       name = excluded.name,
       school = excluded.school,
       conference = excluded.conference,
       normalized_name = excluded.normalized_name,
       normalized_school = excluded.normalized_school,
       sort_name = excluded.sort_name,
       year = excluded.year,
       position = excluded.position,
       height = excluded.height,
       import_status = excluded.import_status,
       import_generation = excluded.import_generation,
       source = 'IMPORTED',
       selectable = 1
     WHERE players.source = 'IMPORTED'
       AND NOT EXISTS (
         SELECT 1 FROM draft_slots s WHERE s.player_id = players.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM draft_events e WHERE e.player_id = players.id
       )`,
  ).bind(generation, JSON.stringify(payload));
}

export async function reconcilePlayerUniverse(
  db: D1Database,
  incoming: ImportedPlayerRecord[],
  options: PlayerUniverseReconciliationApplyOptions,
): Promise<PlayerUniverseReconciliationApplySummary> {
  if (!incoming.length) {
    throw new Error('Player universe cannot be empty.');
  }

  const storedResult = await db.prepare(
    `SELECT
       p.id,
       p.espn_id,
       p.name,
       p.school,
       p.conference,
       p.normalized_name,
       p.normalized_school,
       p.source,
       p.year,
       p.position,
       p.height,
       p.import_status,
       p.selectable,
       CASE WHEN
         EXISTS (SELECT 1 FROM draft_slots s WHERE s.player_id = p.id)
         OR EXISTS (SELECT 1 FROM draft_events e WHERE e.player_id = p.id)
       THEN 1 ELSE 0 END AS referenced,
       CASE WHEN
         EXISTS (SELECT 1 FROM draft_slots s WHERE s.player_id = p.id)
       THEN 1 ELSE 0 END AS currently_drafted
     FROM players p`,
  ).all<StoredRow>();

  const existing = requireRows(storedResult);
  const byId = new Map(existing.map((row) => [row.id, row]));
  const byEspn = new Map(
    existing
      .filter((row) => row.espn_id)
      .map((row) => [row.espn_id as string, row]),
  );
  const byIdentity = new Map(
    existing.map((row) => [
      `${row.normalized_name}\u0000${row.normalized_school}`,
      row,
    ]),
  );

  const plan = await planPlayerUniverseReconciliation(db, incoming);
  const incomingByEspn = new Map(
    incoming
      .filter((row) => row.espnId)
      .map((row) => [row.espnId as string, row]),
  );

  const incomingById = new Map(incoming.map((row) => [row.id, row]));

  const generation = `reconcile:${options.nowMs}:${incoming.length}`;

  const deleteIds = new Set<string>();
  const ordinaryRows: ImportedPlayerRecord[] = [];
  const specialStatements: D1PreparedStatement[] = [];

  let safeUpdates = 0;
  let espnIdsAttached = 0;
  let protectedEspnIdsAttached = 0;
  let inserted = 0;
  let duplicateRecordsRemoved = 0;
  let espnIdsReplaced = 0;
  let historicalTransfersVersioned = 0;
  let nameMismatchesPreserved = 0;
  let protectedRowsSkipped = 0;
  let retiredRowsPreserved = 0;
  let omissionsPreserved = 0;
  let writeInCollisionsPreserved = 0;

  for (const item of plan.items) {
    const incomingRow =
      (item.espnId ? incomingByEspn.get(item.espnId) : undefined)
      ?? (item.incomingId ? incomingById.get(item.incomingId) : undefined);

    const stored = item.storedId ? byId.get(item.storedId) : undefined;

    switch (item.action) {
      case 'UNCHANGED':
        break;

      case 'UPDATE_SAFE': {
        if (!incomingRow || !stored || stored.referenced) {
          throw new Error(`Unsafe UPDATE_SAFE plan item for ${item.name}.`);
        }
        ordinaryRows.push(
          preserveExistingCanonicalData(incomingRow, stored),
        );
        safeUpdates += 1;
        break;
      }

      case 'ATTACH_ESPN_ID': {
        if (!incomingRow || !stored || stored.referenced) {
          throw new Error(`Unsafe ATTACH_ESPN_ID plan item for ${item.name}.`);
        }
        ordinaryRows.push(
          preserveExistingCanonicalData(incomingRow, stored),
        );
        espnIdsAttached += 1;
        break;
      }

      case 'ATTACH_ESPN_ID_PROTECTED': {
        if (!incomingRow?.espnId || !stored || !stored.referenced) {
          throw new Error(`Unsafe protected ESPN attachment for ${item.name}.`);
        }

        specialStatements.push(
          db.prepare(
            `UPDATE players
                SET espn_id = ?
              WHERE id = ?
                AND source = 'IMPORTED'
                AND (espn_id IS NULL OR espn_id = '')`,
          ).bind(incomingRow.espnId, stored.id),
        );
        protectedEspnIdsAttached += 1;
        break;
      }

      case 'INSERT': {
        if (!incomingRow) {
          throw new Error(`Missing incoming INSERT row for ${item.name}.`);
        }
        ordinaryRows.push(incomingRow);
        inserted += 1;
        break;
      }

      case 'IDENTITY_CONFLICT_REVIEW': {
        if (!incomingRow) {
          throw new Error(`Missing incoming conflict row for ${item.name}.`);
        }

        const espnOwner = incomingRow.espnId
          ? byEspn.get(incomingRow.espnId)
          : undefined;
        const identityOwner = byIdentity.get(
          identityKey(incomingRow.name, incomingRow.school),
        );

        if (
          espnOwner
          && identityOwner
          && espnOwner.id !== identityOwner.id
        ) {
          if (espnOwner.referenced || identityOwner.referenced) {
            throw new Error(
              `Referenced duplicate conflict requires manual review: ${item.name}.`,
            );
          }

          deleteIds.add(espnOwner.id);
          ordinaryRows.push(
            preserveExistingCanonicalData(incomingRow, identityOwner),
          );
          duplicateRecordsRemoved += 1;
          espnIdsAttached += 1;
          break;
        }

        if (
          identityOwner
          && !espnOwner
          && identityOwner.espn_id
          && identityOwner.espn_id !== incomingRow.espnId
        ) {
          if (identityOwner.referenced) {
            throw new Error(
              `Referenced ESPN replacement requires manual review: ${item.name}.`,
            );
          }

          ordinaryRows.push(
            preserveExistingCanonicalData(incomingRow, identityOwner),
          );
          espnIdsReplaced += 1;
          break;
        }

        throw new Error(
          `Unrecognized identity conflict shape for ${item.name}.`,
        );
      }

      case 'NAME_MISMATCH_REVIEW':
        nameMismatchesPreserved += 1;
        break;

      case 'UPDATE_PROTECTED_REVIEW': {
        if (!incomingRow || !stored || !stored.referenced) {
          throw new Error(`Invalid protected update for ${item.name}.`);
        }

        const schoolChanged = stored.school !== incomingRow.school;
        const conferenceChanged =
          stored.conference !== incomingRow.conference;

        if (
          (schoolChanged || conferenceChanged)
          && stored.currently_drafted === 0
          && incomingRow.espnId
        ) {
          const versionedId =
            `espn-current:${incomingRow.espnId}:${options.nowMs}`;

          specialStatements.push(
            db.prepare(
              `UPDATE players
                  SET espn_id = NULL,
                      selectable = 0
                WHERE id = ?
                  AND source = 'IMPORTED'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM draft_slots s
                    WHERE s.player_id = players.id
                  )`,
            ).bind(stored.id),
          );

          ordinaryRows.push(
            canonicalRow(incomingRow, versionedId),
          );
          historicalTransfersVersioned += 1;
        } else {
          protectedRowsSkipped += 1;
        }
        break;
      }

      case 'RETIRED_REVIEW':
        retiredRowsPreserved += 1;
        break;

      case 'OMISSION_REVIEW':
      case 'OMISSION_PROTECTED':
        omissionsPreserved += 1;
        break;

      case 'WRITE_IN_COLLISION':
        writeInCollisionsPreserved += 1;
        break;

      default: {
        const exhaustive: never = item.action;
        throw new Error(`Unhandled reconciliation action: ${exhaustive}`);
      }
    }
  }

  const statements: D1PreparedStatement[] = [];

  for (const id of deleteIds) {
    statements.push(
      db.prepare(
        `DELETE FROM players
          WHERE id = ?
            AND source = 'IMPORTED'
            AND NOT EXISTS (
              SELECT 1 FROM draft_slots s WHERE s.player_id = players.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM draft_events e WHERE e.player_id = players.id
            )`,
      ).bind(id),
    );
  }

  statements.push(...specialStatements);

  for (
    let index = 0;
    index < ordinaryRows.length;
    index += JSON_ROWS_PER_STATEMENT
  ) {
    statements.push(
      bulkUpsert(
        db,
        ordinaryRows.slice(index, index + JSON_ROWS_PER_STATEMENT),
        generation,
      ),
    );
  }

  const summary: PlayerUniverseReconciliationApplySummary = {
    incomingRows: incoming.length,
    safeUpdates,
    espnIdsAttached,
    protectedEspnIdsAttached,
    inserted,
    duplicateRecordsRemoved,
    espnIdsReplaced,
    historicalTransfersVersioned,
    nameMismatchesPreserved,
    protectedRowsSkipped,
    retiredRowsPreserved,
    omissionsPreserved,
    writeInCollisionsPreserved,
  };

  statements.push(
    db.prepare(
      `INSERT INTO draft_events
         (draft_id, event_type, actor_owner_id, created_at_ms, details_json)
       SELECT ?, 'PLAYER_UNIVERSE_RECONCILED', ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM drafts WHERE id = ?
       )`,
    ).bind(
      ACTIVE_DRAFT_ID,
      options.actorOwnerId ?? null,
      options.nowMs,
      JSON.stringify(summary),
      ACTIVE_DRAFT_ID,
    ),
  );

  await db.batch(statements);
  return summary;
}

export async function reconcilePlayerUniverseFromCsv(
  db: D1Database,
  csvText: string,
  options: PlayerUniverseReconciliationApplyOptions,
): Promise<PlayerUniverseReconciliationApplySummary> {
  return reconcilePlayerUniverse(
    db,
    parsePlayerUniverseCsv(csvText),
    options,
  );
}
