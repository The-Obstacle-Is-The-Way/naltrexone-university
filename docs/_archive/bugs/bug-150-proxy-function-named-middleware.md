# BUG-150: Proxy Default Export Named `middleware` — Recurring False-Positive Audit Noise

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-23
**Resolved:** 2026-02-23

---

## Description

`proxy.ts` previously exported `async function middleware(...)`. The file is
correctly named `proxy.ts` and Next.js 16 recognizes it as
`ƒ Proxy (Middleware)` at build time. The stale function name created
cross-audit false positives and local naming confusion.

The mismatch:

1. Triggers false-positive "auth bypass" flags in every automated sweep
2. Confuses developers reading the code — the file says "proxy" but the function says "middleware"
3. Creates noise in every security audit (see BS-030 decision log)

Runtime behavior is unaffected — Next.js resolves the proxy by file convention, not by export name.

## Root Cause

When the project migrated from `middleware.ts` to `proxy.ts` (Next.js 16 convention), the default export function name was never updated to match.

## Exact Fix

### Change 1: Rename default export (1 line)

**File:** `proxy.ts` line 69

```diff
- export default async function middleware(
+ export default async function proxy(
    request: NextRequest,
    event: NextFetchEvent,
  ) {
```

### Change 2: Rename inner Clerk variable to avoid shadowing (1 line)

**File:** `proxy.ts` line 52

The local variable `const middleware = clerkMiddleware(...)` inside `getClerkMiddleware()` should be renamed to avoid confusion with the old export name:

```diff
-   const middleware = clerkMiddleware(
+   const clerkMw = clerkMiddleware(
      async (auth, request) => {
        if (!isPublicRoute(request)) {
          await auth.protect();
        }
      },
      {
        contentSecurityPolicy: {
          directives: CLERK_CSP_DIRECTIVES,
        },
      },
    );

-   cachedClerkMiddleware = middleware;
-   return middleware;
+   cachedClerkMiddleware = clerkMw;
+   return clerkMw;
```

### Total changes: 2 lines renamed in `proxy.ts`

No other files reference the default export by name — it's consumed by Next.js convention.

## Verification

- [x] `pnpm build` still prints `ƒ Proxy (Middleware)` — confirms Next.js recognizes the proxy
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes
- [x] Added regression test `proxy.test.ts` to enforce default export name `proxy`
- [x] `rg -n "function middleware\\(" proxy.ts` returns no matches

## Related

- BS-030 (Proxy/Middleware Layer — First-Principles Architecture Analysis)
- ADR-004 (Auth Boundary)
- BUG-071 (CSP / preview blank page — original proxy migration context)
