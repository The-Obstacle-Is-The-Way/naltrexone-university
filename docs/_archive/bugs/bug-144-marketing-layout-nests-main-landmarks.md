# BUG-144: MarketingLayout Nests `<main>` Landmarks (Regression of BUG-100)

**Status:** Fixed
**Priority:** P2
**Date:** 2026-02-17
**Component:** Frontend — Marketing Shell (Accessibility)

---

## Description

The marketing shell currently renders **nested `<main>` landmarks** on marketing pages (`/` and `/pricing`). The root layout provides a global skip link to `#main-content`, but the marketing tree composes:

- `MarketingLayout` → `<main>{children}</main>`
- Page/View component → `<main id="main-content" tabIndex={-1}>…</main>`

This reintroduces the same semantic/a11y problem previously fixed in **BUG-100** (nested main landmarks), but now via the marketing layout abstraction.

**Expected:** Each document should expose exactly **one** main landmark.

**Actual:** Marketing pages expose **two** main landmarks, nested.

---

## Evidence

### 1) Outer `<main>` in the marketing shell

`components/marketing/marketing-layout.tsx:59`

```tsx
<main>{children}</main>
```

### 2) Landing page renders its own main landmark

`components/marketing/marketing-home.tsx:65-67`

```tsx
<MarketingLayout authNav={authNav} featuresHref="#features">
  <main id="main-content" tabIndex={-1}>
```

### 3) Pricing page renders its own main landmark inside MarketingLayout

`app/pricing/page.tsx:151-162`

```tsx
<MarketingLayout authNav={authNav} featuresHref={`${ROUTES.HOME}#features`}>
  <PricingView ... />
</MarketingLayout>
```

`app/pricing/pricing-view.tsx:35-40`

```tsx
<main id="main-content" tabIndex={-1} className="min-h-screen bg-background py-16">
```

---

## Impact

- Screen readers can report multiple main landmarks, weakening landmark navigation.
- Semantic expectations of the skip link are muddied (the `#main-content` target is nested inside another `<main>`).
- Accessibility regressions can slip past tests because current coverage asserts `#main-content` exists but does not assert **main landmark uniqueness**.

---

## Root Cause

After BUG-100 removed the root layout `<main>`, marketing pages correctly owned the primary main landmark (`#main-content`). Introducing `MarketingLayout` added an outer `<main>` wrapper, unintentionally reintroducing nesting for any child that correctly renders its own `<main id="main-content">`.

---

## Proposed Fix

Choose **one** owner of the main landmark for marketing routes:

### Option A (Recommended): MarketingLayout owns the main landmark

1. Change `MarketingLayout` to:
   - render `<main id="main-content" tabIndex={-1}>…</main>` instead of `<main>{children}</main>`
2. Update marketing pages/views (`MarketingHomeShell`, `PricingView`) to remove their inner `<main>` wrappers (replace with `<div>` or `<section>` as appropriate).

**Benefit:** Centralizes `#main-content` ownership for all marketing pages, preventing future drift.

### Option B: Pages/views own the main landmark (no `<main>` in MarketingLayout)

1. Replace `MarketingLayout`’s `<main>` with a `<div>` wrapper.
2. Keep `MarketingHomeShell` and `PricingView` as the main landmark owners.

**Risk:** Future marketing pages could accidentally omit `#main-content` if they forget to provide their own `<main>`.

---

## Verification Plan

- Add/extend regression tests to assert **exactly one** `<main>` is rendered for:
  - Marketing home (`components/marketing/marketing-home.test.tsx`)
  - Pricing page (`app/pricing/page.test.tsx`) or Pricing view
- Verify the root skip link (`app/layout.tsx:38-43`) still targets the active `#main-content`.

---

## Related

- [BUG-100](./bug-100-nested-main-landmarks-in-layouts.md) — original nested-main fix
- `components/marketing/marketing-layout.tsx`
- `components/marketing/marketing-home.tsx`
- `app/pricing/page.tsx`
- `app/pricing/pricing-view.tsx`
