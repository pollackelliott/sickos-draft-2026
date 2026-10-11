# AGENTS.md — Sickos Draft 2026

This repository is intentionally developed in bounded stages. `docs/product-spec.md` is the controlling product contract.

## Non-negotiable working rules

1. Read `docs/product-spec.md` and `docs/architecture.md` before making changes.
2. Work only on the stage explicitly authorized by the owner. Do not build ahead.
3. Stage 1 domain rules under `src/domain/` are controlling business logic; do not bypass or duplicate them in later layers.
4. Stage 2 persistence uses the schema in `migrations/` and the service/store boundary under `src/server/`.
5. Stage 3 read-only UI behavior is derived through `src/ui/`; browser display state is never authoritative.
6. Stage 4 owner identity is determined server-side from the owner code. Never trust an owner ID supplied by a client mutation request.
7. Critical draft mutations must remain server-side and transactional.
8. Do not add features listed as out of scope in the product spec.
9. Prefer simple code and small dependencies over generalized platform abstractions.
10. Mobile usability, especially iPhone Safari, is a first-class requirement.
11. Do not introduce AI/API features into the product.
12. Do not scrape or infer player metadata. Imported league data is authoritative.
13. Each implementation stage must end with tests and a concise status report before the next stage begins.
14. If a requirement is ambiguous and materially affects data integrity, stop that specific change rather than inventing league rules.
15. Stage 5 commissioner mutations must require server-side commissioner identity and must still pass through the controlling domain and persistence rules.
16. Stage 6 player identity prefers durable external IDs (ESPN ID when known) plus immutable application internal IDs. Name + School is reconciliation evidence, not permanent identity.
17. Stage 6 refreshes must never silently merge ambiguous players or rewrite completed draft selections.
18. Stage 6B player-universe refreshes must remain transactional, commissioner-authorized when routed over HTTP, preserve write-ins, and freeze any imported player referenced by a current slot or historical draft event.

## Current authorized state

Stage 5 — Commissioner tools — COMPLETE.

Stage 6A — Player universe reconciliation audit — COMPLETE. All 24 review groups are owner-approved, the final reconciled universe is 6,322 players, and the sealed master SHA-256 is `b59ec2cd479ea89e3fdf85399c5a5f26f76fb25442c39f59caa2fe4e52e1adae`. No player data has been applied to D1 or application setup.

Stage 6B — validated ingestion/refresh implementation — COMPLETE. The server now validates canonical player CSVs and can transactionally replace the unreferenced imported universe while preserving write-ins and all slot/event-referenced players. Remote D1 has not been created or mutated.

The next bounded stage is Stage 6C — real league setup. Do not begin Stage 6C until explicitly authorized by the owner and the final owner list/draft order are available. Production deployment remains Stage 7.
