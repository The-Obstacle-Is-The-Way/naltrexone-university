# BUG-216: Health Handler Directly Imports `drizzle-orm` in App Layer

**Status:** Invalidated (false positive)
**Priority:** ~~P3~~ N/A
**Date:** 2026-03-13

## Summary

The earlier report called the direct `drizzle-orm` import a Clean Architecture violation. That is not accurate in this repo: `app/api/health/handler.ts` lives in the framework layer, the master spec explicitly says this route should run `SELECT 1` via Drizzle, and the handler already injects its mutable collaborators for testability.

## Invalidation Reason

Tracer-bullet verification showed this is an SSOT-aligned framework-edge implementation, not a bug:

1. **`app/` is not an inner application layer in this repo.** ADR-012 classifies `app/`, `lib/`, and `db/` as the outer **Frameworks & Drivers** layer, while `src/application/` and `src/adapters/` are the inner Clean Architecture layers. See `docs/adr/adr-012-directory-structure.md:27-55` and `88-108`.
2. **The master spec explicitly requires this exact shape.** `docs/specs/master_spec.md:683-692` says the health route applies rate limiting, then runs `SELECT 1` via Drizzle, then returns the JSON health payload.
3. **The handler already injects the changeable dependencies.** `app/api/health/handler.ts:8-15` defines `HealthHandlerDeps` with injected `db.execute`, `logger`, `rateLimiter`, and `now`, and `app/api/health/handler.ts:17-71` uses those dependencies rather than reaching into global singletons from the handler body.
4. **The direct Drizzle dependency is limited to the edge probe itself.** `app/api/health/handler.ts:1` imports `sql` / `SQLWrapper`, and `app/api/health/handler.ts:47-64` uses that only to execute `sql\`SELECT 1\``. For an outer-layer health endpoint, that is expected.
5. **The route is already highly testable without a health-check port.** `app/api/health/route.test.ts:8-149` and `152-290` construct the handler with injected `execute`, `FakeLogger`, `FakeRateLimiter`, and `now` values and verify all success and failure paths.
6. **No current SSOT requires a `HealthCheckGateway` abstraction.** There is no health-check port in `src/application/ports`, and the spec/ADR set does not call for one.

## Conclusion

This is a false positive. The current handler is consistent with the repo's architecture and specification. If the team later wants a reusable health-check abstraction for consistency, that would be optional P4 debt, not a bug fix required by the current SSOT.
