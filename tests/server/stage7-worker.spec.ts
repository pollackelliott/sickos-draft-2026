import { describe, expect, it } from 'vitest';
import worker from '../../src/server/worker.js';

const db = {
  prepare() {
    throw new Error('DB should not be touched by these adapter-only requests.');
  },
  batch() {
    throw new Error('DB should not be touched by these adapter-only requests.');
  },
};

function assets(body = 'asset') {
  return {
    async fetch(request: Request): Promise<Response> {
      return new Response(`${body}:${new URL(request.url).pathname}`, { status: 200 });
    },
  };
}

describe('Stage 7 Cloudflare worker adapter', () => {
  it('routes known API requests to the API handler', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/api/health'),
      { DB: db, ASSETS: assets() },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('never falls through unknown /api paths to the SPA', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/api/not-real'),
      { DB: db, ASSETS: assets('should-not-serve') },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'API route not found.' });
  });

  it('falls through non-api requests to the static asset binding', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/some/client/route'),
      { DB: db, ASSETS: assets('spa') },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('spa:/some/client/route');
  });
});
