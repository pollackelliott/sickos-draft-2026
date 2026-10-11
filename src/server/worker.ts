import { handleApi, type WorkerEnv as ApiWorkerEnv } from './api.js';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface ProductionWorkerEnv extends ApiWorkerEnv {
  ASSETS: AssetsBinding;
}

export default {
  async fetch(request: Request, env: ProductionWorkerEnv): Promise<Response> {
    const apiResponse = await handleApi(request, { DB: env.DB });
    if (apiResponse) return apiResponse;

    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'API route not found.' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
