# AGENTS.md — Sickos Draft 2026

This repository is intentionally developed in bounded stages. `docs/product-spec.md` is the controlling product contract.

## Non-negotiable working rules

1. Read `docs/product-spec.md` and `docs/architecture.md` before making changes.
2. Work only on the stage explicitly authorized by the owner. Do not build ahead.
3. Stage 1 is complete. The draft-domain rules under `src/domain/` are controlling business logic; do not bypass or duplicate them in later layers.
4. Core draft rules belong in a framework-agnostic TypeScript domain layer. UI state is never authoritative.
5. Critical draft mutations must eventually be validated server-side and committed transactionally.
6. Do not add features listed as out of scope in the product spec.
7. Prefer simple code and small dependencies over generalized platform abstractions.
8. Mobile usability, especially iPhone Safari, is a first-class requirement.
9. Do not introduce AI/API features into the product.
10. Do not scrape or infer player metadata. Imported league data is authoritative.
11. Each implementation stage must end with tests and a concise status report before the next stage begins.
12. If a requirement is ambiguous and materially affects data integrity, stop that specific change rather than inventing league rules.

## Current authorized state

Stage 1 — Domain model and rule engine — COMPLETE.

The next stage, Stage 2 — Persistence and API, requires explicit owner approval.
