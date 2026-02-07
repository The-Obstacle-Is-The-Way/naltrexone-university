# DEBT-140: Request Correlation Is Defined but Not Wired Into Runtime Logs

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The architecture docs define request-level correlation (`requestId`) for logs, but runtime logging paths do not currently propagate request context.

Validated from first principles:

- `lib/request-context.ts` exists and provides `createRequestContext` / `getRequestLogger`
- no imports of `lib/request-context.ts` were found in `app/`, `src/`, `lib/`, or `tests/`
- route handlers and controllers log errors/events, but without standardized `requestId` propagation
- ADR-008 compliance checklist still has unchecked request-correlation items

## Impact

- Incident forensics are slower because logs cannot be reliably stitched per request/action
- Cross-boundary debugging is harder in webhook and billing paths
- Observability implementation drifts from accepted ADR decisions

## Resolution

1. Generate a `requestId` at each route/server-action entrypoint
2. Create a child logger with request context and pass it through controller dependencies
3. Ensure every log emitted during a request includes the same `requestId`
4. Add focused tests for key handlers verifying request-context logging fields

## Verification

- [ ] Entry routes/actions create and propagate `requestId`
- [ ] Logs from a single request share the same `requestId`
- [ ] ADR-008 checklist items for correlation are checked
- [ ] `pnpm typecheck` and `pnpm test --run` pass

## Related

- `lib/request-context.ts`
- `lib/logger.ts`
- `docs/adr/adr-008-logging-observability.md`
- `app/api/stripe/webhook/handler.ts`
- `app/api/webhooks/clerk/handler.ts`
- `app/api/health/handler.ts`
