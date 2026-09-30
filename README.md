# Sickos Draft 2026

A deliberately simple mobile-first web app for the Sickos League's asynchronous 2026 fantasy college basketball draft.

## Current status

**Stage 2 — Persistence and API complete.**

The draft rule engine is backed by a D1-compatible SQLite persistence layer with transactional revision protection, database constraints, durable clock reconciliation, an internal mutation service, and read-only draft/player HTTP endpoints.

The visible application is still only the foundation shell. Owner-code login, actual drafting controls, commissioner screens, real league imports, and deployment have intentionally not been built yet.

The controlling product contract is [`docs/product-spec.md`](docs/product-spec.md). Future Codex/agent work must also follow [`AGENTS.md`](AGENTS.md).

## Foundation stack

- React
- Vite
- TypeScript
- Vitest
- plain CSS
- Cloudflare D1-compatible SQLite persistence

The draft-domain layer under `src/domain/` remains independent of React and the persistence provider. Persistence/server code lives under `src/server/`.

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

## Durable stage reports

- [`docs/stage1-report.md`](docs/stage1-report.md)
- [`docs/stage2-report.md`](docs/stage2-report.md)

## Development stages

See §32 of `docs/product-spec.md`.

The next stage is **Stage 3 — Read-only application**, and it must not begin without explicit owner approval.
