# DEBT-001: Foundation Drift vs SSOT (Missing Composition/Observability Primitives)

**Status:** Resolved
**Date:** 2026-02-01

## Summary

The SSOT documentation (master spec + ADRs) establishes foundational primitives (`lib/container.ts`, logging/request context, domain barrel exports). The codebase had partial alignment but was missing a few of these building blocks, creating doc/code drift and increasing the chance of inconsistent patterns as slices are implemented.

## Symptoms

- Docs referenced `lib/container.ts` as the composition root (ADR-007 / SPEC-010), but the file did not exist.
- Docs referenced logging/request context primitives (ADR-008), but `lib/logger.ts` / `lib/request-context.ts` did not exist.
- Master spec/ADR-012 expects `src/domain/index.ts` domain barrel export, but it was missing.
- Entitlement logic existed in multiple places, including an unused `lib/` helper that bypassed the application layer patterns.

## Impact

- New contributors/agents follow docs and hit missing files.
- Increased risk of ad-hoc dependency wiring (violating Clean Architecture / DIP).
- Increased risk of status drift between domain rules and infrastructure entitlement checks.

## Fix

- Added `lib/container.ts` with a minimal, extensible composition-root surface.
- Added `lib/logger.ts` (Pino) + `lib/request-context.ts` to establish a standard logging entry point.
- Added `src/domain/index.ts` barrel export.
- Removed the unused `lib/subscription.ts` entitlement helper (see DEBT-023), leaving a single canonical entitlement path in domain/application layers.

## Acceptance Criteria

- Repo builds and tests pass with the new primitives present.
- Documentation references now match real filepaths.
- Entitlement status set has a single canonical definition in the domain layer.
