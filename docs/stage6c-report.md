# Stage 6C — Real League Setup

## Status

Stage 6C is COMPLETE through the pre-deployment setup boundary.

The real 2026 Sickos Draft league configuration is now represented durably in the repository, while login codes remain private and are not committed to source control.

No remote D1 database has been created or mutated. The sealed 6,322-player Stage 6A universe has not yet been loaded into production.

## Real league configuration

Managers: **14**

Provisional first-round order is alphabetical by current display name:

1. Chris Barbas
2. Connor Home
3. Connor Kraus
4. Dan Labosky
5. Elliott Pollack
6. Garrett Pollack
7. Harrison Rogalski
8. Ivetta Abramyan
9. Jake
10. Jason Jonesi
11. Jordan Kuehne
12. Nathan Levy
13. Todd Saltzberg
14. Werner Gunn

Commissioner: **Elliott Pollack**

Draft settings:

- rounds: **18**
- initial clock: **24 hours**
- total scheduled slots: **252**

The final surname for Jake is still pending. Jake already has a stable internal owner ID (`owner-jake`), so changing the display name later will not alter identity, code, commissioner state, or historical references.

## Stable owner identity

Owner identity is independent from:

- display name;
- first-round draft position;
- generated login code.

The durable owner IDs are recorded in `data/stage6c/league-owners.csv`.

This permits harmless pre-start corrections such as:

- `Jake` → a full name later;
- changing Chris or any other display name;
- replacing the provisional alphabetical order with the actual draft lottery order.

## Pre-start owner/order editing

Stage 6C adds a commissioner-only pre-start setup operation:

`POST /api/commissioner/prestart-owners`

The operation accepts the complete existing owner set with updated display names and draft positions.

It:

- requires commissioner identity server-side;
- requires the draft lifecycle to be `NOT_STARTED`;
- preserves the exact owner-ID set;
- preserves login codes;
- preserves commissioner flags;
- validates consecutive unique positions;
- regenerates ownership across all 252 immutable snake slots;
- increments the draft revision;
- records a `PRESTART_OWNERS_UPDATED` audit event.

Once the draft has started, owner-name/order mutation through this path is rejected with `DRAFT_ALREADY_STARTED`.

## Provisional repository data

- `src/server/real-league-config.ts` — compiled real-league definition and settings.
- `data/stage6c/league-owners.csv` — non-secret owner identity/order snapshot.
- `data/stage6c/league-settings.json` — non-secret real league settings.
- login codes — **private, not committed**.

## Private owner codes

Fourteen random human-readable codes are generated outside source control. They are intended to remain stable even when a display name or draft position changes.

The code sheet should be treated as a private commissioner artifact and supplied to the deployment/setup process in Stage 7 rather than committed to the repository.

## Player universe

The sealed player master remains:

- rows: **6,322**
- SHA-256: `b59ec2cd479ea89e3fdf85399c5a5f26f76fb25442c39f59caa2fe4e52e1adae`

Stage 6B already provides the validated transactional ingestion path.

Stage 6C deliberately does not create a remote D1 database. Stage 7 will create the deployment database, apply migrations, initialize the real 14-owner draft using the private code sheet, and load the sealed player universe through the Stage 6B path.

## Validation

Stage 6C automated coverage verifies:

1. exactly 14 real managers are defined;
2. Chris Barbas is included and Elliott Pollack is the sole commissioner;
3. the provisional alphabetical order generates an 18-round / 252-slot snake;
4. second-round ownership reverses correctly;
5. owner display names and draft positions can change before Start;
6. stable IDs, codes, and commissioner status survive those changes;
7. the 252-slot snake is regenerated after an order change;
8. name/order changes are rejected after Start;
9. the pre-start setup HTTP route requires commissioner identity.

## Next bounded stage

**Stage 7 — Deployment and adversarial testing.**

Before Start Draft, the final first-round draft order and Jake's last name may be supplied at any time and applied through the Stage 6C pre-start setup path.

Production deployment must not begin without explicit owner approval.
