# DEBT-098: Clerk UI Components Not Fully Themed for Achromatic Dark Mode

**Status:** Open
**Priority:** P2
**Date:** 2026-02-04

---

## Description

The DEBT-097 achromatic dark mode redesign updated the sign-in and sign-up pages with partial Clerk theming (hardcoded `appearance.variables`), but several Clerk UI touchpoints remain unthemed or inconsistently themed:

1. **`<UserButton />`** — zero theming applied, uses Clerk's default detection
2. **`<ClerkProvider>`** — no global `appearance` prop, so each component must be themed individually
3. **`@clerk/themes` not installed** — cannot use `baseTheme: dark` for comprehensive dark mode
4. **Sign-in/sign-up page background mismatch** — uses `bg-muted` (#1c1c1c) instead of `bg-background` (#090909)
5. **OAuth branded screens** — Clerk's hosted OAuth consent page uses Clerk Dashboard branding (not configurable via code)

## Current State

### What's themed (from DEBT-097 PR 3)

```tsx
// app/sign-in/[[...sign-in]]/page.tsx (and sign-up equivalent)
<SignIn
  appearance={{
    variables: {
      colorBackground: '#1c1c1c',    // Matches --muted, not --background
      colorPrimary: '#e4e4e7',
      colorText: '#ededed',
      colorTextSecondary: '#737373',
      borderRadius: '0.75rem',
    },
  }}
/>
```

### What's not themed

| Component | Location | Issue |
|-----------|----------|-------|
| `<UserButton />` | `components/auth-nav.tsx:98` | No `appearance` prop — uses Clerk default |
| `<ClerkProvider>` | `components/providers.tsx:24` | No global `appearance` — theming is per-component |
| Sign-in page wrapper | `app/sign-in/[[...sign-in]]/page.tsx:26` | `bg-muted` background (#1c1c1c) instead of `bg-background` (#090909) |
| Sign-up page wrapper | `app/sign-up/[[...sign-up]]/page.tsx:26` | Same background mismatch |
| OAuth consent page | Clerk Dashboard | Uses Clerk's default branding — must configure in Clerk Dashboard, not code |

## Impact

- **Visual inconsistency:** The UserButton dropdown and OAuth screens may render in Clerk's default light theme, clashing with the achromatic dark app
- **Fragile theming:** Without global `<ClerkProvider appearance={...}>`, every new Clerk component needs manual theming
- **Background mismatch:** Sign-in/sign-up pages have a lighter background (#1c1c1c) than the rest of the app (#090909), creating a visible seam

## Resolution

### Step 1: Install `@clerk/themes`

```bash
pnpm add @clerk/themes
```

### Step 2: Add global Clerk theme to `<ClerkProvider>`

```tsx
// components/providers.tsx
import { dark } from '@clerk/themes';

<ClerkProvider
  appearance={{
    baseTheme: dark,
    variables: {
      colorBackground: '#090909',
      colorPrimary: '#e4e4e7',
      colorText: '#ededed',
      colorTextSecondary: '#737373',
      borderRadius: '0.75rem',
    },
  }}
>
  {children}
</ClerkProvider>
```

This globally themes all Clerk components (SignIn, SignUp, UserButton, UserProfile, etc.).

### Step 3: Remove per-component `appearance` from SignIn/SignUp

Once the global theme is set, individual `appearance` props on `<SignIn>` and `<SignUp>` can be removed (or kept as overrides if needed).

### Step 4: Fix sign-in/sign-up page backgrounds

```tsx
// Change from:
<div className="flex min-h-screen items-center justify-center bg-muted">
// Change to:
<div className="flex min-h-screen items-center justify-center bg-background">
```

### Step 5: Configure Clerk Dashboard branding (manual)

In the Clerk Dashboard under **Branding**:
- Set background color to `#090909`
- Set accent/button color to `#e4e4e7`
- Upload dark-mode-compatible logo

This affects the hosted OAuth consent page and Clerk-hosted UI.

### Step 6: Theme UserButton specifically (if global theme insufficient)

```tsx
// components/auth-nav.tsx
<UserButton
  appearance={{
    elements: {
      avatarBox: 'ring-2 ring-zinc-700',
      userButtonPopoverCard: 'bg-zinc-900 border-zinc-800',
    },
  }}
/>
```

## Verification

- [ ] `@clerk/themes` installed and `baseTheme: dark` applied globally
- [ ] Sign-in page: dark background, Clerk widget matches achromatic theme
- [ ] Sign-up page: same as sign-in
- [ ] UserButton dropdown: dark background, readable text
- [ ] OAuth flow: Google sign-in popup/redirect has dark branding (Clerk Dashboard config)
- [ ] No visual seam between app pages and Clerk pages
- [ ] All existing tests pass (Clerk is mocked in tests)

## Related

- DEBT-097: Premium achromatic UI redesign (resolved — this is follow-up work)
- `components/providers.tsx` — ClerkProvider wrapper
- `components/auth-nav.tsx` — UserButton usage
- `app/sign-in/[[...sign-in]]/page.tsx` — Current partial theming
- `app/sign-up/[[...sign-up]]/page.tsx` — Current partial theming
