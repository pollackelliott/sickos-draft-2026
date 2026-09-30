# Server and persistence layer

The server layer uses a small Cloudflare D1-compatible persistence boundary.

- `d1-store.ts` reads/writes normalized draft data and owner identity records.
- `service.ts` applies the Stage 1 domain rules and persists transitions with revision-based optimistic concurrency.
- `api.ts` exposes public reads plus authenticated owner identity/pick/write-in routes.
- `auth.ts` resolves the short owner code to the server-authoritative owner identity.
- `initialize.ts` seeds small development/test datasets; it is not the Stage 6 production CSV importer.
- `d1-types.ts` contains the minimal D1 binding surface needed by this project so the core source does not depend on a provider SDK package.

Ordinary owner mutation routes are available as of Stage 4. Commissioner-only mutation routes remain deliberately unexposed until Stage 5.
