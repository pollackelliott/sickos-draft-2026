import { normalizeIdentityPart } from '../domain/index.js';
import type { D1Database, D1PreparedStatement, D1Result } from './d1-types.js';
import { playerSortKey } from './player-sort.js';
import { ACTIVE_DRAFT_ID } from './store-types.js';

const MAX_IMPORT_BYTES = 2_000_000;
const MAX_IMPORT_ROWS = 10_000;
const BULK_ROWS_PER_STATEMENT = 7;

export type PlayerUniverseImportErrorCode = 'INVALID_CSV' | 'IDENTITY_CONFLICT';

export class PlayerUniverseImportError extends Error {
  constructor(
    readonly code: PlayerUniverseImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlayerUniverseImportError';
  }
}

export interface ImportedPlayerRecord {
  id: string;
  espnId: string | null;
  name: string;
  school: string;
  conference: string;
  year: string | null;
  position: string | null;
  height: string | null;
  importStatus: string | null;
}

export interface PlayerUniverseRefreshSummary {
  incomingRows: number;
  appliedRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
  referencedPlayersProtected: number;
  referencedChangesIgnored: number;
  writeInsPreserved: number;
  writeInMatchesSkipped: number;
  finalPlayerCount: number;
}

export type PlayerUniverseReconciliationAction =
  | 'UNCHANGED'
  | 'UPDATE_SAFE'
  | 'NAME_MISMATCH_REVIEW'
  | 'UPDATE_PROTECTED_REVIEW'
  | 'ATTACH_ESPN_ID'
  | 'ATTACH_ESPN_ID_PROTECTED'
  | 'INSERT'
  | 'WRITE_IN_COLLISION'
  | 'IDENTITY_CONFLICT_REVIEW'
  | 'RETIRED_REVIEW'
  | 'OMISSION_REVIEW'
  | 'OMISSION_PROTECTED';

export interface PlayerUniverseReconciliationItem {
  action: PlayerUniverseReconciliationAction;
  storedId: string | null;
  incomingId: string | null;
  espnId: string | null;
  name: string;
  storedSchool: string | null;
  incomingSchool: string | null;
  storedConference: string | null;
  incomingConference: string | null;
  source: 'IMPORTED' | 'WRITE_IN' | null;
  referenced: boolean;
  selectable: boolean | null;
}

export interface PlayerUniverseReconciliationPlan {
  incomingRows: number;
  existingRows: number;
  counts: Record<PlayerUniverseReconciliationAction, number>;
  items: PlayerUniverseReconciliationItem[];
}

export interface PlayerUniverseRefreshOptions {
  nowMs: number;
  actorOwnerId?: string | null;
}

interface StoredPlayerRow {
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
  referenced: number;
  selectable?: number;
}

function requireRows<T>(result: D1Result<T>): T[] {
  if (!result.success) {
    throw new Error(result.error ?? 'D1 query failed.');
  }
  return result.results ?? [];
}

function canonicalHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[\s-]+/g, '_');
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushRow = () => {
    row.push(field);
    field = '';
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char === '"') {
      if (inQuotes && input[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }
      if (inQuotes) {
        inQuotes = false;
        continue;
      }
      if (field.length === 0) {
        inQuotes = true;
        continue;
      }
      throw new PlayerUniverseImportError('INVALID_CSV', 'Malformed CSV quote.');
    }

    if (!inQuotes && char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      pushRow();
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new PlayerUniverseImportError('INVALID_CSV', 'CSV ends inside a quoted field.');
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

const HEADER_ALIASES: Record<string, keyof ImportedPlayerRecord | 'ignore'> = {
  internal_id: 'id',
  id: 'id',
  espn_id: 'espnId',
  player_id: 'espnId',
  name: 'name',
  player: 'name',
  school: 'school',
  conference: 'conference',
  year: 'year',
  yr: 'year',
  class: 'year',
  position: 'position',
  height: 'height',
  source_status: 'importStatus',
  import_status: 'importStatus',
  match_method: 'ignore',
  espn_school: 'ignore',
  torvik_school: 'ignore',
  school_changed_from_espn: 'ignore',
  conference_source: 'ignore',
};

function cleanOptional(value: string | undefined): string | null {
  const cleaned = value?.trim() ?? '';
  return cleaned ? cleaned : null;
}

function identityKey(name: string, school: string): string {
  return `${normalizeIdentityPart(name)}\u0000${normalizeIdentityPart(school)}`;
}

export function parsePlayerUniverseCsv(csvText: string): ImportedPlayerRecord[] {
  if (new TextEncoder().encode(csvText).byteLength > MAX_IMPORT_BYTES) {
    throw new PlayerUniverseImportError(
      'INVALID_CSV',
      `Player-universe CSV exceeds ${MAX_IMPORT_BYTES.toLocaleString('en-US')} bytes.`,
    );
  }

  const records = parseCsvRows(csvText);
  if (records.length < 2) {
    throw new PlayerUniverseImportError('INVALID_CSV', 'Player-universe CSV must contain a header and at least one player.');
  }
  if (records.length - 1 > MAX_IMPORT_ROWS) {
    throw new PlayerUniverseImportError('INVALID_CSV', `Player-universe CSV may contain at most ${MAX_IMPORT_ROWS.toLocaleString('en-US')} players.`);
  }

  const mappedHeaders = records[0].map((header) => HEADER_ALIASES[canonicalHeader(header)] ?? 'ignore');
  const knownHeaders = new Set(mappedHeaders.filter((header) => header !== 'ignore'));
  for (const required of ['name', 'school', 'conference'] as const) {
    if (!knownHeaders.has(required)) {
      throw new PlayerUniverseImportError('INVALID_CSV', `Missing required CSV column: ${required}.`);
    }
  }

  const duplicateKnownHeaders = [...knownHeaders].filter(
    (header) => mappedHeaders.filter((candidate) => candidate === header).length > 1,
  );
  if (duplicateKnownHeaders.length) {
    throw new PlayerUniverseImportError(
      'INVALID_CSV',
      `Duplicate CSV column: ${duplicateKnownHeaders[0]}.`,
    );
  }

  const players: ImportedPlayerRecord[] = [];
  const ids = new Set<string>();
  const espnIds = new Set<string>();
  const identities = new Set<string>();

  for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
    const values = records[rowIndex];
    const raw: Partial<Record<keyof ImportedPlayerRecord, string>> = {};
    mappedHeaders.forEach((header, columnIndex) => {
      if (header !== 'ignore') raw[header] = values[columnIndex] ?? '';
    });

    const name = raw.name?.trim() ?? '';
    const school = raw.school?.trim() ?? '';
    const conference = raw.conference?.trim() ?? '';
    const espnId = cleanOptional(raw.espnId);

    if (!name || !school || !conference) {
      throw new PlayerUniverseImportError(
        'INVALID_CSV',
        `Row ${rowIndex + 1} must include name, school, and conference.`,
      );
    }
    if (espnId && !/^\d+$/.test(espnId)) {
      throw new PlayerUniverseImportError('INVALID_CSV', `Row ${rowIndex + 1} has an invalid ESPN ID.`);
    }

    const id = raw.id?.trim() || (espnId ? `espn:${espnId}` : '');
    if (!id) {
      throw new PlayerUniverseImportError(
        'INVALID_CSV',
        `Row ${rowIndex + 1} needs internal_id when ESPN ID is unavailable.`,
      );
    }

    const key = identityKey(name, school);
    if (ids.has(id)) {
      throw new PlayerUniverseImportError('INVALID_CSV', `Duplicate internal player ID: ${id}.`);
    }
    if (espnId && espnIds.has(espnId)) {
      throw new PlayerUniverseImportError('INVALID_CSV', `Duplicate ESPN player ID: ${espnId}.`);
    }
    if (identities.has(key)) {
      throw new PlayerUniverseImportError(
        'INVALID_CSV',
        `Duplicate normalized player/school identity: ${name} — ${school}.`,
      );
    }

    ids.add(id);
    if (espnId) espnIds.add(espnId);
    identities.add(key);

    players.push({
      id,
      espnId,
      name,
      school,
      conference,
      year: cleanOptional(raw.year),
      position: cleanOptional(raw.position),
      height: cleanOptional(raw.height),
      importStatus: cleanOptional(raw.importStatus),
    });
  }

  return players;
}

function sameImportedData(existing: StoredPlayerRow, incoming: ImportedPlayerRecord): boolean {
  return (
    existing.id === incoming.id &&
    existing.espn_id === incoming.espnId &&
    existing.name === incoming.name &&
    existing.school === incoming.school &&
    existing.conference === incoming.conference &&
    existing.year === incoming.year &&
    existing.position === incoming.position &&
    existing.height === incoming.height &&
    existing.import_status === incoming.importStatus
  );
}

function makeBulkUpsert(
  db: D1Database,
  rows: ImportedPlayerRecord[],
  refreshToken: string,
): D1PreparedStatement {
  const tuple = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'IMPORTED\')';
  const values: unknown[] = [];

  for (const row of rows) {
    values.push(
      row.id,
      row.espnId,
      row.name,
      row.school,
      row.conference,
      normalizeIdentityPart(row.name),
      normalizeIdentityPart(row.school),
      playerSortKey(row.name),
      row.year,
      row.position,
      row.height,
      row.importStatus,
      refreshToken,
    );
  }

  return db.prepare(
    `INSERT INTO players
       (id, espn_id, name, school, conference, normalized_name, normalized_school, sort_name,
        year, position, height, import_status, import_generation, source)
     VALUES ${rows.map(() => tuple).join(', ')}
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
       source = 'IMPORTED'
     WHERE players.source = 'IMPORTED'
       AND NOT EXISTS (SELECT 1 FROM draft_slots s WHERE s.player_id = players.id)
       AND NOT EXISTS (SELECT 1 FROM draft_events e WHERE e.player_id = players.id)`,
  ).bind(...values);
}


function storedIdentityKey(row: StoredPlayerRow): string {
  return `${row.normalized_name}\u0000${row.normalized_school}`;
}

function sameIncomingMetadata(
  existing: StoredPlayerRow,
  incoming: ImportedPlayerRecord,
): boolean {
  return (
    existing.espn_id === incoming.espnId &&
    existing.name === incoming.name &&
    existing.school === incoming.school &&
    existing.conference === incoming.conference &&
    existing.year === incoming.year &&
    existing.position === incoming.position &&
    existing.height === incoming.height &&
    existing.import_status === incoming.importStatus
  );
}

export async function planPlayerUniverseReconciliation(
  db: D1Database,
  incoming: ImportedPlayerRecord[],
): Promise<PlayerUniverseReconciliationPlan> {
  const storedResult = await db.prepare(
    `SELECT p.id, p.espn_id, p.name, p.school, p.conference,
            p.normalized_name, p.normalized_school, p.source,
            p.year, p.position, p.height, p.import_status, p.selectable,
            CASE WHEN
              EXISTS (SELECT 1 FROM draft_slots s WHERE s.player_id = p.id)
              OR EXISTS (SELECT 1 FROM draft_events e WHERE e.player_id = p.id)
            THEN 1 ELSE 0 END AS referenced
       FROM players p`,
  ).all<StoredPlayerRow>();

  const existing = requireRows(storedResult);

  const existingById = new Map(
    existing.map((row) => [row.id, row]),
  );

  const existingByEspn = new Map(
    existing
      .filter((row) => row.espn_id)
      .map((row) => [row.espn_id as string, row]),
  );

  const existingByIdentity = new Map(
    existing.map((row) => [
      `${row.normalized_name}\u0000${row.normalized_school}`,
      row,
    ]),
  );

  const matchedStoredIds = new Set<string>();
  const items: PlayerUniverseReconciliationItem[] = [];

  const push = (
    action: PlayerUniverseReconciliationAction,
    stored: StoredPlayerRow | null,
    row: ImportedPlayerRecord | null,
  ) => {
    items.push({
      action,
      storedId: stored?.id ?? null,
      incomingId: row?.id ?? null,
      espnId: row?.espnId ?? stored?.espn_id ?? null,
      name: row?.name ?? stored?.name ?? '',
      storedSchool: stored?.school ?? null,
      incomingSchool: row?.school ?? null,
      storedConference: stored?.conference ?? null,
      incomingConference: row?.conference ?? null,
      source: stored?.source ?? null,
      referenced: stored?.referenced === 1,
      selectable: stored?.selectable == null ? null : stored.selectable === 1,
    });
  };

  for (const row of incoming) {
    const sameId = existingById.get(row.id);

    if (sameId) {
      matchedStoredIds.add(sameId.id);

      const espnOwner = row.espnId
        ? existingByEspn.get(row.espnId)
        : undefined;
      const identityOwner = existingByIdentity.get(
        identityKey(row.name, row.school),
      );

      if (
        (espnOwner && espnOwner.id !== sameId.id)
        || (identityOwner && identityOwner.id !== sameId.id)
      ) {
        push('IDENTITY_CONFLICT_REVIEW', sameId, row);
        continue;
      }

      if (sameId.selectable === 0) {
        push('RETIRED_REVIEW', sameId, row);
        continue;
      }

      if (sameId.name !== row.name) {
        push('NAME_MISMATCH_REVIEW', sameId, row);
        continue;
      }

      if (sameIncomingMetadata(sameId, row)) {
        push('UNCHANGED', sameId, row);
        continue;
      }

      push(
        sameId.referenced
          ? 'UPDATE_PROTECTED_REVIEW'
          : 'UPDATE_SAFE',
        sameId,
        row,
      );
      continue;
    }

    const sameEspn = row.espnId
      ? existingByEspn.get(row.espnId)
      : undefined;

    if (sameEspn) {
      matchedStoredIds.add(sameEspn.id);

      const identityOwner = existingByIdentity.get(
        identityKey(row.name, row.school),
      );

      if (identityOwner && identityOwner.id !== sameEspn.id) {
        push('IDENTITY_CONFLICT_REVIEW', sameEspn, row);
        continue;
      }

      if (sameEspn.selectable === 0) {
        push('RETIRED_REVIEW', sameEspn, row);
        continue;
      }

      if (sameEspn.name !== row.name) {
        push('NAME_MISMATCH_REVIEW', sameEspn, row);
        continue;
      }

      if (sameIncomingMetadata(sameEspn, row)) {
        push('UNCHANGED', sameEspn, row);
        continue;
      }

      push(
        sameEspn.referenced
          ? 'UPDATE_PROTECTED_REVIEW'
          : 'UPDATE_SAFE',
        sameEspn,
        row,
      );
      continue;
    }

    const sameIdentity = existingByIdentity.get(
      identityKey(row.name, row.school),
    );

    if (sameIdentity) {
      matchedStoredIds.add(sameIdentity.id);

      if (sameIdentity.selectable === 0) {
        push('RETIRED_REVIEW', sameIdentity, row);
        continue;
      }

      if (sameIdentity.source === 'WRITE_IN') {
        push('WRITE_IN_COLLISION', sameIdentity, row);
        continue;
      }

      if (
        sameIdentity.espn_id &&
        sameIdentity.espn_id !== row.espnId
      ) {
        push('IDENTITY_CONFLICT_REVIEW', sameIdentity, row);
        continue;
      }

      push(
        sameIdentity.referenced
          ? 'ATTACH_ESPN_ID_PROTECTED'
          : 'ATTACH_ESPN_ID',
        sameIdentity,
        row,
      );
      continue;
    }

    push('INSERT', null, row);
  }

  for (const stored of existing) {
    if (stored.source !== 'IMPORTED') continue;
    if (matchedStoredIds.has(stored.id)) continue;

    push(
      stored.referenced
        ? 'OMISSION_PROTECTED'
        : 'OMISSION_REVIEW',
      stored,
      null,
    );
  }

  const actions: PlayerUniverseReconciliationAction[] = [
    'UNCHANGED',
    'UPDATE_SAFE',
    'NAME_MISMATCH_REVIEW',
    'UPDATE_PROTECTED_REVIEW',
    'ATTACH_ESPN_ID',
    'ATTACH_ESPN_ID_PROTECTED',
    'INSERT',
    'WRITE_IN_COLLISION',
    'IDENTITY_CONFLICT_REVIEW',
    'RETIRED_REVIEW',
    'OMISSION_REVIEW',
    'OMISSION_PROTECTED',
  ];

  const counts = Object.fromEntries(
    actions.map((action) => [
      action,
      items.filter((item) => item.action === action).length,
    ]),
  ) as Record<PlayerUniverseReconciliationAction, number>;

  return {
    incomingRows: incoming.length,
    existingRows: existing.length,
    counts,
    items,
  };
}

export async function refreshPlayerUniverse(
  db: D1Database,
  incoming: ImportedPlayerRecord[],
  options: PlayerUniverseRefreshOptions,
): Promise<PlayerUniverseRefreshSummary> {
  if (!incoming.length) {
    throw new PlayerUniverseImportError('INVALID_CSV', 'Player universe cannot be empty.');
  }

  const storedResult = await db.prepare(
    `SELECT p.id, p.espn_id, p.name, p.school, p.conference,
            p.normalized_name, p.normalized_school, p.source,
            p.year, p.position, p.height, p.import_status,
            CASE WHEN
              EXISTS (SELECT 1 FROM draft_slots s WHERE s.player_id = p.id)
              OR EXISTS (SELECT 1 FROM draft_events e WHERE e.player_id = p.id)
            THEN 1 ELSE 0 END AS referenced
       FROM players p`,
  ).all<StoredPlayerRow>();
  const existing = requireRows(storedResult);

  const existingById = new Map(existing.map((row) => [row.id, row]));
  const existingByEspn = new Map(
    existing.filter((row) => row.espn_id).map((row) => [row.espn_id as string, row]),
  );
  const existingByIdentity = new Map(existing.map((row) => [
    `${row.normalized_name}\u0000${row.normalized_school}`,
    row,
  ]));
  const incomingById = new Map(incoming.map((row) => [row.id, row]));

  const actionable: ImportedPlayerRecord[] = [];
  const skippedForWriteIn = new Set<string>();

  for (const row of incoming) {
    const sameId = existingById.get(row.id);
    if (sameId?.source === 'WRITE_IN') {
      throw new PlayerUniverseImportError(
        'IDENTITY_CONFLICT',
        `Incoming internal ID ${row.id} is already owned by a write-in player.`,
      );
    }

    if (row.espnId) {
      const sameEspn = existingByEspn.get(row.espnId);
      if (sameEspn && sameEspn.id !== row.id) {
        throw new PlayerUniverseImportError(
          'IDENTITY_CONFLICT',
          `ESPN ID ${row.espnId} is already attached to internal ID ${sameEspn.id}.`,
        );
      }
    }

    const sameIdentity = existingByIdentity.get(identityKey(row.name, row.school));
    if (sameIdentity && sameIdentity.id !== row.id) {
      if (sameIdentity.source === 'WRITE_IN') {
        skippedForWriteIn.add(row.id);
        continue;
      }
      throw new PlayerUniverseImportError(
        'IDENTITY_CONFLICT',
        `${row.name} — ${row.school} already exists under internal ID ${sameIdentity.id}.`,
      );
    }

    if (sameId?.referenced) continue;
    actionable.push(row);
  }

  const actionableById = new Map(actionable.map((row) => [row.id, row]));
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of actionable) {
    const prior = existingById.get(row.id);
    if (!prior) inserted += 1;
    else if (sameImportedData(prior, row)) unchanged += 1;
    else updated += 1;
  }

  const removableImported = existing.filter(
    (row) => row.source === 'IMPORTED' && !row.referenced,
  );
  const removed = removableImported.filter((row) => !actionableById.has(row.id)).length;

  const referencedImported = existing.filter(
    (row) => row.source === 'IMPORTED' && row.referenced,
  );
  const referencedChangesIgnored = referencedImported.filter((row) => {
    const candidate = incomingById.get(row.id);
    return !candidate || !sameImportedData(row, candidate);
  }).length;

  const writeIns = existing.filter((row) => row.source === 'WRITE_IN');
  const refreshToken = `refresh:${options.nowMs}:${incoming.length}`;
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE players
          SET normalized_name = '__refresh__:' || id,
              normalized_school = '__refresh__:' || id
        WHERE source = 'IMPORTED'
          AND NOT EXISTS (SELECT 1 FROM draft_slots s WHERE s.player_id = players.id)
          AND NOT EXISTS (SELECT 1 FROM draft_events e WHERE e.player_id = players.id)`,
    ),
  ];

  for (let index = 0; index < actionable.length; index += BULK_ROWS_PER_STATEMENT) {
    statements.push(
      makeBulkUpsert(db, actionable.slice(index, index + BULK_ROWS_PER_STATEMENT), refreshToken),
    );
  }

  statements.push(
    db.prepare(
      `DELETE FROM players
        WHERE source = 'IMPORTED'
          AND COALESCE(import_generation, '') <> ?
          AND NOT EXISTS (SELECT 1 FROM draft_slots s WHERE s.player_id = players.id)
          AND NOT EXISTS (SELECT 1 FROM draft_events e WHERE e.player_id = players.id)`,
    ).bind(refreshToken),
  );

  const eventDetails = JSON.stringify({
    incomingRows: incoming.length,
    appliedRows: actionable.length,
    inserted,
    updated,
    unchanged,
    removed,
    referencedPlayersProtected: referencedImported.length,
    referencedChangesIgnored,
    writeInsPreserved: writeIns.length,
    writeInMatchesSkipped: skippedForWriteIn.size,
  });
  statements.push(
    db.prepare(
      `INSERT INTO draft_events
         (draft_id, event_type, actor_owner_id, created_at_ms, details_json)
       SELECT ?, 'PLAYER_UNIVERSE_REFRESHED', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM drafts WHERE id = ?)`,
    ).bind(
      ACTIVE_DRAFT_ID,
      options.actorOwnerId ?? null,
      options.nowMs,
      eventDetails,
      ACTIVE_DRAFT_ID,
    ),
  );

  await db.batch(statements);

  const countRow = await db.prepare('SELECT COUNT(*) AS total FROM players')
    .first<{ total: number }>();

  return {
    incomingRows: incoming.length,
    appliedRows: actionable.length,
    inserted,
    updated,
    unchanged,
    removed,
    referencedPlayersProtected: referencedImported.length,
    referencedChangesIgnored,
    writeInsPreserved: writeIns.length,
    writeInMatchesSkipped: skippedForWriteIn.size,
    finalPlayerCount: countRow?.total ?? 0,
  };
}

export async function refreshPlayerUniverseFromCsv(
  db: D1Database,
  csvText: string,
  options: PlayerUniverseRefreshOptions,
): Promise<PlayerUniverseRefreshSummary> {
  return refreshPlayerUniverse(db, parsePlayerUniverseCsv(csvText), options);
}
