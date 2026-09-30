import type { DraftState } from '../domain/index.js';
import { D1DraftStore } from './d1-store.js';
import { DraftService } from './service.js';
import type { D1Database } from './d1-types.js';

export interface WorkerEnv {
  DB: D1Database;
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
    startedAtMs: state.startedAtMs,
    completedAtMs: state.completedAtMs,
    owners: state.owners,
    players: state.players,
    slots: state.slots,
  };
}

export async function handleReadApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return null;

  if (url.pathname === '/api/health') {
    return json({ ok: true });
  }

  const store = new D1DraftStore(env.DB);
  if (url.pathname === '/api/draft') {
    const snapshot = await new DraftService(store).getCurrent(Date.now());
    return json(publicState(snapshot.state, snapshot.revision));
  }

  if (url.pathname === '/api/players') {
    const result = await store.searchPlayers({
      search: url.searchParams.get('search') ?? undefined,
      conference: url.searchParams.get('conference') ?? undefined,
      school: url.searchParams.get('school') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? 50),
      offset: Number(url.searchParams.get('offset') ?? 0),
    });
    return json(result);
  }

  return null;
}
