# Stage 4 — Identity and Drafting

## Status

Stage 4 is complete.

The application now supports the simple owner-code identity model and ordinary owner drafting. Commissioner-only operations remain deliberately unavailable until Stage 5.

## Owner identity

- Each owner uses the short human-readable code stored with that owner.
- Codes are matched case-insensitively and are unique case-insensitively in the database.
- The browser stores the normalized code in local storage so the owner normally enters it once.
- `Change user` clears the saved code and opens the code-entry flow again.
- Owner codes are never returned by public draft/player APIs.
- The server derives the owner from the code for every mutation; a browser-supplied owner ID is never trusted.

This remains intentionally low-security because the league contains no sensitive data and code sharing/impersonation risk is accepted by the product contract.

## Drafting interactions

A logged-in owner can draft only when the Stage 1 rule engine says that owner has an actionable slot.

The Players screen now provides:

- searchable server-backed player results;
- full conference and school filter options without loading the full player pool into the browser;
- Available Only filtering;
- explicit reasons for drafted or conference-ineligible players;
- Draft buttons only when the current owner has a legal target slot;
- a confirmation dialog showing player, school, conference, and target slot;
- write-in entry for Name, School, and Conference.

If an owner is both on the clock and owes an earlier selection, both target slots are available. The UI defaults to the live on-clock slot so the owner does not unintentionally let another timer expire. If an owner owes multiple selections, only the oldest owed slot is exposed, while a simultaneously active normal slot may still be filled.

## Authenticated API

Stage 4 adds:

- `GET /api/me`
- `POST /api/pick`
- `POST /api/write-in`
- `GET /api/player-options`

The two mutation endpoints require the owner code through the `x-league-code` header. They use the authenticated owner identity and then defer legality to the existing transactional DraftService/domain rules.

Commissioner routes such as pause, resume, reset, corrections, proxy picks, clock changes, and export are intentionally not routed yet.

## Write-ins

Write-in IDs are generated server-side.

The existing normalized Name + School duplicate rule remains authoritative. Concurrency handling was tightened so two simultaneous matching write-ins result in one success and one ordinary duplicate response rather than a generic server error.

## Refresh behavior

The browser now uses the real API contract rather than the Stage 3 demo-state fixture.

Draft state refreshes:

- after successful picks/write-ins;
- approximately every 45 seconds;
- when the browser tab becomes visible again.

Countdown rendering remains display-only; server timestamps remain authoritative.

## Validation

The combined Stage 1–4 suite now contains **51 tests**.

All **51/51 tests passed** through the local Vitest-compatible runner, including:

- every prior domain/persistence/read-only view-model test;
- valid and invalid owner-code identity;
- case-insensitive code uniqueness;
- server-side owner derivation rather than browser owner IDs;
- authenticated normal picks;
- authenticated write-ins;
- normalized write-in duplicate rejection;
- simultaneous matching write-in handling;
- complete player filter options;
- absence of commissioner mutation routes;
- owner actionable-slot selection;
- live-pick preference when the same owner also owes a pick;
- oldest-owed-only exposure;
- player/conference availability display;
- paused-draft UI action suppression.

The React/TSX Stage 4 source also passed a separate strict syntax/type validation using temporary local React declarations that were not committed.

The npm registry remains unavailable in this environment, so the canonical installed-package `npm test` / Vite browser build could not be executed here.

## Next stage

Stage 5 — Commissioner tools.

Stage 5 must not begin without explicit owner approval.
