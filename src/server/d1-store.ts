import { DomainError, normalizeIdentityPart, type DraftSlot, type DraftState, type Owner, type Player } from '../domain/index.js';
import type { D1Database, D1PreparedStatement, D1Result } from './d1-types.js';
import {
  ACTIVE_DRAFT_ID,
  type DraftMutationEvent,
  type OwnerRecord,
  type PersistedDraftSnapshot,
  type PersistMutationOptions,
  type PlayerSearchQuery,
  type PlayerSearchResult,
} from './store-types.js';

interface DraftRow {
  id: string;
  rounds: number;
  clock_duration_ms: number;
  lifecycle: DraftState['lifecycle'];
  paused: number;
  active_slot_id: string | null;
  active_deadline_ms: number | null;
  paused_remaining_ms: number | null;
  started_at_ms: number | null;
  completed_at_ms: number | null;
  revision: number;
}

interface OwnerRow {
  id: string;
  name: string;
  draft_position: number;
  code: string;
  is_commissioner: number;
}

interface SlotRow {
  id: string;
  round: number;
  round_pick: number;
  overall_pick: number;
  owner_id: string;
  status: DraftSlot['status'];
  player_id: string | null;
  selected_at_ms: number | null;
  selection_kind: DraftSlot['selectionKind'];
}

interface PlayerRow {
  id: string;
  name: string;
  school: string;
  conference: string;
  source: Player['source'];
}

function requireRows<T>(result: D1Result<T>): T[] {
  if (!result.success) {
    throw new Error(result.error ?? 'D1 query failed.');
  }
  return result.results ?? [];
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    school: row.school,
    conference: row.conference,
    source: row.source,
  };
}

function sameSlot(a: DraftSlot, b: DraftSlot): boolean {
  return (
    a.status === b.status &&
    a.playerId === b.playerId &&
    a.selectedAtMs === b.selectedAtMs &&
    a.selectionKind === b.selectionKind
  );
}

function stateHeaderChanged(a: DraftState, b: DraftState): boolean {
  return (
    a.config.rounds !== b.config.rounds ||
    a.config.clockDurationMs !== b.config.clockDurationMs ||
    a.lifecycle !== b.lifecycle ||
    a.paused !== b.paused ||
    a.activeSlotId !== b.activeSlotId ||
    a.activeDeadlineMs !== b.activeDeadlineMs ||
    a.pausedRemainingMs !== b.pausedRemainingMs ||
    a.startedAtMs !== b.startedAtMs ||
    a.completedAtMs !== b.completedAtMs
  );
}

export class RevisionConflictError extends Error {
  constructor() {
    super('Draft changed during the request.');
    this.name = 'RevisionConflictError';
  }
}

export class D1DraftStore {
  constructor(private readonly db: D1Database) {}

  async loadSnapshot(): Promise<PersistedDraftSnapshot> {
    const draft = await this.db.prepare(
      `SELECT id, rounds, clock_duration_ms, lifecycle, paused, active_slot_id,
              active_deadline_ms, paused_remaining_ms, started_at_ms, completed_at_ms, revision
         FROM drafts WHERE id = ?`,
    ).bind(ACTIVE_DRAFT_ID).first<DraftRow>();

    if (!draft) {
      throw new DomainError('INVALID_CONFIGURATION', 'The active draft has not been initialized.');
    }

    const [ownerResult, slotResult, draftedPlayerResult] = await Promise.all([
      this.db.prepare(
        'SELECT id, name, draft_position, code, is_commissioner FROM owners ORDER BY draft_position',
      ).all<OwnerRow>(),
      this.db.prepare(
        `SELECT id, round, round_pick, overall_pick, owner_id, status, player_id,
                selected_at_ms, selection_kind
           FROM draft_slots WHERE draft_id = ? ORDER BY overall_pick`,
      ).bind(ACTIVE_DRAFT_ID).all<SlotRow>(),
      this.db.prepare(
        `SELECT DISTINCT p.id, p.name, p.school, p.conference, p.source
           FROM players p
           JOIN draft_slots s ON s.player_id = p.id
          WHERE s.draft_id = ?`,
      ).bind(ACTIVE_DRAFT_ID).all<PlayerRow>(),
    ]);

    const owners: Owner[] = requireRows(ownerResult).map((row) => ({
      id: row.id,
      name: row.name,
      draftPosition: row.draft_position,
    }));

    const slots: DraftSlot[] = requireRows(slotResult).map((row) => ({
      id: row.id,
      round: row.round,
      roundPick: row.round_pick,
      overallPick: row.overall_pick,
      ownerId: row.owner_id,
      status: row.status,
      playerId: row.player_id,
      selectedAtMs: row.selected_at_ms,
      selectionKind: row.selection_kind,
    }));

    return {
      draftId: draft.id,
      revision: draft.revision,
      state: {
        owners,
        players: requireRows(draftedPlayerResult).map(toPlayer),
        config: { rounds: draft.rounds, clockDurationMs: draft.clock_duration_ms },
        slots,
        lifecycle: draft.lifecycle,
        paused: draft.paused === 1,
        activeSlotId: draft.active_slot_id,
        activeDeadlineMs: draft.active_deadline_ms,
        pausedRemainingMs: draft.paused_remaining_ms,
        startedAtMs: draft.started_at_ms,
        completedAtMs: draft.completed_at_ms,
      },
    };
  }

  async getPlayer(playerId: string): Promise<Player | undefined> {
    const row = await this.db.prepare(
      'SELECT id, name, school, conference, source FROM players WHERE id = ?',
    ).bind(playerId).first<PlayerRow>();
    return row ? toPlayer(row) : undefined;
  }

  async findPlayerByNameSchool(name: string, school: string): Promise<Player | undefined> {
    const row = await this.db.prepare(
      `SELECT id, name, school, conference, source FROM players
        WHERE normalized_name = ? AND normalized_school = ? LIMIT 1`,
    ).bind(normalizeIdentityPart(name), normalizeIdentityPart(school)).first<PlayerRow>();
    return row ? toPlayer(row) : undefined;
  }

  async listOwners(): Promise<OwnerRecord[]> {
    const result = await this.db.prepare(
      'SELECT id, name, draft_position, code, is_commissioner FROM owners ORDER BY draft_position',
    ).all<OwnerRow>();
    return requireRows(result).map((row) => ({
      id: row.id,
      name: row.name,
      draftPosition: row.draft_position,
      code: row.code,
      isCommissioner: row.is_commissioner === 1,
    }));
  }

  async findOwnerByCode(code: string): Promise<OwnerRecord | undefined> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return undefined;
    const row = await this.db.prepare(
      `SELECT id, name, draft_position, code, is_commissioner
         FROM owners WHERE UPPER(code) = ? LIMIT 1`,
    ).bind(normalized).first<OwnerRow>();
    return row ? {
      id: row.id,
      name: row.name,
      draftPosition: row.draft_position,
      code: row.code,
      isCommissioner: row.is_commissioner === 1,
    } : undefined;
  }

  async playerFilterOptions(conference?: string): Promise<{ conferences: string[]; schools: string[] }> {
    const conferenceRows = await this.db.prepare(
      'SELECT DISTINCT conference FROM players ORDER BY conference COLLATE NOCASE',
    ).all<{ conference: string }>();

    const schoolStatement = conference?.trim()
      ? this.db.prepare(
          'SELECT DISTINCT school FROM players WHERE conference = ? ORDER BY school COLLATE NOCASE',
        ).bind(conference.trim())
      : this.db.prepare('SELECT DISTINCT school FROM players ORDER BY school COLLATE NOCASE');
    const schoolRows = await schoolStatement.all<{ school: string }>();

    return {
      conferences: requireRows(conferenceRows).map((row) => row.conference),
      schools: requireRows(schoolRows).map((row) => row.school),
    };
  }

  async searchPlayers(query: PlayerSearchQuery): Promise<PlayerSearchResult> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (query.search?.trim()) {
      clauses.push('normalized_name LIKE ?');
      values.push(`%${normalizeIdentityPart(query.search)}%`);
    }
    if (query.conference?.trim()) {
      clauses.push('conference = ?');
      values.push(query.conference.trim());
    }
    if (query.school?.trim()) {
      clauses.push('school = ?');
      values.push(query.school.trim());
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const requestedLimit = Number.isFinite(query.limit) ? (query.limit as number) : 50;
    const requestedOffset = Number.isFinite(query.offset) ? (query.offset as number) : 0;
    const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 200);
    const offset = Math.max(Math.trunc(requestedOffset), 0);

    const countRow = await this.db.prepare(
      `SELECT COUNT(*) AS total FROM players ${where}`,
    ).bind(...values).first<{ total: number }>();

    const rows = await this.db.prepare(
      `SELECT id, name, school, conference, source FROM players ${where}
        ORDER BY name COLLATE NOCASE, school COLLATE NOCASE LIMIT ? OFFSET ?`,
    ).bind(...values, limit, offset).all<PlayerRow>();

    return { players: requireRows(rows).map(toPlayer), total: countRow?.total ?? 0 };
  }

  async persistMutation(options: PersistMutationOptions): Promise<number> {
    const statements: D1PreparedStatement[] = [];
    statements.push(
      this.db.prepare(
        `INSERT INTO draft_mutation_claims (draft_id, expected_revision, claimed_at_ms)
         VALUES (?, ?, ?)`,
      ).bind(ACTIVE_DRAFT_ID, options.expectedRevision, options.event.createdAtMs),
    );

    for (const player of options.insertedPlayers ?? []) {
      statements.push(
        this.db.prepare(
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

    const beforeById = new Map(options.before.slots.map((slot) => [slot.id, slot]));
    for (const slot of options.after.slots) {
      const before = beforeById.get(slot.id);
      if (!before || sameSlot(before, slot)) continue;
      const selectedPlayer = slot.playerId
        ? options.after.players.find((player) => player.id === slot.playerId)
        : undefined;
      statements.push(
        this.db.prepare(
          `UPDATE draft_slots
              SET status = ?, player_id = ?, selected_conference = ?, selected_at_ms = ?, selection_kind = ?
            WHERE draft_id = ? AND id = ?`,
        ).bind(
          slot.status,
          slot.playerId,
          selectedPlayer?.conference ?? null,
          slot.selectedAtMs,
          slot.selectionKind,
          ACTIVE_DRAFT_ID,
          slot.id,
        ),
      );
    }

    if (options.deleteWriteIns) {
      statements.push(this.db.prepare("DELETE FROM players WHERE source = 'WRITE_IN'"));
    }

    if (stateHeaderChanged(options.before, options.after)) {
      statements.push(
        this.db.prepare(
          `UPDATE drafts
              SET rounds = ?, clock_duration_ms = ?, lifecycle = ?, paused = ?, active_slot_id = ?,
                  active_deadline_ms = ?, paused_remaining_ms = ?, started_at_ms = ?, completed_at_ms = ?,
                  revision = revision + 1
            WHERE id = ? AND revision = ?`,
        ).bind(
          options.after.config.rounds,
          options.after.config.clockDurationMs,
          options.after.lifecycle,
          options.after.paused ? 1 : 0,
          options.after.activeSlotId,
          options.after.activeDeadlineMs,
          options.after.pausedRemainingMs,
          options.after.startedAtMs,
          options.after.completedAtMs,
          ACTIVE_DRAFT_ID,
          options.expectedRevision,
        ),
      );
    } else {
      statements.push(
        this.db.prepare(
          'UPDATE drafts SET revision = revision + 1 WHERE id = ? AND revision = ?',
        ).bind(ACTIVE_DRAFT_ID, options.expectedRevision),
      );
    }

    statements.push(
      this.db.prepare(
        `INSERT INTO draft_events
           (draft_id, event_type, actor_owner_id, slot_id, player_id, created_at_ms, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ACTIVE_DRAFT_ID,
        options.event.type,
        options.event.actorOwnerId ?? null,
        options.event.slotId ?? null,
        options.event.playerId ?? null,
        options.event.createdAtMs,
        options.event.details ? JSON.stringify(options.event.details) : null,
      ),
    );

    try {
      await this.db.batch(statements);
      return options.expectedRevision + 1;
    } catch (error) {
      const current = await this.db.prepare('SELECT revision FROM drafts WHERE id = ?')
        .bind(ACTIVE_DRAFT_ID).first<{ revision: number }>();
      if (current && current.revision !== options.expectedRevision) {
        throw new RevisionConflictError();
      }
      throw error;
    }
  }
}
