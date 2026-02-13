# BUG-132: Duplicate Nav Links — "Pricing" and "Dashboard" Appear Twice in Header

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-12

---

## Description

`AuthNav` (`components/auth-nav.tsx`) renders navigation links that duplicate what the parent layout already provides on the left side of the header. This produces visible double links in 5 out of 7 auth/page combinations.

**Observed:** "Pricing" appears twice on marketing pages (logged out or logged in without entitlement). "Dashboard" appears twice on app pages (logged in with entitlement).

**Expected:** Each navigation link appears exactly once in the header.

## Affected Scenarios

| # | Auth State | Page | Left Nav (layout) | Right Nav (AuthNav) | Duplicate |
|---|-----------|------|--------------------|---------------------|-----------|
| 1 | Unauthenticated | Landing `/` | Features, **Pricing** | **Pricing**, Sign In | Pricing |
| 2 | Unauthenticated | Pricing `/pricing` | Features, **Pricing** | **Pricing**, Sign In | Pricing |
| 3 | Auth + entitled | App `/app/*` (sm+) | **Dashboard**, Practice… | **Dashboard**, UserButton | Dashboard |
| 4 | Auth + entitled | Landing `/` | Features, Pricing | Dashboard, UserButton | None ✓ |
| 5 | Auth + NOT entitled | Landing `/` | Features, **Pricing** | **Pricing**, UserButton | Pricing |
| 6 | Auth + NOT entitled | App `/app/*` | — (redirected) | — (redirected) | N/A |
| 7 | Auth + NOT entitled | Pricing `/pricing` | Features, **Pricing** | **Pricing**, UserButton | Pricing |

Mobile is also affected: `MarketingLayout` renders a second nav row (`sm:hidden`, lines 46–55) with Features + Pricing, while AuthNav stays in the header row — so the Pricing duplicate persists across breakpoints.

On app pages, the duplicate "Dashboard" link is a **desktop-only** issue: `AppDesktopNav` is hidden on mobile (`sm:flex`), so scenario #3 only reproduces at `sm+`.

**Scenario 4 is uniquely correct and valuable** — it's the only header-level "Dashboard" link for entitled users visiting marketing pages. The brand link on marketing pages goes to `ROUTES.HOME`, not the dashboard.

## Steps to Reproduce

1. Sign out → visit landing page → observe "Pricing" in left nav AND next to "Sign In"
2. Sign in (entitled user) → visit any `/app/*` page → observe "Dashboard" in left nav AND next to user avatar
3. Sign in (entitled user) → visit landing page → observe "Dashboard" correctly appears only on the right (no duplicate)

## Root Cause

Three independent issues in `components/auth-nav.tsx`:

### Root Cause A — `unauthenticatedNav` hardcodes "Pricing" (lines 43–48)

```typescript
const unauthenticatedNav = (
  <div className="flex items-center space-x-4">
    <Link href={ROUTES.PRICING} ...>Pricing</Link>      // ← always duplicates MarketingLayout
    <Button asChild size="sm" className="rounded-full">
      <Link href={ROUTES.SIGN_IN}>Sign In</Link>
    </Button>
  </div>
);
```

`unauthenticatedNav` is only ever rendered inside `MarketingLayout`, which already renders "Pricing" on the left (`marketing-layout.tsx:37–38` desktop, lines 52–53 mobile). The link is always a duplicate.

### Root Cause B — `primaryLink = "Pricing"` for non-entitled users (line 72)

```typescript
const primaryLink = entitlement.isEntitled
  ? { href: ROUTES.APP_DASHBOARD, label: 'Dashboard' }
  : { href: ROUTES.PRICING, label: 'Pricing' };  // ← duplicates MarketingLayout
```

Non-entitled authenticated users can only see this on marketing pages (app layout redirects them via `enforceEntitledAppUser` at `layout.tsx:48–50`). MarketingLayout already has "Pricing" on the left, so this is always a duplicate.

### Root Cause C — `primaryLink = "Dashboard"` in app layout context (lines 70–71)

When AuthNav runs inside `AppLayoutShell`, `AppDesktopNav` (`app-desktop-nav.tsx:21–37`) already renders "Dashboard" as the first item in `APP_NAV_ITEMS` (`app-nav-items.ts:9`). The `primaryLink` duplicates it.

However, when AuthNav runs inside `MarketingLayout` (scenario 4), "Dashboard" is useful and unique — it's the only header-level link back to the app. **This case must be preserved.**

## Component Dependency Chain

```
app/page.tsx → renderMarketingHome() → AuthNav() → MarketingLayout({ authNav })
app/pricing/page.tsx → AuthNav() → MarketingLayout({ authNav })
app/(app)/app/layout.tsx → renderAppLayout() → AuthNav() → AppLayoutShell({ authNav })
```

## Affected Files

| File | Role |
|------|------|
| `components/auth-nav.tsx` | Right-side auth nav — renders duplicate links |
| `components/marketing/marketing-layout.tsx` | Marketing header — owns Features + Pricing on left |
| `app/(app)/app/layout.tsx` | App header — composes AppDesktopNav + AuthNav |
| `components/app-desktop-nav.tsx` | Left-side app nav — renders APP_NAV_ITEMS (incl. Dashboard) |
| `components/app-nav-items.ts` | Nav item config — Dashboard is first item |
| `components/marketing/marketing-home.tsx` | Landing page — wires AuthNav into MarketingLayout |
| `app/pricing/page.tsx` | Pricing page — wires AuthNav into MarketingLayout |

## Fix

Three changes to `components/auth-nav.tsx`, plus one to the app layout:

### 1. Remove "Pricing" from `unauthenticatedNav` (fixes root cause A)

The unauthenticated state should render only the "Sign In" button. MarketingLayout owns the "Pricing" link.

### 2. Only set `primaryLink` for entitled users (fixes root cause B)

Non-entitled authenticated users should render only `UserButton` — no `primaryLink`. The "Pricing" link is already in MarketingLayout's left nav, and non-entitled users never reach the app layout.

### 3. Add `showPrimaryLink?: boolean` prop, default `true` (fixes root cause C)

The app layout passes `showPrimaryLink: false` when calling `AuthNav()`, since `AppDesktopNav` already renders Dashboard. Marketing pages keep the default (`true`), preserving the useful "Dashboard" escape hatch in scenario 4.

### 4. App layout passes `showPrimaryLink: false`

In `app/(app)/app/layout.tsx`, update the `AuthNav` call to suppress the Dashboard link.

## Verification

- [ ] Unauthenticated landing page: "Pricing" appears only in left nav, not next to "Sign In"
- [ ] Unauthenticated pricing page: same — no duplicate "Pricing"
- [ ] Authenticated + entitled on app pages: "Dashboard" appears only in left nav, not next to avatar
- [ ] Authenticated + entitled on landing page: "Dashboard" still appears next to avatar (escape hatch preserved)
- [ ] Authenticated + NOT entitled on landing page: no duplicate "Pricing", only UserButton on right
- [ ] Authenticated + NOT entitled on pricing page: same — no duplicate
- [ ] Mobile breakpoints: no duplicates across all scenarios
- [ ] Unit tests for AuthNav cover all auth/entitlement combinations

## Related

- `components/auth-nav.tsx` — primary fix target
- `app/(app)/app/layout.tsx` — needs to pass `showPrimaryLink: false`
- BUG-005 (archived) — previously fixed a broken Dashboard link in AuthNav
