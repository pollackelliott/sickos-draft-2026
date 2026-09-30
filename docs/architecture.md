# Architecture Decisions

## Stage 0 foundation

- **Frontend:** React + Vite + TypeScript
- **Styling:** plain CSS
- **Tests:** Vitest
- **Domain model:** framework-agnostic TypeScript under `src/domain/`

The draft rules remain independent from React, browser APIs, database clients, and hosting-provider SDKs.

## Stage 2 persistence decision

Cloudflare D1 is now the selected persistence target for v1.

Reasons:

- SQLite semantics fit the small relational dataset;
- the league has one tiny active draft rather than high-volume multi-tenant traffic;
- D1 supports transactional batches and foreign-key constraints;
- it keeps this app independent from the College Basketball History Vercel workload;
- no ORM is necessary for the small schema.

The schema is defined in `migrations/0001_initial.sql`.

## Mutation/concurrency model

The database stores a monotonic `revision` on the active draft. Every mutation transaction first claims the revision it read by inserting `(draft_id, expected_revision)` into a table with a unique primary key.

If two requests begin from the same revision, only one can claim it. The losing transactional batch rolls back, reloads current state, and retries or returns the relevant domain error.

This protects simultaneous drafting without adding a separate locking service.

The database also independently enforces:

- a drafted player can occupy only one slot;
- an owner can occupy only one drafted slot per conference;
- write-in/imported Name + School identity is unique after normalization.

## Clock model

Stored timestamps remain authoritative. Read and mutation service interactions reconcile elapsed deadlines before returning/acting. Reconciliation is persisted, including when the requested user action itself turns out to be invalid.

Client countdowns remain display-only.

## API layering

Stage 2 exposes read-only HTTP endpoints for draft state and player search. Mutation functions live behind `DraftService` but are not publicly routed until Stage 4 provides owner identity and authorization.

This avoids creating a knowingly unauthenticated write surface during development.

## Player loading

The mutable draft snapshot loads owners, slots, and only players currently referenced by completed slots. Candidate players are fetched individually for mutations; the 5,000–6,000-row player pool is searched directly in SQL rather than loaded into every draft-state request.

## Refresh model

The eventual application should refresh after successful actions, when the browser tab becomes active, and by low-frequency polling (roughly 30–60 seconds). Server-authoritative timestamps determine actual draft state.

## Deliberately deferred

Stage 2 does not create a remote D1 database, deploy a Worker, implement real CSV ingestion, expose mutation HTTP routes, or add authentication. Those belong to later approved stages.
