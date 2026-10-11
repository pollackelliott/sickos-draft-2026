# Stage 7 — Deployment and Adversarial Testing Checkpoint

## Status

**DEPLOYMENT-READY — REMOTE CLOUDFLARE ROLLOUT PENDING**

Repository-owned Stage 7 deployment work is complete through the remote-infrastructure boundary.

This ChatGPT session has authenticated GitHub access but no authenticated Cloudflare/D1 connector. No remote D1 database, Worker deployment, or production URL has been created from this session. Stage 7 must not be called COMPLETE until the remote runbook succeeds and production smoke checks pass.

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

The real database UUID is never committed.

## Private deployment inputs

The production bootstrap consumes the Stage 6C private owner-code CSV at deploy time.

`scripts/generate-bootstrap-sql.mjs` reads:

- `data/stage6c/league-owners.csv`;
- `data/stage6c/league-settings.json`;
- the private owner-code CSV supplied by path.

It generates gitignored `.wrangler/bootstrap.sql` containing the real owner codes and all 252 initial FUTURE snake slots.

A non-secret fixture proves the same generation path in automated tests.

## Player upload guard

`scripts/upload-player-universe.mjs` uploads the reconciled player universe through the commissioner-only Stage 6B endpoint.

For initial production upload it enforces the sealed Stage 6A SHA-256:

`b59ec2cd479ea89e3fdf85399c5a5f26f76fb25442c39f59caa2fe4e52e1adae`

A different file requires explicit opt-out via `SICKOS_ALLOW_UNSEALED_PLAYER_UPLOAD=1`, intended only for a later reviewed refresh.

## Production smoke script

`scripts/smoke-production.mjs` is deliberately non-destructive. It verifies:

- health;
- NOT_STARTED lifecycle;
- 14 managers;
- 252 slots;
- no public owner-code leakage;
- exact 6,322-player population;
- commissioner identity;
- ordinary-owner identity;
- ordinary-owner denial from commissioner setup;
- JSON 404 behavior for unknown API paths.

It never starts the draft or submits a pick.

## Automated adversarial coverage

Stage 7 adds tests for:

- Worker/API/static-assets routing separation;
- unknown API paths not leaking into the SPA;
- real bootstrap SQL generation using non-secret codes;
- 14-owner / 252-slot bootstrap integrity;
- snake direction across the round 1 → round 2 boundary;
- 18-round and 24-hour settings.

All prior domain, persistence, authentication, commissioner, refresh, and setup tests remain active.

CI now additionally performs:

1. production-dependency audit (`npm audit --omit=dev --audit-level=high`);
2. TypeScript typecheck;
3. full Vitest suite;
4. Vite production build;
5. generated Wrangler configuration;
6. Wrangler `deploy --dry-run` bundle validation.

## Cloudflare deployment model

The current Cloudflare Workers platform supports serving a React SPA as Worker static assets while selectively running the Worker first for `/api/*`. D1 migrations remain Wrangler-managed.

The exact operator procedure is durably recorded in `docs/deployment-runbook.md`.

## Remote work still required

Stage 7 remains incomplete until an authenticated Cloudflare operator performs:

1. create D1 database `sickos-draft-2026`;
2. record its UUID as `SICKOS_D1_DATABASE_ID`;
3. apply migrations;
4. generate and apply private bootstrap SQL;
5. deploy Worker + static assets;
6. upload the sealed 6,322-player universe;
7. run production smoke checks;
8. record production URL, database UUID, deployed Git SHA, and PASS proof.

No remote production state has been mutated at this checkpoint.

## Gate

Do not begin Stage 8 until Stage 7 remote proof is complete.
