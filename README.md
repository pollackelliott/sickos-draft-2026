# Sickos Draft 2026

A deliberately simple mobile-first web app for the Sickos League's asynchronous 2026 fantasy college basketball draft.

## Current status

**Stage 1 — Domain model and rule engine complete.**

The core draft rules now exist as framework-agnostic TypeScript with 20 rule tests. Database persistence, API endpoints, authentication, production UI, commissioner tooling, and deployment are intentionally not implemented yet.

The controlling product contract is [`docs/product-spec.md`](docs/product-spec.md). Future Codex/agent work must also follow [`AGENTS.md`](AGENTS.md).

## Foundation stack

- React
- Vite
- TypeScript
- Vitest
- plain CSS

The draft-domain layer will live under `src/domain/` and remain independent of React and the eventual hosting/database provider.

Cloudflare Workers + D1 is the leading deployment candidate, but persistence and deployment decisions are intentionally deferred until their implementation stages.

## Local development

Once dependencies are installed:

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run typecheck
npm test
npm run build
```

## Demo fixtures

Small deterministic development files live in:

- `data/demo/owners.csv`
- `data/demo/players.csv`

They are fake test data and are not intended to model the real league roster.

## Development stages

See §32 of `docs/product-spec.md`.

Stage 1 validation details are recorded in [`docs/stage1-report.md`](docs/stage1-report.md).

The next stage is **Stage 2 — Persistence and API**, and it must not begin without explicit owner approval.
