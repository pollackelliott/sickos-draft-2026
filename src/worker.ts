import { handleReadApi, type WorkerEnv } from './server/read-api.js';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const response = await handleReadApi(request, env);
      return response ?? new Response('Not found', { status: 404 });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
  },
};
