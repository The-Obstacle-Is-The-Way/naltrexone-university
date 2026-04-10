# DEBT-357: Test Double Discipline Drift

**Priority:** P3
**Created:** 2026-04-08
**Status:** Resolved (PR #273)
**Source:** Follow-up from [DEBT-354](./debt-354-god-file-and-clean-code-audit.md)
**Related:** [docs/dev/react-vitest-testing.md](../../dev/react-vitest-testing.md), [clerk-auth-gateway.test.ts](../../src/adapters/gateways/clerk-auth-gateway.test.ts), [get-started-cta.test.tsx](../../components/get-started-cta.test.tsx), [auth-nav.test.tsx](../../components/auth-nav.test.tsx)

## Resolution

Added `FakeCheckEntitlementUseCase` to `src/application/test-helpers/fakes/fake-use-cases.ts`. Replaced the 42-line inline `createFakeUserRepository()` in `clerk-auth-gateway.test.ts` with `FakeUserRepository` and converted interaction assertions (`_calls`) to behavioral assertions (`findByClerkId`). Replaced all inline `AuthGateway` and entitlement use-case stubs in `get-started-cta.test.tsx` and `auth-nav.test.tsx` with `FakeAuthGateway`, `FakeCheckEntitlementUseCase`, and `createUser()`. Zero production code changed. Net −88 lines.

---

## Problem Statement

The repo standard is "fakes over mocks" for our own code, but some render and
adapter tests have drifted back toward ad hoc inline doubles:

- [`clerk-auth-gateway.test.ts`](../../src/adapters/gateways/clerk-auth-gateway.test.ts) builds an inline `UserRepository` fake even though `FakeUserRepository` exists
- [`get-started-cta.test.tsx`](../../components/get-started-cta.test.tsx) repeatedly inlines `AuthGateway` objects and entitlement use-case stubs instead of using `FakeAuthGateway` plus `FakeUseCase`
- [`auth-nav.test.tsx`](../../components/auth-nav.test.tsx) already uses `FakeAuthGateway` but still repeats inline entitlement use-case stubs across scenarios

This is not the catastrophic kind of test debt, but it is exactly how a test
suite slowly drifts away from the repo's stated conventions.

## Why This Is Debt

- repeated inline test doubles create boilerplate and local drift
- tests become less behaviorally realistic than the shared fakes
- future contributors get mixed signals about when inline stubs are acceptable
- the repo standard becomes "documented but optional"

## In Scope

- DI-friendly tests that can use existing fake classes or the generic `FakeUseCase`
- server-component render tests
- adapter tests with clear injected seams

## Out of Scope

- Browser Mode controller-boundary `vi.mock()` exceptions documented in `docs/dev/react-vitest-testing.md`
- Next.js / Clerk / Playwright / other external package mocks
- composition-root route tests where module-level imports cannot be injected cleanly

## Desired End State

When a fake already exists, tests should use it by default. When a small generic
fake is available, repeated ad hoc stubs should collapse onto it.

Expected patterns:

- `FakeAuthGateway` for auth state
- `FakeUserRepository` for user repository behavior
- `FakeUseCase` or a tiny named test helper for simple use-case seams

## Implementation Notes

- This does **not** require dogmatic replacement of every `vi.fn()` callback setter in hook tests; state-setter spies are still fine
- Prefer extracting a small named helper when many scenarios need the same fake wiring
- Keep the explicitly documented route/composition-root exceptions as exceptions

## Acceptance Criteria

- Targeted tests above stop using ad hoc doubles where repo-standard fakes already exist
- Shared fake helpers are used for repeated auth/entitlement render scenarios
- `docs/dev/react-vitest-testing.md` remains true to actual test practice
- Acceptable `vi.mock()` exceptions stay documented and narrow
