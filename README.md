# Sickos Draft 2026

A deliberately simple mobile-first web app for the Sickos League's asynchronous 2026 fantasy college basketball draft.

## Current status

**Stage 6B — Validated player ingestion and refresh complete.**

The project now has:

- tested snake-draft, timing, owed-pick, and conference rules;
- D1-compatible durable persistence and concurrency protection;
- Draft, Players, Teams, and Rules screens;
- short owner-code identity remembered on the owner's device;
- server-authorized normal picks, owed-pick backfills, player confirmation, and write-ins;
- commissioner-only controls for start, pause/resume, manual skip, proxy picks, corrections/removals, future clock changes, reset, and CSV export;
- a sealed 6,322-player 2026–27 reconciled universe from ESPN + Bart Torvik inputs;
- validated CSV parsing with durable internal/ESPN identity;
- transactional commissioner-only player-universe refresh that freezes referenced players and preserves write-ins;
- mobile-first Sickos styling.

The real owner list/draft order, actual D1 initialization, and production deployment have intentionally not been completed yet.

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

## Owner access

Owners use short human-readable league codes. The code is remembered in browser local storage and is sent only when identity or drafting actions require it. Public draft responses never expose owner codes.

The commissioner uses the same owner-code flow. Commissioner routes additionally require the authenticated owner to carry the commissioner flag on the server.

## Demo fixtures

Small deterministic development fixtures remain in the repository for tests and design validation. The application UI targets the real API contract rather than using demo state as its runtime source.

## Durable stage reports

- [`docs/stage1-report.md`](docs/stage1-report.md)
- [`docs/stage2-report.md`](docs/stage2-report.md)
- [`docs/stage3-report.md`](docs/stage3-report.md)
- [`docs/stage4-report.md`](docs/stage4-report.md)
- [`docs/stage5-report.md`](docs/stage5-report.md)
- [`docs/stage6a-report.md`](docs/stage6a-report.md)
- [`docs/stage6b-report.md`](docs/stage6b-report.md)

## Development stages

See §32 of `docs/product-spec.md`.

Stage 6A and 6B are complete. The next bounded step is **Stage 6C — real league setup** once the final owner list and draft order are available. Production deployment remains Stage 7.
