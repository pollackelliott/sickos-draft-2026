# Stage 7 — Deployment and Adversarial Testing Checkpoint

## Status

**COMPLETE — REMOTE CLOUDFLARE ROLLOUT AND PRODUCTION SMOKE PASS**

Stage 7 is complete.

The production system has been deployed to Cloudflare Workers + Static Assets with a remote D1 database, the sealed 6,322-player universe has been loaded, and the non-destructive production smoke suite passed in full.

## Production proof

- Production URL: `https://sickos-draft-2026.pollackelliott.workers.dev`
- Cloudflare D1 database: `sickos-draft-2026`
- D1 database UUID: `a2cbe20c-faef-4ec2-9972-a12c898c2007`
- Deployed Git SHA: `90922ff54e74db592aff9cf164208319ffff1b57`
- Cloudflare Worker version ID: `2a550ea8-38d5-487f-9f46-06eab0df14cd`
- Production lifecycle after smoke: `NOT_STARTED`
- Managers: 14
- Draft slots: 252
- Future slots: 252
- Draft rounds: 18
- Initial clock: 86,400,000 ms / 24 hours
- Commissioner rows: 1
- Public owner-code leakage: none observed

## Production adapter

Stage 7 adds `src/server/worker.ts`, a Cloudflare Worker entrypoint that:

- routes known `/api/*` requests into the existing server-authoritative API layer;
- returns JSON 404 for unknown API paths rather than falling through to the SPA;
- serves all non-API traffic from the Cloudflare static-assets binding.

Deployment configuration uses Workers Static Assets with SPA fallback and `/api/*` worker-first routing.

## Deployment configuration

`scripts/write-wrangler-config.mjs` generates a gitignored `.wrangler.deploy.jsonc` from:

- fixed Worker name `sickos-draft-2026`;
- `src/server/worker.ts`;
- production Vite output under `dist/`;
- D1 binding `DB`;
- D1 name `sickos-draft-2026`;
- environment-supplied `SICKOS_D1_DATABASE_ID`;
- repository migrations under `migrations/`.

The database UUID remains an operator-supplied deployment value rather than a committed runtime config value.

## Migrations

The remote D1 database successfully applied:

- `0001_initial.sql`
- `0002_player_import_identity.sql`

Both migrations completed successfully before bootstrap.

## Private deployment bootstrap

The production bootstrap consumed the private Stage 6C owner-code CSV outside the repository.

`scripts/generate-bootstrap-sql.mjs` generated gitignored `.wrangler/bootstrap.sql` for:

- 14 owners;
- one commissioner;
- 18 rounds;
- 252 FUTURE snake slots;
- 24-hour initial clock;
- `NOT_STARTED` lifecycle.

The first remote bootstrap attempt was rejected safely by D1 because the generated SQL contained explicit `BEGIN TRANSACTION` / `COMMIT` statements. Wrangler reported rollback-to-original-state semantics. A read-only verification immediately afterward confirmed:

- drafts: 0
- owners: 0
- slots: 0

The permanent Stage 7 hotfix removed explicit SQL transaction-control statements from the generator and added regression assertions forbidding `BEGIN`, `COMMIT`, and `SAVEPOINT` in generated bootstrap SQL.

Hotfix commit:

`90922ff54e74db592aff9cf164208319ffff1b57`

The hotfix passed the full Stage 7 validation workflow before being sealed to `main`.

The regenerated production bootstrap then succeeded:

- 268 queries executed;
- 253 rows read;
- 1,584 rows written.

A read-only production verification confirmed:

- lifecycle: `NOT_STARTED`
- rounds: 18
- clock_duration_ms: 86,400,000
- owners: 14
- commissioners: 1
- slots: 252
- future_slots: 252

## Player universe

The initial production player upload used the sealed Stage 6A master with SHA-256:

`b59ec2cd479ea89e3fdf85399c5a5f26f76fb25442c39f59caa2fe4e52e1adae`

Production upload result:

- incomingRows: 6,322
- appliedRows: 6,322
- inserted: 6,322
- updated: 0
- unchanged: 0
- removed: 0
- referencedPlayersProtected: 0
- referencedChangesIgnored: 0
- writeInsPreserved: 0
- writeInMatchesSkipped: 0
- finalPlayerCount: 6,322

## Production smoke proof

The repository-owned non-destructive production smoke suite passed every check:

- PASS: health
- PASS: public draft shape/no code leakage
- PASS: player universe present
- PASS: commissioner identity
- PASS: ordinary identity
- PASS: non-commissioner blocked
- PASS: unknown API is JSON 404

The smoke suite did not start the draft or submit a pick.

## Automated adversarial coverage

Stage 7 includes tests for:

- Worker/API/static-assets routing separation;
- unknown API paths not leaking into the SPA;
- real bootstrap SQL generation using non-secret codes;
- no explicit D1-incompatible bootstrap transaction-control statements;
- 14-owner / 252-slot bootstrap integrity;
- snake direction across the round 1 → round 2 boundary;
- 18-round and 24-hour settings.

All prior domain, persistence, authentication, commissioner, refresh, and setup tests remain active.

CI additionally performs:

1. production-dependency audit (`npm audit --omit=dev --audit-level=high`);
2. TypeScript typecheck;
3. full Vitest suite;
4. Vite production build;
5. generated Wrangler configuration;
6. Wrangler `deploy --dry-run` bundle validation.

## Current production safety state

At Stage 7 completion:

- the draft is still `NOT_STARTED`;
- no real picks have been made;
- all 252 slots remain FUTURE;
- the public endpoint exposes no owner codes;
- the exact 6,322-player sealed universe is live.

The provisional alphabetical draft order and Jake's surname may still be changed through the existing pre-start owner setup path without changing stable owner identities or owner codes.

## Gate

**Stage 7 is COMPLETE. Stage 8 may begin.**

Do not start the real draft during Stage 8 fake-mini-draft testing.
