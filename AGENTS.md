# AGENTS.md — Sickos Draft 2026

This repository is intentionally developed in bounded stages. `docs/product-spec.md` is the controlling product contract.

## Non-negotiable working rules

1. Read `docs/product-spec.md` and `docs/architecture.md` before making changes.
2. Work only on the stage explicitly authorized by the owner. Do not build ahead.
3. Stage 1 domain rules under `src/domain/` are controlling business logic; do not bypass or duplicate them in later layers.
4. Stage 2 persistence uses the schema in `migrations/` and the service/store boundary under `src/server/`.
5. Stage 3 read-only UI behavior is derived through `src/ui/`; do not make browser display state authoritative.
6. Core draft rules remain framework-agnostic. UI state is never authoritative.
7. Critical draft mutations must remain server-side and transactional.
8. Do not add features listed as out of scope in the product spec.
9. Prefer simple code and small dependencies over generalized platform abstractions.
10. Mobile usability, especially iPhone Safari, is a first-class requirement.
11. Do not introduce AI/API features into the product.
12. Do not scrape or infer player metadata. Imported league data is authoritative.
13. Each implementation stage must end with tests and a concise status report before the next stage begins.
14. If a requirement is ambiguous and materially affects data integrity, stop that specific change rather than inventing league rules.
15. Do not expose mutation HTTP routes before owner-code identity/authorization is implemented in Stage 4.

## Current authorized state

Stage 3 — Read-only application — COMPLETE.

The next stage, Stage 4 — Identity and drafting, requires explicit owner approval.
