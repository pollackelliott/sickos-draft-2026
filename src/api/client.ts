import type { DraftState, Player } from '../domain/index.js';

export interface PublicDraft extends DraftState {
  revision: number;
}

export interface SessionOwner {
  id: string;
  name: string;
  draftPosition: number;
  isCommissioner: boolean;
}

export interface PlayerSearchResult {
  players: Player[];
  total: number;
}

export interface PlayerFilterOptions {
  conferences: string[];
  schools: string[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string; code?: string } & T;
  if (!response.ok) {
    throw new ApiError(body.error ?? 'Request failed.', response.status, body.code);
  }
  return body;
}

export function normalizeLeagueCode(code: string): string {
  return code.trim().toUpperCase();
}

export class DraftApiClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private authHeaders(code?: string): Record<string, string> {
    return code ? { 'x-league-code': normalizeLeagueCode(code) } : {};
  }

  async getDraft(): Promise<PublicDraft> {
    return readJson<PublicDraft>(await this.fetcher('/api/draft'));
  }

  async getMe(code: string): Promise<SessionOwner> {
    const result = await readJson<{ owner: SessionOwner }>(await this.fetcher('/api/me', {
      headers: this.authHeaders(code),
    }));
    return result.owner;
  }

  async searchPlayers(input: {
    search?: string;
    conference?: string;
    school?: string;
    limit?: number;
    offset?: number;
  }): Promise<PlayerSearchResult> {
    const params = new URLSearchParams();
    if (input.search) params.set('search', input.search);
    if (input.conference) params.set('conference', input.conference);
    if (input.school) params.set('school', input.school);
    params.set('limit', String(input.limit ?? 100));
    params.set('offset', String(input.offset ?? 0));
    return readJson<PlayerSearchResult>(await this.fetcher(`/api/players?${params.toString()}`));
  }

  async playerFilterOptions(conference?: string): Promise<PlayerFilterOptions> {
    const params = new URLSearchParams();
    if (conference) params.set('conference', conference);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return readJson<PlayerFilterOptions>(await this.fetcher(`/api/player-options${suffix}`));
  }

  async pick(code: string, slotId: string, playerId: string): Promise<PublicDraft> {
    const result = await readJson<{ draft: PublicDraft }>(await this.fetcher('/api/pick', {
      method: 'POST',
      headers: { ...this.authHeaders(code), 'content-type': 'application/json' },
      body: JSON.stringify({ slotId, playerId }),
    }));
    return result.draft;
  }

  async writeIn(code: string, input: {
    slotId: string;
    name: string;
    school: string;
    conference: string;
  }): Promise<PublicDraft> {
    const result = await readJson<{ draft: PublicDraft }>(await this.fetcher('/api/write-in', {
      method: 'POST',
      headers: { ...this.authHeaders(code), 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }));
    return result.draft;
  }
}
