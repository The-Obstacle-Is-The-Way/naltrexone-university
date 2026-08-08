# DEBT-463: Public legal-page readability and copy

**Status:** Active
**Priority:** P3
**Filed:** 2026-08-08
**Baseline:** `origin/dev` at `662c60b0cd9d688442699ebb69e00372f6c0cdcd`

## Scope and invariant

Redesign `/terms` and `/privacy` for sustained reading and edit the public prose for a concise, natural tone. Every obligation, disclaimer, price, trial term, renewal and cancellation mechanic, provider disclosure, retention period, privacy right, and legal qualifier must keep the same substance. The public source sections in `docs/legal/` and their typed content modules remain byte-identical.

This work does not reopen DEBT-414's settled legal rulings or owner gates.

## Phase 0 measured audit

Method: production at `https://addictionboards.com`, Chromium after `networkidle`, 2026-08-08. Captures cover `/`, `/pricing`, `/terms`, and `/privacy` at 1600x1000 and 390x844 in the actual forced-dark state and in a light-token simulation made by removing the root `dark` class after render. Light mode is not currently user-selectable. Evidence lives in gitignored `audit-screenshots/debt-463/before/`.

| Finding | Verdict | Measured evidence |
|---|---|---|
| F1: legal measure is about twice every other reading surface and is unregistered | **REFUTED as written; narrower defect confirmed.** | Terms and Privacy used an 896px article / 832px content column. Terms measured 95.8 average, 106 median, and 121 maximum CPL; Privacy measured 89.1 average, 106 median, and 121 maximum. That is too wide for sustained prose and the legal container was absent from Pattern Registry § 12.5. It is not twice every other surface: the homepage hero is also 832px and one marketing paragraph spans 1216px. Pricing disclosures are narrower at 490–492px. |
| F2: long-form legal body uses full foreground while marketing prose is muted | **CONFIRMED.** | Legal body computed to `rgb(237, 237, 237)` on `rgb(9, 9, 9)` dark and `rgb(2, 8, 23)` on white in the light-token simulation. The 832px homepage hero copy used muted `rgb(131, 131, 131)` dark / `rgb(100, 116, 139)` light. Pricing renewal disclosures are a full-foreground exception but are compact transaction copy, not long-form reading. |
| F3: heading levels flatten and sections visually merge | **CONFIRMED.** | Both Markdown `##` and `###` mapped to an actual `h2` at 24px/32px with a 40px top margin and no separator. Public content used only that tier, so the rendered documents had no `h3`. Full-page captures show uniform section blocks. |
| F4: legal and marketing line-height utilities differ | **CONFIRMED as a class difference; not a defect by itself.** | Legal body is 16px/28px, a 1.75 ratio. Homepage hero copy is 20px/32.5px under `leading-relaxed`, a 1.625 ratio; ordinary marketing copy is commonly 16px/24px. Legal rhythm is already more open, so changing it would not address the monotony. |
| F5: the documented two-pipeline model omits the legal renderer | **CONFIRMED.** | `typography-policy.md` named hardcoded UI and question-content Markdown only. `components/legal/legal-document.tsx` is a third Markdown pipeline with distinct sanitization, link routing, source-mirror, outline, and overflow-table requirements. |
| F6: prose tokens render as code chips | **CONFIRMED.** | Production rendered 1 `code` element in Terms and 4 in Privacy. They came from plain-prose backticks around `addictionboards.com`, `support@addictionboards.com`, and the `users` table name rather than executable code. |
| F7: public copy is em-dash-heavy and mechanically uniform | **CONFIRMED for measurable traits.** | The published Terms module contains 16 em dashes and Privacy contains 8. Terms has 39 prose paragraphs with 205.3 mean characters; Privacy has 42 with 173.5 mean. Several clauses stack semicolon-separated qualifications. “Machine-written” is a subjective attribution and is not asserted as fact; the measured punctuation and rhythm are sufficient reasons to edit. |

Shared computed typography in both legal pages: Manrope body, 16px, 28px line height, normal tracking; Instrument Sans H1, 36px/40px; Instrument Sans flattened section H2, 24px/32px.

## Chosen design

| Finding | Chosen option |
|---|---|
| F1 | Use a registered `max-w-[72ch]` article including responsive padding. Target approximately 65–75 CPL on desktop; mobile keeps the existing 358px content width. |
| F2 | Use `text-foreground/80` for body, lists, and table cells. Keep headings, links, and strong emphasis at full foreground. Computed contrast is about 10.87:1 dark and 11.48:1 light. |
| F3 | Author public sections as Markdown `##` and subsections as `###`; render them as real `h2` and `h3`. Add a decorative `border-border` separator with `mt-12` and `pt-8` to each top-level section. |
| F4 | Keep `text-base leading-7`. The measured 1.75 line-height is appropriate for sustained legal reading. |
| F5 | Document Pipeline 3 for public legal Markdown and preserve its separation from question-content Markdown. |
| F6 | Remove inline-code markup from plain prose. Retain the renderer's code style for future text that is actually code. |
| F7 | Use zero em dashes in both public documents. Split long compound clauses where the same conditions can be stated as shorter sentences or lists. |

The existing role-less `div[tabIndex=0]` overflow-table wrappers, canonical `ring-focus`, LegalLink routing, sanitization, and safe-protocol behavior remain unchanged.

## Public-copy change table

The following table is the owner-verification map. Structural Markdown changes from `###` sections to `##` sections do not change words; they restore the rendered outline.

| Document / old copy | New copy | Meaning preserved because |
|---|---|---|
| Terms “Last updated: August 5, 2026”; Privacy “Last updated: August 6, 2026” | Both public pages: “Last updated: August 8, 2026” | The date records this publication change. The Terms consent identity and content hash advance with it; no pricing-disclosure text changed. |
| Terms summary: “Addiction Boards is a study tool for board-exam preparation. It is not medical advice and does not guarantee exam results. Paid plans are $29/month or $199/year, renew automatically until you cancel, and new users get a 7-day free trial with no card required. You can cancel anytime from the Billing page in the app, effective at the end of your current trial or paid billing period. Use the content for your own studying, don't copy or resell it, and don't put patient information anywhere in the Service.” | “Addiction Boards is a study tool for board-exam preparation. It is not medical advice and does not guarantee exam results. Paid plans cost $29 per month or $199 per year and renew automatically until you cancel. New users get one 7-day free trial with no card required. You may cancel anytime on the Billing page in the app; cancellation takes effect at the end of your current trial or paid billing period. Use the content only for your own study. Do not copy or resell it, and do not enter patient information anywhere in the Service.” | The medical and outcome disclaimer stays verbatim. Price, cadence, trial eligibility/duration/card rule, cancellation route/timing, license limit, and patient-information prohibition all remain explicit. |
| Terms: “The rest of this page is the detail behind those sentences, and the detail controls.” | “The sections below provide the details. If this summary conflicts with them, the detailed terms control.” | It states the same priority of detailed terms over the short summary more directly. |
| Terms: backticked `addictionboards.com` | Plain `addictionboards.com` | Text is byte-for-byte the same after Markdown rendering; only code-chip styling is removed. |
| Terms heading: “What the Service is — and is not” | “What the Service is and is not” | Heading punctuation only. |
| Terms medical paragraph beginning “The Service is not medical advice.” | The same opening becomes an `h3`; the body becomes: “Content is for exam preparation and general education only. It is not medical, clinical, or healthcare advice, and it is not a substitute for professional clinical judgment. Do not use it to diagnose, treat, or make decisions about any patient. Medical knowledge changes, so verify anything you rely on clinically against current guidelines and primary sources. Using the Service does not create a clinician-patient relationship or any kind of professional-client relationship.” | Educational purpose, every advice category, clinical-judgment disclaimer, patient-use prohibition, verification warning, and both relationship disclaimers remain. Active-voice sentence splits do not narrow them. |
| Terms: bold “No guarantee of results.” and “Not affiliated with any board.” lead-ins | The same words become `h3` subsections; their body sentences remain unchanged. | Only document structure changes. |
| Terms automatic-renewal introduction with the parenthetical em-dash list | “These are the material terms of the automatic-renewal offer. The plan, price, billing frequency, automatic renewal, free-trial mechanics, and cancellation method also appear at the point of purchase before any billing information is collected.” | Every listed material term and the before-collection placement remain explicit. |
| Terms automatic-renewal bullet: one compound sentence around the monthly/yearly parenthetical | “Each plan renews automatically at the end of every billing period: monthly for Pro Monthly and yearly for Pro Annual. Your payment method is charged at each renewal until you cancel.” | Cadence, charge timing, and cancel-forward behavior are unchanged. |
| Terms free-trial bullet: four em-dash-heavy sentences | “New accounts receive a 7-day free trial. Each person may receive only one. No payment method is required to start it. Creating another account, or deleting and re-creating an account, to get another free trial is not permitted and breaches Section 2. If you do not add a payment method before the trial ends, the trial ends and you are not charged. Nothing further happens. If you add one, your paid plan starts when the trial ends and renews automatically as described above.” | New-account eligibility, one-per-person limit, anti-recreation rule, no-card/no-charge branch, the no-further-action assurance, conversion time, and automatic renewal all remain. |
| Terms price-change sentence: “The notice will include how to cancel — the Billing page...” | “The notice will explain how to cancel: use the Billing page in the app or email support@addictionboards.com.” | Both cancellation methods remain in the notice; only punctuation and directness change. |
| Terms heading: “Your license to the content — and its limits” | “Your license to the content and its limits” | Heading punctuation only. |
| Terms single “You may not” sentence containing five semicolon-separated prohibitions | “You may not:” followed by five bullets that preserve copying/scraping, sharing/resale, competing-product/model use, reverse engineering, and service/security interference restrictions and the good-faith research contact. | The exact prohibition categories, statutory reverse-engineering qualifier, examples, and security-research exception remain; only list structure changes. |
| Terms Service-discontinuation sentence ending with an em-dash parenthetical | Split into: “If we discontinue the Service entirely while you have an active paid subscription, we will refund the unused portion of the period you paid for. This is an exception to the no-refund rule above. Section 8 contains one more exception for termination without cause.” | The refund trigger, amount, and both stated carve-outs remain. |
| Terms disclaimer sentence ending “error-free — medical and examination content...” | “We do not warrant that content is current, complete, or error-free. Medical and examination content in particular changes over time.” | Warranty disclaimer and reason both remain. |
| Terms informal-resolution/forum sentence with two em-dash interruptions | Split into five sentences preserving the 30-day contact step, New York forum and consent, small-claims exception, and non-waivable home-state rights. | Every procedure, forum, exception, and savings clause remains. |
| Terms update sentence with an em-dash interruption | “For material changes, we will give notice by email before the change takes effect; we may also post notice in the app. For material subscription changes, the Section 4 notice window applies.” | Email notice, optional in-app notice, timing, and the specific subscription window all remain. |
| Terms contact signature separated by an em dash | “John H. Jung, MD, MS, sole proprietor, New York, United States” | Entity, capacity, and location are unchanged. |
| Privacy summary's separate sale/share and tracking sentences | “We do not sell personal information, share it for cross-context behavioural advertising, use advertising trackers, or use session replay.” | All four negations remain, now in one sentence. |
| Privacy: “Deleting an account...” | “Deleting your account...” | Second-person phrasing does not change deletion scope or retention exceptions. |
| Privacy backticks around `addictionboards.com`, `support@addictionboards.com`, and `users` | Plain prose tokens | Rendered words do not change; only code-chip styling is removed. |
| Privacy inventory sentence: “The application database's users table ... but that table is not the full data inventory.” | “The users table in the application database stores an email address and internal and Clerk identifiers, but it is only part of the data inventory.” | The same fields and the same warning against treating one table as the complete inventory remain. |
| Privacy bold feedback warning and payment lead-in | “Feedback comments” and “Payment information” become `h3` subsections; the feedback body begins “Do not enter personal or patient information...” | The free-text storage warning, patient/PHI/clinical-record prohibition, Stripe collection, local PAN limitation, and retention purposes remain in their bodies. |
| Privacy purpose bullets separated by em dashes | Replace each em dash with a colon. | Labels and every purpose remain verbatim. |
| Privacy retention label “User-linked application records — account...” | “User-linked application records: account...” | Category scope is unchanged. |
| Privacy deletion paragraph with two long exception sentences | Split the consent-record sentence and recast “It also does not necessarily remove...” as “Other limited ... may also remain, as may copies independently held by providers.” | Cascaded rows, all three consent/notice exceptions, pseudonymous survivor fields, every other named record category, provider copies, and required provider deletion remain. |
| Privacy contact signature separated by an em dash | “John H. Jung, MD, MS, sole proprietor, New York, United States” | Entity, capacity, and location are unchanged. |

## OWNER-REVIEW

- Meaning-adjacent edit for focused review: the Terms medical disclaimer changes “must not be used” to the direct instruction “Do not use it” while retaining the identical prohibited patient uses.
- Meaning-adjacent edit for focused review: the Terms forum paragraph is split into shorter sentences; confirm the small-claims and non-waivable-rights exceptions remain scoped as intended.
- Meaning-adjacent edit for focused review: the privacy deletion paragraph is split; confirm no retention survivor category was lost.

## TDD and verification

- **Red:** the initial renderer, page, theme-token, mirror/date, and Terms-version guards failed in 7 places across the 5 focused files before implementation. Hostile copy review then made each recovered clause fail independently before restoration: the exact no-guarantee sentence, “Nothing further happens,” the new-account trigger and one-person limit, the no-payment-method sentence, and the actor-specific “until you cancel” renewal condition.
- **Green:** the focused final run passes 5 files / 47 tests. Mirror tests compare the complete public Markdown strings, mandatory-clause tests retain exact substantive sentences, and the Terms SHA test recomputes the digest from the rendered content module.
- Existing sanitization, LegalLink branch behavior, overflow-table accessibility, last-row border, and theme-token guards remain present and green. No `resolves.toBeDefined()`, nullable fallback, or raw-markup substitute was introduced.
- The final Terms identity is date/version `2026-08-08` with SHA-256 `58242b58d7e680e8e3211043bc3174b97327d8a091bd61c02a6366b1cb6121da`. The separate pricing-disclosure version remains `2026-08-05` because the pre-billing disclosure strings did not change. `lib/container/use-cases.ts` passes both identities and the hash into the Checkout/setup consent records.

## Phase 4 measured verification

Method: optimized local production build at the DEBT-463 head, using the same Chromium procedure and viewports as the baseline. All 16 after-state captures are in gitignored `audit-screenshots/debt-463/after/`; representative dark production-theme evidence is committed under [`assets/debt-463/`](./assets/debt-463/).

| Surface | Before | After |
|---|---|---|
| Terms desktop | [1600px before](./assets/debt-463/terms-desktop-before.webp) | [1600px after](./assets/debt-463/terms-desktop-after.webp) |
| Terms mobile | [390px before](./assets/debt-463/terms-mobile-before.webp) | [390px after](./assets/debt-463/terms-mobile-after.webp) |
| Privacy desktop | [1600px before](./assets/debt-463/privacy-desktop-before.webp) | [1600px after](./assets/debt-463/privacy-desktop-after.webp) |
| Privacy mobile | [390px before](./assets/debt-463/privacy-mobile-before.webp) | [390px after](./assets/debt-463/privacy-mobile-after.webp) |

| Measurement | Terms | Privacy |
|---|---:|---:|
| Desktop article / content width | 702.7px / 638.7px | 702.7px / 638.7px |
| Desktop CPL, average / median / maximum | 74.8 / 81 / 94 | 75.4 / 82 / 93 |
| Mobile content width | 358px | 358px |
| Mobile CPL, average / median / maximum | 43.2 / 44 / 52 | 42.0 / 44 / 51 |
| Rendered inline-code elements | 0 | 0 |
| Rendered em dashes | 0 | 0 |

Body typography remains Manrope 16px/28px with normal tracking. The actual dark body color computes as `oklab(0.946473 0.0000428855 0.0000188947 / 0.8)`; the light-token simulation computes as `oklab(0.137053 -0.00715154 -0.0352408 / 0.8)`. Tailwind's built CSS contains the real `max-w-[72ch]`, `text-foreground/80`, and `text-pretty` rules. Axe 4.13.0 reports zero violations on both legal pages at desktop and mobile in both the actual dark state and light-token simulation. Every route capture returned 200 and the date rendered as August 8, 2026.

## Adversarial self-review record

| Lens | Verdict | Evidence and disposition |
|---|---|---|
| Legal meaning | **CONFIRMED findings, fixed; final additional-loss hypothesis REFUTED.** | The hostile pass caught five defects in our own rewrite: an initially weakened no-guarantee sentence, omission of “Nothing further happens,” the ambiguous phrase “required to start per person,” passive “until canceled” wording that no longer named the user's cancellation as the condition, and a subsequent free-trial split that omitted the new-account trigger while weakening definite “receive” to “may receive.” Each received an exact red test before the original substance was restored or split unambiguously. A second walk through every row in the change table found no further missing obligation, disclaimer, price, trial term, renewal/cancellation mechanic, provider disclosure, retention period, or privacy right. The three meaning-adjacent edits listed under OWNER-REVIEW remain flagged rather than self-certified. |
| Design system | **Violation hypothesis REFUTED.** | Every production class is existing/canonical or registered in Pattern Registry § 12.5 in this change. The new measure, tone, hierarchy, and separator all compile in Tailwind v4. Semantic tokens, the documented `/80` ramp, and canonical `ring-focus` are used; no raw color, undocumented opacity, or dark override was added. |
| Test integrity | **Vacuity hypothesis REFUTED.** | Parsed-DOM tests prove the semantic outline and complete source mirrors. Mandatory legal assertions were not deleted or weakened: the old combined free-trial assertion was replaced with an exact three-sentence assertion that independently pins new-account eligibility, the one-person limit, and no-payment start. Mutation-first runs proved all five hostile-review guards fail without their clauses. |
| Accessibility | **Regression hypothesis REFUTED.** | The outline is now `h1 > h2 > h3`; the section border is decorative; the role-less focusable overflow wrappers and LegalLink behavior are unchanged. Axe reports zero violations in all eight legal-page viewport/scheme combinations. The foreground ramp remains well above AA in both token schemes. |
| Versioning | **Coherence CONFIRMED.** | Both public dates, `TERMS_VERSION`, and `TERMS_CONTENT_SHA256` identify the August 8 content. The hash is recomputed by test. Pricing `disclosureVersion` correctly remains August 5 because that copy is unchanged. New consent records receive the new Terms identity through the existing composition root. |
| Regression | **Collateral-change hypothesis REFUTED.** | `/` and `/pricing` source is absent from the production diff and their before/after captures were visually unchanged. Pricing legal links and their tests remain. Sign-up/checkout visible copy is unchanged; only the Terms identity recorded by consent machinery advances. The public source delimiters and internal provenance/decision appendices remain intact. |
