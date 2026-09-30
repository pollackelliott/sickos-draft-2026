# Stage 1 — Domain Model and Rule Engine

## Status

Stage 1 is complete.

The draft rules now exist as framework-agnostic TypeScript under `src/domain/`. No React, browser, database, Cloudflare, or other hosting-provider APIs are imported by the domain layer.

## Implemented behavior

- deterministic snake-slot generation;
- explicit draft start;
- one active normal pick at a time;
- server-authoritative-style deadline values represented as epoch milliseconds;
- exact-time expiration reconciliation, including multiple elapsed turns after a long idle period;
- expired slots becoming `OWED` without forfeiture;
- backfills while another owner remains on the clock;
- oldest-owed-pick-first when one owner owes multiple selections;
- ability for an owner to make a later normal pick while still owing an earlier selection;
- one-player-per-conference enforcement using the roster at the moment of selection;
- duplicate-player rejection;
- pause/resume with remaining time frozen;
- future-only clock-duration changes;
- write-in duplicate detection using normalized Name + School;
- draft completion only after every slot is filled;
- completed-pick replacement without disturbing later picks or the active clock;
- clean reset back to an unstarted draft, removing write-in players.

## Automated test coverage

`tests/domain/engine.spec.ts` contains 20 Stage 1 rule tests.

The environment could not download the Vitest package from the npm registry. The domain source was therefore validated in two independent ways before commit:

1. strict TypeScript compilation of the domain layer with the installed TypeScript 5.8.3 compiler;
2. execution of the exact 20-test test file through a temporary local Vitest-compatible assertion harness.

All 20 tests passed.

Once normal package-registry access is available, `npm install && npm test` remains the canonical project command and should be run before deployment work.

## Deliberately deferred to Stage 2+

Stage 1 does not claim true simultaneous-request safety. It rejects duplicate selections at the domain level, but Stage 2 must enforce atomicity with database transactions/constraints so two concurrent requests cannot both commit.

Also deferred:

- database schema and migrations;
- API/server mutation endpoints;
- owner-code authentication/authorization;
- production UI;
- CSV import/export;
- full commissioner interface;
- deployment.

## Next stage

Stage 2 — Persistence and API.

Stage 2 must not begin without explicit owner approval.
