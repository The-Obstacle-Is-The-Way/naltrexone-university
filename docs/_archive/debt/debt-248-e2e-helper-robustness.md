# DEBT-248: Post-PR-134 CodeRabbit Follow-Ups (E2E Helpers)

**Status:** Resolved  
**Priority:** P4  
**Date:** 2026-02-24  
**Resolved:** 2026-02-24  
**Owner:** Test Infrastructure  
**Related PR:** [#134](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/134)

---

## Resolution Verification (2026-02-24)

- Implemented all 7 deferred helper fixes:
  1. `fetchWithTimeout` now combines caller abort signal with timeout abort.
  2. `CredentialValidationError` now supports `ErrorOptions`, and unexpected
     preflight wrapping preserves cause chain.
  3. Clerk password verification now sends JSON body with
     `Content-Type: application/json`.
  4. Stripe auth failures are separated from transport failures in both secret
     key and price checks.
  5. `resolveRequiredChoiceFixtures` query is deterministic via explicit
     `ORDER BY`.
  6. `runE2EUserStateReset` no longer uses brittle `resolvedEnv.* as string`
     casts; it now has runtime mapping guards with one clear failure.
  7. `CLERK_API_BASE`, `CLERK_API_TIMEOUT_MS`, and
     `ClerkUserListResponse` are defined once in
     `credential-health-check.ts` and reused by
     `reset-e2e-user-state.ts`.
- Updated tests:
  - `tests/e2e/helpers/credential-health-check.test.ts`
  - `tests/e2e/helpers/reset-e2e-user-state.test.ts`
- Validation:
  - `pnpm typecheck` passed
  - `pnpm test --run` passed

## Verified Triage (2026-02-24)

Total tracked items in this triage table: 11 (11 resolved, 0 deferred).

| CodeRabbit item | File | Verdict | Status |
|---|---|---|---|
| `E2EUserStateResetError` should support `ErrorOptions` | `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | **Resolved in PR #134** |
| Known-error branch should preserve `cause` | `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | **Resolved in PR #134** |
| `fetchWithTimeout` overrides caller `signal` | `tests/e2e/helpers/credential-health-check.ts` | Valid | **Resolved** |
| `CredentialValidationError` drops wrapped cause | `tests/e2e/helpers/credential-health-check.ts` | Valid | **Resolved** |
| `verifyClerkPassword` should send JSON body | `tests/e2e/helpers/credential-health-check.ts` | Valid | **Resolved** |
| Stripe checks conflate auth vs transport errors | `tests/e2e/helpers/credential-health-check.ts` | Valid | **Resolved** |
| `resolveRequiredChoiceFixtures` row order nondeterministic | `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | **Resolved** |
| `resolvedEnv.* as string` casts hide mapping drift | `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | **Resolved** |
| Duplicate `CLERK_API_BASE` + timeout constants | `tests/e2e/helpers/credential-health-check.ts`, `tests/e2e/helpers/reset-e2e-user-state.ts` | Valid | **Resolved** |
| `breakdownLinks.count()` can race | `tests/e2e/session-review-navigation.spec.ts` | Valid | **Resolved in follow-up branch** |
| `toBeDisabled()` missing timeout consistency | `tests/e2e/session-review-navigation.spec.ts` | Valid | **Resolved in follow-up branch** |

---

## Required Resolution (Completed)

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

- [x] `fetchWithTimeout` respects both timeout and external abort signals.
- [x] `CredentialValidationError` and `E2E_PREFLIGHT:UNEXPECTED` preserve `cause`.
- [x] `verifyClerkPassword` sends `application/json` body.
- [x] Stripe auth and transport failures return distinct diagnostics.
- [x] `resolveRequiredChoiceFixtures` query includes deterministic `ORDER BY`.
- [x] `runE2EUserStateReset` has no `resolvedEnv.* as string` assertions.
- [x] `CLERK_API_BASE`, `CLERK_API_TIMEOUT_MS`, and `ClerkUserListResponse` are defined once.
- [x] Session breakdown count uses `expect.poll`.
- [x] `toBeDisabled()` assertions use consistent timeouts.
- [x] `pnpm typecheck` passes.
- [x] `pnpm test --run` passes.

## Related

- [DEBT-247](./debt-247-test-helper-structure-cleanup.md)
- CodeRabbit reviews on PR #134 (2026-02-24)
