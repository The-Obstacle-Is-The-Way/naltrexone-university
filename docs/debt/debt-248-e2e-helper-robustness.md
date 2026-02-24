# DEBT-248: Post-PR-134 CodeRabbit Follow-Ups (E2E Helpers)

**Status:** Open  
**Priority:** P4  
**Date:** 2026-02-24  
**Owner:** Test Infrastructure  
**Related PR:** [#134](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/134)

---

## Description

CodeRabbit follow-up on PR #134 surfaced helper-level robustness items across
`credential-health-check.ts`, `reset-e2e-user-state.ts`, and
`session-review-navigation.spec.ts`.

A first-principles audit of current HEAD shows:

- 2 items are already fixed in merged PR #134 and must not be reworked.
- 2 additional spec-level items were fixed in this follow-up branch.
- 7 items remain as deferred robustness improvements.

This document is the SSOT backlog for those 7 remaining deferred items.

## Verified Triage (2026-02-24)

Total tracked items in this triage table: 11 (4 resolved, 7 deferred).

| CodeRabbit item | File | Verdict | Status |
|---|---|---|---|
| `E2EUserStateResetError` should support `ErrorOptions` | `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | **Resolved in PR #134** |
| Known-error branch should preserve `cause` | `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | **Resolved in PR #134** |
| `fetchWithTimeout` overrides caller `signal` | `tests/e2e/helpers/credential-health-check.ts` | Valid | Deferred here |
| `CredentialValidationError` drops wrapped cause | `tests/e2e/helpers/credential-health-check.ts` | Valid | Deferred here |
| `verifyClerkPassword` should send JSON body | `tests/e2e/helpers/credential-health-check.ts` | Valid | Deferred here |
| Stripe checks conflate auth vs transport errors | `tests/e2e/helpers/credential-health-check.ts` | Valid | Deferred here |
| `resolveRequiredChoiceFixtures` row order nondeterministic | `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | Deferred here |
| `resolvedEnv.* as string` casts hide mapping drift | `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | Deferred here |
| Duplicate `CLERK_API_BASE` + timeout constants | `tests/e2e/helpers/credential-health-check.ts`, `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | Deferred here |
| `breakdownLinks.count()` can race | `tests/e2e/session-review-navigation.spec.ts` | Valid | **Resolved in follow-up branch** |
| `toBeDisabled()` missing timeout consistency | `tests/e2e/session-review-navigation.spec.ts` | Valid | **Resolved in follow-up branch** |

---

## Required Resolution (Definitive)

1. **Preserve caller abort signals in `fetchWithTimeout`**
- File: `tests/e2e/helpers/credential-health-check.ts`
- Update `fetchWithTimeout(input, init, timeoutMs)` to combine:
  - internal timeout abort, and
  - external `init.signal` abort.
- Do not mutate the caller `init` object.

2. **Add cause chaining to `CredentialValidationError`**
- File: `tests/e2e/helpers/credential-health-check.ts`
- Constructor must accept `options?: ErrorOptions` and call `super(message, options)`.
- In `runE2ECredentialHealthCheck`, the `E2E_PREFLIGHT:UNEXPECTED` wrapper must pass `{ cause: error }`.

3. **Use JSON body for Clerk password verification**
- File: `tests/e2e/helpers/credential-health-check.ts`
- In `verifyClerkPassword`, replace `URLSearchParams({ password })` with JSON request body:
  - headers include `Content-Type: application/json`
  - body is `JSON.stringify({ password })`

4. **Differentiate Stripe auth failures from transport failures**
- File: `tests/e2e/helpers/credential-health-check.ts`
- In `verifyStripeSecretKey` and `verifyStripePriceId`:
  - map `StripeAuthenticationError` to credential-invalid codes.
  - map non-auth exceptions to transport/connectivity codes (not invalid credential codes).

5. **Make choice fixture selection deterministic**
- File: `tests/e2e/helpers/reset-e2e-user-state.ts`
- In `resolveRequiredChoiceFixtures`, add `ORDER BY` to the SQL query before `rows.find(...)` selection.

6. **Remove brittle env casts**
- File: `tests/e2e/helpers/reset-e2e-user-state.ts`
- Replace:
  - `resolvedEnv.databaseUrl as string`
  - `resolvedEnv.clerkSecretKey as string`
  - `resolvedEnv.clerkEmail as string`
- with explicit runtime guards after `failures.length` check.
- Throw one clear error listing missing mapped keys if any are undefined.

7. **Deduplicate Clerk API constants and response type**
- Files:
  - `tests/e2e/helpers/credential-health-check.ts`
  - `tests/e2e/helpers/reset-e2e-user-state.ts`
- Export and reuse one source for:
  - `CLERK_API_BASE`
  - `CLERK_API_TIMEOUT_MS`
  - `ClerkUserListResponse`

## Verification

- [ ] `fetchWithTimeout` respects both timeout and external abort signals.
- [ ] `CredentialValidationError` and `E2E_PREFLIGHT:UNEXPECTED` preserve `cause`.
- [ ] `verifyClerkPassword` sends `application/json` body.
- [ ] Stripe auth and transport failures return distinct diagnostics.
- [ ] `resolveRequiredChoiceFixtures` query includes deterministic `ORDER BY`.
- [ ] `runE2EUserStateReset` has no `resolvedEnv.* as string` assertions.
- [ ] `CLERK_API_BASE`, `CLERK_API_TIMEOUT_MS`, and `ClerkUserListResponse` are defined once.
- [x] Session breakdown count uses `expect.poll`.
- [x] `toBeDisabled()` assertions use consistent timeouts.
- [x] `pnpm test --run` passes.

## Related

- [DEBT-247](../_archive/debt/debt-247-test-helper-structure-cleanup.md)
- CodeRabbit reviews on PR #134 (2026-02-24)
