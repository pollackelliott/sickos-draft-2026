import { describe, expect, it } from 'vitest';
import { DraftApiClient } from '../../src/api/client.js';

describe('DraftApiClient browser fetch binding', () => {
  it('binds the default fetch implementation to globalThis', async () => {
    const originalFetch = globalThis.fetch;
    const receiverAwareFetch = function (this: unknown): Promise<Response> {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response(JSON.stringify({ lifecycle: 'NOT_STARTED' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    } as typeof fetch;

    globalThis.fetch = receiverAwareFetch;
    try {
      const client = new DraftApiClient();
      const draft = await client.getDraft();
      expect(draft.lifecycle).toBe('NOT_STARTED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
