# Stage 6A — Player Universe Reconciliation Audit

## Status

Stage 6A reconciliation is complete through the audit/checkpoint boundary. No player universe has been loaded into the application database.

## Controlling inputs

- ESPN: `CBB_rosters_26_27_v1_oct9 - CBB_rosters_26_27_v1_oct9.csv`
  - SHA-256: `37142b97f0c61474d52d2deb95edde130891bb32e5a94635a180f7fb238dfdd9`
  - Rows: 5,281
- Bart Torvik: `Torvik_Player_Universe_26_27_v1_Oct9 - Torvik_Player_Universe_26_27_v1_Oct9.csv`
  - SHA-256: `b084f10094aee207ccf6c814d4ad8454dfc5b0796d46727f45ca13ed253fb895`
  - Rows: 3,606

Owner direction for this pass:

- Torvik is preferred for 2026–27 roster/school placement.
- ESPN player IDs are authoritative when present.
- ESPN school→conference pairings are authoritative.
- Neither source is assumed complete.

## Deterministic reconciliation rules

1. A valid Torvik ESPN player ID is a definitive identity match.
2. A Torvik row without an ESPN ID may inherit an ESPN ID only when:
   - its normalized player name maps to exactly one ESPN player; and
   - that normalized name occurs exactly once in the Torvik file.
3. Torvik school placement wins for safely matched players.
4. Conference is taken from the ESPN school→conference mapping whenever that school exists in ESPN.
5. A unique Torvik player with no ESPN name match is retained as a Torvik-only player with a candidate internal ID.
6. Same-name Torvik populations and ambiguous ESPN-name populations are withheld for review rather than guessed.
7. ESPN players not safely accounted for by Torvik remain in the automatic universe as ESPN-only records.

## Automatic player universe

The generated checkpoint artifact `stage6a_player_universe_auto.csv` contains **6,312** automatically resolved players.

SHA-256: `fb8c0e797d76f99da15b5f1ba82a6b9cc37f23ad4008d01dd8b53fb9e1959bbb`

Breakdown:

- 1,574 — Torvik + ESPN matched by explicit ESPN ID.
- 970 — Torvik + ESPN matched by collision-free unique normalized name.
- 1,031 — unique Torvik-only players with no ESPN exact-name match.
- 2,737 — ESPN players not safely accounted for by Torvik.

Among the collision-free name matches, **916** have a different Torvik school from the ESPN school and are therefore treated as safe roster-placement updates.

Integrity checks:

- duplicate internal IDs: **0**
- duplicate normalized Name + School rows: **0**

The large automatic-universe CSV is retained as the exact Stage 6A conversation artifact rather than applied to the application or D1 at this checkpoint.

## Review-required population

`data/stage6a/player-review-required.csv` contains **31 Torvik rows across 24 player names** that were deliberately not merged automatically.

The 24 review groups break down into:

- **16** names that occur multiple times in the Torvik file and include at least one unresolved/no-ID row;
- **8** otherwise-single Torvik names that map to multiple ESPN players.

Two other repeated Torvik names — Jake Davis and Trent Perry — require no review because every repeated row carries a distinct valid ESPN ID.

## School / conference audit

Torvik contains **364 schools**.

- **363** are present in the ESPN school→conference map.
- The only Torvik school absent from ESPN is **New Haven** (10 players), listed by Torvik in **NEC**.
- Nine Torvik conference labels use `Pac 12` while ESPN uses `Pac-12`; the automatic universe canonicalizes those schools to ESPN's `Pac-12` label.
- No other school→conference disagreement was found.

## Important identity conclusion

Name + School should not be the permanent player identity. Transfers demonstrate why.

The import architecture should use:

1. ESPN ID as the preferred durable external identity when known;
2. immutable application internal ID for every player;
3. Name/School normalization only as reconciliation evidence, never as the sole permanent identity.

## Mid-draft refresh requirement

The owner has explicitly approved refreshed player-universe files after the initial import, including during the draft.

The safe Stage 6 importer should therefore:

- preserve internal IDs across refreshes;
- add newly discovered players;
- update undrafted player roster metadata from a refreshed authoritative universe;
- never delete or rewrite a player already referenced by a completed draft slot;
- preserve write-ins;
- never silently merge an ambiguous identity;
- maintain conference-rule integrity for already-drafted players.

This supersedes the earlier product-spec assumption that the imported pool is completely fixed after draft start.

## Checkpoint

Stage 6A stops here.

No player data has been applied to D1 or wired into application setup. The next bounded action is to adjudicate or otherwise disposition the 24 review groups, then seal the reconciled universe before implementing ingestion/refresh behavior.
