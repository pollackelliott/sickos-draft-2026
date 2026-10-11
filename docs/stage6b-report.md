# Stage 6B — Validated Player Ingestion and Refresh

## Status

Stage 6B is COMPLETE.

This stage implements validated ingestion and safe replacement/refresh behavior for the reconciled player universe. It does not create or mutate a remote D1 database and does not load the sealed 6,322-player Stage 6A master into production.

## Schema

Migration `migrations/0002_player_import_identity.sql` adds:

- `espn_id` — durable external identity when known;
- `import_status` — retained reconciliation/source status;
- `import_generation` — internal refresh marker;
- a partial unique index on nonblank ESPN IDs.

The existing internal player ID remains the primary application identity.

## Canonical CSV validation

`src/server/player-import.ts` parses and validates the reconciled player CSV before any mutation.

Accepted canonical fields include:

- `internal_id`
- `espn_id`
- `name`
- `school`
- `conference`
- optional `year`, `position`, `height`, and `source_status`

Rules:

- Name, School, and Conference are required.
- A row without ESPN ID must supply `internal_id`.
- A row with ESPN ID may derive `espn:<id>` when `internal_id` is absent.
- Duplicate internal IDs are rejected.
- Duplicate ESPN IDs are rejected.
- Duplicate normalized Name + School pairs are rejected.
- ESPN IDs must be numeric.
- Malformed CSV, blank required fields, oversized files, and more than 10,000 players are rejected before mutation.
- Quoted fields, embedded commas, and escaped quotes are supported.

## Refresh semantics

A refresh is applied as one transactional D1 `batch()`.

Before applying, the complete incoming file and its relationship to the existing player table are validated.

The refresh then:

- updates or retains stable internal IDs for undrafted imported players;
- adds new imported players;
- removes imported players absent from the refreshed universe only when they have never been referenced;
- preserves every write-in;
- preserves every imported player referenced by a current draft slot or any historical draft event;
- ignores school/conference/metadata changes for referenced players, thereby freezing drafted/history-bearing identities;
- refuses to remap an existing ESPN ID to a different internal ID;
- refuses to silently merge an imported Name + School identity onto a different imported internal ID;
- skips an incoming row that exactly collides with an existing write-in Name + School so the write-in identity survives;
- records a `PLAYER_UNIVERSE_REFRESHED` draft event when an active draft exists.

Temporary normalized identity values are used inside the transaction so legitimate school/name changes do not create ordering-dependent uniqueness failures.

Bulk inserts use eight rows per SQL statement, staying below D1's 100-bound-parameter limit.

## Commissioner API

Stage 6B adds:

`POST /api/commissioner/player-universe`

The request body is the canonical CSV text. The existing owner-code authentication is reused and the endpoint separately requires commissioner identity server-side.

Validation failures return a 400 response. Durable identity conflicts return 409.

No file-upload UI has been added; Stage 6B establishes the safe server path first.

## Automated validation

Final code validation before the documentation seal:

- GitHub Actions run: `38157400514`
- TypeScript typecheck: PASS
- Vitest: **63/63 PASS**
- Production Vite build: PASS

The six new Stage 6B tests verify:

1. quoted CSV parsing and required durable identity;
2. pre-draft imported-pool replacement;
3. mid-draft freezing of referenced players while safely refreshing undrafted rows;
4. preservation of write-ins;
5. preservation of players referenced only by historical draft events;
6. rejection of ESPN identity remapping before mutation;
7. commissioner authorization for the refresh API.

(The mid-draft test covers both referenced-player freezing and write-in preservation in one test.)

## Stage 6A master

The sealed Stage 6A master remains:

- rows: **6,322**
- SHA-256: `b59ec2cd479ea89e3fdf85399c5a5f26f76fb25442c39f59caa2fe4e52e1adae`

It has not been applied to remote D1 in Stage 6B.

## Next bounded step

Stage 6C — real league setup — remains blocked on the final owner list and draft order.

That stage should generate owner codes, establish Elliott Pollack as commissioner, set 18 rounds and the initial 24-hour clock, initialize the real league configuration, and load the sealed player universe through the validated Stage 6B path. Production deployment remains Stage 7.
