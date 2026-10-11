# Sickos Draft 2026

A deliberately simple mobile-first web app for the Sickos League's asynchronous 2026 fantasy college basketball draft.

## Current status

**Stage 6C — Real league setup complete.**

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
- the real 14-manager league configuration with Elliott Pollack as commissioner, 18 rounds, and a 24-hour initial clock;
- pre-start owner-name and draft-order editing that preserves stable owner IDs and private login codes;
- mobile-first Sickos styling.

The real owner list is configured. The current alphabetical order is provisional and may be changed before Start Draft. Remote D1 initialization and production deployment have intentionally not been completed yet.

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
- [`docs/stage6c-report.md`](docs/stage6c-report.md)

## Development stages

See §32 of `docs/product-spec.md`.

Stage 6A, 6B, and 6C are complete. The next stage is **Stage 7 — deployment and adversarial testing**, and it requires explicit owner approval.
