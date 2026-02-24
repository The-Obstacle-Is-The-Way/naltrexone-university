# DEBT-248: E2E Helper Robustness

**Status:** Open
**Priority:** P4
**Date:** 2026-02-24
**Owner:** Test Infrastructure

---

## Description

CodeRabbit review of PR #134 identified four pre-existing code quality issues in E2E helper modules. These are not regressions — they existed before the PR — but are legitimate improvements for debuggability and E2E stability.

## Items

### 1. CredentialValidationError missing cause chaining

- File: `tests/e2e/helpers/credential-health-check.ts`
- `CredentialValidationError` constructor does not accept `ErrorOptions`, so wrapped errors lose their original stack/cause.
- Fix: Add optional `ErrorOptions` parameter and forward to `super()`. Same pattern already applied to `E2EUserStateResetError` in this PR.

### 2. Stripe credential checks conflate auth and network errors

- File: `tests/e2e/helpers/credential-health-check.ts`
- `verifyStripeSecretKey` and `verifyStripePriceId` catch all errors as invalid credentials. Network timeouts or transport failures get misreported as "invalid key."
- Fix: Inspect caught error type; only report auth-specific codes for `StripeAuthenticationError`. Rethrow or report distinct code for transport failures.

### 3. Duplicated CLERK_API_BASE and CLERK_API_TIMEOUT_MS constants

- Files: `tests/e2e/helpers/credential-health-check.ts`, `tests/e2e/helpers/reset-e2e-user-state.ts`
- Both files define `CLERK_API_BASE = 'https://api.clerk.com/v1'` and timeout values independently.
- Fix: Export from `credential-health-check.ts` and import in `reset-e2e-user-state.ts`.

### 4. E2E breakdownLinks.count() race condition

- File: `tests/e2e/session-review-navigation.spec.ts`
- `breakdownLinks.count()` is called immediately after navigation, which can race with DOM rendering.
- Fix: Replace with `expect.poll(() => breakdownLinks.count()).toBeGreaterThanOrEqual(2)` for stable E2E assertion.

---

## Verification

- [ ] `CredentialValidationError` accepts and forwards `ErrorOptions`.
- [ ] Stripe credential checks distinguish auth errors from transport failures.
- [ ] `CLERK_API_BASE` and `CLERK_API_TIMEOUT_MS` are defined once and imported.
- [ ] `breakdownLinks.count()` uses `expect.poll` pattern.
- [ ] `pnpm test --run` passes.

## Related

- [DEBT-247](debt-247-test-helper-structure-cleanup.md)
- PR #134 CodeRabbit review (2026-02-24)
