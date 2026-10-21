import { DomainError, type DraftState } from '../domain/index.js';
import { authenticateOwner } from './auth.js';
import { D1DraftStore } from './d1-store.js';
import { DraftService } from './service.js';
import {
  parsePlayerUniverseCsv,
  planPlayerUniverseReconciliation,
  PlayerUniverseImportError,
  refreshPlayerUniverseFromCsv,
} from './player-import.js';
import { updatePreDraftOwners } from './league-setup.js';
import type { D1Database } from './d1-types.js';
import type { OwnerRecord } from './store-types.js';

export interface WorkerEnv {
  DB: D1Database;
}

interface PickBody {
  slotId?: unknown;
  playerId?: unknown;
}

interface WriteInBody {
  slotId?: unknown;
  name?: unknown;
  school?: unknown;
  conference?: unknown;
}

function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { ...init, headers });
}

function publicState(state: DraftState, revision: number) {
  return {
    revision,
    lifecycle: state.lifecycle,
    paused: state.paused,
    config: state.config,
    activeSlotId: state.activeSlotId,
    activeDeadlineMs: state.activeDeadlineMs,
    pausedRemainingMs: state.pausedRemainingMs,
    startedAtMs: state.startedAtMs,
    completedAtMs: state.completedAtMs,
    owners: state.owners,
    players: state.players,
    slots: state.slots,
  };
}

function publicOwner(owner: { id: string; name: string; draftPosition: number; isCommissioner: boolean }) {
  return {
    id: owner.id,
    name: owner.name,
    draftPosition: owner.draftPosition,
    isCommissioner: owner.isCommissioner,
  };
}

async function bodyJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

async function requireCommissioner(
  store: D1DraftStore,
  request: Request,
): Promise<{ owner: OwnerRecord | null; response: Response | null }> {
  const owner = await authenticateOwner(store, request);
  if (!owner) {
    return { owner: null, response: json({ error: 'Enter a valid commissioner league code.' }, { status: 401 }) };
  }
  if (!owner.isCommissioner) {
    return { owner: null, response: json({ error: 'Commissioner access required.' }, { status: 403 }) };
  }
  return { owner, response: null };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function draftCsv(state: DraftState): string {
  const owners = new Map(state.owners.map((owner) => [owner.id, owner]));
  const players = new Map(state.players.map((player) => [player.id, player]));
  const rows = [['Overall Pick', 'Round', 'Player', 'User', 'Team', 'Conference'].join(',')];

  for (const slot of [...state.slots].sort((a, b) => a.overallPick - b.overallPick)) {
    if (slot.status !== 'COMPLETE' || !slot.playerId) continue;
    const owner = owners.get(slot.ownerId);
    const player = players.get(slot.playerId);
    if (!owner || !player) continue;
    rows.push([
      slot.overallPick,
      slot.round,
      player.name,
      owner.name,
      player.school,
      player.conference,
    ].map(csvCell).join(','));
  }

  return `${rows.join('\r\n')}\r\n`;
}

function domainErrorResponse(error: DomainError): Response {
  const status = error.code === 'PLAYER_NOT_FOUND' ? 404 : 409;
  return json({ error: error.message, code: error.code }, { status });
}

export async function handleApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;

  const store = new D1DraftStore(env.DB);
  const service = new DraftService(store);

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ ok: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/draft') {
      const snapshot = await service.getCurrent(Date.now());
      return json(publicState(snapshot.state, snapshot.revision));
    }

    if (request.method === 'GET' && url.pathname === '/api/players') {
      const result = await store.searchPlayers({
        search: url.searchParams.get('search') ?? undefined,
        conference: url.searchParams.get('conference') ?? undefined,
        school: url.searchParams.get('school') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? 100),
        offset: Number(url.searchParams.get('offset') ?? 0),
      });
      return json(result);
    }

    if (request.method === 'GET' && url.pathname === '/api/player-options') {
      return json(await store.playerFilterOptions(url.searchParams.get('conference') ?? undefined));
    }

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const owner = await authenticateOwner(store, request);
      if (!owner) return json({ error: 'Invalid league code.' }, { status: 401 });
      return json({ owner: publicOwner(owner) });
    }

    if (url.pathname.startsWith('/api/commissioner/')) {
      const auth = await requireCommissioner(store, request);
      if (auth.response) return auth.response;
      const commissioner = auth.owner!;

      if (request.method === 'POST' && url.pathname === '/api/commissioner/start') {
        const snapshot = await service.start(Date.now(), commissioner.id);
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/pause') {
        const snapshot = await service.pause(Date.now(), commissioner.id);
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/resume') {
        const snapshot = await service.resume(Date.now(), commissioner.id);
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/skip') {
        const body = await bodyJson<{ slotId?: unknown }>(request);
        const slotId = requiredString(body?.slotId);
        if (!slotId) return json({ error: 'The active draft slot is required.' }, { status: 400 });
        const snapshot = await service.skip({ slotId, nowMs: Date.now(), actorOwnerId: commissioner.id });
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/clock') {
        const body = await bodyJson<{ clockDurationMs?: unknown }>(request);
        const clockDurationMs = requiredPositiveNumber(body?.clockDurationMs);
        if (!clockDurationMs) return json({ error: 'Clock duration must be greater than zero.' }, { status: 400 });
        const snapshot = await service.changeClock(clockDurationMs, Date.now(), commissioner.id);
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/proxy-pick') {
        const body = await bodyJson<{ ownerId?: unknown; slotId?: unknown; playerId?: unknown }>(request);
        const ownerId = requiredString(body?.ownerId);
        const slotId = requiredString(body?.slotId);
        const playerId = requiredString(body?.playerId);
        if (!ownerId || !slotId || !playerId) {
          return json({ error: 'Owner, draft slot, and player are required.' }, { status: 400 });
        }
        const snapshot = await service.pick({
          ownerId,
          slotId,
          playerId,
          nowMs: Date.now(),
          actorOwnerId: commissioner.id,
        });
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/correct-pick') {
        const body = await bodyJson<{ slotId?: unknown; playerId?: unknown }>(request);
        const slotId = requiredString(body?.slotId);
        const playerId = requiredString(body?.playerId);
        if (!slotId || !playerId) return json({ error: 'Draft slot and replacement player are required.' }, { status: 400 });
        const snapshot = await service.correctPick({
          slotId,
          playerId,
          nowMs: Date.now(),
          actorOwnerId: commissioner.id,
        });
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/remove-pick') {
        const body = await bodyJson<{ slotId?: unknown }>(request);
        const slotId = requiredString(body?.slotId);
        if (!slotId) return json({ error: 'Draft slot is required.' }, { status: 400 });
        const snapshot = await service.removePick({ slotId, nowMs: Date.now(), actorOwnerId: commissioner.id });
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/prestart-owners') {
        const body = await bodyJson<{ owners?: unknown }>(request);
        if (!Array.isArray(body?.owners)) {
          return json({ error: 'owners must be an array.' }, { status: 400 });
        }
        const owners = body.owners.map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const row = entry as Record<string, unknown>;
          const id = requiredString(row.id);
          const name = requiredString(row.name);
          const draftPosition = typeof row.draftPosition === 'number' && Number.isInteger(row.draftPosition)
            ? row.draftPosition
            : null;
          return id && name && draftPosition ? { id, name, draftPosition } : null;
        });
        if (owners.some((owner) => !owner)) {
          return json({ error: 'Every owner needs id, name, and integer draftPosition.' }, { status: 400 });
        }
        const summary = await updatePreDraftOwners(env.DB, owners as Array<{ id: string; name: string; draftPosition: number }>, {
          nowMs: Date.now(),
          actorOwnerId: commissioner.id,
        });
        return json({ setup: summary });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/player-universe/plan') {
        const incoming = parsePlayerUniverseCsv(await request.text());
        const plan = await planPlayerUniverseReconciliation(env.DB, incoming);
        return json({ plan });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/player-universe') {
        const summary = await refreshPlayerUniverseFromCsv(env.DB, await request.text(), {
          nowMs: Date.now(),
          actorOwnerId: commissioner.id,
        });
        return json({ refresh: summary });
      }

      if (request.method === 'POST' && url.pathname === '/api/commissioner/reset') {
        const body = await bodyJson<{ confirmation?: unknown }>(request);
        if (body?.confirmation !== 'RESET') {
          return json({ error: 'Type RESET to confirm a full draft reset.' }, { status: 400 });
        }
        const snapshot = await service.reset(Date.now(), commissioner.id);
        return json({ draft: publicState(snapshot.state, snapshot.revision) });
      }

      if (request.method === 'GET' && url.pathname === '/api/commissioner/export') {
        const snapshot = await service.getCurrent(Date.now());
        return new Response(draftCsv(snapshot.state), {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="sickos-draft-2026.csv"',
          },
        });
      }

      return null;
    }

    if (request.method === 'POST' && url.pathname === '/api/pick') {
      const owner = await authenticateOwner(store, request);
      if (!owner) return json({ error: 'Enter a valid league code to draft.' }, { status: 401 });
      const body = await bodyJson<PickBody>(request);
      const slotId = requiredString(body?.slotId);
      const playerId = requiredString(body?.playerId);
      if (!slotId || !playerId) return json({ error: 'slotId and playerId are required.' }, { status: 400 });

      const snapshot = await service.pick({ ownerId: owner.id, slotId, playerId, nowMs: Date.now() });
      return json({ draft: publicState(snapshot.state, snapshot.revision) });
    }

    if (request.method === 'POST' && url.pathname === '/api/write-in') {
      const owner = await authenticateOwner(store, request);
      if (!owner) return json({ error: 'Enter a valid league code to draft.' }, { status: 401 });
      const body = await bodyJson<WriteInBody>(request);
      const slotId = requiredString(body?.slotId);
      const name = requiredString(body?.name);
      const school = requiredString(body?.school);
      const conference = requiredString(body?.conference);
      if (!slotId || !name || !school || !conference) {
        return json({ error: 'Player name, school, conference, and draft slot are required.' }, { status: 400 });
      }

      const playerId = `write-${crypto.randomUUID()}`;
      const snapshot = await service.writeIn({
        ownerId: owner.id,
        slotId,
        nowMs: Date.now(),
        player: { id: playerId, name, school, conference },
      });
      return json({ draft: publicState(snapshot.state, snapshot.revision), playerId });
    }

    return null;
  } catch (error) {
    if (error instanceof DomainError) return domainErrorResponse(error);
    if (error instanceof PlayerUniverseImportError) {
      return json(
        { error: error.message, code: error.code },
        { status: error.code === 'IDENTITY_CONFLICT' ? 409 : 400 },
      );
    }
    throw error;
  }
}
