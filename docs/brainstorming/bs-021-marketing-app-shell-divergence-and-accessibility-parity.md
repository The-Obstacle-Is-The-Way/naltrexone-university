# BS-021: Marketing/App Shell Divergence and Accessibility Parity

**Date:** 2026-02-17
**Triggered by:** Side-by-side audit of logged-out landing page vs logged-in dashboard shell
**Scope:** Structural, semantic, and navigation consistency between marketing and authenticated app shells (separate from BS-020 card contrast)
**Related:** [BS-020](./bs-020-card-contrast-and-hover-consistency.md), [Design Principles](../frontend/design-principles.md), [Frontend Standards](../frontend/standards.md)

---

## The Problem

The product intentionally has two shells:

- Marketing shell (logged out): discovery + conversion
- App shell (logged in): task execution

That separation is good architecture. But the current implementation has a mix of:

1. **Intentional divergences** (different IA/navigation needs), and
2. **Unintentional divergences** (accessibility and semantic drift)

The key risk is that real UX differences get conflated with markup bugs, making it harder to decide what should be unified versus preserved.

---

## What Is Intentional vs Unintentional

| Area | Current Difference | Intentional? | Notes |
|------|--------------------|--------------|-------|
| Primary nav IA | Marketing has 2 links; app has 6 product links | **Yes** | Different jobs-to-be-done |
| Header actions | Marketing: sign-in link; app: mobile menu + theme toggle + user menu | **Yes** | Authenticated shell needs controls |
| Logo destination | Marketing logo → `/`; app logo → `/app/dashboard` | **Yes** | Context-appropriate home route |
| Theme toggle presence | App has toggle; marketing has none | **Unknown** | Could be intentional brand choice or drift |
| Nested `<main>` on landing | Outer `<main>` wraps inner `<main id="main-content">` | **No** | Semantic/a11y bug |
| Unlabeled landing sections | Five major sections lack labels | **No** | Landmark discoverability gap |
| "Sign In" vs "Sign in" casing | Mixed capitalization across components | **No** | Content-style inconsistency |
| Hero `<h1>` text spacing for AT | Split spans may read as concatenated phrase | **Needs confirmation** | Verify computed accessible name in browser |

---

## Root Cause

The marketing and app shells are implemented in different component trees:

- Marketing route entry: `app/page.tsx` → `components/marketing/marketing-home.tsx` → `components/marketing/marketing-layout.tsx`
- App route entry: `app/(app)/app/layout.tsx` with dedicated app nav and controls

This split enables good separation of concerns, but there is no enforced parity checklist for:

- landmark semantics (`main`, section labels)
- microcopy style consistency ("Sign In" casing)
- cross-shell design-token behavior (already tracked in BS-020)

As a result, shell differences that should be deliberate coexist with accidental semantic drift.

---

## Severity Assessment

| Issue | Severity | Who's Affected | How Often |
|-------|----------|----------------|-----------|
| Nested `<main>` on landing | **Medium** | Screen reader / assistive tech users | Every marketing visit |
| Unlabeled landing sections | Low-Medium | Screen reader / keyboard landmark navigation users | Every marketing visit |
| "Sign In" casing drift | Low | All users (quality/cohesion) | Ongoing |
| Theme-toggle policy mismatch | Low | Users switching between marketing and app | Entry + first login |
| Intentional IA differences (marketing vs app nav) | Not a bug | All users | Ongoing |

---

## Proposed Design Direction

### Option A: Accessibility + Copy Cleanup Only (Recommended First Pass)

Keep shell behavior differences (nav IA, header controls, routing destinations) as-is.
Fix only semantic and copy drift:

1. Remove nested `<main>` on marketing pages
2. Add `aria-label` or `aria-labelledby` for major landing sections
3. Standardize "Sign in" / "Sign In" casing across marketing + auth nav
4. Verify hero `<h1>` accessible name spacing and fix only if needed

**Pros:** Low-risk, high-value, no architecture churn  
**Cons:** Does not address broader cross-shell policy questions (theme toggle parity)

### Option B: Full Shell Parity Pass

Define a shared shell-parity standard (landmarks, nav behavior, theme controls, header conventions), then align both trees to the same baseline.

**Pros:** Maximum consistency  
**Cons:** Higher scope, risks forcing false symmetry where product intent differs

---

## Open Questions

1. Should marketing intentionally remain dark-only, or should it expose the same theme toggle as the app?
2. Should "Sign in" (sentence case) be the canonical copy everywhere, including `AuthNav`?
3. Do we want labeled section landmarks as a hard standard for long-form marketing pages?
4. Should shell parity be formalized in `docs/frontend/design-principles.md` as an explicit checklist?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Document created | Audit found non-trivial semantic and shell-consistency concerns that are out of BS-020 scope |
| 2026-02-17 | Split from BS-020 | Card contrast/hover (BS-020) and shell semantic parity are separate problem spaces requiring independent prioritization |

---

## Verified Code Paths

| What | File | Lines | Current |
|------|------|-------|---------|
| Marketing shell wrapper | `components/marketing/marketing-layout.tsx` | 22-23, 59 | Uses `bg-background`; renders outer `<main>{children}</main>` |
| Marketing desktop nav label | `components/marketing/marketing-layout.tsx` | 30-33 | `aria-label="Marketing navigation (desktop)"` |
| Marketing mobile nav label | `components/marketing/marketing-layout.tsx` | 45-47 | Separate mobile `<nav>` with `aria-label="Marketing navigation (mobile)"` |
| Landing inner main | `components/marketing/marketing-home.tsx` | 66 | Renders `<main id="main-content" ...>` inside marketing layout main |
| Landing unlabeled sections | `components/marketing/marketing-home.tsx` | 68, 95, 129, 170, 237 | Five major sections lack `aria-label`/`aria-labelledby` |
| Landing hero split heading spans | `components/marketing/marketing-home.tsx` | 73-77 | H1 text split across two spans |
| Landing CTA copy casing | `components/marketing/marketing-home.tsx` | 251 | Uses `Sign In` |
| Marketing footer copy casing | `components/marketing/marketing-layout.tsx` | 85 | Uses `Sign in` |
| Unauthenticated auth nav copy | `components/auth-nav.tsx` | 46 | Uses `Sign In` |
| App shell background + controls | `app/(app)/app/layout.tsx` | 73, 87-90 | Uses `bg-muted`; includes mobile nav, theme toggle, auth nav |
| App desktop nav landmark | `components/app-desktop-nav.tsx` | 17-19 | `aria-label="App navigation"` |
| App mobile menu trigger | `components/mobile-nav.tsx` | 107-113 | `<button>` with `aria-label="Open/Close navigation menu"` |
| Global skip link | `app/layout.tsx` | 38-43 | `Skip to content` anchor to `#main-content` |
| Marketing route entry | `app/page.tsx` | 8-9 | Home page renders marketing shell |

---

## Suggested Next Spec

If approved, this should become a focused spec for:

1. Marketing semantic landmark cleanup
2. Cross-shell copy normalization
3. Documented policy on theme-toggle parity between marketing/app
