# DEBT-243: E2E Credential Drift and Silent Failure (Resolved)

**Status:** Resolved  
**Date:** 2026-02-23  
**Owner:** Test Infrastructure

## Verification Note (2026-02-23)

The resolution was re-audited against live repository state. Every implementation artifact in this debt item is present and wired correctly:

- [x] `tests/e2e/helpers/credential-health-check.ts` exists and builds a validator list for `database`, `clerk`, and `stripe` in `buildValidators(...)`.
- [x] `tests/e2e/helpers/credential-health-check.test.ts` exists and covers success, missing env aggregation, multi-failure aggregation, schema drift code, and unexpected error wrapping.
- [x] `tests/e2e/global.setup.ts` invokes `runE2ECredentialHealthCheck()` before any other setup action.
- [x] `.github/workflows/ci.yml` contains `Validate E2E credential inputs` with both `require_non_empty(...)` and `require_not_dummy(...)` guards.
- [x] `instrumentation.ts` logs `[SENTRY_DISABLED] ...` warning in production runtime when DSN is unset.
- [x] `app/api/cron/reconcile-stripe-subscriptions/route.ts` logs structured unauthorized events (`reason: missing_authorization_header` and `reason: invalid_token`).

## Final Outcome

The structural failure mode documented by DEBT-243 is closed:

- E2E credential drift now fails once, early, with actionable error codes.
- CI now validates credential inputs before E2E execution.
- Silent skip behavior for credential drift is removed from setup flow.

## What Is Deliberately Out of Scope

DEBT-243 only covers credential correctness in the E2E setup path. Remaining E2E reliability work is tracked separately:

- `docs/debt/debt-244-test-reliability-schema-and-state-drift.md`
- `docs/debt/debt-245-e2e-pyramid-drift-and-skip-governance.md` (resolved)
