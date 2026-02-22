# BS-030: Proxy/Middleware Layer — First-Principles Architecture Analysis

**Date:** 2026-02-22
**Triggered by:** `proxy.ts` flagged as a "P0 auth bypass" in 3 of 5 bug sweep audits (all false positives). Recurring false positives suggest a code smell or architectural ambiguity worth investigating.
**Scope:** Is the proxy/middleware layer an anti-pattern? Does it violate SRP? What would the best software engineering minds say?
**Related:** ADR-004 (Auth Boundary), ADR-009 (Security Hardening), BUG-071, BUG-116, DEBT-197

---

## The Problem

Our `proxy.ts` file keeps triggering false-positive "critical auth bypass" findings in automated bug sweeps. Three of five audits have flagged it. The reasons:

1. **Naming inconsistency**: The file is `proxy.ts` (Next.js 16 convention) but the exported function is still named `middleware` — the deprecated convention
2. **Empty middleware-manifest.json**: Next.js 16 tracks proxy separately from legacy middleware, so `"middleware": {}` is normal — but automated analysis reads it as "no middleware registered"
3. **No `middleware.ts` file exists**: Pattern-matching tools look for `middleware.ts` and panic when they don't find one

The question is: are these just naming problems, or is there something structurally wrong with the layer?

## What proxy.ts Actually Does

```
proxy.ts (88 lines)
├── CLERK_CSP_DIRECTIVES — CSP header config for Clerk
├── shouldBypassClerkAuth() — Test-mode bypass (SKIP_CLERK)
├── getClerkMiddleware() — Lazy import + singleton cache
└── export default middleware() — Delegates to Clerk or bypasses
```

### Single Responsibility Analysis

| Concern | SRP Verdict | Notes |
|---------|-------------|-------|
| Auth protection via Clerk | Primary responsibility | This is what the file exists to do |
| CSP header configuration | Part of Clerk config | Passed as options to `clerkMiddleware()` — not a separate concern |
| Test bypass (SKIP_CLERK) | Cross-cutting test concern | Adds complexity but is essential for CI/E2E without Clerk |
| Lazy import + caching | Performance optimization | Cold start optimization for the Clerk SDK |
| Public route matching | Part of auth config | Imported from `lib/public-routes.ts` — well-extracted |

**Verdict**: The file has ONE responsibility — *delegate request-level auth to Clerk*. The supporting concerns (CSP, bypass, caching) are implementation details of that single responsibility, not separate responsibilities.

Uncle Bob's litmus test: "Does this file have more than one reason to change?" The answer is no — it changes only when the auth strategy changes.

## What the Masters Would Say

### Uncle Bob (Clean Architecture)

**Placement**: Correct. `proxy.ts` is at the outermost infrastructure layer — the "Frameworks & Drivers" ring. Auth middleware is a framework concern, not a domain or application concern.

**Dependency direction**: Correct. `proxy.ts` depends inward (imports `PUBLIC_ROUTE_PATTERNS` from `lib/`), never outward. Domain and application layers have zero awareness of it.

**SRP**: Passes. One reason to change. The file is 88 lines — well under the "a class should fit on one screen" heuristic.

### Kent Beck (Four Rules of Simple Design)

1. **Passes the tests**: Yes — E2E suite validates auth guards; build output confirms `ƒ Proxy (Middleware)`
2. **Reveals intention**: Partially. The function name `middleware` in a file called `proxy.ts` obscures intention
3. **No duplication**: Good — `PUBLIC_ROUTE_PATTERNS` is extracted and shared
4. **Fewest elements**: The lazy import + caching pattern adds elements that could be eliminated

### Pragmatic Programmer (Hunt & Thomas)

- **Don't Repeat Yourself**: Auth is checked at 3 layers — but this is defense-in-depth, not duplication. Each layer serves a different purpose:
  - Proxy: optimistic redirect (unauthenticated → sign-in)
  - Layout: entitlement check (authenticated but unsubscribed → pricing)
  - Server action: action-level guard (belt-and-suspenders for IDOR)
- **Say What You Mean**: The `middleware` function name violates this principle

### John Ousterhout (A Philosophy of Software Design)

- **Deep vs Shallow Module**: This is a "pass-through" module — it adds a thin layer over Clerk's middleware. Ousterhout would ask: "What complexity is it absorbing?" Answer: the test bypass and lazy import. Without those, you'd just `export default clerkMiddleware(...)`.
- **Complexity budget**: 88 lines is well within budget. The lazy import pattern is the only non-obvious thing.

## The Real Issue: Naming, Not Architecture

The architecture is sound. The problem is **naming**:

```typescript
// Current: confusing
export default async function middleware(request, event) { ... }

// Next.js 16 convention: clear
export default async function proxy(request, event) { ... }
```

Next.js 16's codemod explicitly renames `function middleware` → `function proxy`. We never ran it. This single naming inconsistency is why every automated tool flags the file.

## The Next.js Philosophy Tension

Next.js 16 docs say:

> "We recommend users avoid relying on Middleware unless no other options exist."
> "Proxy is not intended for slow data fetching… it should not be used as a full session management or authorization solution."

But also:

> "Proxy is particularly useful for implementing custom server-side logic like authentication, logging, or handling redirects."
> "[Proxy is appropriate for] optimistic checks such as permission-based redirects."

And Clerk's official docs say:

> "Create a `proxy.ts` file… The `clerkMiddleware()` helper integrates Clerk authentication into your Next.js application through Middleware."

**Our usage aligns with the supported pattern**: We use proxy for optimistic auth redirects, not as the sole auth mechanism. Our three-layer defense-in-depth ensures that even if proxy were completely removed, the layout entitlement check and server action guards would still protect all data and routes.

## Severity Assessment

| Issue | Severity | Impact |
|-------|----------|--------|
| Function named `middleware` instead of `proxy` | P4 (code smell) | Causes recurring false positives in audits; no runtime impact |
| Three-layer auth defense | Not an issue | This is defense-in-depth by design (ADR-009) |
| Lazy import + caching | P4 (minor complexity) | Performance optimization; adds 10 lines of complexity |
| Overall architecture | Sound | Follows Clean Architecture, SRP, and vendor recommendations |

## Proposed Fix (Sketch)

### Minimum viable fix (recommended)

Rename the function to match the convention:

```diff
- export default async function middleware(
+ export default async function proxy(
    request: NextRequest,
    event: NextFetchEvent,
  ) {
```

This single change would:
- Align with Next.js 16 convention
- Eliminate the primary cause of false-positive audit findings
- Cost zero risk (function name on a default export is cosmetic)

### Optional: Simplify the bypass pattern

The `shouldBypassClerkAuth()` + `getClerkMiddleware()` + caching pattern could be simplified if Clerk's SDK supports a bypass natively. Current approach works but adds cognitive load for readers.

### Not recommended: Remove proxy.ts

Removing proxy.ts and relying solely on layout + server action guards would:
- Lose the fast redirect for unauthenticated users (they'd hit the layout server component before being redirected)
- Lose CSP header injection at the network boundary
- Violate Clerk's recommended integration pattern
- Remove a defense layer (even if the other two are sufficient)

## Open Questions

1. Should we run the Next.js 16 codemod (`npx @next/codemod@canary middleware-to-proxy .`) or just rename the function manually?
2. Should `getClerkMiddleware()` caching be simplified? (The lazy import is needed for SKIP_CLERK bypass, but the caching might be unnecessary if Clerk already singletons internally.)
3. Is DEBT-197 (SKIP_CLERK production guard) fully resolved? The current implementation looks correct but the bypass pattern is the main source of complexity.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-22 | Architecture is sound; naming is the issue | First-principles analysis against SRP, Simple Design, Clean Architecture |
| 2026-02-22 | Recommend renaming `function middleware` → `function proxy` | Aligns with Next.js 16 convention; eliminates recurring false positives |
