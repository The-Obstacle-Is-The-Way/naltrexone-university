# DEBT-477: Landing Page Copy and Cohesion — Retire the Arrow CTA, Unify Signed-Out CTA Casing and Size, Keep Plan Cards Left-Aligned, and Split the Footer Link Row

**Status:** Open — filed 2026-09-16 from an owner walkthrough of the live signed-out surfaces; evidence captured against production (`main` = `58a99635`, tree-identical to `dev` `a0d4378e` for every file cited here). Implementation merged to `dev` in [PR #904](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/904) on 2026-09-17 (merge commit `6c923683`); promotion to `main` pending. Owner decisions D1–D4 were recorded later the same day (D1 reversed: plan cards stay left-aligned; D2 held; D3 no; D4 as proposed). The `/pricing` composition and consent-copy proposal that arrived with them is verified and filed separately as [DEBT-478](./debt-478-pricing-plan-consent-dialog.md)
**Priority:** P3 — cohesion work plus the measured F12 contrast defect; every finding is a visible cohesion or copy inconsistency on the first-impression surfaces (`/`, `/pricing`, and the shared marketing header and footer)
**Date:** 2026-09-16
**Source:** Owner review of addictionboards.com on 2026-09-16: the bottom "Get Started" is the only CTA with a chevron and should be a plain button; the "Simple pricing" cards read left-aligned under a centered heading; the footer "is starting to look sloppy" with six links crowded on the right. An external design pass produced an eleven-item draft; the owner's rulings on this record's four decisions arrived later the same day together with a `/pricing` proposal (DEBT-478). This record re-verifies each item against source and against headless-Chromium measurements of production, corrects two of the draft's diagnoses (F3's "app chrome is sentence case throughout" and F8's direction of drift), and adds the design-system history the draft did not have.
**Related:** [DEBT-250](../_archive/debt/debt-250-frontend-visual-divergence-compliance-plan.md) (Decision 2 approved the D-15 exception this debt retires), [DEBT-258](../_archive/debt/debt-258-marketing-alignment.md) (marketing CTA variants; Decision 1), [DEBT-382](../_archive/debt/debt-382-landing-page-content-refresh-question-count-and-author-credibility.md) (hero copy), [DEBT-389](../_archive/debt/debt-389-footer-layout-brand-left-links-right.md) (footer brand-left / links-right layout, which this debt keeps), [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md) (trial CTA and disclosure copy), [DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) (owns the consent disclosure strings in `lib/pricing-data.ts`; added the footer legal links in #727), [Pattern Registry](../frontend/pattern-registry.md), [Frontend Standards](../frontend/standards.md), [Typography Policy](../frontend/typography-policy.md), `.claude/rules/frontend.md`, [DEBT-478](./debt-478-pricing-plan-consent-dialog.md) (`/pricing` grid width, disclosure placement, and the `Back to home` link; owns everything on `/pricing` other than label casing and CTA size)

---

## Problem

Between February and August 2026 the signed-out surfaces accumulated five small, individually approved changes that were never reconciled with each other:

1. DEBT-250 / DEBT-258 (2026-02-28) standardized the marketing pills and plan-card CTAs onto the `Button` variants (Decision 1) but kept one animated-border CTA at the bottom of the landing page as approved exception **D-15** (Decision 2: "adds personality without system pollution").
2. DEBT-382 (2026-05-21, #313) rewrote the hero copy to "Addiction Psychiatry and Medicine".
3. DEBT-389 (2026-05-21, #315) collapsed the footer into brand-left / one right-anchored link row, sized for **four** links.
4. DEBT-414 Stage 1 (2026-08-04, #727) appended **Privacy Policy** and **Terms of Service** to that same row, making six, without revisiting the layout.
5. DEBT-410 (2026-08) made "Start 7-day free trial" (sentence case) the pricing-page CTA while the landing page kept "Get Started" (Title Case).

The result is a page that mixes label casings, CTA heights, section-header alignments, and card alignments, and whose final call to action is the only element on any signed-out surface that carries an icon or an animated border. The original findings concern cohesion; the adversarial pass also found the F12 contrast defect. The owner's three complaints are the three most visible symptoms; the measurements below found five more of the same kind.

Every change proposed here moves code **toward** an existing rule in `docs/frontend/` or records a deliberate reversal of a documented decision. New footer composition and marketing-eyebrow patterns are registered before implementation. The registry rule "pattern doesn't exist? Add it here first" is honored by pairing each code change with its registry or standards edit in the same PR.

## Evidence (production, 2026-09-16)

Captured with the repo's Playwright Chromium against `https://addictionboards.com/` and `/pricing` at 1440×900 and 390×844 with `colorScheme: 'dark'` (the site is dark-only per DEBT-421). Crops are committed under [`docs/debt/assets/debt-477/`](./assets/debt-477/). Line numbers are as of `a0d4378e`; re-verify before editing if the implementing PR opens later.

| Element | Measured | Cause in source |
|---|---|---|
| Hero "Get Started" | 152×36 px, 16 px text | `components/get-started-cta.tsx:13` — `ctaClassName = 'rounded-full px-8 py-3 text-base'` has no `h-auto`, so the Button size default `h-9` (36 px) survives `tailwind-merge` and `py-3` never takes effect. Same in `MarketingPrimaryCtaFallback` (`marketing-home.tsx:65`). |
| Hero "View pricing" | 129×46 px, 14 px | `marketing-home.tsx:57` `pillSizeClasses = 'h-auto rounded-full px-6 py-3 text-sm font-medium'` plus the outline variant's 1 px border. |
| Landing plan-card CTAs | 306×46 (monthly, outline) / 304×44 (annual, default), 14 px | `marketing-home.tsx:216,242` — `text-sm`. |
| `/pricing` plan CTAs | 526×48 / 524×48, 16 px | `app/pricing/pricing-client.tsx:13` (`SubscribeButton`, signed-in) and `app/pricing/pricing-auth-cta.tsx:107` (signed-out link) — both `h-auto … py-3 text-base`. |
| Final "Get Started →" | 176×48 px, contains an `<svg>` (`ArrowRight`), 6 s animated gradient border | `marketing-home.tsx:267-271` — `MetallicCtaButton` inside `data-debt-exception="D-15"`. |
| Section `h2` alignment | Features `text-align: start`; Pricing and final CTA `center` | `marketing-home.tsx:145` — `<div className="max-w-2xl">` with no `mx-auto text-center`. |
| Plan cards, `/` and `/pricing` | `text-align: start` under centered section headings | `marketing-home.tsx:198,222`; `app/pricing/pricing-view.tsx:160,202`. |
| Footer | six links in one right-anchored cluster; at 390 px they wrap as "Features Pricing Privacy Policy / Terms of Service Sign in Sign up" | `components/marketing/marketing-layout.tsx:81-109`. |
| Footer tagline | "Board exam preparation for addiction medicine professionals." | `marketing-layout.tsx:87`. The hero (`marketing-home.tsx`), the site metadata (`app/layout.tsx:12`), and `README.md:3` all say Addiction Psychiatry **and** Addiction Medicine. |

Screenshots (before): [hero 1440](./assets/debt-477/home-1440-hero-before-2026-09-16.png) · [pricing section 1440](./assets/debt-477/home-1440-pricing-before-2026-09-16.png) · [final CTA 1440](./assets/debt-477/home-1440-finalcta-before-2026-09-16.png) · [footer 1440](./assets/debt-477/home-1440-footer-before-2026-09-16.png) · [footer 390](./assets/debt-477/home-390-footer-before-2026-09-16.png) · [`/pricing` plans 1440](./assets/debt-477/pricing-1440-plans-before-2026-09-16.png).

## Findings and required changes

Each finding records: what is wrong, the rule or decision it drifts from, the code change, the paired documentation edit, and the test to write first.

### F1 — The final CTA is the only arrow / animated-border CTA on any signed-out surface (owner: agree)

**Wrong.** The bottom "Get Started →" is `MetallicCtaButton`: an animated gradient border, a transparent face, and a trailing `ArrowRight`. It is the only CTA on `/` or `/pricing` with an icon, and the only primary action that is not a filled pill. Beside the outline "Sign in" pill, the closing section has **no filled primary at all**, so the page's last call to action has weaker hierarchy than its first.

**Rule.** Pattern Registry Part 5 "Variant Usage Guide": primary page action = `default` + `rounded-full`. Registry Part 11 lists D-15 as the **only** remaining approved divergence; Standards line 871 says the same. Retiring it closes the last active entry in that historical divergence inventory; it does not establish universal conformance.

**This is a deliberate reversal of DEBT-250 Decision 2** (2026-02-28: "keep MetallicCtaButton as documented marketing-only exception"). The owner's 2026-09-16 reasoning supersedes it: one-of-a-kind ornamentation on the closing CTA reads as inconsistency, not personality, now that every other CTA is a system pill. Record the reversal in Part 11 rather than deleting the row silently.

**Change — `components/marketing/marketing-home.tsx` `MarketingFinalCtaSection` (lines 267-272):**

```tsx
<Button asChild className="h-auto rounded-full px-8 py-3 text-base">
  <Link href={ROUTES.PRICING}>Get started</Link>
</Button>
```

- Remove the `@debt-exception D-15` comment, the `data-debt-exception="D-15"` wrapper, and the `MetallicCtaButton` import (line 9).
- Delete `components/ui/metallic-cta-button.tsx`, `components/ui/metallic-border.tsx`, and their two colocated tests. `MetallicBorder` has no consumer other than `MetallicCtaButton` (repo grep, 2026-09-16).
- `app/globals.css`: delete the `/* Metallic gradient animation */` block (`@keyframes metallic-shift` and `.metallic-border`, lines 194-220) and the `.metallic-border { animation: none; }` rule inside `@media (prefers-reduced-motion: reduce)` (lines 243-245). Leave `fade-in-up` alone.

**Docs.**
- Registry Part 5: delete the "MetallicCtaButton (Marketing Only — D-15 Exception)" subsection (line 625).
- Registry Part 11: move D-15 out of the live table into the "Resolved (historical)" list: "`D-15` — MetallicCtaButton retired 2026-09 (DEBT-477); the final CTA now uses `default` + `rounded-full`, the same treatment as the hero primary. Reverses DEBT-250 Decision 2." D-15 is the table's only row, so the live table becomes empty; replace it with one sentence stating that there are no open divergences.
- Registry 15.2: remove the `metallic-shift` row (line 1311). Registry 15.4: remove the `.metallic-border` bullet (line 1331) and update the `globals.css` line range in that sentence.
- Registry "Marketing Button Overrides" table (line 598): add a row — Final CTA "Get started" | `default` + `h-auto rounded-full px-8 py-3 text-base` | Same treatment as the hero primary; replaced the retired D-15 metallic CTA.
- Standards line 871: replace the "Only approved exception `D-15` … remains" row text with "All BS-035 divergences are resolved; D-15 retired in DEBT-477." Standards lines 889-890: remove the two `metallic-*.tsx` inventory rows.

**Tests first.**
- `components/marketing/marketing-home.test.tsx:310` "marks MetallicCtaButton with a div debt-exception wrapper" is the D-15 guard; replace it with: within `section[aria-label="Get started"]`, the `/pricing` anchor has `data-slot="button"`, its class tokens include `bg-primary` and `rounded-full`, it contains no `svg`, and `doc.querySelector('[data-debt-exception]')` is `null`.
- Delete `metallic-cta-button.test.tsx` and `metallic-border.test.tsx` with their components.
- `components/theme-token-regression.test.tsx` does not scan for `metallic`; no change.

### F2 — The hero primary CTA is 10 px shorter than its sibling

**Wrong.** "Get Started" renders 36 px tall next to a 46 px "View pricing". Measured at both widths.

**Cause.** `ctaClassName` omits `h-auto`, so Button's `h-9` wins over `py-3`. The outline pills already carry `h-auto` in `pillSizeClasses`.

**Change.**

```ts
// components/get-started-cta.tsx:13
const ctaClassName = 'h-auto rounded-full px-8 py-3 text-base';
```

```tsx
// components/marketing/marketing-home.tsx:65 — MarketingPrimaryCtaFallback
<Button asChild className="h-auto rounded-full px-8 py-3 text-base">
```

After the change the primary renders 48 px (`text-base` line-height 24 + `py-3` 24) beside the outline pill's 46 px (`text-sm` 20 + 24 + 2 px border). The remaining 2 px is the 4 px line-height difference minus the outline’s 2 px border; it is not a defect and must not be "fixed" with an arbitrary padding value.

**Docs.** Registry "Marketing Button Overrides" table: add a row — Hero primary "Get started" / "Go to dashboard" | `default` + `h-auto rounded-full px-8 py-3 text-base` | `h-auto` is required: without it Button's `h-9` overrides `py-3`.

**Tests first.** `components/get-started-cta.test.tsx` (all four render branches) and `marketing-home.test.tsx` "renders static fallbacks…": assert the primary anchor's class tokens include `h-auto`.

### F3 — CTA label casing is mixed across the signed-out surfaces

**Wrong.** Verified inventory on `/` and `/pricing` at `a0d4378e`:

| Label | Casing | Where |
|---|---|---|
| Get Started | Title | hero (3 branches in `get-started-cta.tsx:28,37,47`; fallback `marketing-home.tsx:66`), both plan cards (`:218,244`), final CTA (`:270`) |
| Go to Dashboard | Title | hero entitled branch (`get-started-cta.tsx:46`); `/pricing` subscribed card (`pricing-view.tsx:122`) |
| Back to Home | Title | `pricing-view.tsx:253`, `pricing-view-skeleton.tsx:81`, `app/pricing/error.tsx:19`, `app/not-found.tsx:38` |
| Manage Billing | Title | `pricing-view.tsx:98,125,144` |
| Subscribe Monthly / Subscribe Annual | Title | `pricing-view.tsx:190,234` |
| View pricing | sentence | hero |
| Sign in / Sign up | sentence | header, footer, final CTA — **already locked by tests** (`marketing-home.test.tsx:321`, `marketing-layout.test.tsx:86`) |
| Start 7-day free trial | sentence | `/pricing` trial CTAs (`lib/pricing-data.ts` `trialCta`) |

Sentence case is already the documented direction for auth labels and the majority on these surfaces; "Get Started" is the holdout. The external draft's claim that "app chrome is sentence case throughout" is **false**: the app mixes `Go to Practice` (×6), `Back to Dashboard`, `Mark for review`, `Return to dashboard`, `View all`. That inconsistency is real but is a separate, larger debt; do not let it expand this one.

**Rule (new, scoped).** Add to `docs/frontend/standards.md` § 2 Button a short "Label casing (signed-out surfaces)" paragraph: *Button and nav-link labels on `/`, `/pricing`, and the marketing header and footer use sentence case ("Get started", "View pricing", "Sign in"). Proper nouns, plan names, and page titles keep their capitals ("Addiction Boards", "Pro Monthly", "Privacy Policy", "Terms of Service"). Authenticated app chrome is not yet standardized; see DEBT-477 F3 for the inventory.*

**Change — Phase A (this PR, no consent-text coupling; owner-confirmed 2026-09-16):**
- `Get Started` → `Get started` — `get-started-cta.tsx:28,37,47`; `marketing-home.tsx:66,218,244` and the F1 replacement.
- `Go to Dashboard` → `Go to dashboard` — `get-started-cta.tsx:46`; `pricing-view.tsx:122`; `tests/e2e/subscribe.spec.ts:25`.
- `Back to Home` → `Back to home` — `pricing-view.tsx:253`, `pricing-view-skeleton.tsx:81` (must match the view it stands in for), `app/pricing/error.tsx:19`, `app/not-found.tsx:38` (signed-out surface; keep it consistent), plus `app/pricing/page.test.tsx:224` and `app/not-found.test.tsx:29`. DEBT-478 deletes the `/pricing` link outright (the marketing header brand link and footer already provide the route home); if DEBT-478 lands first, the `pricing-view.tsx` and `pricing-view-skeleton.tsx` sites no longer exist and only `error.tsx` and `not-found.tsx` are recased.
- `Manage Billing` → `Manage billing` — `pricing-view.tsx:98,125,144`; the label appears in no legal or disclosure text (repo grep of `lib/` and `docs/legal/`, 2026-09-16), so it is safe. `app/pricing/page.test.tsx` has 36 assertions across the Subscribe/Manage labels; update only the `Manage Billing` ones in Phase A.

**Phase B (owner decision D2 — held, confirmed 2026-09-16; coordinate with DEBT-414):** `Subscribe Monthly` / `Subscribe Annual`. The `standardDisclosure` strings quote the label verbatim — `lib/pricing-data.ts:32` "By selecting Subscribe Monthly, you authorize recurring monthly charges." and `:50` for annual — under `disclosureVersion: '2026-08-05'` (`:26,43`). Changing the label without the disclosure produces a visible-label / consent-text mismatch; changing the disclosure is consent evidence and belongs to DEBT-414's owner. Phase B therefore waits for a ruling on whether a casing-only change to a quoted label requires a `disclosureVersion` bump. Until then `Subscribe Monthly` / `Subscribe Annual` stay as they are, and this record says so rather than leaving the mismatch implicit. Phase B also touches `tests/e2e/checkout-redirect.spec.ts:57`, `tests/e2e/stripe-hosted-paid-checkout.spec.ts:45,48`, and the remaining `page.test.tsx` / `pricing-view.test.tsx` assertions.

**Docs.** Typography Policy line 45 example: `"Get Started", "Subscribe Annual"` → `"Get started" (hero and final CTA); plan-card CTAs`. Registry "Marketing Button Overrides" table rows that say "Get Started" → "Get started".

**Tests first.** Update every `'Get Started'` expectation in `marketing-home.test.tsx` (including the injected `primaryCtaSlot` fixture at line 28) and `get-started-cta.test.tsx`; add a negative assertion in `marketing-home.test.tsx` mirroring the existing "Sign In" guard: no anchor on `/` has text `Get Started`.

### F4 — Features is the only left-aligned section header

**Wrong.** Hero, Pricing, and the final CTA center their heading and lede; Features left-aligns them (`marketing-home.tsx:145`). On the four-section page it reads as one editorial stray, and it is the largest single contributor to the "several hands" impression.

**Rule.** Registry 13.6 (line 1261) already files `max-w-2xl` under **"Centered content — Pricing cards, subtitles, feature headings"**. The code drifts from the registry's own categorization.

**Change.**

```tsx
// MarketingFeaturesSection
<div className="mx-auto max-w-2xl text-center">
```

Nothing else in the section changes; the card grid stays left-aligned inside its cards.

**Docs.** Standards § 4 "Page headings" table: add "Marketing section h2 + lede are centered (`mx-auto max-w-2xl text-center`); the lede is the standard `mt-3 text-base text-muted-foreground` role." No registry change beyond the row already present.

**Tests first.** `marketing-home.test.tsx`: the `h2` "Everything you need to prep efficiently" has a parent whose class tokens include `text-center` and `mx-auto`.

### F5 — Plan cards are left-aligned under centered headings (owner decision D1: keep left; document the rule)

**Observed.** On `/`, the impact-stat cards are `text-center`, the pricing heading is centered, and the two plan cards are left-aligned. `/pricing` has the same cards, also left. The first draft of this record defaulted to centering both surfaces.

**Decision (owner, 2026-09-16): keep the plan cards left-aligned on both surfaces.** They are list-bearing content (name, price, feature list, full-width button), and a centered text stack over a full-width button never settles. The codebase agrees: of 53 `<Card>` open tags in `app/` and `components/`, only three are `text-center` — the landing impact stats (`marketing-home.tsx:109`) and the two single-message status cards on `/pricing` ("You're already subscribed", "Subscription needs attention"; `pricing-view.tsx:113,130`). Empty states (Standards § 9) are left-aligned too. The forwarded note's "every other card in the app is left-aligned" is slightly overstated; the accurate rule is recorded below.

**Change.** None to the cards. Centered marketing section headings can sit over left-aligned list-bearing cards; authenticated page titles are not uniformly centered. F4 aligns the marketing headings without changing the cards. The width problem that made the `/pricing` cards feel wrong is a composition issue and belongs to [DEBT-478](./debt-478-pricing-plan-consent-dialog.md).

**Docs.** Registry 13.3 Showcase row (line 1232): "`p-8` | Marketing pricing cards, pricing page plan cards — content left-aligned. Only stat cards and single-message status cards are `text-center`."

**Tests first.** `marketing-home.test.tsx` and `app/pricing/pricing-view.test.tsx`: both plan cards' class tokens do **not** include `text-center` (a regression guard for the decision).

### F6 — The DEBT-389 footer link row overflowed when the legal links were added

**Wrong.** DEBT-389 (#315) chose one right-anchored inline row because the footer had **four** links in "2 buckets of 2" and the `Product` / `Account` column labels "did not earn their weight". DEBT-414 Stage 1 (#727) appended Privacy Policy and Terms of Service to that row (`marketing-layout.tsx:97-102`). Six links in one cluster now out-weigh the brand block on desktop, and at 390 px the cluster wraps after "Privacy Policy", splitting the legal pair across lines.

**Decision.** Keep DEBT-389's discipline exactly — brand-left / links-right, left-aligned text, no category labels, the same `L-1` link class, the same divider and copyright row — and change only the grouping: two right-anchored rows that sit on the same baselines as the two left rows.

```text
Addiction Boards                                   Features  Pricing  Sign in  Sign up
Board exam preparation for addiction psychiatry    Privacy Policy  Terms of Service
and addiction medicine.
──────────────────────────────────────────────────────────────────────────────────────
© 2026 Addiction Boards
```

**Change — `components/marketing/marketing-layout.tsx` `MarketingFooter` (lines 79-115):**

```tsx
<footer className="border-t border-border">
  <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="grid gap-y-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-baseline md:gap-x-8">
      <p className="text-base font-bold font-heading text-foreground md:col-start-1 md:row-start-1">
        Addiction Boards
      </p>
      <p className="text-sm text-muted-foreground md:col-start-1 md:row-start-2">
        Board exam preparation for addiction psychiatry and addiction medicine.
      </p>
      <nav
        aria-label="Footer product navigation"
        className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground md:col-start-2 md:row-start-1 md:mt-0 md:justify-end"
      >
        <Link href={featuresHref} className={marketingNavLinkClass}>Features</Link>
        <Link href={ROUTES.PRICING} className={marketingNavLinkClass}>Pricing</Link>
        <Link href={ROUTES.SIGN_IN} className={marketingNavLinkClass}>Sign in</Link>
        <Link href={ROUTES.SIGN_UP} className={marketingNavLinkClass}>Sign up</Link>
      </nav>
      <nav
        aria-label="Footer legal navigation"
        className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground md:col-start-2 md:row-start-2 md:justify-end"
      >
        <Link href={ROUTES.PRIVACY} className={marketingNavLinkClass}>Privacy Policy</Link>
        <Link href={ROUTES.TERMS} className={marketingNavLinkClass}>Terms of Service</Link>
      </nav>
    </div>
    <div className="mt-8 border-t border-border pt-8 text-sm text-muted-foreground">
      <p>&copy; {currentYear} Addiction Boards</p>
    </div>
  </div>
</footer>
```

Notes:
- DOM order is brand, tagline, product/auth nav, legal nav, so below `md` the column stacks in reading order (owner decision D4) and the explicit `md:col-start` / `md:row-start` placement produces the 2×2 on desktop. No `order-*` utilities.
- Both `<nav>` elements carry `aria-label` (Registry 18.1); the labels differ, so axe `landmark-unique` passes. The header's two marketing navs are unchanged.
- `'use cache'` and the UTC `currentYear` read stay exactly where they are (`marketing-layout.tsx:73-76`; the colocated test at `marketing-layout.test.tsx:58` guards it).
- `gap-y-2` reproduces the current `mt-2` between brand and tagline; `mt-4 md:mt-0` on the first nav keeps mobile breathing room between the tagline and the links.

**Docs.** Standards § "Marketing Shell Header" (line 791): add a sibling "Marketing Shell Footer" block recording the grid, the two labeled navs, the tagline as the owner of that copy, and the rule that new footer links join one of the two rows rather than a third. Registry 18.1 (line 1446): `<nav>` count 8 → 10.

**Tests first.** `marketing-layout.test.tsx:110` "renders footer links in a single untitled group" is DEBT-389's regression guard and is **superseded by this record**; replace it with "renders footer links in two labeled groups": all six hrefs still resolve with their labels; `nav[aria-label="Footer product navigation"]` contains exactly Features, Pricing, Sign in, Sign up in that order; `nav[aria-label="Footer legal navigation"]` contains exactly Privacy Policy, Terms of Service; the footer text still contains neither `Product` nor `Account`. Keep the existing sentence-case, legal-links, brand-treatment, and copyright tests green.

### F7 — The footer tagline narrows the product (copy)

**Wrong.** "Board exam preparation for addiction medicine professionals." The product serves Addiction Psychiatry and Addiction Medicine (hero, `app/layout.tsx:12`, `README.md:3`). DEBT-389 preserved this line deliberately as "copy unchanged"; the copy was never audited against the DEBT-382 hero rewrite that landed the same day.

**Change.** "Board exam preparation for addiction psychiatry and addiction medicine." (already in the F6 snippet). Lower-case specialty names match the sentence-case register of the footer; the hero keeps its capitalized "Addiction Psychiatry and Medicine" because it is display copy.

**Tests first.** `marketing-layout.test.tsx`: the footer contains the new tagline and not the old one.

### F8 — Landing plan-card CTAs are one size smaller than the registry and `/pricing` (draft diagnosis corrected)

**Wrong.** Registry 12.3 (line 1154): "Marketing CTA label | `text-base font-medium` | Hero / pricing primary CTAs." `/pricing` complies (`pricing-client.tsx:13`, `pricing-auth-cta.tsx:107`; measured 16 px, 48 px tall). The landing cards use `text-sm` (`marketing-home.tsx:216,242`; measured 14 px, 44/46 px tall). The external draft had this backwards — it read `pricing-view.tsx:30` `DefaultButton` (`mt-8 w-full rounded-full`, `h-9`) as the production button, but `DefaultButton` is only the test fallback; the page injects `SubscribeButton`.

**Change — `marketing-home.tsx:216,242`:** `className="mt-8 h-auto w-full rounded-full py-3 text-base"`. Drop `font-medium`; the Button base already applies it. The monthly/annual CTAs then render 50 / 48 px, matching `/pricing` typography; its two filled CTAs remain 48 / 48 px. Owner-confirmed 2026-09-16: bump up, not down. DEBT-478 moves the `/pricing` consent interaction but keeps them `text-base`, so the two surfaces stay matched.

**Docs.** None needed for 12.3 — the code moves to the rule. Typography Policy line 45 changes only its example text (F3).

**Tests first.** `marketing-home.test.tsx:286` "uses outline monthly CTA and default annual CTA": add that both CTAs' class tokens include `text-base` and `h-auto`.

### F9 — L-4 Brand Link does not describe the shipped marketing brand treatment (docs-only)

**Wrong.** Registry L-4 (line 452) says `rounded-md text-sm font-semibold text-foreground …` and "Implemented in both app and marketing headers". The marketing header brand is `text-base font-bold font-heading whitespace-nowrap` (`marketing-layout.tsx:27-28`) and the footer brand is `font-bold font-heading` (`:83`), both locked by tests (`marketing-layout.test.tsx:139,180`, "stronger … brand treatment"). The code is intentional; the registry lags it.

**Change.** Registry L-4: add "**Marketing variant:** `text-base font-bold font-heading whitespace-nowrap` for the marketing header brand link and `text-base font-bold font-heading` for the footer brand `<p>`. The app shell keeps `text-sm font-semibold`." Add explicit `text-base` to the footer brand to satisfy typography policy without changing its computed size.

### F10 — Mention the free trial on the landing page? (owner decision D3: no, confirmed 2026-09-16)

DEBT-410 made "Start 7-day free trial" the pricing CTA for eligible visitors, but `/` says "Get started" four times and its closing lede is "Full access, cancel anytime." A visitor learns about the trial only after clicking through.

**Ruling: leave `/` trial-agnostic (D3).** Static marketing copy stays in cached fragments; the auth-aware hero CTA remains dynamic. Do not introduce a cached trial promise. The review below corrects the draft's overbroad cache-boundary description.

### F11 — Adjacent stale documentation to fix in the same PR (docs-only)

- Standards line 799 says the marketing header "includes `ThemeToggle`"; DEBT-421 unmounted it (`marketing-layout.tsx:147` comment). Replace with "ThemeToggle is unmounted while light mode is disabled (DEBT-421)."
- Registry 15.4 cites `globals.css:226-238` for the reduced-motion block; it is at 238-250 today and will shift again after F1. Cite the selector, not the lines.

**Not in scope, noted for the owner:** the "100% Mobile Responsive" impact stat is the weakest of the four; the hero pairs its primary with "View pricing" while the final CTA pairs with "Sign in" (intentional, leave); the header "Sign in" fallback is `h-9` by design (compact header tier).

## Owner decisions

| # | Decision | Owner ruling (2026-09-16) |
|---|---|---|
| D1 | Center plan-card content on both `/` and `/pricing` (F5) | **No — keep left-aligned on both.** Reverses this record's first default. Registry 13.3 records the rule: only stat cards and single-message status cards are `text-center`. |
| D2 | Phase B casing: `Subscribe Monthly` / `Subscribe Annual` (F3) | **Hold.** Recase everything else on the signed-out surfaces; leave the two labels quoted by dated disclosures to DEBT-414. |
| D3 | Mention the free trial on `/` (F10) | **No.** |
| D4 | Footer stacking order below `md` (F6) | **As proposed:** brand, tagline, product/auth links, legal links; two labeled `<nav>`s. |

Also confirmed the same day: retire D-15 (F1), `h-auto` on the hero CTA (F2), center the Features header (F4), the new footer tagline (F7), and the casing-rule scope and CTA-size direction corrections (F3, F8). The `/pricing` composition proposal that arrived with these rulings is verified and filed as [DEBT-478](./debt-478-pricing-plan-consent-dialog.md); nothing in this record centers or restyles the `/pricing` cards.

## What this debt does NOT touch

- `/privacy`, `/terms`, `components/legal/*`, `docs/legal/*`, and every string in `lib/pricing-data.ts` (`trialCta`, `postTrialNote`, all disclosures, `disclosureVersion`). Those are DEBT-414 territory and consent evidence.
- Clerk-rendered surfaces (`/sign-in`, `/sign-up`) — accepted third-party seam (Registry Decision 8).
- Authenticated app chrome label casing (`Go to Practice`, `Back to Dashboard`, …). Real, larger, and separate; the dated review below records its inventory and follow-up seed.
- Hero copy, impact-stat values, feature-card copy, plan names, prices, `pillSizeClasses`, the outline pill treatment (DEBT-258 Decision 1), the `'use cache'` fragment boundaries (DEBT-348), and light mode (DEBT-421).
- The `MarketingAuthNavFallback` header button.
- The `/pricing` composition: grid width, the disclosure box and where consent copy lives, the `Plans` heading, and whether `Back to home` exists at all. All of that is [DEBT-478](./debt-478-pricing-plan-consent-dialog.md); this record touches `/pricing` only for label casing (F3 Phase A) and the F8 size match.

## Implementation plan (one PR into `dev`, TDD, docs first)

Branch from `dev` (not from `docs/debt-414-terms-read-through`, which is another agent's active legal work; keep the two reviews independent). Read `.claude/rules/frontend.md` and Registry Parts 5, 11, 12, 13, 18 before touching code.

1. **Docs first.** Registry: Part 5 (F1 deletion, F1/F2 override rows, "Get started" casing), Part 11 (D-15 → resolved, reversal recorded), 12.3 example, 13.3 Showcase row, 15.2 / 15.4, 18.1 nav count, L-4 marketing variant. Standards: § 2 label-casing paragraph, § 4 centered marketing headers, "Marketing Shell Footer" block, lines 799 / 871 / 889-890. Typography Policy line 45.
2. **Red tests** for F1, F2, F3 Phase A, F4, F6, F7, F8 as listed under each finding, plus the F5 not-`text-center` guard.
3. `components/get-started-cta.tsx` — F2, F3.
4. `components/marketing/marketing-home.tsx` — F1, F2 fallback, F3, F4, F5, F8.
5. `components/marketing/marketing-layout.tsx` — F6, F7.
6. `app/pricing/pricing-view.tsx`, `pricing-view-skeleton.tsx`, `pricing/error.tsx`, `app/not-found.tsx` — F3 Phase A only (skip the two `/pricing` `Back to home` sites if DEBT-478 has already removed them).
7. Delete the two metallic components, their tests, and the CSS (F1). `rg -n metallic app components tests` must return nothing; `docs/_archive/` may still mention it historically.
8. `tests/e2e/subscribe.spec.ts:25` — F3 Phase A. (`checkout-redirect.spec.ts` and `stripe-hosted-paid-checkout.spec.ts` are Phase B only.)
9. Full gate per `AGENTS.md` "Verify EVERY Change Before Pushing", including `pnpm build` (the cached marketing fragments prerender) and E2E with the credential check. Re-run the same Playwright capture used for the evidence table at 1440 and 390 for `/` and `/pricing`; commit the "after" crops next to the "before" crops in `docs/debt/assets/debt-477/` and attach them to the PR.
10. Update this record's Status, the Active register row, and the `index.md` Latest stanza; do **not** edit `docs/debt/debt-414-*.md` — the Phase B dependency is recorded here and in D2, and that document is under active edit on its own branch.

## Test surfaces

| File | Existing tests to update | New assertions |
|---|---|---|
| `components/marketing/marketing-home.test.tsx` | `:28` fixture label; `:76-82`; `:286` (add `text-base`, `h-auto`); `:310` (replace, F1) | final CTA is a `default` Button with no `svg`; no `[data-debt-exception]`; features heading wrapper `text-center mx-auto`; plan cards not `text-center`; no anchor reads `Get Started` |
| `components/marketing/marketing-layout.test.tsx` | `:110` (replace, F6) | two labeled footer navs with exact membership and order; new tagline present, old absent; `Product` / `Account` still absent |
| `components/get-started-cta.test.tsx` | `:44` and siblings — `Get started` / `Go to dashboard` | class tokens include `h-auto` |
| `app/pricing/pricing-view.test.tsx` | `Go to dashboard`, `Manage billing`, `Back to home` | plan cards not `text-center` |
| `app/pricing/page.test.tsx` | `:224` and the `Manage Billing` assertions (Phase A) | — |
| `app/not-found.test.tsx` | `:29` | — |
| `tests/e2e/subscribe.spec.ts` | `:25` | — |
| `components/ui/metallic-*.test.tsx` | delete | — |

## Acceptance criteria

- [ ] No `<svg>` inside any CTA on `/`; no `metallic` class in compiled CSS; no `data-debt-exception` attribute anywhere; the registry's live divergence table is empty.
- [ ] Hero primary and the final CTA are the same `default` + `rounded-full` pill, 48 px tall; the outline sibling is 46 px (line-height minus border difference).
- [ ] Every button and nav-link label on `/`, `/pricing`, `/not-found`, and the marketing header/footer is sentence case except proper nouns, plan names, page titles, and the Phase B `Subscribe Monthly` / `Subscribe Annual` labels named in D2.
- [ ] All four section headers on `/` are centered.
- [ ] Plan cards on `/` and `/pricing` remain left-aligned (no `text-center`); registry 13.3 states the rule.
- [ ] Landing plan-card CTAs are `text-base`, monthly/annual 50 / 48 px; `/pricing` remains 48 / 48 px.
- [ ] Footer renders brand + tagline left and two right-anchored, `aria-label`ed link rows; at 390 px it stacks brand, tagline, product/auth links, legal links; the legal pair never splits across lines at 390 px.
- [ ] Footer tagline names both addiction psychiatry and addiction medicine.
- [ ] Registry Part 5, Part 11, 12.3, 13.3, 15.2, 15.4, 18.1, L-4 and Standards § 2, § 4, Marketing Shell Footer, lines 799 / 871 / 889-890 updated in the same PR; Typography Policy line 45 updated.
- [ ] `lib/pricing-data.ts`, `docs/legal/`, and `components/legal/` untouched (`git diff --stat` shows none of them).
- [ ] Full gate green; CodeRabbit APPROVED on the exact head; "after" screenshots committed under `docs/debt/assets/debt-477/` and attached to the PR.

## Implementation constraints

Per repo rules: docs before code (`.claude/rules/frontend.md`, Registry "add it here first"); strict TDD; `AGENTS.md` full gate before every push; `CodeRabbit` review on the exact head before merge, with findings adjudicated as claims under "Guard and Scanner Review Discipline". Citations in this record were verified mechanically against `a0d4378e` on 2026-09-16; re-verify line numbers if the implementing PR opens more than a few commits later.


## Adversarial review record (2026-09-16)

Independent first impressions were saved **before reading the records** in [first-look](./assets/debt-477/first-look-2026-09-16.md). Fresh production captures cover `/`, `/pricing`, `/pricing?plan=annual`, `/privacy`, `/terms`, an actual 404, `/sign-in`, and `/sign-up` at 390, 768, 1024, and 1440 px, dark Chromium, DPR 1, viewport height 900. Full pages and section crops use `review-before-production-*`; [measurements](./assets/debt-477/measurements.json) contain every requested link/button box, font size, alignment, and SVG flag. [Pricing measurements](./assets/debt-478/measurements.json) and [local authenticated measurements](./assets/debt-478/measurements-local.json) complete the evidence. The 404 never became network-idle within 12 seconds; its rendered 404 was captured after DOM readiness. No deployment or merge occurred.

| Claim | Verdict | Strongest evidence / correction |
|---|---|---|
| F1: final CTA alone uses the arrow/metallic treatment | CONFIRMED | Fresh final-CTA crop and `hasSvg` census; DEBT-250 Decision 2 and DEBT-258 explicitly approved it historically. Retirement reverses that decision. It does **not** establish universal registry compliance: F12 is new. |
| F2: hero height defect and predicted 48/46 result | CORRECTED | [DOM experiment](./assets/debt-477/prototype-measurements.json): 36→48 px at all four widths; outline remains 46. The residual 2 px is **4 px line-height difference minus 2 px outline border**, not “border delta only.” |
| F3: mixed casing, scoped Phase A | CONFIRMED | Source inventory below includes authenticated Title Case; the new rule cannot truthfully describe app chrome as already standardized. Consent-coupled outer plan labels remain held. |
| F4: Features header alone left aligned | CONFIRMED | Fresh Features crop and cached `MarketingFeaturesSection`; registry 13.6 already names centered feature headings. |
| F5: 3 of 53 centered Card sites; keep plans left | CORRECTED | Independent TypeScript AST [census](./assets/debt-477/source-census.json) confirms 3/53 and left-aligned empty states. The assertion that every app page has a **centered page title** is false; D1 follows list readability, not that analogy. |
| F6: footer grouping and mobile split | CONFIRMED | [390 crop](./assets/debt-477/review-before-production-home-footer-390-2026-09-16.png) shows the legal pair split. The new grid prototype keeps the legal pair on one line at all four widths; no horizontal overflow was observed. |
| F7: tagline omits psychiatry | CONFIRMED | Footer capture versus hero and `app/layout.tsx` metadata. Adopt the already approved replacement verbatim. |
| F8: landing CTAs undersized | CORRECTED | 14 px vs 16 px is confirmed. With `text-base`, landing **monthly/annual = 50/48 px**; `/pricing` has two filled 48 px buttons. They match the typography tier, not both physical heights. |
| F9: L-4 omits marketing variant | CONFIRMED | Header computes 16 px bold; L-4 documents 14 px semibold. Preserve the shipped brand, document its variant and explicit footer `text-base`. |
| F10: no trial promise on cached landing | CORRECTED | Five copy/section functions and footer are cached; the hero **shell/auth CTA is dynamic**, so “every landing section is cached” is overbroad. D3 remains no trial mention. |
| F11: stale ThemeToggle and CSS anchors | CONFIRMED | ThemeToggle is unmounted in `MarketingLayout`; registry cites old reduced-motion line numbers. Cite the selector instead. |

**Counts (F1–F11): 7 CONFIRMED / 4 CORRECTED / 0 REFUTED / 0 UNVERIFIABLE.**

### Layout, accessibility, and pattern rulings

The footer grid is a new **composition** even though it uses existing tokens. Register `md:grid-cols-[minmax(0,1fr)_auto]`, explicit cell placement, and `md:items-baseline` in the marketing-footer entry before implementation; do not claim that no new layout pattern is introduced. In the prototype at 768 px the tagline is 40 px/two lines, legal links are 20 px/one line and share its first baseline (both top at 2733.5 px). At 1024 the tagline is one line. Mobile DOM order remains brand, tagline, product navigation, legal navigation. Different labels preserve landmark uniqueness; run axe again on the implemented layout.

Part 11 currently contains only D-15. Replace its empty table with “No active divergences in this inventory”; retain the historical approved-exception wording for Clerk/other accepted decisions. Do not rewrite 2026-02-28 as if metallic had already been removed then. Record retirement on 2026-09-16 as the reversal.

Keyboard-only Tab produced 17 home and 18 pricing stops, with per-stop screenshots and computed outline/shadow receipts in [home accessibility](./assets/debt-477/accessibility-before.json) and [pricing accessibility](./assets/debt-478/accessibility-before.json). Reduced motion changes `metallic-shift` to `none`; that claim is confirmed before deletion.

**F12 — new confirmed defect, included in the DEBT-477 fix:** axe reports the hero eyebrow `text-muted-foreground` on `bg-muted` at **4.49:1** (12 px), below 4.5:1. Use full `text-foreground` on this existing badge surface, documenting the marketing-eyebrow variant under M-1 before code. Write the contrast-role regression first, then rerun axe. No global token change is needed. `/pricing` had zero axe violations in this pass.

The first-look concern about “streaks and trends” is refuted as an unsupported-feature allegation: `dashboard/page.tsx` renders Current streak, Overall accuracy, and Last 7 days accuracy. These support the comparative progress copy, though there is no claim here of a plotted trend chart. The author-credential sentence remains the owner's supplied fact; this source audit cannot independently verify professional credentials.

### Authenticated casing follow-up seed

A separate later debt will standardize authenticated action labels after an inventory-led design review, preserving proper nouns and legal document titles. Current actionable inventory (including prop/string labels, not just literal JSX): `Go to Practice` in six card/empty-state links plus dashboard-error and question-error links; `Back to Dashboard` in practice header/default back-link and history/practice/bookmarks/billing errors; `Back to Practice` in quick-practice back-link and quick/session errors; `Back to History` in question error; `View Summary` in exam-results and both post-exam-review actions; `Review Answers` in two summary branches; `New Session` in summary; `Review & Submit` in practice action, session header, and exam review. Do not silently expand Phase A into these routes. Brand `Addiction Boards`, `Privacy Policy`, `Terms of Service`, and the page name `Quick Practice` are excluded from action recasing. The [exact string inventory](./assets/debt-477/authenticated-casing-inventory.json) also includes dynamic question back-links: `Back to Summary`, `Back to Session`, and `Back to Bookmarks`. Counts include 8 Go to Practice, 7 Back to Dashboard, 5 Back to Practice, 2 Back to History, 3 View Summary, 2 Review Answers, 1 New Session, and 3 Review & Submit sites.

### Tests identified before implementation

Existing anchors were rechecked at `d336f747`: `marketing-home.test.tsx:62,76,204,219,234,286,310`; `marketing-layout.test.tsx:110`; `get-started-cta.test.tsx:29,47,66,84`; `pricing-view.test.tsx:23`; `pricing/page.test.tsx:210,316,378,845,1053,1335`; `not-found.test.tsx:22`; `tests/e2e/subscribe.spec.ts:25`. The metallic component tests are removed with their subjects only after the replacement assertion fails red. F5 preservation tests are expected to be green at baseline. No production code was changed during this audit.

Relative links were checked mechanically: 32 targets in DEBT-477, 11 in DEBT-478, and 498 in the debt index, all existing (angle-bracket destinations containing parentheses parsed correctly). See [link check](./assets/debt-477/link-check.json).

### Implementation preparation receipt (2026-09-16)

[Code PR #904](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/904), merged to `dev` on 2026-09-17 (`6c923683`), implements F1–F9/F11 (F3 Phase A only) and the new F12. Its [implementation receipt](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/blob/a8a928d5f09dffb366f357f1fd41922563a2266e/docs/debt/assets/debt-477/implementation-verification.md) records the full green gate and four-width after captures. Hero/outline heights are 48/46 px; landing CTA heights are 50/48 px with 16 px labels. The footer’s 768 px two-line tagline shares the legal nav’s first baseline. Axe is clear and the eyebrow contrast is 14.5567:1. The pricing cards remain left-aligned. The PR merged to `dev` on 2026-09-17 after exact-head review approval; promotion to `main` is pending.
