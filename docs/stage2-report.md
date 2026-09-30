# Stage 2 — Persistence and API

## Status

Stage 2 is complete.

The Stage 1 rule engine is now backed by a Cloudflare D1-compatible persistence layer and a server/service boundary. No production UI, owner-code authentication, commissioner HTTP endpoints, CSV import/export, or deployment was added.

## Persistence design

The schema lives in `migrations/0001_initial.sql` and contains:

- owners;
- players;
- one active draft configuration/state row;
- immutable draft slots;
- revision claims used for optimistic concurrency;
- a lightweight draft-event audit log.

Database constraints independently protect two critical invariants:

- one drafted slot per player;
- no owner may have two selected players from the same conference.

Write-in identity is also unique by normalized `Name + School`.

## Concurrency model

Every successful mutation consumes exactly one draft revision.

A mutation transaction first inserts `(draft_id, expected_revision)` into `draft_mutation_claims`. That pair is unique. Two requests that read the same revision cannot both claim it; D1 batch transactions roll back the losing transaction, and the service retries from fresh state.

This keeps the design small while providing the required first-valid-submission-wins behavior.

## Clock persistence

`DraftService.getCurrent(nowMs)` reconciles elapsed deadlines and persists the result. Mutating interactions reconcile first as well, so an elapsed clock becomes durable even when the user's attempted action is subsequently invalid.

A long period with no traffic therefore catches up deterministically from stored deadlines on the next interaction.

## API boundary

Stage 2 exposes read-only HTTP endpoints:

- `GET /api/health`
- `GET /api/draft`
- `GET /api/players`

Owner codes are not included in public draft responses.

Mutation operations exist behind `DraftService`, but are intentionally **not** exposed as unauthenticated HTTP routes. Stage 4 will add owner-code identity/authorization and then expose the appropriate drafting operations. This prevents Stage 2 from creating a dangerous temporary write API simply to satisfy an implementation milestone.

## Initialization

`initializeDraft()` exists for small deterministic fixtures and development setup. The real 5,000–6,000-player CSV import is deliberately deferred to Stage 6, where validation and chunked ingestion will be implemented.

No remote D1 database has been created or deployed yet. Remote resource creation belongs to the deployment stage.

## Validation

The complete Stage 1 suite plus Stage 2 persistence/API tests currently contains **31 tests**.

They cover:

- all Stage 1 draft rules;
- durable initialization/reload;
- ordinary persisted picks;
- deterministic multi-expiration catch-up;
- reconciliation persistence even when an attempted pick is invalid;
- two concurrent attempts at the same player;
- database-level duplicate-player protection;
- database-level one-conference-per-owner protection;
- write-in persistence and normalized duplicate rejection;
- reset with write-in cleanup and retained event history;
- persisted player search;
- read API behavior and non-exposure of owner codes.

All **31/31 tests passed** using the exact test files against Node's SQLite implementation, which exercises SQLite constraints and transactional rollback semantics.

The Stage 1 + Stage 2 source also passed strict TypeScript compilation with TypeScript 5.8.3.

The environment still cannot download packages from the npm registry, so the canonical installed-Vitest `npm test` command could not be executed here. The exact Vitest test files were executed through a temporary compatible test runner instead.

## Deferred to later stages

- real owner-code authentication/authorization;
- HTTP mutation routes;
- polished/read-only UI;
- commissioner UI;
- production CSV import/export;
- remote D1 resource creation;
- Cloudflare deployment configuration;
- production deployment.

## Next stage

Stage 3 — Read-only application.

Stage 3 must not begin without explicit owner approval.
