# DEBT-504: Request Correlation Duplicates the Hosting Platform

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — remove the request-ID helper and the per-call logger option; keep the Logger port in controller dependencies
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
3. Remove the custom ID, its context helper and the per-call logger option. Use
   Vercel's request grouping for hosted diagnosis and keep the injected `Logger`
   port for testability.

## Resolution (decided)

Option 3, in a separate code PR:

- Remove `lib/request-context.ts` and its five callers. The five entry points
  log through the `Logger` in their resolved dependencies, built by the
  container, as the use cases already do.
- Remove `ActionOptions.logger` from `createAction`
  (`src/adapters/controllers/create-action.ts`) and the threaded
  `{ logger: requestLogger }` in `app/pricing/subscribe-to-plan.ts`. Without the
  request ID it only repeats `handleError`'s default logger, and it is the
  optional per-call channel that BUG-324's stopgap dropped in production, as an
  accepted trade-off. Once `ActionOptions` has no `logger`, passing one fails
  typecheck, so the type system keeps it from returning.
  `handleError` logs through the controller's resolved `Logger` when one exists.
- Keep the `Logger` port and its injection through dependencies. Do not replace
  it with implicit global context, an environment switch, or a framework import
  in the application layer.

No owner confirmation is needed: the project is on Vercel's Hobby plan and has
no log drains (the Drains API returned none on 2026-10-06), so nothing outside
Vercel reads these fields. If cross-request correlation becomes a real
requirement, specify its scope and transport separately.

*Corrected 2026-10-06: removing the per-call logger option replaces #1410's
"retain logger injection", which kept that option; the owner check is answered
from the Drains API (#1410 review).*

## Verification

- [ ] Red first: each of the five entry points still emits its operational
  messages through the `Logger` in its dependencies, and a controller's
  unexpected error is logged through the controller's resolved `Logger`.
- [ ] `lib/request-context.ts` and `ActionOptions.logger` are gone, and no
  caller passes a logger per call.
- [ ] Engineering, within an hour of the promotion: one production request's
  server lines appear together under its Vercel request ID
  (`vercel logs --request-id`). Record counts and statuses only.

## Related

- [BUG-324](../_archive/bugs/bug-324-server-actions-accept-caller-supplied-dependencies.md).
- [Logging](../dev/logging.md).
