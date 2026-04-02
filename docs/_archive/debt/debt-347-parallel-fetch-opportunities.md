# DEBT-347: Parallel Fetch Opportunities in Layout, Pricing, and Billing

**Priority:** P4
**Created:** 2026-04-02
**Resolved:** 2026-04-02
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [app/(app)/app/layout.tsx](../../../app/(app)/app/layout.tsx), [app/pricing/page.tsx](../../../app/pricing/page.tsx), [app/(app)/app/billing/page.tsx](../../../app/(app)/app/billing/page.tsx)

---

## Context

The dashboard, history questions tab, and marketing home page already use `Promise.all` for independent work. A few other server components still await independent work sequentially.

These are minor optimizations, not correctness issues, but they are cheap wins.

---

## Finding 1: App Layout — Sequential `enforceEntitledAppUser` + `authNav`

### File: `app/(app)/app/layout.tsx`

```typescript
// CURRENT
const { subscriptionStatus } = await enforceEntitledAppUserFn();
const authNav = await authNavFn();
```

These two operations are independent:

- `enforceEntitledAppUserFn()` checks auth + entitlement
- `authNavFn()` renders the auth nav

### Fix

```typescript
const [{ subscriptionStatus }, authNav] = await Promise.all([
  enforceEntitledAppUserFn(),
  authNavFn(),
]);
```

### Impact

This runs on every app-shell render, so even a modest savings compounds.

---

## Finding 2: Pricing Page — Sequential `loadPricingData`, `searchParams`, and `AuthNav`

### File: `app/pricing/page.tsx`

```typescript
// CURRENT
const pricingData = await loadPricingData(deps);
const resolvedSearchParams = await searchParams;
const authNav = await resolvedAuthNavFn();
```

At the await boundary these are independent.

### Fix

```typescript
const [pricingData, resolvedSearchParams, authNav] = await Promise.all([
  loadPricingData(deps),
  searchParams,
  resolvedAuthNavFn(),
]);
```

### Impact

Still small, but pricing is a public entry point, so minor latency improvements matter more here than on lower-traffic internal pages.

---

## Finding 3: Billing Page — Sequential `loadBillingData` + `searchParams`

### File: `app/(app)/app/billing/page.tsx`

```typescript
// CURRENT
const { subscription } = await loadBillingData(props?.deps);
const resolvedSearchParams = await props?.searchParams;
```

These are independent.

### Fix

```typescript
const [{ subscription }, resolvedSearchParams] = await Promise.all([
  loadBillingData(props?.deps),
  props?.searchParams,
]);
```

### Impact

Small. Billing is lower traffic than the shell or pricing page, but the fix is trivial.

---

## What Was Already Parallelized (No Action Needed)

| Page | Pattern | Status |
|------|---------|--------|
| Dashboard (`app/(app)/app/dashboard/page.tsx:260-263`) | `Promise.all([getUserStats, getSessionHistory])` | Already optimized |
| History Questions tab (`app/(app)/app/history/page.tsx:85-96`) | `Promise.all([getAttemptedQuestions, getTags])` | Already optimized |
| Marketing home (`components/marketing/marketing-home.tsx:277-280`) | `Promise.all([authNav, getStartedCta])` | Already optimized |

---

## Lower-Signal Follow-Ons

These are real but smaller:

- [`app/(app)/app/practice/[sessionId]/page.tsx`](../../../app/(app)/app/practice/[sessionId]/page.tsx) awaits `params` and `searchParams` sequentially
- [`app/(app)/app/questions/[slug]/page.tsx`](../../../app/(app)/app/questions/[slug]/page.tsx) does the same
- [`app/(app)/app/bookmarks/page.tsx`](../../../app/(app)/app/bookmarks/page.tsx) has minor await-order cleanup potential

These are worth batching only after the higher-value shell/pricing/billing cases above.

---

## What Can't Be Parallelized

These sequential chains are still correct:

| Location | Chain | Why Sequential |
|----------|-------|---------------|
| `requireEntitledUserId()` | `requireUser()` -> `checkEntitlement(user.id)` | Entitlement needs `user.id` |
| `loadBillingData()` | `requireUser()` -> `findByUserId(user.id)` | Subscription lookup needs `user.id` |
| Billing/practice action paths | `requireUser()` -> rate limit by `user.id` | Rate-limit key depends on `user.id` |

## Scope

- Three files
- Small await-order changes only
- No domain/application layer changes
- No behavior changes

## Estimated Effort

~30-45 minutes including manual verification.

## Resolution (2026-04-02)

Completed:

- `app/(app)/app/layout.tsx` now batches `enforceEntitledAppUserFn()` and `authNavFn()`
- `app/pricing/page.tsx` now batches `loadPricingData(deps)`, `searchParams`, and `resolvedAuthNavFn()`
- `app/(app)/app/billing/page.tsx` now batches `loadBillingData(props?.deps)` and `props?.searchParams`
- `app/(app)/app/practice/[sessionId]/page.tsx` now batches `params` and `searchParams`
- `app/(app)/app/questions/[slug]/page.tsx` now batches `params` and `searchParams`
- `app/(app)/app/bookmarks/page.tsx` now batches `searchParams` and `getBookmarksFn({})`
- Added focused regression coverage in `app/(app)/app/layout-shell.test.tsx`
- Added focused regression coverage in `app/pricing/page.test.tsx`
- Added focused regression coverage in `app/(app)/app/billing/page.test.tsx`
- Added focused regression coverage in `app/(app)/app/practice/[sessionId]/page.test.tsx`
- Added focused regression coverage in `app/(app)/app/questions/[slug]/page.test.tsx`
- Added focused regression coverage in `app/(app)/app/bookmarks/page.test.tsx`

Verification passed on 2026-04-02:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- `pnpm test:browser`
- `pnpm build`
