# DEBT-389: Footer Layout — Collapse the Unbalanced 3-Column Grid into a Header-Mirrored Brand-Left / Links-Right Footer

**Priority:** P3
**Created:** 2026-05-21
**Source:** Visual iteration on the landing page (full-page review + a Claude Design exploration). The footer is a `grid gap-8 md:grid-cols-3` with three equal-width columns, but the content is unbalanced: column 1 (brand + two-line tagline) is full, while `Product` (Features, Pricing) and `Account` (Sign in, Sign up) are short link stacks left-aligned inside their thirds. Each column is ~389px wide but the link columns hold only ~80px of content, so the content bunches into the left two-thirds and leaves a large dead zone on the right with no right-edge anchor — reading as unevenly spaced / left-heavy.
**Related:** [DEBT-382](../_archive/debt/debt-382-landing-page-content-refresh-question-count-and-author-credibility.md), [DEBT-387](../_archive/debt/debt-387-features-card-understates-study-modes.md), [DEBT-388](./debt-388-hero-credibility-line-concision-and-reposition.md) (sibling hero polish), [Frontend Standards](../frontend/standards.md)

**Status:** Active — layout direction locked (chosen after a Claude Design A/B across several variants); copy and link set unchanged.

---

## Why This Is Debt

Concrete and user-visible on `/`. The footer is the only place where the page's full-width register (`max-w-7xl`, shared by the header, stats, and Features) carries content too sparse to fill it. The diagnosis (confirmed in design review): equal `grid-cols-3` thirds + narrow, left-aligned link stacks → the rightmost ~270px of the container is empty, with no element anchoring the right edge. The footer reads as imbalanced rather than composed. The "two titled columns" treatment is itself overkill for **4 links in 2 buckets of 2** — the `Product` / `Account` headers do not earn their weight.

This is not the "centered vs left" question (the footer correctly stays left-aligned and bookends the header). It is purely column distribution.

---

## Decision (locked 2026-05-21)

Replace the 3-equal-column grid with a **header-mirrored layout**: brand block on the left, all links as a single inline row anchored to the right — exactly echoing the site header (`Addiction Boards` left, nav links right). This:

- Anchors both margins (brand left, links right), eliminating the dead right zone.
- Mirrors the header, so the footer bookends it in layout as well as content.
- Drops the unearned `Product` / `Account` category labels and the column structure — more minimal, honest about the content volume.

The **copy and link set do not change**: the footer still exposes Features, Pricing, Sign in, Sign up, the brand, the tagline, and the copyright. Only the layout/grouping changes.

---

## Current State (verified 2026-05-21 against `main` @ `5d32aa65`)

| File | Lines | Element |
|------|-------|---------|
| `components/marketing/marketing-layout.tsx` | 80-118 | `<footer>` (container `max-w-7xl`) |
| `components/marketing/marketing-layout.tsx` | 82 | `<div className="grid gap-8 md:grid-cols-3">` — the 3-column grid to replace |
| `components/marketing/marketing-layout.tsx` | 84-89 | Brand `<p>` (`font-bold font-heading`) + tagline `<p>` (`mt-2 text-sm text-muted-foreground`) |
| `components/marketing/marketing-layout.tsx` | 91-101 | `Product` column: label + `Features` (`featuresHref`) + `Pricing` (`ROUTES.PRICING`) |
| `components/marketing/marketing-layout.tsx` | 102-112 | `Account` column: label + `Sign in` (`ROUTES.SIGN_IN`) + `Sign up` (`ROUTES.SIGN_UP`) |
| `components/marketing/marketing-layout.tsx` | 114-116 | Divider + `© {currentYear} Addiction Boards` |

Links use `marketingNavLinkClass`. `featuresHref` is passed into `MarketingLayout` (currently `#features`).

---

## Proposed Change (one file, layout only)

Restructure the top of the footer (`marketing-layout.tsx:82-113`):

1. Replace the `grid md:grid-cols-3` wrapper with a flex row: brand block left, links right, top-aligned — e.g. `flex flex-col gap-8 md:flex-row md:items-start md:justify-between`.
2. **Left:** keep the brand `<p>` (`Addiction Boards`, `font-bold font-heading`) and the tagline `<p>` exactly as-is.
3. **Right:** a single inline link row containing **Features, Pricing, Sign in, Sign up** (in that order), using `marketingNavLinkClass`, e.g. `flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground`. Remove the `Product` and `Account` label `<p>`s and the two column wrappers.
4. Keep the divider + copyright block (`:114-116`) unchanged.
5. **Mobile:** the flex stacks (`flex-col`) so the link row sits below the brand block and wraps naturally. Verify the row doesn't overflow on narrow widths.

Build only from existing tokens (`marketingNavLinkClass`, current muted/spacing scale) — no new colors, fonts, or sections.

---

## What This Debt Item Does NOT Touch

- Footer copy: brand, tagline, the four link labels/hrefs, and the copyright all stay.
- The footer's left-alignment of the brand block and overall `max-w-7xl` register.
- Header, hero, stats, features, pricing, final CTA.
- Any routing or behavior — layout/markup only.

---

## Test Surfaces

These existing assertions in `components/marketing/marketing-layout.test.tsx` must stay GREEN — the redesign keeps everything they assert:

- `:68` footer contains `© 2026 Addiction Boards` (copyright unchanged).
- `:85-93` sentence-case auth labels queried by href — `footer a[href=SIGN_IN]` = `Sign in`, `a[href=SIGN_UP]` = `Sign up` (both links survive in the inline row, same hrefs/text).
- `:137-148` footer brand treatment — `footer p` with text `Addiction Boards` keeps its `font-bold`/heading classes (preserve the brand `<p>`).
- `:157+` mobile nav reachability for Features/Pricing (the links remain present).

Additional work:
- **Repo-grep** the footer category labels (`"Product"`, `"Account"`) across `*.ts` / `*.tsx` before editing to confirm nothing asserts them; remove them only after confirming. (Initial grep of the test file shows no assertion on those labels.)
- **TDD:** add an assertion proving the new structure — the four footer links render in a single right-side group and the `Product` / `Account` category labels no longer render (negative assertion). Confirm Features + Pricing are still queryable in the footer.

---

## Acceptance Criteria

- [ ] Footer renders brand + tagline on the left and a single inline row of Features / Pricing / Sign in / Sign up anchored to the right; no `Product` / `Account` labels, no 3-column grid.
- [ ] All four links keep their existing hrefs and labels; brand, tagline, and copyright unchanged.
- [ ] Existing `marketing-layout.test.tsx` footer assertions still pass; a new structure assertion is added test-first (incl. negative assertion for the removed labels).
- [ ] `pnpm test --run` and `pnpm build` pass; full gate green.
- [ ] Visual verification on `localhost:3000/` in light + dark, desktop + mobile widths: links anchor to the right edge on desktop, stack/wrap cleanly under the brand on mobile, no overflow or dead-zone.

---

## Implementation Constraints

Per repo memory rules: `feedback_docs_before_code` (review before code), strict TDD (write the structure/negative-label assertions first), `feedback_full_gate_before_push`, and `feedback_verify_doc_citations_mechanically` (citations verified against `main` @ `5d32aa65` on 2026-05-21; re-verify if the PR opens more than a few commits later).
