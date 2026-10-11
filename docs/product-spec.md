# Sickos Draft 2026 — v1 Product & Technical Specification

## 1. Purpose

Sickos Draft 2026 is a deliberately simple web application for conducting one private fantasy college basketball league draft. It replaces a manual process with a persistent asynchronous board available 24/7 for several weeks. The product is one league, one active draft, one season, with minimal ongoing maintenance.

## 2. League and draft model

- Approximately 12–14 owners.
- Approximately 18 rounds; every owner receives the same number of selections.
- Standard snake draft generated from first-round owner order and number of rounds.
- No traded picks and no intentional passes in v1.
- Owners at the ends of the snake may have consecutive picks.
- Display round, round pick, and overall pick where useful.

## 3. Conference rule

Each fantasy roster may contain no more than one player from any conference. The conference value in the reconciled player universe is authoritative for eligibility. Once a player is drafted, that selected player's school/conference identity is frozen for the draft. A later player-universe refresh may update an undrafted player's roster metadata, including school/conference, but must never silently rewrite a completed selection. The rule applies equally to normal picks, owed-pick backfills, write-ins, and commissioner-entered selections, and must be enforced server-side.

## 4. Asynchronous clock

Exactly one normal slot is ON THE CLOCK at a time. The clock length is configurable and expected to be around 12–24 hours. A valid selection immediately completes that slot and starts the next slot with the full configured duration. The timer runs continuously through nights, weekends, and holidays.

The interface shows both a live countdown and exact deadline. A change in clock duration affects future clocks only; it does not alter the currently active deadline.

## 5. Expiration and owed picks

Expiration does not forfeit a selection. When a slot expires:

1. that slot becomes `OWED_PICK`;
2. the owner retains the exact original slot;
3. the normal snake advances immediately;
4. the next owner receives a full clock.

An owner may backfill an owed pick while another owner is on the clock. Backfill does not affect the active normal clock. If an owner owes multiple selections, the oldest must be filled first. Backfills retain their original round and overall pick.

Conference eligibility is evaluated against the owner's roster at the moment of the attempted backfill, regardless of the chronological order in which the roster was filled.

## 6. Draft completion

Reaching the final normal slot does not complete the draft if owed picks remain. The draft is complete only when every scheduled slot contains a valid player. Outstanding picks should be visibly counted near the top of the Draft screen.

## 7. Timer authority and reconciliation

The database/server timestamp is authoritative. Browser timers are display-only. Correctness must not depend on a browser remaining open. On server interactions, elapsed deadlines are reconciled deterministically. If the application receives no traffic for hours, the next interaction must correctly catch up through elapsed slots.

## 8. Pause and resume

The commissioner may pause and resume the draft. A pause freezes the remaining duration on the current normal clock. If eight hours remained at pause time, approximately eight hours remain when resumed. The paused state is clearly visible.

## 9. Identity and access

Each owner receives one short human-readable code such as `BLUE42`. There are no usernames, registration flows, email addresses, OAuth, password resets, or MFA. Entering the code identifies the owner; the browser remembers the identity locally. A small `Change user` control allows replacing the saved code.

Knowing another owner's code is sufficient to act as that owner; this low-security model is intentional for the private league.

## 10. Spectator mode

Without a code, the site remains publicly readable. Spectators may see the board, clock, next picks, outstanding picks, recent picks, all rosters, player pool, player availability, rules, and draft order. The only material difference is the ability to submit picks.

## 11. Commissioner

Elliott is both an owner and commissioner. His normal owner code also exposes commissioner controls. A separate administrator identity is unnecessary.

Commissioner capabilities:

- start the draft;
- pause/resume;
- make a pick on behalf of an owner;
- correct/remove/replace an existing pick without moving unrelated later picks;
- manually skip/advance an active slot when necessary;
- change clock duration for future clocks;
- reset the draft with explicit destructive confirmation;
- download current CSV results.

Any correction must leave roster conference rules valid.

## 12. Player pool

The commissioner supplies one or more authoritative roster/player-universe files, normally producing a reconciled pool of roughly 5,000–6,500 players. Raw source files may vary, but the reconciled Stage 6 canonical import requires durable identity plus at least Name, School, and Conference. The preferred canonical columns are:

`internal_id,espn_id,name,school,conference`

`espn_id` is optional when unavailable, but any row without ESPN ID must carry an immutable `internal_id`. Optional fields such as Year, Position, Height, and reconciliation/source status may be preserved when supplied. Player names need not be unique; Name + School is sufficient human-facing identification but is not the permanent identity key.

Player-universe refreshes are allowed before and during the draft. A refresh must preserve internal IDs when identity is known, add newly discovered players, preserve write-ins, and never silently merge ambiguous identities. During an active draft, already-drafted player records are immutable; undrafted player roster metadata may be refreshed.

## 13. Write-ins

Any owner making a legitimate selection may write in a missing player by providing Player Name, School, and Conference. Before acceptance, known durable identifiers should be honored when available and an exact normalized Name + School match against the imported pool must be checked. If a match exists, the existing player must be used instead. Write-ins receive immutable internal IDs, survive later player-universe refreshes, and obey all normal conference and availability rules.

## 14. Player browsing and selection

Do not use one 5,000–6,000-player dropdown. Provide:

- free-text player search;
- conference filter;
- school filter;
- sorting;
- prominent Available Only toggle.

Filters work independently; School narrows appropriately when Conference is selected. All users may browse at any time. Drafted or conference-ineligible players may remain visible when Available Only is off, but must be disabled with an explanation such as `Drafted by Mike — Pick 2.06` or `Unavailable — Big Ten already used`.

Before committing a selection, display a confirmation containing player, school, conference, and the slot being filled.

## 15. Concurrency

All picks must be atomic. A player can never be drafted twice. If two valid actors attempt the same player simultaneously, the first committed transaction wins and the second receives a clear human-facing error. The same protection applies to normal picks, backfills, commissioner picks, and write-ins as appropriate.

## 16. Draft board

The primary Draft screen is a grid with rounds vertically and owners horizontally in first-round order. Each completed cell shows Player / School / Conference. The grid visually distinguishes completed, ON CLOCK, OWED PICK, and future cells.

On mobile, the board scrolls horizontally rather than compressing 12–14 columns. The round column and owner headers should remain visible when practical. No functionality may depend on hover.

The page prominently displays ON THE CLOCK, a live countdown, exact deadline, and the next 2–3 scheduled picks. Outstanding owed picks are shown compactly when applicable. A recent-picks feed is ordered by actual submission time; a late pick may be labeled as a backfill for its original slot.

## 17. Team pages

Teams are public. Each owner page lists picks in draft-round order with Round, Player, School, and Conference. It also shows a compact conference checklist such as `ACC ✓` and `Big Ten —`, without repeating player names in that checklist.

## 18. Navigation

Primary navigation:

- Draft
- Players
- Teams
- Rules

Draft is the default landing page. Commissioner controls are conditional.

The Rules page explains snake format, number of rounds, one-player-per-conference, clock duration, expiration/backfill behavior, oldest-owed-first, write-ins, and draft order.

## 19. Refresh model

The site should update without manual refresh. Recommended behavior: immediate refresh after successful actions, refresh when the browser tab becomes active, and background polling roughly every 30–60 seconds. Polling is not authoritative for timer correctness.

## 20. Setup files

The reconciled `players.csv` requires durable player identity plus `Name,School,Conference`; the preferred schema is `internal_id,espn_id,name,school,conference`, with `internal_id` mandatory whenever ESPN ID is absent.

`owners.csv` requires `DraftPosition,Name,Code`.

Owner order plus number of rounds generates the complete snake. Owner IDs are stable and independent of display name and draft position. Before Start Draft, the commissioner may correct owner display names and replace the provisional first-round order; doing so regenerates the snake ownership assignments while preserving owner IDs and codes. After Start Draft, owner order is locked. The commissioner configures round count and clock duration.

## 21. CSV export

One commissioner-downloadable CSV is available at any time. Minimum columns:

`Overall Pick,Round,Player,User,Team,Conference`

`Team` means the player's college team/school. `User` means fantasy owner. Backfills retain their original round/overall pick. Export is ordered by draft slot, not submission chronology.

## 22. Reset and demo data

A reset removes all selections and write-ins, restores every slot, clears pause state, and returns the draft to its initial configuration. It requires explicit destructive confirmation.

Development includes a deterministic small demo fixture with four owners and enough multi-conference players to test snake turns, conference conflicts, expiration, and backfills.

## 23. Mandatory Stage 1+ automated behaviors

Tests must ultimately verify at minimum:

1. snake order generation;
2. only the appropriate owner can fill the active normal slot;
3. expiration creates an owed pick and advances the snake;
4. owed picks can be backfilled while another owner remains on clock;
5. oldest owed pick is filled first;
6. a player cannot be drafted twice;
7. an owner cannot roster two players from one conference;
8. conference restrictions include backfills;
9. valid normal picks advance immediately;
10. concurrent attempts cannot duplicate ownership;
11. pause freezes remaining time and resume restores it;
12. current clock is unaffected by later clock-duration configuration changes;
13. future clocks use the new duration;
14. completion requires every slot filled;
15. write-in exact Name + School duplicates are rejected;
16. commissioner corrections leave unrelated later picks intact;
17. reset restores clean state;
18. CSV export preserves original slot numbers for backfills.

Timer tests must use fake/deterministic time rather than real waiting.

## 24. Data integrity

Critical rules are enforced server-side/database-side. UI disabling is convenience only. Invalid crafted requests must still be rejected. Important state transitions are transactional. Draft state survives reloads, browser closure, device changes, zero-traffic periods, and ordinary deployments.

## 25. Visual direction

The application should feel like a simple sibling of the existing Sickos fantasy college basketball website, not a generic SaaS dashboard. Desired character: simple, functional, compact, readable, unfancy, mobile-friendly, minimal ornamentation. Avoid unnecessary animations, gradients, excessive cards, component-library styling, conference logos, and required dark mode.

## 26. Technical direction

Preferred characteristics:

- TypeScript;
- React/Vite foundation;
- framework-agnostic domain layer;
- relational persistent database added later;
- server-side validation;
- transactional mutations;
- plain responsive CSS;
- automated tests;
- minimal dependencies;
- easy local development;
- no OpenAI or AI API dependency.

Cloudflare Workers/D1 is the leading deployment candidate, but hosting is not part of the product contract and provider-specific logic must not enter the core domain layer.

## 27. Logical data model

Approximate future concepts:

- `owners`: ID, name, draft position, login code, commissioner flag.
- `players`: ID, name, school, conference, optional imported metadata, write-in marker.
- `draft`: round count, clock duration, pause/timing configuration, start metadata.
- `draft_slots`: immutable slot ID, round, overall pick, owner ID, status/derived state, selected player, selection timestamp.
- optional `draft_events`: lightweight operational audit for picks, backfills, corrections, pauses, resumes, expiration/skip, clock change, reset.

Statuses may conceptually include `FUTURE`, `ON_CLOCK`, `OWED`, and `COMPLETE`, although exact persistence is an implementation decision.

## 28. Start draft

Before commissioner Start Draft, users may browse but nobody may select. Starting activates Round 1 Pick 1 and gives it the configured full deadline.

## 29. Human-facing errors

Errors should be plain language, e.g. `That player was just drafted.`, `You already have a Big Ten player.`, `It is not currently your turn.`, `You must fill your Round 4 owed pick before your Round 6 owed pick.`, `That player already exists in the player pool.`, or `The draft is currently paused.` Internal errors must not leak to participants.

## 30. Explicitly out of scope for v1

Do not add without explicit owner approval: multi-league support, historical seasons, traded picks, email/SMS/push notifications, user registration, proper password authentication, password reset, OAuth/social login, player-stat integrations, scraping, automated enrichment, AI features, chat, conference logos, complex admin dashboards, complex setup wizard, keepers, waivers, post-draft roster management, scoring, standings, multi-season archives, or native apps.

## 31. Definition of success

A real 12–14-owner draft can run for several weeks with participants primarily using phones and without the commissioner manually maintaining draft state. Participants can enter a code once, see the clock, browse players, understand ineligibility, make legal picks, backfill owed slots, and inspect the board/rosters. The commissioner can resolve ordinary mistakes without direct database intervention.

## 32. Staged implementation discipline

- **Stage 0 — Repository foundation:** repo structure, README, product spec, architecture decision, demo fixtures, test framework, empty application shell. No draft engine.
- **Stage 1 — Domain model and rule engine:** pure TypeScript snake/slots/eligibility/backfill/timer/pause/completion rules with tests.
- **Stage 2 — Persistence and API:** schema, migrations, transactional server operations.
- **Stage 3 — Read-only application:** Draft, Players, Teams, Rules with demo data and mobile verification.
- **Stage 4 — Identity and drafting:** code persistence, permissions, search/filter, confirmation, normal picks/backfills.
- **Stage 5 — Commissioner tools:** pause/resume, proxy picks, corrections, clock changes, reset, CSV.
- **Stage 6 — Imports and real data:** validated CSV ingestion; real files only after validation exists.
- **Stage 7 — Deployment and adversarial testing.**
- **Stage 8 — Abbreviated full mock draft.**

No stage may broaden product scope without explicit owner approval.
