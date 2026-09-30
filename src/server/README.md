# Server and persistence layer

Stage 2 uses a small Cloudflare D1-compatible persistence boundary.

- `d1-store.ts` reads/writes normalized draft data.
- `service.ts` applies the Stage 1 domain rules and persists transitions with revision-based optimistic concurrency.
- `read-api.ts` exposes only read-only HTTP endpoints for now.
- `initialize.ts` seeds small development/test datasets; it is not the Stage 6 production CSV importer.
- `d1-types.ts` contains the minimal D1 binding surface needed by this project so the core source does not depend on a provider SDK package.

Mutation HTTP routes are deliberately deferred until Stage 4 owner-code authorization exists.
