import { DomainError, type DraftState } from '../domain/index.js';
import { authenticateOwner } from './auth.js';
import { D1DraftStore } from './d1-store.js';
import { DraftService } from './service.js';
import type { D1Database } from './d1-types.js';

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
    throw error;
  }
}
