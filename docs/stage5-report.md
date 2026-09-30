# Stage 5 — Commissioner Tools

## Status

Stage 5 is complete.

The commissioner now uses the same owner-code identity as any other owner, with commissioner authority checked server-side from the stored `isCommissioner` flag. Ordinary owners and spectators cannot invoke commissioner routes.

## Commissioner controls

The commissioner-only screen provides:

- Start Draft;
- pause and resume while preserving remaining active-clock time;
- manual skip of the current active slot;
- future clock-duration changes;
- proxy picks for owners who are currently on the clock or owe a pick;
- replacement of completed selections;
- removal of completed selections;
- current draft CSV export;
- full reset with typed `RESET` plus destructive confirmation.

The page remains intentionally compact and mobile-first rather than becoming a generalized admin dashboard.

## Correction and skip semantics

A manual skip converts the exact current `ON_CLOCK` slot to `OWED`, then starts the next scheduled slot with a full clock. The request includes the expected active slot ID so a stale commissioner screen cannot accidentally skip a newly advanced slot.

Replacing a completed pick changes only that immutable slot. Player uniqueness and one-player-per-conference are revalidated, while later completed picks and the live clock remain untouched.

Removing a completed pick converts that original slot to `OWED` and clears its player/selection metadata. Later picks do not move. If the draft had otherwise been complete, removal reopens it as `IN_PROGRESS` until the owed slot is filled.

## Proxy picks

Proxy picks identify the target owner and actionable slot, but the commissioner does not bypass league rules. The same server-side slot, oldest-owed, player uniqueness, and conference rules apply as for an owner submitting directly.

Operational events record the commissioner as the actor when the commissioner makes or repairs a selection for another owner.

## CSV export

The commissioner may download a CSV at any time with:

`Overall Pick,Round,Player,User,Team,Conference`

Rows are ordered by original draft slot. Backfills therefore retain their original round and overall pick rather than being reordered by submission time.

## Validation

Clean GitHub Actions validation on run `36763760254` passed:

- `npm run typecheck`: PASS
- `npm test`: **57/57 tests PASS**
- `npm run build`: PASS

The 57-test suite includes all prior Stage 1–4 coverage plus five Stage 5 commissioner API tests covering:

- commissioner-only authorization;
- start, pause, resume, and future-only clock changes;
- manual skip to owed status and proxy drafting;
- correction/removal without moving unrelated later state;
- CSV export and explicit destructive reset confirmation.

During clean-machine validation, a pre-existing TypeScript project configuration defect was exposed: the Node/test project included the tests without including the non-React source files they import. `tsconfig.node.json` was narrowed to include those actual test dependencies so the documented repository typecheck/build commands now work on a clean install.

The npm install step reported two moderate dependency-audit findings. Stage 5 did not perform unrelated dependency upgrades; dependency review can be handled before production deployment.

## Deliberately not included

Stage 5 does not import the real owners/player pool, create the production D1 database, deploy the app, or begin production/adversarial hosting work.

## Next stage

Stage 6 — Imports and real data.

Stage 6 must not begin without explicit owner approval.
