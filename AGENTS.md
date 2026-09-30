# AGENTS.md — Sickos Draft 2026

This repository is intentionally developed in bounded stages. `docs/product-spec.md` is the controlling product contract.

## Non-negotiable working rules

1. Read `docs/product-spec.md` and `docs/architecture.md` before making changes.
2. Work only on the stage explicitly authorized by the owner. Do not build ahead.
3. Stage 1 domain rules under `src/domain/` are controlling business logic; do not bypass or duplicate them in later layers.
4. Stage 2 persistence uses the schema in `migrations/` and the service/store boundary under `src/server/`.
5. Core draft rules remain framework-agnostic. UI state is never authoritative.
6. Critical draft mutations must remain server-side and transactional.
7. Do not add features listed as out of scope in the product spec.
8. Prefer simple code and small dependencies over generalized platform abstractions.
9. Mobile usability, especially iPhone Safari, is a first-class requirement.
10. Do not introduce AI/API features into the product.
11. Do not scrape or infer player metadata. Imported league data is authoritative.
12. Each implementation stage must end with tests and a concise status report before the next stage begins.
13. If a requirement is ambiguous and materially affects data integrity, stop that specific change rather than inventing league rules.
14. Do not expose mutation HTTP routes before owner-code identity/authorization is implemented in Stage 4.

## Current authorized state

Stage 2 — Persistence and API — COMPLETE.

The next stage, Stage 3 — Read-only application, requires explicit owner approval.
