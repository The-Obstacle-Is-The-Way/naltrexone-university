# BUG-146: Marketing Footer “Sign in/up” Casing Is Inconsistent with the Rest of the App

**Status:** Open
**Priority:** P4
**Date:** 2026-02-17
**Component:** Frontend — Marketing Shell (Copy Consistency)

---

## Description

The marketing footer renders “Sign in” / “Sign up” (sentence case), while the rest of the application consistently uses “Sign In” / “Sign Up” (title case) in headings, metadata titles, and primary auth navigation.

This is a small UI inconsistency, but it creates avoidable cross-shell polish drift (marketing vs app) and undermines the “single source of truth” intent of shared components like `AuthNav`.

---

## Evidence

### Marketing footer uses sentence case

`components/marketing/marketing-layout.tsx:84-89`

```tsx
<Link href={ROUTES.SIGN_IN} className={navLinkClass}>
  Sign in
</Link>
<Link href={ROUTES.SIGN_UP} className={navLinkClass}>
  Sign up
</Link>
```

### App auth navigation and auth pages use title case

`components/auth-nav.tsx:43-47`

```tsx
<Button asChild size="sm" className="rounded-full">
  <Link href={ROUTES.SIGN_IN}>Sign In</Link>
</Button>
```

`app/sign-in/[[...sign-in]]/sign-in-page-client.tsx:25`

```tsx
<h1 className="text-xl font-semibold text-foreground">Sign In</h1>
```

`app/sign-up/[[...sign-up]]/sign-up-page-client.tsx:25`

```tsx
<h1 className="text-xl font-semibold text-foreground">Sign Up</h1>
```

---

## Impact

- Minor trust/polish regression: visible copy inconsistency across top-level navigation surfaces.
- Creates future churn when standardizing copy (“Sign In” becomes a moving target).

---

## Root Cause

The marketing footer hardcodes auth-link labels instead of reusing a canonical copy source or aligning with existing auth UI.

---

## Proposed Fix

Pick a canonical casing (recommended: “Sign In” / “Sign Up” to match auth page headings and metadata) and update:

- `components/marketing/marketing-layout.tsx` footer labels
- Any snapshot/string-based tests that assert these labels

Optionally document the standard in `docs/frontend/standards.md` under a “Copy” subsection if the project wants to enforce this consistently.

---

## Verification Plan

- `pnpm test --run`
- Manually verify footer links on:
  - `/`
  - `/pricing`
