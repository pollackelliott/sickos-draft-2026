# Draft domain layer

Stage 1 implements the league's rules as pure TypeScript. Nothing in this directory imports React, browser APIs, a database client, Cloudflare APIs, or another hosting SDK.

The domain layer owns:

- snake-slot generation;
- draft start and active-clock state;
- deterministic expiration reconciliation;
- owed-pick/backfill ordering;
- one-player-per-conference enforcement;
- duplicate-player rejection;
- pause/resume clock freezing;
- future clock-duration changes;
- write-in duplicate detection;
- draft completion;
- basic completed-pick replacement;
- clean draft reset.

It does **not** provide database transactions or true concurrent-write protection. Stage 2 must wrap these rules in transactional persistence so two simultaneous requests cannot both commit.
