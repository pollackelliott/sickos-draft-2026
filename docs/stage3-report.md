# Stage 3 — Read-only Application

## Status

Stage 3 is complete.

The application now has a read-only, mobile-first interface using deterministic demo data. No owner login, drafting controls, mutation routes, commissioner controls, production imports, or deployment were added.

## Screens implemented

- **Draft** — current owner on the clock, countdown/deadline, next picks, outstanding owed picks, round-by-owner draft board, and recent picks.
- **Players** — name search, conference filter, school filter, sorting, and Available Only toggle. Drafted players remain visible when requested and identify their owner/slot.
- **Teams** — public owner selection, roster in draft order, and compact filled/open conference checklist.
- **Rules** — concise operational rules for snake order, conference restriction, clocks, owed picks, oldest-owed-first, and write-ins.

## Visual direction

The app intentionally borrows the existing Sickos site family:

- warm tan/gym-floor palette;
- dark header;
- orange accent;
- compact Noto Sans / monospace labels;
- minimal ornamentation;
- touch-friendly controls.

Unlike the existing narrow fantasy site, this app can expand on desktop because the draft board needs horizontal room. On phones the board scrolls horizontally, with the Round column sticky.

## Demo state

The demo deliberately includes:

- three completed selections;
- one expired `OWED PICK`;
- the same owner immediately on the clock again at the turn of the snake;
- future rounds;
- player availability/drafted states.

That makes the unusual asynchronous behavior visible before interactive drafting is enabled.

## Validation

Stage 3 adds eight pure view-model tests covering:

- board construction;
- snake slot labels in owner columns;
- owed/active display state;
- next-pick ordering;
- recent-pick chronology;
- player filtering and availability labels;
- team roster/conference checklist derivation;
- countdown formatting.

The npm registry remained unavailable in this environment, so dependency installation and the canonical Vite/Vitest browser build could not be run. The Stage 3 pure TypeScript view-model logic was validated independently, and the application source was syntax/type-checked with temporary React declarations without adding those stubs to the repository.

## Next stage

Stage 4 — Identity and drafting.

Stage 4 must not begin without explicit owner approval.
