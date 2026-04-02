# DEBT-347: Parallel Fetch Opportunities in App Layout and Billing Page

**Priority:** P4
**Created:** 2026-04-02
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [app/(app)/app/layout.tsx](../../app/(app)/app/layout.tsx), [app/(app)/app/billing/page.tsx](../../app/(app)/app/billing/page.tsx)

---

## Context

The dashboard and history pages already use `Promise.all` for independent data fetches (good). Two other pages have sequential awaits that could be parallelized for a small latency win.

These are minor optimizations — not correctness issues — but they're trivially easy to fix.

---

## Finding 1: App Layout — Sequential `enforceEntitledAppUser` + `authNav`

### File: `app/(app)/app/layout.tsx` (lines 143-144)

```typescript
// CURRENT — sequential
const { subscriptionStatus } = await enforceEntitledAppUserFn();  // Line 143
const authNav = await authNavFn();                                // Line 144
```

These two operations are **independent**:
- `enforceEntitledAppUserFn()` checks auth + subscription
- `authNavFn()` renders the Clerk auth navigation component

Neither depends on the other's result (the `subscriptionStatus` is used only for the banner below, not by `authNav`).

### Fix

```typescript
// AFTER — parallel
const [{ subscriptionStatus }, authNav] = await Promise.all([
  enforceEntitledAppUserFn(),
  authNavFn(),
]);
```

### Impact

This runs on **every single page load** within the app shell. Even a 50ms saving compounds across all users.

---

## Finding 2: Billing Page — Sequential `loadBillingData` + `searchParams`

### File: `app/(app)/app/billing/page.tsx` (lines 164-165)

```typescript
// CURRENT — sequential
const { subscription } = await loadBillingData(props?.deps);  // Line 164
const resolvedSearchParams = await props?.searchParams;        // Line 165
```

These are independent — `searchParams` is a Next.js promise that resolves to URL query parameters, unrelated to billing data.

### Fix

```typescript
// AFTER — parallel
const [{ subscription }, resolvedSearchParams] = await Promise.all([
  loadBillingData(props?.deps),
  props?.searchParams ?? Promise.resolve(undefined),
]);
```

### Impact

Small — billing page is visited infrequently. But it's a one-line change.

---

## What Was Already Parallelized (No Action Needed)

| Page | Pattern | Status |
|------|---------|--------|
| Dashboard (`app/(app)/app/dashboard/page.tsx:260-263`) | `Promise.all([getUserStats, getSessionHistory])` | Already optimized |
| History Questions tab (`app/(app)/app/history/page.tsx:85-96`) | `Promise.all([getAttemptedQuestions, getTags])` | Already optimized |

---

## What Can't Be Parallelized (Data Dependencies)

These sequential patterns are **correct** — each step depends on the previous one:

| Location | Chain | Why Sequential |
|----------|-------|---------------|
| `requireEntitledUserId()` | `requireUser()` → `checkEntitlement(user.id)` | Entitlement check needs `user.id` |
| `loadBillingData()` | `getDeps()` → `requireUser()` → `findByUserId(user.id)` | Each step depends on prior result |
| Billing controller | `requireUser()` → `rateLimiter.limit(user.id)` | Rate limit key includes `user.id` |

No action needed on these.

---

## Scope

- Two files, two one-line changes
- No domain/application layer changes
- No test changes needed (behavior unchanged)

## Estimated Effort

~30 minutes including testing the pages manually.
