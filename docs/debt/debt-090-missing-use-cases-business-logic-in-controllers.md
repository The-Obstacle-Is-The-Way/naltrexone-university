# DEBT-090: Missing Application Use Cases (Business Logic Lives in Controllers)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-04

---

## Description

Several adapters/controllers currently contain significant business/use-case logic that the SSOT expects to live in **application-layer use cases**. This is a Clean Architecture drift: controllers should orchestrate request/response concerns and delegate business rules to use cases.

SSOT evidence (files expected):

- SPEC-011 Paywall: `src/application/use-cases/create-checkout-session.ts`, `create-portal-session.ts`
- SPEC-013 Practice Sessions: `src/application/use-cases/start-practice-session.ts`, `end-practice-session.ts`
- SPEC-014 Review + Bookmarks: `src/application/use-cases/get-bookmarks.ts`, `get-missed-questions.ts`
- SPEC-012 Core Question Loop: `src/application/use-cases/toggle-bookmark.ts`
- SPEC-015 Dashboard: `src/application/use-cases/get-user-stats.ts`

Current implementation reality:

- `src/application/use-cases/` contains `check-entitlement.ts`, `submit-answer.ts`, `get-next-question.ts` only.
- Controllers implement core decision logic directly.

Concrete examples (non-exhaustive):

- `src/adapters/controllers/practice-controller.ts:101-138` selects candidate question IDs, seeds, shuffles, slices, persists session params.
- `src/adapters/controllers/stats-controller.ts:91-166` orchestrates 6 repository calls, computes accuracy/streak, joins attempts→questions, applies graceful-degradation rules.
- `src/adapters/controllers/bookmark-controller.ts:68-92` implements toggle behavior (remove → if absent then validate question → add).
- `src/adapters/controllers/billing-controller.ts:72-160` includes get-or-create Stripe customer logic, subscription gating, and checkout session orchestration.

## Impact

- **SSOT drift:** Specs explicitly call for use cases and use-case tests; the codebase structure does not match.
- **Testability:** Use-case behavior is harder to test in isolation when embedded in controller actions.
- **Maintainability:** Business rule changes require editing controllers (outer layer), increasing coupling to framework concerns.
- **Composition clarity:** Application layer becomes underpowered; adapters become “fat”.

## Resolution

### Recommended: Introduce the missing use cases and thin controllers

For each controller with business logic:

1. Write failing unit tests for the new use case using existing fakes (`src/application/test-helpers/fakes.ts`).
2. Implement the minimal use case (constructor DI, no framework imports).
3. Move logic from controller into use case (controller becomes input validation + auth/entitlement + call use case).
4. Keep controller signatures stable (API stays the same), unless SSOT requires changes.

Suggested use cases (names aligned to spec intent):

- `CreateCheckoutSessionUseCase`
- `CreatePortalSessionUseCase`
- `StartPracticeSessionUseCase`
- `EndPracticeSessionUseCase`
- `GetUserStatsUseCase`
- `ToggleBookmarkUseCase`
- (Optional) `GetBookmarksUseCase` if we want controllers fully thin.

## Verification

- New use-case tests exist and pass (`src/application/use-cases/*.test.ts`).
- Controllers become thin (no selection/aggregation business rules inside).
- `pnpm typecheck && pnpm test --run` pass.
- Specs remain accurate (no mismatches between documented file structure and code).

## Related

- `docs/specs/spec-005-core-use-cases.md`
- `docs/specs/spec-011-paywall.md`
- `docs/specs/spec-013-practice-sessions.md`
- `docs/specs/spec-014-review-bookmarks.md`
- `docs/specs/spec-015-dashboard.md`
