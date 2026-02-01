# BUG-011: UX Flow Gaps — Multiple Navigation and Wiring Issues

**Status:** Open
**Priority:** P1
**Date:** 2026-02-01

---

## Description

The end-to-end user flow has multiple gaps where navigation doesn't work as expected or features aren't properly wired together. A logged-in user clicking "Get Started" encounters several broken or confusing paths.

This is a **compound bug** documenting multiple related UX issues discovered during flow testing.

---

## Issue 1: "Get Started" Goes to Pricing, Not Dashboard (For Logged-In Users)

**Current Behavior:**
- User is logged in (avatar shows in header)
- User clicks "Get Started" button
- User goes to `/pricing` page

**Expected Behavior:**
- If user is logged in AND subscribed → go to `/app/dashboard`
- If user is logged in but NOT subscribed → go to `/pricing`
- If user is NOT logged in → go to `/pricing` (then `/sign-up` after clicking subscribe)

**Root Cause:**
The home page (`app/page.tsx`) has a static "Get Started" link that always goes to `/pricing`:
```tsx
<Link href="/pricing">Get Started</Link>
```

There's no conditional logic to check subscription status.

**Fix:**
Make "Get Started" smart — server component that checks auth + entitlement:
```tsx
// If entitled: Link to /app/dashboard
// If authenticated but not entitled: Link to /pricing
// If not authenticated: Link to /pricing
```

---

## Issue 2: AuthNav Shows "Pricing" Link Even When Subscribed

**Current Behavior:**
- User is logged in and subscribed
- Header still shows "Pricing" link
- Should show "Dashboard" or "Practice" for subscribed users

**Root Cause:**
`components/auth-nav.tsx` line 54-59 always shows "Pricing" link for signed-in users:
```tsx
<SignedIn>
  <Link href="/pricing">Pricing</Link>  // Always shows Pricing
  <UserButton />
</SignedIn>
```

**Expected Behavior:**
- If subscribed: Show "Dashboard" link (not "Pricing")
- If not subscribed: Show "Pricing" link

**Fix:**
AuthNav needs to check entitlement status and conditionally render nav links.

---

## Issue 3: No Visual Feedback for Subscription Status on Home Page

**Current Behavior:**
- Subscribed user on home page sees same UI as non-subscribed user
- No indication they're already paying customers
- "Get Started" button doesn't reflect their status

**Expected Behavior:**
- Subscribed users should see "Go to Dashboard" instead of "Get Started"
- Or at minimum, the nav should clearly show they have access

---

## Issue 4: Missing `/app/dashboard` Content

**Current Behavior:**
Dashboard page (`app/(app)/app/dashboard/page.tsx`) is a placeholder:
```tsx
<p>Your progress and performance will show up here.</p>
```

No actual stats, progress, or useful content.

**Expected Behavior (per SPEC-015):**
- Show total questions answered
- Show accuracy percentage
- Show streak/recent activity
- Show weak areas based on performance

**Impact:**
Users who subscribe land on an empty dashboard with no value.

---

## Issue 5: No Loading States or Error Boundaries

**Current Behavior:**
- `/app/practice` shows "Loading question…" but no skeleton
- No error boundary if question fetch fails
- No retry mechanism

**Expected Behavior:**
- Skeleton loading states for better perceived performance
- Error boundaries with retry buttons
- Graceful degradation

---

## Issue 6: Missing "Back to Dashboard" from Practice

**Current Behavior:**
- User is on `/app/practice`
- Header has Dashboard link (good)
- But practice page itself has no clear exit/back button

**Expected Behavior:**
- Clear navigation back to dashboard
- Or breadcrumb showing Practice > Dashboard

---

## Issue 7: Pricing Page Has No "Already Subscribed" State

**Current Behavior:**
- Subscribed user visits `/pricing`
- Still sees subscribe buttons
- Clicking them might create duplicate checkouts

**Expected Behavior:**
- Show "You're already subscribed" message
- Show link to billing portal or dashboard
- Hide subscribe buttons

---

## Summary Table

| # | Issue | Severity | Component |
|---|-------|----------|-----------|
| 1 | Get Started always goes to /pricing | P2 | `app/page.tsx` |
| 2 | AuthNav shows Pricing for subscribed users | P2 | `components/auth-nav.tsx` |
| 3 | No subscription status on home page | P3 | `app/page.tsx` |
| 4 | Dashboard is empty placeholder | P2 | `app/(app)/app/dashboard/page.tsx` |
| 5 | No loading states/error boundaries | P3 | Multiple components |
| 6 | No back button from practice | P4 | `app/(app)/app/practice/page.tsx` |
| 7 | Pricing page for subscribed users | P2 | `app/pricing/page.tsx` |

---

## Resolution Plan

### Phase 1: Fix Navigation (P2)
1. Make "Get Started" button smart (check entitlement)
2. Update AuthNav to show Dashboard for subscribed users
3. Add "already subscribed" state to pricing page

### Phase 2: Add Dashboard Content (P2)
1. Implement SPEC-015 dashboard with real stats
2. Wire up to statistics domain service

### Phase 3: Polish UX (P3-P4)
1. Add loading skeletons
2. Add error boundaries
3. Add back navigation
4. Add subscription badge/indicator

---

## Verification

- [ ] Logged-in subscribed user clicking "Get Started" goes to dashboard
- [ ] AuthNav shows "Dashboard" (not "Pricing") for subscribed users
- [ ] Pricing page shows "already subscribed" for subscribed users
- [ ] Dashboard shows real statistics
- [ ] Loading states are present on async pages

---

## Related

- BUG-010: Database Not Seeded — No Questions Available (compound issue)
- SPEC-011: Paywall
- SPEC-012: Core Question Loop
- SPEC-015: Dashboard
- `components/auth-nav.tsx`
- `app/page.tsx`
- `app/pricing/page.tsx`
