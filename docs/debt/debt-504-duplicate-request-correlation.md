# DEBT-504: Request Correlation Duplicates the Hosting Platform

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — remove the duplicate request ID and manual propagation; retain logger injection
**Priority:** P4
**Date:** 2026-10-06
**Resolved:** —
**Verification receipts:** —

## Summary

Five entry points create a random request ID and manually pass a child logger.
Vercel already associates runtime log rows with its request ID. The application
ID is a different value, not Vercel's ID, and is not propagated across all paths.

## Evidence

Inspected on `main` at `0f324edd`:

- `lib/request-context.ts:10-24` generates a UUID and binds it to a pino child.
- `rg -n 'createRequestContext|getRequestLogger' app lib` finds five production
  callers: subscribe, health, and the Stripe, Clerk and Resend webhook routes.
  None passes a user ID or an incoming correlation ID.
- `app/pricing/subscribe-to-plan.ts:43` forwards the child through the controller's
  optional logger. BUG-324's production-only stopgap dropped that option.
  Its final server-only controller design restored it.
- Vercel's [runtime-log documentation](https://vercel.com/docs/logs/runtime)
  describes request IDs on log rows. This is platform correlation, not a claim
  that pino JSON itself contains the platform ID or that local logs have it.
- Vercel's deployment API dates the stopgap promotion #1388 to production at
  2026-10-06T04:58:32.853Z and the final design #1390 at 06:17:47.567Z: about
  79 minutes. The code proves the option was dropped; historical per-line logs
  are outside Hobby's one-hour retention and were not re-read.

## Impact

The extra ID adds manual wiring and suggests coverage it does not provide.
No lost business data or remaining checkout failure is established. Correlation
inside a hosted request remains available through Vercel.

## Options

1. Keep both IDs and test each propagation edge. This preserves duplicate
   concepts and creates work whenever an entry point changes.
2. Add `AsyncLocalStorage`. This would improve propagation but retains a second
   ID without a demonstrated cross-request requirement.
3. Remove the custom ID and context helper. Use Vercel's request grouping for
   hosted diagnosis and keep the injected `Logger` port for testability.

## Resolution (decided)

Option 3. Remove the five context creations and the unused helper in a separate
code PR. Keep logger injection and useful fixed operation fields. Do not replace
it with implicit global context, an environment switch, or a framework import
in the application layer.

Before removal, the owner confirms no external log consumer relies on this JSON
field; this audit can establish repository callers, not private consumers. If
local cross-request correlation becomes a real requirement, specify its scope
and transport separately rather than retaining this incomplete mechanism.

## Verification

- [ ] Implementer writes red-first tests that the five entry points still emit
  their operational messages through the injected logger.
- [ ] No production call or import of the removed helper remains; the deletion
  guard fails when the pattern returns.
- [ ] Owner confirms external consumers do not depend on the custom field.
- [ ] After promotion, capture one ordinary hosted request within one hour and
  confirm its server lines are grouped by Vercel. Record counts/statuses only.

## Related

- [BUG-324](../bugs/bug-324-server-actions-accept-caller-supplied-dependencies.md).
- [Logging](../dev/logging.md).
