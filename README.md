# Sickos Draft 2026

A deliberately simple mobile-first web app for the Sickos League's asynchronous 2026 fantasy college basketball draft.

## Current status

**Stage 3 — Read-only application complete.**

The project now has:

- tested draft rules;
- D1-compatible durable persistence and concurrency protection;
- read-only Draft, Players, Teams, and Rules screens using deterministic demo data;
- a mobile-first Sickos visual style with a horizontally scrollable draft board.

Owner-code login, actual drafting controls, commissioner screens, real league imports, and production deployment have intentionally not been built yet.

The controlling product contract is [`docs/product-spec.md`](docs/product-spec.md). Future Codex/agent work must also follow [`AGENTS.md`](AGENTS.md).

## Foundation stack

- React
- Vite
- TypeScript
- Vitest
- plain CSS
- Cloudflare D1-compatible SQLite persistence

The draft-domain layer under `src/domain/` remains independent of React and the persistence provider. Persistence/server code lives under `src/server/`. Read-only browser presentation helpers live under `src/ui/`.

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

The Stage 3 browser demo uses equivalent deterministic in-code fixtures so it can exercise draft states without requiring a deployed database.

## Durable stage reports

- [`docs/stage1-report.md`](docs/stage1-report.md)
- [`docs/stage2-report.md`](docs/stage2-report.md)
- [`docs/stage3-report.md`](docs/stage3-report.md)

## Development stages

See §32 of `docs/product-spec.md`.

The next stage is **Stage 4 — Identity and drafting**, and it must not begin without explicit owner approval.
