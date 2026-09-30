# AGENTS.md — Sickos Draft 2026

This repository is intentionally developed in bounded stages. `docs/product-spec.md` is the controlling product contract.

## Non-negotiable working rules

1. Read `docs/product-spec.md` and `docs/architecture.md` before making changes.
2. Work only on the stage explicitly authorized by the owner. Do not build ahead.
3. Stage 0 is foundation only. Draft-domain rules are not yet implemented.
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

Stage 0 — Repository foundation.

The next stage, Stage 1 — Domain model and rule engine, requires explicit owner approval.
