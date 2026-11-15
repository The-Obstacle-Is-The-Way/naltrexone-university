# DEBT-504: Request Correlation Duplicates the Hosting Platform

**Status:** Open — folded into DEBT-528 as its step 1; close as Superseded
**Priority:** P4
**Date:** 2026-10-06

---

## Summary

Five entry points create a random request ID and pass a child logger by hand. Vercel already groups a request's runtime log lines by its own request ID. The application's ID is a different value and reaches only those five paths.

## Evidence

Checked at `34d9aea0`.

- `lib/request-context.ts:10-24` makes a UUID and binds it to a pino child.
- Its five callers are health, the Stripe, Clerk and Resend webhooks, and subscribe (`app/pricing/subscribe-to-plan.ts:37-43`). None passes a user ID or an incoming ID.
- Subscribe forwards the child through `ActionOptions.logger` (`src/adapters/controllers/create-action.ts:9`). Without it, `handleError` logs to the root logger (`src/adapters/controllers/action-result.ts:52`), the one the container injects (`lib/container.ts:48`).
- ADR-008 (`docs/adr/adr-008-logging-observability.md:30,40-43`) decided these request IDs, so removing them needs an ADR-008 amendment.

## Impact

The extra ID adds wiring and suggests coverage it does not have. No lost data or failure is established; Vercel still correlates a hosted request's lines.

## Options

1. Keep both IDs and test each propagation edge.
2. Add `AsyncLocalStorage`. This keeps a second ID with no cross-request need.
3. Remove the custom ID, its helper and the per-call logger option; keep the injected `Logger` port.

## Resolution (decided)

Option 3, decided 2026-10-06. It now lives in DEBT-528 as step 1, beside the other entry-point copies, with its red test, the ADR-008 amendment and the log check. The earlier extra, routing `handleError` through each controller's resolved logger, is dropped: that logger is the same root logger `handleError` already uses, so it would add a hook for no change.

## Verification

- [x] DEBT-528 step 1 carries the whole resolution and its checks (2026-11-15).

## Related

- DEBT-528, which supersedes this record.
- BUG-324, which dropped the per-call option once as a stopgap.

Corrected 2026-11-15: folded into DEBT-528 step 1; added ADR-008's request-ID decision, which the removal amends; dropped the resolved-logger hook as a no-op; the Drains API now answers 404 for this Hobby team, so the 2026-10-06 "no drains" reading could not be repeated; finished history is in git at `34d9aea0`.
