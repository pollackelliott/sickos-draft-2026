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

## Stage 3 read-only UI decision

The read-only browser application keeps navigation dependency-free: four React tabs (`Draft`, `Players`, `Teams`, `Rules`) are controlled with local UI state rather than adding a router before one is needed.

Pure presentation derivation lives in `src/ui/view-model.ts`. Board layout, recent picks, player availability labels, team rosters, conference checklists, and countdown formatting are therefore testable without React.

`src/ui/demo-data.ts` builds a deterministic but live-looking draft snapshot from the Stage 1 domain engine. It intentionally includes an owed pick at the end of Round 1 and the same owner on the clock at the start of Round 2, making the asynchronous/backfill model visible before Stage 4 adds drafting.

The visual language follows the existing Sickos fantasy site: tan floor-inspired background, dark header, orange accent, compact typography, and minimal ornamentation. The draft app departs from the existing narrow layout on larger screens because the board benefits from desktop width; on phones, the board remains horizontally scrollable with a sticky Round column.

## Stage 4 identity and drafting decision

Owner identity deliberately remains simple: a short human-readable code is stored with each owner and supplied in the `x-league-code` header for authenticated requests. Codes are normalized case-insensitively and the database prevents case-only duplicates. The browser remembers the normalized code in local storage.

The server always resolves the owner from that code and ignores any attempted browser-supplied owner identity. Public API responses never expose owner codes. This is intentionally lightweight authentication for a private, low-stakes league with no sensitive information.

The Stage 4 mutation surface is intentionally narrow: ordinary owner picks and write-ins only. All commissioner powers remain unrouted until Stage 5.

The Players screen searches the player table through server queries and retrieves conference/school filter options separately. It does not load the complete 5,000–6,000-player pool into draft state.


## Stage 5 commissioner decision

Commissioner access reuses the normal owner-code identity model. The server resolves the owner from the code and separately requires `isCommissioner`; hiding the Commissioner tab in React is convenience only and is never the authorization boundary.

Commissioner mutations continue through the existing `DraftService`, revision-claim transaction model, and Stage 1 domain rules. There is no parallel “admin database edit” path.

The Stage 5 operational semantics are:

- starting the draft activates the first scheduled slot with a full configured clock;
- pause/resume preserves the remaining time on the current clock;
- clock-duration changes affect future clocks only;
- manually skipping the current slot converts that exact slot to `OWED` and starts the next scheduled slot with a full clock;
- proxy picks identify the target owner and slot explicitly, then obey the same player, conference, slot, and oldest-owed rules as ordinary picks;
- replacing a completed pick leaves unrelated later slots and the current clock unchanged while re-validating player and conference uniqueness;
- removing a completed pick converts that immutable original slot to `OWED`; unrelated later selections stay in place;
- a removal from an otherwise complete draft reopens the lifecycle as `IN_PROGRESS` until the owed slot is filled;
- reset restores the original unstarted slot schedule, clears selections/pause state, and removes write-in players;
- CSV export is ordered by immutable draft slot, so backfills retain their original round and overall-pick positions.

The Commissioner screen is deliberately a compact operational page rather than a generalized admin dashboard. Destructive or unusual actions require explicit confirmation in the UI, and full reset additionally requires typing `RESET`.

Stage 5 also corrected the Node TypeScript project include set so the repository's canonical `npm run typecheck` and `npm run build` commands can validate the source files imported by the test suite on a clean machine.


## Stage 6B player-universe ingestion and refresh

The reconciled player universe now has a dedicated server-side ingestion path rather than being loaded through draft initialization.

Durable identity uses the application's immutable internal player ID plus ESPN ID when known. `Name + School` remains a human-facing/reconciliation identity and a database uniqueness guard, but it is not allowed to silently replace a different durable identity.

Player-universe refresh is intentionally replacement-oriented for unreferenced imported players:

- the complete incoming CSV is validated before mutation;
- all writes execute in one transactional D1 batch;
- unreferenced imported players may be added, updated, or removed;
- write-ins are always preserved;
- any imported player referenced by a current slot or historical draft event is frozen and preserved, even if absent or changed in the refreshed file;
- ESPN-ID remaps and imported identity collisions fail closed rather than guessing;
- exact incoming Name + School collisions with an existing write-in preserve the write-in and skip the incoming duplicate.

A refresh uses a temporary normalized-identity namespace inside the same transaction before applying the new rows. This permits legitimate name/school changes without making correctness depend on row ordering. Bulk inserts are grouped at eight rows per statement so the canonical 12 bound values per row remain below D1's per-query bound-parameter ceiling.

The commissioner-only HTTP route accepts canonical CSV directly. A browser upload surface is deliberately deferred; Stage 6B establishes and tests the safe server operation first.


## Stage 6C real-league setup

The real league uses stable internal owner IDs that are independent from display name, login code, and draft position. This allows the commissioner to correct a participant's display name or replace the provisional order without changing owner identity.

The 14-manager provisional league configuration is compiled in `src/server/real-league-config.ts` and mirrored as non-secret data under `data/stage6c/`. Login codes are deliberately excluded from source control and are supplied privately at deployment.

Pre-start owner/order editing is transactional and is allowed only while the draft lifecycle is `NOT_STARTED`. The update preserves the exact owner-ID set, codes, and commissioner flags, temporarily moves positions outside the unique 1..N range, applies the new names/order, then rewrites owner assignment on the existing immutable 252 snake-slot IDs. Historical slot IDs therefore remain stable.

Once Start Draft changes the lifecycle, this setup path closes permanently for that active draft.


## Stage 7 Cloudflare deployment adapter

Production uses a single Cloudflare Worker plus Workers Static Assets. The Worker entrypoint delegates `/api/*` traffic to the established API layer and serves the React/Vite `dist/` output through the static-assets binding. Unknown API paths return JSON 404 and cannot fall through to the SPA.

Wrangler configuration is generated into a gitignored root file from environment-supplied D1 identity. The repository therefore contains deployment structure but never the production D1 UUID or Cloudflare credentials.

Real-league bootstrap is also generated outside Git. Stable owner/name/order settings come from the non-secret Stage 6C repository data, while the private owner-code CSV is supplied only at deploy time. The resulting SQL is gitignored and intentionally fails rather than overwriting an already initialized database.

Initial player loading goes through the Stage 6B commissioner refresh endpoint and requires the sealed Stage 6A file hash by default.

CI validates the deployable Worker bundle with Wrangler dry-run in addition to the existing typecheck, tests, and Vite build. Remote deployment proof remains a separate Stage 7 gate because it requires an authenticated Cloudflare account.
