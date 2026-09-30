# Architecture Decision — Stage 0

## Chosen foundation

- **Frontend:** React + Vite + TypeScript
- **Styling:** plain CSS; no component library or Tailwind in v1 unless a concrete need emerges
- **Tests:** Vitest
- **Domain model:** framework-agnostic TypeScript under `src/domain/`
- **Persistence/API:** deferred to Stage 2
- **Deployment target:** Cloudflare Workers/D1 is the current leading candidate, but deployment remains intentionally unbound in Stage 0

## Why this stack

The application is small, mobile-first, stateful, and rules-driven. React is sufficient for search/filter interactions and a horizontally scrolling draft board without introducing a large application framework. Vite keeps local development and builds simple. Vitest supports deterministic testing of the draft clock and rule engine in Stage 1.

The most important architectural boundary is not the UI framework: it is keeping the draft rules independent from the browser and hosting provider. Snake generation, eligibility, owed-pick ordering, timer reconciliation, pause/resume, and completion logic must be expressible and testable without React, Cloudflare, or a database SDK.

## Persistence direction

Stage 2 should add a relational persistence layer and server-side transactional mutation path. Cloudflare D1 is a strong candidate because the league scale is tiny and it avoids coupling this project to the existing Vercel workload. If another provider is selected later, the domain layer should not need rewriting.

## Refresh model

The eventual application should refresh after successful actions, when the browser tab becomes active, and by low-frequency polling (roughly 30–60 seconds). Server-authoritative timestamps determine actual draft state; a browser countdown is display-only.

## Deliberate non-decisions in Stage 0

Stage 0 does not select an ORM, API framework, production database adapter, deployment provider, authentication package, or real-time transport. Those decisions belong to the stage where they become necessary.
