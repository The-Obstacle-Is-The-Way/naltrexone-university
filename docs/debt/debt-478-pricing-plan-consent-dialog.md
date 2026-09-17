# DEBT-478: Pricing Page Composition and Plan Consent Dialog — Narrow the Grid to the Landing Width and Move the Renewal Disclosure into the Confirmation Step

**Status:** Open — filed 2026-09-16 from an owner design round (seven placements of the legal paragraph were built and compared) that arrived with the DEBT-477 rulings; every claim in that proposal was re-verified here against source at `a0d4378e`, three were corrected and one hard limit was added. **D5–D7 closed by delegated adversarial review below. D6 was recorded before implementation and is ratified by the owner's 2026-09-17 merge instruction.** Implementation merged to `dev` in [PR #905](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/905) on 2026-09-17 (merge commit `bc1deb61`, retargeted from the DEBT-477 branch after #904 merged), then promoted to `main` in [PR #906](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/906) on 2026-09-17 (merge commit `09a45af6`); `main` and `dev` were left tree-identical at `8fc10e54` by that promotion, post-merge run [35259751078](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35259751078) passed test and deploy, and production `/` and `/pricing` return 200 with a healthy `/api/health`.
**Priority:** P3 — the visible defect is composition (600 px plan cards holding a six-line legal slab); the dependency on consent evidence is what makes the fix non-trivial
**Date:** 2026-09-16
**Source:** Owner note re PR #899, 2026-09-16: "`pricing-view.tsx` puts the two-card grid in the full `max-w-7xl` container, so each card is ~600 px holding ~40 characters, and the disclosure box becomes a slab. The landing page renders the same two cards in `max-w-3xl` and looks fine." Decision after seven variants (in-card box, in-card bullets, per-card fine print, split, below-grid block, centered note, dialog): "a legal paragraph is not page content; it's the consent step. Move it into a confirmation dialog."
**Related:** [DEBT-477](./debt-477-landing-page-copy-and-cohesion.md) (signed-out cohesion; owns label casing and the landing plan-card CTA size, and defers all other `/pricing` composition here), [DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) § 4 (pre-billing disclosure elements), § 5 (Stripe consent), § 6 (consent ledger; "exact disclosure snapshot and version"), [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md) (trial CTA copy), [Pattern Registry](../frontend/pattern-registry.md) S-2, S-4, Part 5, 12.3, 13.3, 13.4, 13.6, [Frontend Standards](../frontend/standards.md) § 10, `.claude/rules/frontend.md`

---

## Problem

`app/pricing/pricing-view.tsx` renders the two plan cards in a `mt-6 grid gap-8 md:grid-cols-2` inside the page's `mx-auto max-w-7xl` wrapper. Measured on production 2026-09-16 at 1440 px: each plan CTA is 526 px wide, so each card is about 590 px. The landing page renders the same two cards in `mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2` (`components/marketing/marketing-home.tsx`), about 370 px each, and looks composed.

The width was harmless until DEBT-414 Stage 2 (#720, 2026-08-03) placed the renewal disclosure inside each card as a bordered box (`app/pricing/pricing-auth-cta.tsx:80`, `rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed`). The trial disclosure is 485 characters (`lib/pricing-data.ts:30`), so at 590 px it is a six-line slab that visually outweighs the price; narrowing the grid to the landing width alone would make it ten-plus lines. Screenshot: [`/pricing` plans, 1440 px](./assets/debt-477/pricing-1440-plans-before-2026-09-16.png).

The owner's design round concluded that the paragraph is not page content at all: it is the consent step DEBT-414 § 4 requires "immediately above the relevant CTA". The correct home for a consent step is the confirmation dialog that precedes the commit, where the terms sit directly above the button that authorizes billing. Legal proximity gets stronger, the page gets its composition back, and the consent evidence pipeline (§ 6) keeps recording an exact snapshot of what the subscriber saw.

## Verification of the forwarded proposal (original review, superseded where corrected below)

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

- Keep the outer shell/status-card wrapper; plans section `mx-auto max-w-3xl`, plan grid `mt-10 grid gap-6 md:grid-cols-2`. The actual grid matches the landing width. The `Pricing` h1 and its lede stay as they are.
- The `Plans` h2 becomes `sr-only` (it still labels the `<section aria-labelledby="pricing-plans-heading">`; heading hierarchy stays h1 → h2 → h3).
- Each card contains only: name, optional "Selected plan" line, price, savings line, feature list, and one button — `default` + `mt-8 h-auto w-full rounded-full py-3 text-base` (already `pricing-client.tsx:13`). No disclosure box, no Terms/Privacy links, no legal copy anywhere on the page.
- One footnote under the grid, `mt-6 text-center text-sm text-muted-foreground`, rendered only when `isAuthenticated && showTrialCtas`: "7-day free trial on either plan. No payment method needed. Cancel anytime." When `showTrialCtas` is false: omit it.
- Delete the `Back to home` link (`pricing-view.tsx:253`, skeleton `:81`); the marketing header brand link and footer already provide the route home. `app/pricing/page.test.tsx:224` follows.
- The subscribed / needs-attention status cards (`pricing-view.tsx:113,130`) are unchanged.

### Dialog (`app/pricing/plan-consent-dialog.tsx`, client component, registry S-4)

Opened by the plan button for authenticated visitors; `open` initially when `selectedPlan` matches and the visitor is authenticated (the `?plan=` return from sign-up). Follows `question-report-dialog.tsx` exactly for structure, focus return, Escape, and footer.

The exact rows and sentences are exclusively the D6 data below; the earlier draft is superseded. Trial-eligible (`showTrialCtas`):

- `DialogTitle` "Start your 7-day free trial"; `DialogDescription` "Review the terms, then start. No payment method is needed today."
- `<dl className="text-sm">`; each row wrapper uses `grid gap-x-6 gap-y-1 border-t border-border/40 py-3 sm:grid-cols-3`, `dt` `text-sm text-muted-foreground`, `dd` `text-sm font-bold text-foreground sm:col-span-2`. Labels include the colon serialized in the snapshot. Render D6's four trial rows and exact sentence with L-2 links.
- `DialogFooter`: `Cancel` (`outline`) and `Start free trial` (`default`, submit), both `rounded-md`. The form contains `IdempotencyKeyField`, displayed offer identity, and a dialog-local pending-aware submit button. The dialog uses the registered scroll-safe S-4 variant.

Not trial-eligible:

- Title "Subscribe to Pro Monthly" / "Subscribe to Pro Annual"; description "Review the terms, then subscribe."
- D6's three standard rows and exact sentence, button `Subscribe`.

Signed-out visitors (decision D5): no dialog. The plan button stays `AuthAwareCta`'s sign-up link with the same `?plan=` redirect; the dialog opens after they return.

### Data (`lib/pricing-data.ts`, governed by the D6 ruling below)

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

1. Follow the recorded D5 and D6 rulings below; they supersede the draft wording above.
2. Docs first: registry 13.3 / 13.4 / 13.6 / S-4 / Part 5, Standards § 10.
3. Red tests: `pricing-data.test.ts` snapshot bound and content; dialog static + browser specs; `pricing-view.test.tsx` page assertions.
4. `lib/pricing-data.ts` structured consent + serialization + version bump.
5. `app/pricing/plan-consent-dialog.tsx`; wire from `pricing-view.tsx` (authenticated) and keep `AuthAwareCta`'s sign-up link (signed-out); delete `SubscribePlanCta` and the `disclosure` prop; end the `SubscribeButtonComponent` seam at `PricingView`.
6. Page composition and skeleton; delete `Back to home`.
7. E2E updates; full gate per `AGENTS.md` including E2E with the credential check, since the Stripe-hosted specs are the only proof the two-click path still reaches Checkout with the new metadata.
8. Re-capture `/pricing` at 1440 and 390 px (closed and open dialog) and commit "after" crops beside `docs/debt/assets/debt-477/pricing-1440-plans-before-2026-09-16.png` under `docs/debt/assets/debt-478/`.
9. DEBT-414: record the new `disclosureVersion` and the dialog as the consent surface; do not edit `debt-414-*.md` while its branch is active — hand the note to that owner.

## Owner decisions

| # | Decision | Ruling (2026-09-16) |
|---|---|---|
| D5 | Signed-out visitors: dialog or direct sign-up link? | **Direct link (unchanged).** A consent dialog whose button records nothing is theatre; the dialog auto-opens after sign-up on `?plan=`, which is the real consent moment. Keeps `pricing-unauthenticated.spec.ts` valid. |
| D6 | DEBT-414 sign-off on the structured rows, the two wording gaps (conditional "After trial"; non-trial tying sentence), and the `disclosureVersion` bump | **Closed by delegated review.** Exact data, versions, mapping, and safeguards are in D6 below; hand off through PR #894, without editing its document. |
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


## Adversarial review record (2026-09-16)

The [independent first look](./assets/debt-478/first-look-2026-09-16.md) preceded reading this record. [Production measurements](./assets/debt-478/measurements.json) cover all four widths. Authenticated local captures used the repository Clerk E2E helpers, the resolver's Docker Postgres, migrations, and all 958 seeded questions. [Local measurements](./assets/debt-478/measurements-local.json) cover subscribed and trial-eligible states and both plan URLs; [corrected attention measurements](./assets/debt-478/measurements-local-attention.json) use `unpaid`. `past_due` remains entitled under the grace policy and did not produce the attention card. The local subscription fixture was restored. The `?plan=` captures reproduce the return URL with the existing E2E account; they are **not evidence of creating a new account**.

Each row below corresponds in order to the twenty rows of the forwarded-proposal verification table.

| # / claim | Verdict | Strongest evidence / correction |
|---|---|---|
| 1 Width mismatch | CONFIRMED | CTA widths 526/524 vs 306/304 at 1440; grid wrappers account for it. |
| 2 S-4 Dialog recipe | CONFIRMED | `question-report-dialog.tsx` and `ui/dialog.tsx` use the documented Portal, header, form, footer. |
| 3 Inline L-2 links | CONFIRMED | Existing legal anchors already use `rounded-sm font-medium text-foreground hover:underline ring-focus`. |
| 4 Query auto-open | CORRECTED | Normalization/return URL exist; **auto-open does not yet exist**. Invalid values normalize to null; authenticated canceled subscribers must open standard consent, never trial consent. |
| 5 Structured snapshot/version | CORRECTED | Stripe metadata cap is 500; ≤480 is adopted. Version bump also affects cron deduplication and requires decoupling (D6). |
| 6 Existing data tests | CONFIRMED | Adapt the assertions to serialization; preserving old property names is unnecessary. |
| 7 Nine disclosure elements | CORRECTED | Preserve conditional first charge, no-card/no-charge fact, explicit trial deadline, actual cancellation path, and a separate renewal action. D6 supersedes the longer draft. |
| 8 Every other Card left aligned | REFUTED | Independent AST census: 3/53 centered sites, exactly the three named in DEBT-477. |
| 9 Stale Trial CTA Subtext | CONFIRMED | `postTrialNote` has no runtime reference; registry still describes it. |
| 10 Old box is S-2 | REFUTED | Full-strength nested `border-border` differs from S-2 `/60`; S-2 already says no consumer. |
| 11 Arbitrary dl columns | CORRECTED | Use a registered row wrapper with `grid gap-x-6 gap-y-1 sm:grid-cols-3`; `dd sm:col-span-2`. This remains a new semantic composition requiring an S-4 entry. |
| 12 Row separators | CONFIRMED | Part 1 documents internal `border-border/40`; use on row wrappers, not duplicate dt/dd boundaries. |
| 13 Tiny consent sentence | CORRECTED | Use 14 px `text-sm text-muted-foreground`; measured dark card contrast is recorded below, above AA. |
| 14 Client component boundary | CONFIRMED | Pass serializable plan/eligibility/open data and server action; never the server's `SubscribeButtonComponent` function. |
| 15 Static/browser split | CONFIRMED | Portal content is absent from static markup. Browser specs must own rows, focus, submission, reopening, and initial open state. |
| 16 Eight click sites/four specs | CORRECTED | There are **four pricing click sites across three specs**: checkout-redirect:36,57; hosted-paid:48; hosted-trial:41. hosted-paid:45 is an assertion, :103 is Stripe's submit, subscribe:25 is a dashboard link. |
| 17 Signed-out dialog | CORRECTED | D5 closes this as direct signup link; authenticated return is the consent surface. |
| 18 Eligibility footnote | CORRECTED | `showTrialCtas` alone includes anonymous visitors whose history is unknown. Footnote requires **isAuthenticated && showTrialCtas** within the plans branch of dynamic PricingView. |
| 19 Skeleton | CONFIRMED | Width, hidden Plans heading, grid spacing, and removed Back link must follow the page. |
| 20 Legal proximity sufficiency | CORRECTED | Rows adjacent to the actual submit support proximity, but cannot replace acknowledgment delivery, retention, or real cancellation. Mapping and operational limits below replace a blanket sufficiency claim. |

**Counts: 9 CONFIRMED / 9 CORRECTED / 2 REFUTED / 0 UNVERIFIABLE.** Future implementation/E2E outcomes are acceptance work, not falsely counted as verified observations.

### D5 ruling

Signed-out CTAs remain the existing literal signup links, including `/sign-up?redirect_url=%2Fpricing%3Fplan%3Dmonthly`. No signed-out dialog. Authenticated non-entitled visitors with a valid plan parameter auto-open the matching dialog using the **current server-derived eligibility**; canceled subscribers see standard pricing. Entitled/payment-recovery visitors render their existing status card and no dialog. Invalid plan values open nothing. The footnote is authenticated-only because an anonymous request cannot prove prior subscription history. This is a deliberate tightening of the draft footnote guard without changing the spec-pinned signup link.

### D6 ruling

Produced by adversarial review on **2026-09-16**, under the owner's explicit delegation in this task, and **ratified by the owner on merge of the PR recording it**. Implementation preparation is authorized now that this ruling is recorded; merging remains prohibited until the owner says merge. This is a source-grounded implementation ruling, not a representation that operational delivery or every state law has been verified.

**2026-09-17:** the owner's merge instruction ratified this ruling; the implementation merged to `dev` in #905 (`bc1deb61`). The paragraph above is kept as the dated 2026-09-16 record.

Use checkout `disclosureVersion: '2026-09-16'` for both plans. Keep `TERMS_VERSION`, Terms hash, prices, cancellation method, and existing subscriber terms unchanged. Preserve the unchanged add-card prose with its own existing disclosure version `2026-08-05`; D7 does not rewrite it. Export a separately named **annual renewal notice version `2026-08-05`** and wire the cron to that stable value: `listAnnualSubscriptionsDue` and repository identity match on disclosure version. Reusing the new checkout version would requeue already-created notices for the same subscription/date/destination. The notice text is unchanged, so its version must not change. Add a red cron-composition regression proving this separation.

Exact data are also machine-readable in [consent-ruling-data.json](./assets/debt-478/consent-ruling-data.json). Serialization is `rows.map(({label,value}) => label + ': ' + value).concat(sentence).join('\n')`; the colon is visible in each dt, and the link labels remain part of the sentence. Length includes labels, punctuation, spaces, and LF separators. Do not truncate snapshots. Stripe's own [metadata documentation](https://docs.stripe.com/metadata#data) caps each value at 500 characters; the test limit is 480. The existing trial strings are 485 and 483 characters; their lack of margin is real.

#### Monthly — trial (450 characters)

| Row | Exact value |
|---|---|
| Plan | Pro Monthly |
| Trial | 7 days free; no payment method required. Without one, trial ends with no charge. |
| After trial | If you add a payment method before trial end: $29 per month, renewing automatically every month until canceled. |
| Cancel | Before trial ends or your next billing date via the Billing page or support@addictionboards.com. |

Sentence: By selecting "Start free trial", you agree to these renewal terms. Review our Terms of Service and Privacy Policy.

Button: `Start free trial`. Exact serialized snapshot:

```text
Plan: Pro Monthly
Trial: 7 days free; no payment method required. Without one, trial ends with no charge.
After trial: If you add a payment method before trial end: $29 per month, renewing automatically every month until canceled.
Cancel: Before trial ends or your next billing date via the Billing page or support@addictionboards.com.
By selecting "Start free trial", you agree to these renewal terms. Review our Terms of Service and Privacy Policy.
```

#### Monthly — standard (316 characters)

| Row | Exact value |
|---|---|
| Plan | Pro Monthly |
| Billing | $29 per month, charged today and renewing automatically every month until canceled. |
| Cancel | Before your next billing date via the Billing page or support@addictionboards.com. |

Sentence: By selecting "Subscribe", you authorize recurring monthly charges. Review our Terms of Service and Privacy Policy.

Button: `Subscribe`. Exact serialized snapshot:

```text
Plan: Pro Monthly
Billing: $29 per month, charged today and renewing automatically every month until canceled.
Cancel: Before your next billing date via the Billing page or support@addictionboards.com.
By selecting "Subscribe", you authorize recurring monthly charges. Review our Terms of Service and Privacy Policy.
```

#### Annual — trial (448 characters)

| Row | Exact value |
|---|---|
| Plan | Pro Annual |
| Trial | 7 days free; no payment method required. Without one, trial ends with no charge. |
| After trial | If you add a payment method before trial end: $199 per year, renewing automatically every year until canceled. |
| Cancel | Before trial ends or your next billing date via the Billing page or support@addictionboards.com. |

Sentence: By selecting "Start free trial", you agree to these renewal terms. Review our Terms of Service and Privacy Policy.

Button: `Start free trial`. Exact serialized snapshot:

```text
Plan: Pro Annual
Trial: 7 days free; no payment method required. Without one, trial ends with no charge.
After trial: If you add a payment method before trial end: $199 per year, renewing automatically every year until canceled.
Cancel: Before trial ends or your next billing date via the Billing page or support@addictionboards.com.
By selecting "Start free trial", you agree to these renewal terms. Review our Terms of Service and Privacy Policy.
```

#### Annual — standard (313 characters)

| Row | Exact value |
|---|---|
| Plan | Pro Annual |
| Billing | $199 per year, charged today and renewing automatically every year until canceled. |
| Cancel | Before your next billing date via the Billing page or support@addictionboards.com. |

Sentence: By selecting "Subscribe", you authorize recurring annual charges. Review our Terms of Service and Privacy Policy.

Button: `Subscribe`. Exact serialized snapshot:

```text
Plan: Pro Annual
Billing: $199 per year, charged today and renewing automatically every year until canceled.
Cancel: Before your next billing date via the Billing page or support@addictionboards.com.
By selecting "Subscribe", you authorize recurring annual charges. Review our Terms of Service and Privacy Policy.
```


#### Statutory and DEBT-414 mapping

The following are implementation mappings, with primary sources checked on 2026-09-16. A dialog cannot discharge post-consent duties by itself.

| Requirement / primary subsection | Surface or mechanism | Result |
|---|---|---|
| [CA §17602(a)(1), (8)(A–F)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=17602.&lawCode=BPC): clear terms near consent, trial-to-paid amount, interval/contact | Plan, Trial, After trial/Billing, Cancel rows, immediately above sentence/button | Mapped; no card data collected in this dialog. |
| CA §17602(a)(2), (4–5): affirmative renewal consent without contradictory copy | Quoted Start free trial/Subscribe renewal action; separate downstream Stripe Terms acceptance | Mapped to separate affirmative actions; no prechecked control or silent auto-submit. |
| CA §17602(a)(3), (6): retainable acknowledgment and retained verification | Existing consent ledger and atomic acknowledgment queue; retain later of 3 years after consent / 1 year after termination | Code path preserved; **real acknowledgment delivery remains UNVERIFIED** until Resend activation/delivery receipt. |
| CA §17602(c), (d), (f): cancellation mechanisms | Cancel row names Billing and support; existing Billing→Stripe portal and support procedure | Wording mapped; no claim of immediate access termination. |
| [NY §527-a(1)(a)](https://www.nysenate.gov/legislation/laws/GBS/527-A): product, amount/frequency, deadline, methods before consent/billing | All rows and sentence, before redirect | Mapped. |
| NY §527-a(1)(b), (c): affirmative consent and prompt retainable notice | Explicit submit; persisted snapshot plus acknowledgment queue | Consent mapped; delivery limitation as above. |
| NY §527-a(1)(d), (d-1), (e): easy same-medium cancellation without obstruction | Billing online path, support fallback | Existing mechanism retained; rows do not replace testing that path. |
| [ROSCA §4(1–3), codified 15 USC §8403](https://www.ftc.gov/system/files/documents/statutes/restore-online-shoppers-confidence-act/online-shoppers-enrolled.pdf): disclosure before billing, informed consent, simple cancellation | Dialog precedes Stripe; renewal submit precedes required Stripe Terms checkbox; Cancel row | Order preserved. Checkbox configuration in checkout-session adapter stays unchanged. |
| [FTC Act §5(a)(1)](https://www.ftc.gov/sites/default/files/documents/statutes/federal-trade-commission-act/ftc_act_incorporatingus_safe_web_act.pdf): transaction accuracy | Authenticated eligibility guard; conditional After trial; no trial claim on `/` | Truth table must cover eligible, canceled, entitled, recovery, anonymous; server action rechecks eligibility. |
| DEBT-414 §4 elements 1–9 | Plan; Trial; amount; interval; auto-renew; Cancel deadline; Billing/support; linked legal titles; quoted submit sentence | All nine mapped. Full `text-foreground` values, with renewal terms bold, improve conspicuousness. |
| DEBT-414 §5–6 | Existing Stripe required Terms consent, same metadata/webhook consent pipeline, eager entitlement sync, and retention | New snapshot/version must be asserted in the real local database after both hosted journeys. The implementation hosted tests assert the actual displayed snapshot/version/Terms identity and retention in the local ledger. The initial red run established that eager success sync grants entitlement but does **not** persist consent; only the webhook does. Because Stripe cannot push to localhost, the harness retrieves the real completed Stripe TEST event and replays it through the signed local HTTP webhook, then checks persistence. This is explicit local event delivery, not evidence of production webhook delivery. |

CA annual notice/reminder and NY annual notice obligations remain in their existing job; their timing is unaffected by the dialog. No price-increase or subscriber-price mutation is authorized (DEBT-414's 2026-08-06 deferral stands).

**Other-state correction:** DEBT-414 §10 is a comprehensive **privacy trigger checklist**, not an inventory of other automatic-renewal laws. It cannot support “all state ARLs covered.” As an additional primary-source check, [Vermont 9 VSA §2454a(a)(1–3), (b)](https://legislature.vermont.gov/statutes/section/09/063/02454a) requires conspicuous bold renewal terms and separate renewal opt-in for its annual-term trigger. Use bold row values and keep the dialog's renewal action separate from Stripe's Terms acceptance. Vermont's 30–60-day notice window differs from the existing 15–45-day selection window; that pre-existing scheduling gap belongs in the DEBT-414 handoff, not a false claim of nationwide compliance. Other-state completeness is **UNVERIFIED**; a state-by-state applicability/notice audit would settle it.

#### Boundary and lifecycle rulings

```text
Server PricingPage → dynamic PricingView
  ├─ signed out → Button asChild + existing signup href
  └─ signed in → PlanConsentDialog (client)
       props: plan, hasTrial, initiallyOpen, server action
       imports: Button, Radix Dialog, IdempotencyKeyField, consent data
       local form → pending-aware submit → passed server action → Stripe
```

Remove `SubscribeButtonComponent` from page/view billing composition; do not forward any component function into the client. A client-owned form/body can be rendered directly by static tests for semantic structure, while Portal behavior and a plain async test action are injected **within browser tests**. No production fallback component needs to cross the boundary. Use a dialog-local `useFormStatus` submit with the existing primitive's standard `rounded-md` treatment.

`IdempotencyKeyField` belongs inside the mounted dialog form. Radix unmounts closed content, producing a new UUID on reopen; test submit→close→reopen as well as Escape focus return. Initial query open is not consent and must never submit. With JavaScript disabled the dialog cannot open, so authenticated checkout loses the old HTML-form path. Ruling: accept this constrained regression for the existing JS-dependent Clerk flow, explicitly show a noscript explanation and support route; do not silently submit without visible terms.

The scroll-safe S-4 variant must be registered first: `max-h-[calc(100dvh-2rem)] overflow-y-auto`. At 390×844 the preliminary trial layout fits; at 390×667 it exceeds the available 635 px. The prototype is a sizing experiment, **not** a substitute for measuring the final Radix rendering. Keep four trial / three standard rows with small-screen stacked labels and values; rows need no new opacity token. Final implementation must measure contrast from computed colors: `text-muted-foreground` (#838383) on `bg-card` (#121212) is approximately **4.94:1**, above 4.5:1; verify the precise receipt after render. Do not confuse that pair with the failing hero badge's #1c1c1c background.

Width correction: moving the **outer** wrapper to `max-w-3xl` consumes 64 px of desktop padding and makes the actual grid 704 px, narrower than the landing grid's 768 px. Keep the existing shell/status-card wrapper and apply `mx-auto max-w-3xl` to the plans section/grid; synchronize the skeleton. This achieves the stated landing-width target and preserves subscribed/recovery cards.

#### E2E and red-test inventory

Exact new sequences: checkout-redirect trial and hosted-trial → `Start 7-day free trial` (first plan) → dialog `Start free trial`; checkout-redirect paid and hosted-paid → `Subscribe Annual` → dialog `Subscribe`. Remove outer-form assumptions; select the dialog form after opening. `subscribe.spec.ts` changes only its dashboard-link casing in DEBT-477. The signed-out test remains unchanged.

Before implementation, red anchors: `pricing-view.test.tsx:45,97,135`; `pricing/page.test.tsx:210,341,1134,1188,1242`; `lib/pricing-data.test.ts:20,53,76,99`; `components/theme-token-regression.test.tsx:302` (component injection); plus new dialog browser/static files. Existing idempotency assertions for Manage billing remain. Add plan/query/eligibility truth-table tests, exact serialized text vs visible rows, ≤480 for four checkout and two add-card snapshots, version/notice separation, and hosted ledger assertions. Check the final source census for additional test references before changing exported fields.

### D7 ruling and follow-up seed

Move the in-app add-card consent into a dialog in a **separate later debt**. That work must preserve the existing setup-operation ownership, expiry/replay checks, trial-end-specific billing deadline, standalone payment disclosure/version, Stripe Terms acceptance, and retained consent/acknowledgment. Start by capturing the actual banner and setup flow and testing the setup completion contract; reuse S-4 only after the state-specific rows are mapped. This review deliberately leaves the add-card prose and behavior unchanged.

### Owner-only operational work

No Stripe Dashboard, Clerk Dashboard, or DNS change is needed for these two UI PRs. The existing DEBT-414 tail remains: create/verify Resend and its domain/DNS, configure its key, and perform the owner-controlled real acknowledgment delivery test. This run sends no email and touches no live Stripe state. Merge to dev and any later promotion to main remain separate explicit owner actions. There is no remaining design decision awaiting the owner.


### Additional consent-integrity finding

**CONFIRMED:** the current subscribe action posts only `idempotencyKey`; `CreateCheckoutSessionUseCase` recomputes eligibility and selects the current disclosure without checking the offer shown. A stale trial view could therefore submit after its subscription history changes and receive a paid offer. Ruling: the dialog posts its displayed checkout version and trial/standard identity; the server validates them against its own current terms/eligibility before creating a Checkout Session. A mismatch returns to pricing for renewed review and never trusts client-provided prices or prose. Carry the displayed expected-offer identity through the existing typed action/controller/use-case seam, include it in the idempotency request identity, and add a failing use-case test for an eligibility/version mismatch. This is required to substantiate “exact snapshot the subscriber saw,” beyond merely sharing an object in source. The browser action and the exported `use server` billing controller both require the displayed identity. The latter is itself an externally callable action, so treating it as a trusted internal caller would leave a bypass. Optional identity is permitted only at the non-exported-as-server-action application/helper seam; every production Checkout entry passes through the required controller schema. A direct controller call omitting identity must return VALIDATION_ERROR without invoking Checkout. This boundary correction was confirmed from the GitHub review and reproduced with a failing regression test before the follow-up implementation.

### Implementation evidence clarification (2026-09-16)

The new hosted ledger assertion failed on both paid and trial journeys before local event delivery was added: the success interstitial and entitlement were correct, but no consent row existed. Source tracing confirms `checkout-success-sync.tsx` only persists entitlement; `stripe-webhook-controller.ts` persists initial consent and queues acknowledgment. The test now replays the actual Stripe test completion event through the signed local HTTP route, restricted to the E2E-owned test customer, with email delivery disabled. Paid annual and no-card monthly hosted journeys both passed, proving exact displayed snapshots of 313 and 450 characters, checkout version `2026-09-16`, unchanged Terms identity, and at least three years of retention. Both acknowledgments were queued at verification time; the E2E helper removes only those delivery fixtures after assertion so later integration cron tests cannot consume them. Consent records remain retained, and delivery is not claimed. The other two snapshot variants are covered by static/data and browser tests. This corrects any reading of the earlier “success-sync pipeline” wording as consent persistence by the success page itself.

[Code PR #905](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/905), stacked on #904 and merged to `dev` on 2026-09-17 (`bc1deb61`), contains the implementation and [verification receipt](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/blob/fd059cbd1a63c3af68da7c31c2a84c27fa31e878/docs/debt/assets/debt-478/implementation-verification.md). The initial implementation gate (before the controller-boundary correction) passed 4,271 unit tests, 411 browser tests, 258 integration tests, production build, 44 required E2E tests, and the paid/trial hosted lane; integration passed again after hosted delivery cleanup. The final gate on the merged head `b0168813` (which requires `expectedOffer` at the controller) passed 4,272 unit tests, 411 browser tests, 258 integration tests, production build, 44 required E2E tests, and both hosted Checkout journeys; the combined `dev` tree passed 4,272 unit tests again on 2026-09-17 before the merge. The 46 visual combinations have no horizontal overflow or axe violations. Consent text measures 4.9415:1; the 390 px trial dialog is 690 px tall and scrolls within 635 px at viewport height 667. Both code PRs merged to `dev` on 2026-09-17 after exact-head review approvals, and promotion #906 merged it to `main` as `09a45af6` on 2026-09-17 (18:35Z). `main` and `dev` were left tree-identical at `8fc10e54` by that promotion, post-merge run 35259751078 passed test and deploy at 18:45Z, and the shipped surfaces were re-measured on production afterward.
