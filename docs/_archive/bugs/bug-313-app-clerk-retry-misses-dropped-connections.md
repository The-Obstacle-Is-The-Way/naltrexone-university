# BUG-313: The App's Clerk Retry Never Retries a Dropped Connection

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved
**Priority:** P3
**Date:** 2026-09-30
**Resolved:** 2026-09-30 — promoted to `main` through #1261; production release verified (see Resolution)
**Verification receipts:** see Resolution

---

## Description

The app retries two Clerk reads with `retry()`, `DEFAULT_RETRY_OPTIONS` and `isTransientExternalError`:
- `ClerkAuthGateway.getCurrentUser` reads the signed-in user through `currentUser()`, on authenticated requests;
- `resolveClerkUserEmailOwnershipConflict` looks up an existing Clerk identity during user provisioning.

The retry exists for transient failures, and the most common one is a dropped connection. The Clerk SDK never presents a dropped connection in a form the classifier recognizes:
- `@clerk/backend` 3.18.1 catches the failed fetch in its request builder and rethrows a `ClerkAPIResponseError`.
- That error has `code: 'api_response_error'`, **no `status`**, and one error, `{ code: 'unexpected_error', message: 'fetch failed' }`.
- `isTransientExternalError` looks for a socket code or a 429/5xx status, and finds neither.

So the app retried Clerk's 429 and 5xx answers but never a dropped connection. The existing unit test threw a top-level `code: 'ETIMEDOUT'`, a shape the SDK does not produce, so it could not catch this.

Expected: a dropped connection to Clerk is retried like the other transient failures.

## How it was found

BUG-312's E2E helpers hit dropped Clerk connections in CI on 2026-09-30. Checking whether the app's own Clerk retry handles the same failure led to the SDK's request builder, and a probe of the real SDK over a failing `fetch` confirmed the error's shape.

Stripe does not have this gap. Its SDK retries network failures itself: `maxNetworkRetries` defaults to 2, and the SDK adds idempotency keys to POSTs.

## Impact

A dropped connection while reading the signed-in user fails that request, which the user sees as an error, where a retry would almost always have succeeded. The same applies to the identity lookup during provisioning, which then fails closed. No data is wrong; the retry the code intended did not happen. P3.

## Fix

`isTransientClerkError` in `src/adapters/gateways/clerk-retry.ts` is `isTransientExternalError`, plus Clerk's transport failure: an error with no numeric `status` whose errors include `unexpected_error`. That also covers a response body the SDK could not read. Both Clerk read sites use it. Both are reads, so retrying is safe. The shared classifier is unchanged, so Stripe's behavior is untouched.

## Verification

- **Red first, against the real SDK.** The tests obtain the error by calling `@clerk/backend` itself (`createClerkClient(...).users.getUser`) over a stubbed `fetch` (`src/adapters/gateways/test-helpers/clerk-sdk-errors.ts`), not from a hand-built shape.
  - `getCurrentUser` fails once with the SDK's dropped-connection error, then succeeds: two calls. Before the fix it rejected.
  - The provisioner's existing-identity lookup is retried the same way before the conflict is decided.
- **`clerk-retry.test.ts`.** The classifier accepts the SDK's dropped-connection error and its 429, 500 and 503 answers. It rejects its 400, 401, 403, 404 and 422 answers and unrelated errors.
- **The helper's own test.** It returns the SDK's own error for a dropped connection and for a 404, and fails loudly if the SDK does not throw (#1260's Codecov patch check).
- **Mutation checks.** Excluding status-less errors from either call site fails that site's case.

## Resolution (2026-09-30)

- **Shipped.** #1260 merged as `ef63c862` with exact-head approval **5371251023** on `3dc2ac8a`, no findings.
  - Its first head's Codecov patch check failed on the test helper's untested no-throw guard. The helper gained its own test, and the stale approval was dismissed for a full review of the new head.
  - The local full gate passed on that exact head: 6,130 unit, 448 browser and 552 integration tests; build; all 60 E2E tests; the hosted Stripe lane, 7/7.
- **Promoted and released.** Promoted through #1261 (`1d1fdaa0`, merged **20:21:40Z**) after `git fetch` and a passing `verify-promotion` receipt.
  - Its review raised two findings, and the reviewer withdrew both. One claimed Stripe 22.6.2 defaults to one network retry; a runtime probe showed two. The other asked for integration-lane adapter tests, which the error-translation exception covers. The withdrawn CHANGES_REQUESTED review was then dismissed.
  - Release verified: main CI **36772077166** `test` **20:32:58Z**; Ready **20:23:18.487Z**, held without alias until its check completed; production assigned **20:33:00.607Z**; matching trees `1c611df0`; healthy production.
- **Verified on `main`.** Both Clerk read sites use `isTransientClerkError` on `main` at `1d1fdaa0`.
