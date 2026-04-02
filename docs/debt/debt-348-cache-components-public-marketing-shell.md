# DEBT-348: Cache Components for Public Marketing Shell

**Priority:** P3
**Created:** 2026-04-02
**Source:** Broader Next.js 16 / Vercel performance audit
**Related:** [ADR-010 Caching Strategy](../adr/adr-010-caching-strategy.md), [next.config.ts](../../next.config.ts), [app/page.tsx](../../app/page.tsx), [app/pricing/page.tsx](../../app/pricing/page.tsx), [components/marketing/marketing-home.tsx](../../components/marketing/marketing-home.tsx), [components/marketing/marketing-layout.tsx](../../components/marketing/marketing-layout.tsx)

---

## Context

Next.js 16 Cache Components make it possible to keep a route's static shell cached while rendering user-specific pieces dynamically behind `Suspense`. That pattern fits this app's public marketing surfaces well:

- `/` is mostly static copy and pricing teasers
- `/pricing` is mostly static plan content
- only the auth-aware nav / CTA / entitlement guidance needs per-request personalization

The repo does **not** currently enable `cacheComponents` in [`next.config.ts`](../../next.config.ts), and there is no `use cache` usage checked in.

---

## The Problem

The current public pages do personalized server work directly in the main render path:

- [`app/page.tsx`](../../app/page.tsx) renders [`components/marketing/marketing-home.tsx`](../../components/marketing/marketing-home.tsx), which resolves `AuthNav()` and `GetStartedCta()` before returning the full page
- [`app/pricing/page.tsx`](../../app/pricing/page.tsx) resolves `loadPricingData()` and `AuthNav()` before returning the page shell
- both auth-aware helpers currently perform Clerk user lookup plus entitlement lookup for signed-in users

That means pages that are mostly static still wait on user-specific server work. The result is:

- weaker cacheability for public entry points
- slower time-to-first-byte on marketing pages for signed-in traffic
- unnecessary Vercel compute on routes whose main content does not actually depend on per-user data

---

## Proposed Fix

### Phase 1: Enable Cache Components

Turn on `cacheComponents` in [`next.config.ts`](../../next.config.ts) after targeted verification of the marketing routes.

### Phase 2: Keep the Marketing Shell Static

Move the stable page shell into cacheable components:

- header/footer layout structure
- hero copy
- feature sections
- static pricing cards

### Phase 3: Isolate Dynamic User-Specific Islands

Render these behind `Suspense` with lightweight fallbacks:

- `AuthNav`
- entitlement-aware primary CTA
- pricing-page banner state derived from signed-in entitlement

The dynamic islands should keep using fresh auth + entitlement checks per request. Do **not** cross-request cache any user-specific state.

---

## Why This Matters

- **Conversion path:** `/` and `/pricing` are public entry points, so latency matters more than on many internal pages
- **Vercel cost:** static shell reuse reduces server work on repeat traffic
- **Architecture fit:** this keeps ADR-010 intact by caching only static marketing content, not subscription state

---

## What This Is Not

- Not a Redis project
- Not full-page static generation of personalized routes
- Not a reason to cache entitlement across requests

This is specifically about separating the public shell from the personalized chrome.

## Scope

- `next.config.ts`
- Public marketing route composition only (`/`, `/pricing`, shared marketing layout/components)
- No domain/application changes
- No auth correctness changes

## Estimated Effort

~4-6 hours including verification of signed-out and signed-in behavior on home and pricing pages.
