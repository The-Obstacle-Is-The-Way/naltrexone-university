# DEBT-478: Pricing Page Composition and Plan Consent Dialog — Narrow the Grid to the Landing Width and Move the Renewal Disclosure into the Confirmation Step

**Status:** Open — filed 2026-09-16 from an owner design round (seven placements of the legal paragraph were built and compared) that arrived with the DEBT-477 rulings; every claim in that proposal was re-verified here against source at `a0d4378e`, three were corrected and one hard limit was added. **Not implementable until DEBT-414's owner signs off on the structured consent data and the `disclosureVersion` bump (decision D6).**
**Priority:** P3 — the visible defect is composition (600 px plan cards holding a six-line legal slab); the dependency on consent evidence is what makes the fix non-trivial
**Date:** 2026-09-16
**Source:** Owner note re PR #899, 2026-09-16: "`pricing-view.tsx` puts the two-card grid in the full `max-w-7xl` container, so each card is ~600 px holding ~40 characters, and the disclosure box becomes a slab. The landing page renders the same two cards in `max-w-3xl` and looks fine." Decision after seven variants (in-card box, in-card bullets, per-card fine print, split, below-grid block, centered note, dialog): "a legal paragraph is not page content; it's the consent step. Move it into a confirmation dialog."
**Related:** [DEBT-477](./debt-477-landing-page-copy-and-cohesion.md) (signed-out cohesion; owns label casing and the landing plan-card CTA size, and defers all other `/pricing` composition here), [DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) § 4 (pre-billing disclosure elements), § 5 (Stripe consent), § 6 (consent ledger; "exact disclosure snapshot and version"), [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md) (trial CTA copy), [Pattern Registry](../frontend/pattern-registry.md) S-2, S-4, Part 5, 12.3, 13.3, 13.4, 13.6, [Frontend Standards](../frontend/standards.md) § 10, `.claude/rules/frontend.md`

---

## Problem

`app/pricing/pricing-view.tsx` renders the two plan cards in a `mt-6 grid gap-8 md:grid-cols-2` inside the page's `mx-auto max-w-7xl` wrapper. Measured on production 2026-09-16 at 1440 px: each plan CTA is 526 px wide, so each card is about 590 px. The landing page renders the same two cards in `mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2` (`components/marketing/marketing-home.tsx`), about 370 px each, and looks composed.

The width was harmless until DEBT-414 Stage 2 (#720, 2026-08-03) placed the renewal disclosure inside each card as a bordered box (`app/pricing/pricing-auth-cta.tsx:80`, `rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed`). The trial disclosure is 485 characters (`lib/pricing-data.ts:30`), so at 590 px it is a six-line slab that visually outweighs the price; narrowing the grid to the landing width alone would make it ten-plus lines. Screenshot: [`/pricing` plans, 1440 px](./assets/debt-477/pricing-1440-plans-before-2026-09-16.png).

The owner's design round concluded that the paragraph is not page content at all: it is the consent step DEBT-414 § 4 requires "immediately above the relevant CTA". The correct home for a consent step is the confirmation dialog that precedes the commit, where the terms sit directly above the button that authorizes billing. Legal proximity gets stronger, the page gets its composition back, and the consent evidence pipeline (§ 6) keeps recording an exact snapshot of what the subscriber saw.

## Verification of the forwarded proposal

The proposal was written by an agent without repository access. Each claim was checked here; verdicts feed the target state below.

| Claim | Verdict | Evidence |
|---|---|---|
| Cards are ~600 px in `max-w-7xl`; landing uses `max-w-3xl` | **Holds** | Measured 526 px CTAs on `/pricing` vs 304–306 px on `/`; `pricing-view.tsx` wrapper `mx-auto max-w-7xl`; `marketing-home.tsx` grid `max-w-3xl`. |
| Reuse `components/ui/dialog.tsx` under registry S-4 | **Holds** | S-4 lists both `alert-dialog.tsx` and `dialog.tsx` with identical overlay/card strings and `max-w-lg`. One production consumer exists — `components/question/question-report-dialog.tsx` — and is the recipe: `DialogHeader` / `DialogTitle` / `DialogDescription`, a `<form>`, `DialogFooter` with outline Cancel + default submit, `rounded-md` per the Part 5 pill exception. |
| Terms / Privacy links inline as L-2 | **Holds** | The current box already uses the L-2 string (`rounded-sm font-medium text-foreground hover:underline ring-focus`, `pricing-auth-cta.tsx:84-96`). |
| `?plan=` auto-opens the dialog after the sign-up redirect | **Holds** | `app/pricing/page.tsx` `buildPricingPresentation` already derives `selectedPlan` from `?plan=` via `normalizePricingPlanParam`, and `toSignUpRedirectRoute(toPricingRoute({ plan }))` builds the redirect. Today the param only marks the card `aria-current`. |
| Move `lib/pricing-data.ts` to structured `consent: { rows, sentence }`, serialize the snapshot, bump `disclosureVersion` | **Holds, with a hard limit the proposal missed** | The snapshot is `renewal_disclosure_snapshot` in Stripe Checkout metadata (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:93`), read back by the webhook processor and persisted to `renewal_consent_records.disclosure_snapshot` (`db/schema.ts:274`, `text`). **Stripe caps a metadata value at 500 characters.** The trial disclosure is already 485 / 483 characters and no guard exists in the adapter or its tests. Any serialization must stay under the cap with margin, and a red test must pin it (see Data). |
| `pricing-data.test.ts` assertions "must stay green" | **Needs adaptation, not preservation** | `lib/pricing-data.test.ts:35-45` asserts each prose disclosure contains "Billing page" and `support@addictionboards.com`; with structured rows the same assertions run over the serialized snapshot. Intent preserved, subject changes. |
| Every DEBT-414 § 4 element is in the rows | **Holds, with two wording gaps** | § 4 requires: plan; trial + no-card fact; exact amount; interval; auto-renewal; deadline; cancellation method (Billing page + support address); `/terms` and `/privacy` links; a sentence tying the CTA to renewal authorization. The four rows + sentence cover all nine. Gap 1: the "After trial" row must keep the current conditional ("If you add a payment method…"), or it reads as a promise to charge after a no-card trial. Gap 2: the non-trial dialog needs its own tying sentence that quotes its button ("By selecting Subscribe, you authorize recurring monthly charges."). |
| "Every other card in the app is left-aligned" | **Overstated** | 3 of 53 `<Card>` open tags are `text-center`: the landing impact stats and the two single-message status cards on `/pricing`. The rule DEBT-477 F5 records: list-bearing content cards left; stat and single-message status cards centered. The conclusion (plan cards stay left) stands. |
| Delete registry Part 5 "Trial CTA Subtext (DEBT-410)" | **Holds, and it is already stale** | That section cites a `postTrialNote` field that #720 removed on 2026-08-03; nothing in `app/`, `components/`, or `lib/` references it. Delete regardless of this debt. |
| Note under S-2 that the bordered box has no consumer | **Corrected** | The disclosure box is not an S-2 instance: it uses `border-border` at 100% inside a `Card`, which the S-2 rule ("row border `/60` must be lower than the parent Card border") forbids. It is an undocumented variant; removing it removes an undocumented pattern. S-2's "No active consumer" line already exists and needs no change. |
| `<dl>` rows as `grid-cols-[auto_minmax(0,1fr)]` | **Replace** | No `<dl>` and no arbitrary `grid-cols-[…]` template exists anywhere in `app/` or `components/`. Use `grid gap-x-6 gap-y-1 sm:grid-cols-3` with `dt` in column 1 and `dd sm:col-span-2`; same result, no arbitrary value, and it stacks naturally below `sm`. Document under S-4. |
| Row separators `border-t border-border/40` | **Holds** | Registry Part 1 lists `border-border/40` as the internal content separator. |
| Consent sentence `text-xs text-muted-foreground` + new 12.3 row | **Replace** | Use the existing 12.3 "Card body / dense helper copy" role `text-sm text-muted-foreground`. The current box is `text-sm`; the sentence that ties the button to renewal authorization should not be the page's smallest type. No new 12.3 row. |
| `SubscribePlanCta` and its `disclosure` prop go away; `AuthAwareCta` stays | **Holds, plus a seam constraint** | The dialog is a client component (Radix). Server actions may be passed to it as props; a **component** may not (`SubscribeButtonComponent` is a component-as-prop seam used by `page.tsx` and the tests' `DefaultButton`). The dialog imports `SubscribeButton` from `app/pricing/pricing-client.tsx` directly, or owns a `useFormStatus` submit button; the injection seam ends at `PricingView`. |
| Tests: `pricing-view.test.tsx`, new `plan-consent-dialog.test.tsx` + `.browser.spec.tsx` | **Holds, with an architecture consequence** | Radix `DialogContent` renders through a Portal, which produces nothing under `renderToStaticMarkup`. The disclosure-text assertions now in `app/pricing/pricing-view.test.tsx:45-133` and `app/pricing/page.test.tsx:1152-1222` cannot see dialog content; they move to browser mode, exactly as `question-report-dialog.browser.spec.tsx` does. Static tests keep asserting the trigger, the footnote, the auto-open prop, and that no legal copy is rendered on the page. |
| E2E billing specs need two clicks | **Holds** | Eight click sites in four specs: `checkout-redirect.spec.ts:36,57`, `stripe-hosted-paid-checkout.spec.ts:45,48`, `stripe-hosted-trial-start.spec.ts:41`, `subscribe.spec.ts` (post-subscribe path only). `pricing-unauthenticated.spec.ts:10-14` asserts a signed-out **link** with a literal `/sign-up?redirect_url=…` href and is unaffected under decision D5. |
| "Same dialog for signed-out visitors" | **Recommend against (decision D5)** | For a signed-out visitor the dialog's commit button would be a link to `/sign-up`; nothing is authorized and nothing is recorded, so a consent step there is theatre. Keep the signed-out CTA a direct sign-up link (unchanged, spec-pinned) and open the dialog only for authenticated visitors — including automatically on `?plan=` after the redirect, which is the moment consent is actually requested. |
| Footnote "7-day free trial on either plan…" | **Holds, gated** | It must render only when `showTrialCtas` is true (`page.tsx` derives it from `!isEntitled && subscriptionStatus === null`). Canceled ex-subscribers are not eligible; a cached or unconditional line would be the accuracy exposure DEBT-414 avoids. Non-eligible visitors get "Cancel anytime." or nothing. |
| `pricing-view-skeleton.tsx` | **Omitted by the proposal** | `app/pricing/pricing-view-skeleton.tsx:52,70,81` mirrors the `max-w-7xl` wrapper, the `gap-8` grid, and `Back to Home`; it changes in lockstep. |
| ARL § 17602 / NY GBL § 527-a "visual proximity" | **Consistent with DEBT-414's reading; not re-adjudicated here** | The dialog places the terms directly above the button that commits. Stripe Checkout's required Terms consent (§ 5) is unchanged and remains downstream. Whether the row wording satisfies counsel is DEBT-414's gate (D6). |

## Target state

### Page (`app/pricing/pricing-view.tsx`, `pricing-view-skeleton.tsx`)

- Wrapper `mx-auto max-w-3xl px-4 sm:px-6 lg:px-8`; plan grid `mt-10 grid gap-6 md:grid-cols-2` — identical to `marketing-home.tsx`. The `Pricing` h1 and its lede stay as they are.
- The `Plans` h2 becomes `sr-only` (it still labels the `<section aria-labelledby="pricing-plans-heading">`; heading hierarchy stays h1 → h2 → h3).
- Each card contains only: name, optional "Selected plan" line, price, savings line, feature list, and one button — `default` + `mt-8 h-auto w-full rounded-full py-3 text-base` (already `pricing-client.tsx:13`). No disclosure box, no Terms/Privacy links, no legal copy anywhere on the page.
- One footnote under the grid, `mt-6 text-center text-sm text-muted-foreground`, rendered only when `showTrialCtas`: "7-day free trial on either plan. No payment method needed. Cancel anytime." When `showTrialCtas` is false: omit it.
- Delete the `Back to home` link (`pricing-view.tsx:253`, skeleton `:81`); the marketing header brand link and footer already provide the route home. `app/pricing/page.test.tsx:224` follows.
- The subscribed / needs-attention status cards (`pricing-view.tsx:113,130`) are unchanged.

### Dialog (`app/pricing/plan-consent-dialog.tsx`, client component, registry S-4)

Opened by the plan button for authenticated visitors; `open` initially when `selectedPlan` matches and the visitor is authenticated (the `?plan=` return from sign-up). Follows `question-report-dialog.tsx` exactly for structure, focus return, Escape, and footer.

Trial-eligible (`showTrialCtas`):

- `DialogTitle` "Start your 7-day free trial"; `DialogDescription` "Review the terms, then start. No payment method is needed today."
- `<dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">`, each row `border-t border-border/40 py-3` (first row also bordered), `dt` `text-muted-foreground`, `dd` `text-foreground sm:col-span-2`:
  - Plan — Pro Monthly | Pro Annual
  - Trial — 7 days, free. If you never add a payment method, the trial ends and you are not charged.
  - After trial — If you add a payment method: $29 per month, renewing automatically every month until canceled. | If you add a payment method: $199 per year, renewing automatically every year until canceled.
  - Cancel — Anytime before your next billing date, from the Billing page in the app or support@addictionboards.com.
- Consent sentence `text-sm text-muted-foreground`: "By selecting Start free trial you agree to these renewal terms and to our Terms of Service and Privacy Policy." with L-2 links.
- `DialogFooter`: `Cancel` (`outline`) and `Start free trial` (`default`, submit), both `rounded-md`. The submit is the existing `<form action={subscribe*Action}>` with `IdempotencyKeyField` and the `useFormStatus` button from `pricing-client.tsx`.

Not trial-eligible:

- Title "Subscribe to Pro Monthly" / "Subscribe to Pro Annual"; description "Review the terms, then subscribe."
- Rows: Plan; Billing — $29 per month, charged today and renewing automatically every month until canceled. | $199 per year, charged today and renewing automatically every year until canceled.; Cancel — as above. No Trial row.
- Sentence: "By selecting Subscribe you authorize recurring monthly charges and agree to our Terms of Service and Privacy Policy." (annual: "recurring annual charges"). Button `Subscribe`.

Signed-out visitors (decision D5): no dialog. The plan button stays `AuthAwareCta`'s sign-up link with the same `?plan=` redirect; the dialog opens after they return.

### Data (`lib/pricing-data.ts`, DEBT-414 sign-off required — decision D6)

- Per plan, replace `trialDisclosure` and `standardDisclosure` with `consent: { trial: { rows, sentence }, standard: { rows, sentence } }` where `rows` is an ordered `{ label, value }` list. The dialog renders exactly these; `createCheckoutRenewalTerms(plan, hasTrial)` serializes exactly these:

  ```ts
  const disclosureSnapshot = rows
    .map((row) => `${row.label}: ${row.value}`)
    .concat(sentence)
    .join('\n');
  ```

  Rendered text and recorded snapshot cannot drift because both come from one object.
- `trialPaymentDisclosure` (the in-app add-card banner) stays a prose string in this PR; note for DEBT-414 that the same dialog is the natural home for that flow (§ 4 item 2) later.
- Bump `disclosureVersion` for both plans (`:26,43`). `TERMS_VERSION`, `TERMS_CONTENT_SHA256`, `CANCELLATION_METHOD` unchanged.
- **Red test first:** every serialized snapshot (both plans × trial / standard, plus the unchanged `trialPaymentDisclosure`) is ≤ 480 characters — Stripe's 500-character metadata value cap with margin. Then the adapted `pricing-data.test.ts` assertions: each snapshot contains "Billing page", `support@addictionboards.com`, the plan name, the amount, the interval, "renew", and the button label its sentence quotes.

### Registry and standards (docs first)

- 13.6: `max-w-3xl` "Featured sections | Marketing pricing grid, CTA section, **and the `/pricing` composition**". 13.4: delete the `gap-8` "Pricing page plan grid" row (the grid is now `gap-6`). 13.3 Showcase row: as DEBT-477 F5 (left-aligned).
- S-4: add consumer "Plan consent dialog (`app/pricing/plan-consent-dialog.tsx`)" with the `<dl>` recipe above (`sm:grid-cols-3` / `sm:col-span-2`, `border-t border-border/40 py-3`, `dt` muted / `dd` foreground) and the rule that consent copy renders from `PRICING_DATA[plan].consent`, never from JSX literals.
- Part 5: delete "Trial CTA Subtext (DEBT-410)" (stale since #720). In "Marketing Button Overrides", note that the `/pricing` plan button opens the consent dialog for authenticated visitors and is a sign-up link otherwise.
- 12.3: no new row; the consent sentence uses "Card body / dense helper copy".
- Standards § 10 "Confirmation dialogs": add a second list — non-destructive commitment dialogs (billing consent) use `Dialog`, not `AlertDialog`; same S-4 surface.
- 18.1: unchanged (`Dialog` is not a landmark).

### Tests

| File | Change |
|---|---|
| `app/pricing/plan-consent-dialog.test.tsx` (new, static) | trigger renders with the right label per eligibility; `open` derives from `selectedPlan` + `isAuthenticated`; no legal copy in the closed state. |
| `app/pricing/plan-consent-dialog.browser.spec.tsx` (new) | opens per plan with the right title and rows; trial vs standard rows; Escape closes and returns focus to the trigger (mirror `question-report-dialog.browser.spec.tsx:365,387`); submit posts the form with an `idempotencyKey`; `?plan=annual` + authenticated auto-opens the annual dialog. |
| `app/pricing/pricing-view.test.tsx` | `:45` and `:97` (disclosure before CTA, links inside box) move to the browser spec; add: footnote only when `showTrialCtas`; no `Terms of Service` anchor on the page; no `Back to home`; grid tokens `max-w-3xl`, `gap-6`. |
| `app/pricing/page.test.tsx` | `:224` (`Back to Home`), `:1152-1222` (disclosure `<p>` per plan) — remove or move; the plan/label assertions stay. |
| `lib/pricing-data.test.ts` | adapt to the serialized snapshot; add the ≤ 480-character bound. |
| `src/adapters/gateways/stripe/stripe-checkout-sessions*.test.ts` | unchanged in behavior; confirm the snapshot fixture still round-trips. |
| `tests/e2e/checkout-redirect.spec.ts`, `stripe-hosted-paid-checkout.spec.ts`, `stripe-hosted-trial-start.spec.ts` | click the plan button, then the dialog's `Start free trial` / `Subscribe` button. |
| `tests/e2e/pricing-unauthenticated.spec.ts` | unchanged (D5). |

### Implementation plan (one PR into `dev`, separate from DEBT-477's code PR)

1. Obtain D5 and D6 rulings (below). Do not start before D6.
2. Docs first: registry 13.3 / 13.4 / 13.6 / S-4 / Part 5, Standards § 10.
3. Red tests: `pricing-data.test.ts` snapshot bound and content; dialog static + browser specs; `pricing-view.test.tsx` page assertions.
4. `lib/pricing-data.ts` structured consent + serialization + version bump.
5. `app/pricing/plan-consent-dialog.tsx`; wire from `pricing-view.tsx` (authenticated) and keep `AuthAwareCta`'s sign-up link (signed-out); delete `SubscribePlanCta` and the `disclosure` prop; end the `SubscribeButtonComponent` seam at `PricingView`.
6. Page composition and skeleton; delete `Back to home`.
7. E2E updates; full gate per `AGENTS.md` including E2E with the credential check, since the Stripe-hosted specs are the only proof the two-click path still reaches Checkout with the new metadata.
8. Re-capture `/pricing` at 1440 and 390 px (closed and open dialog) and commit "after" crops beside `docs/debt/assets/debt-477/pricing-1440-plans-before-2026-09-16.png` under `docs/debt/assets/debt-478/`.
9. DEBT-414: record the new `disclosureVersion` and the dialog as the consent surface; do not edit `debt-414-*.md` while its branch is active — hand the note to that owner.

## Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| D5 | Signed-out visitors: dialog or direct sign-up link? | **Direct link (unchanged).** A consent dialog whose button records nothing is theatre; the dialog auto-opens after sign-up on `?plan=`, which is the real consent moment. Keeps `pricing-unauthenticated.spec.ts` valid. |
| D6 | DEBT-414 sign-off on the structured rows, the two wording gaps (conditional "After trial"; non-trial tying sentence), and the `disclosureVersion` bump | **Required before implementation.** Hand this record's Dialog and Data sections to the DEBT-414 owner. |
| D7 | Move the in-app add-card consent (`trialPaymentDisclosure`) into the same dialog | **Later, separately.** Note only. |

## Acceptance criteria

- [ ] `/pricing` plan grid is `mx-auto max-w-3xl` / `mt-10 grid gap-6 md:grid-cols-2`; plan cards left-aligned; no legal copy, no Terms/Privacy anchors, no `Back to home` on the page; `Plans` h2 is `sr-only`.
- [ ] Footnote renders only for trial-eligible visitors.
- [ ] Authenticated plan button opens the S-4 dialog with title, four (trial) or three (standard) `<dl>` rows, the tying sentence quoting the dialog button, and L-2 links; Escape returns focus to the trigger; `?plan=` auto-opens for authenticated visitors only.
- [ ] Signed-out plan button is the same sign-up link as today (D5).
- [ ] Rendered rows and the recorded `disclosureSnapshot` come from one object; every serialized snapshot ≤ 480 characters, pinned by a test; `disclosureVersion` bumped for both plans; `renewal_consent_records` receives the new snapshot end-to-end in the Stripe-hosted E2E specs.
- [ ] Registry 13.3 / 13.4 / 13.6 / S-4 / Part 5 and Standards § 10 updated in the same PR; the stale "Trial CTA Subtext" section is gone.
- [ ] Full gate green including E2E; CodeRabbit APPROVED on the exact head; "after" crops committed under `docs/debt/assets/debt-478/`.

## Implementation constraints

Per repo rules: docs before code; strict TDD with the browser lane for anything inside `DialogContent`; `AGENTS.md` full gate before every push; CodeRabbit on the exact head before merge with findings adjudicated as claims. `lib/pricing-data.ts` is consent evidence: no change to it lands without D6. Citations verified against `a0d4378e` on 2026-09-16.
