# DEBT-414: Public Legal Pages, Renewal Consent, and Security-Program Closure

**Priority:** P1 publication and billing-compliance blocker
**Created:** 2026-06-10
**Status:** **ACTIVE — adversarial audit completed 2026-07-29; not safe to publish or use for new paid conversion yet.** The Privacy Policy draft has been corrected against the codebase. The Terms of Service does not exist and was deliberately not drafted during this audit. Renewal disclosure, consent evidence, acknowledgment/reminders, public delivery, and the New York SHIELD Act operational program remain open.
**Owner:** John H. Jung, MD, MS, sole proprietor, New York
**Product:** Addiction Boards at `addictionboards.com`
**Contact:** `support@addictionboards.com`
**Branch baseline:** re-audited from `a9c17d90` on 2026-07-29
**Related:** [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md), [Privacy Policy draft](../legal/privacy-policy.md), [Debt Index](./index.md)

> This is a diligent non-lawyer implementation and evidence record, not legal advice. The owner has chosen in-house drafting while the product is pre-revenue with no active users and a focused legal review before paid user acquisition. “Lawyer review” below is limited to named clauses and evidentiary questions; it is not a substitute for finishing the engineering and operational work.

## Verdict

**Do not publish the current package or collect billing information from a new consumer through the current flow.** Four concrete blockers remain:

1. `docs/legal/terms-of-service.md` is absent. This audit does not draft it.
2. The live pricing and trial add-card entry do not yet implement the complete ROSCA, California, and New York pre-billing disclosure and affirmative-consent path.
3. The repository does not retain a durable consumer-level record of the renewal disclosure and consent, and does not produce the required retainable acknowledgment or annual-plan notices.
4. Draft New York SHIELD Act security and incident-response procedures now exist, but their live-account `OPEN` checks have not been verified and the owner has not adopted them.

The corrected Privacy Policy is suitable for focused review once those implementation facts are settled. It must not be copied into a public page before then, because the final policy must describe the final implementation rather than a planned one.

## Business facts and verification limits

| Fact | Result |
|---|---|
| Legal identity | **CONFIRMED:** John H. Jung, MD, MS, sole proprietor. Credentials are display text, not part of the legal name. The clinical PLLC is excluded. |
| Governing-law choice for the future Terms | New York. The clause itself is **UNDRAFTED**. |
| Product name/domain | Addiction Boards / `addictionboards.com`. |
| Privacy/legal email | DNS MX and SPF records for ImprovMX were independently confirmed on 2026-07-29. **UNVERIFIABLE without sending external mail:** end-to-end forwarding and the asserted catch-all. Do not describe either as tested. |
| Mailing address | No address is currently published. CCPA's request-channel rule does not require one for an exclusively online business with a direct consumer relationship. CAN-SPAM can require one in each commercial or mixed-primary-purpose email; that question remains open until provider-owned templates are inspected. |
| Revenue/users | Owner-recorded pre-revenue and no-active-user state. Not derivable from the repository. |
| Direct provider count | **SIX:** Clerk, Stripe, Neon, Vercel, Sentry, ImprovMX. No seventh direct production provider was found in the source/dependency/deployment review. Preview-only tooling and a direct provider's own vendors are not seventh direct providers. |
| Stripe statement descriptor | The existing shortened descriptor was previously verified as present and compliant. It is a re-verification item, not a missing implementation item. This audit did not access or modify Stripe. |

## Codebase findings that bind the copy

The Privacy Policy's detailed [Provenance and adversarial verification](../legal/privacy-policy.md#provenance-and-adversarial-verification) table is the source of truth. The most important corrections are:

- Email is the only ordinary contact field in the local `users` row, but it is not the only identifier in the full schema. Clerk IDs, Stripe IDs, provider event IDs, free-text feedback, IP-derived rate-limit keys, diagnostics, and support email can identify or relate to a person.
- Full card numbers are not stored in the application database. Stripe Checkout can collect billing information, and the repository cannot support “we never see any payment details.”
- Twenty-four hours is a rate-limit cleanup target and the normal idempotency expiry, not a hard physical-deletion maximum. Both cleanup paths are request-triggered, batch-limited, and allowed to fail.
- User-linked local rows cascade on account deletion. Provider-event ledgers, the Clerk deletion tombstone, pending external cleanup, support mail, provider copies, and required records can survive.
- Sentry replay is off, client tracing is off, and server tracing is sampled at 5%. Raw exception/request capture means “Sentry cannot receive personal information” is false.
- Absence of an analytics dependency is not proof of deployment behaviour. The read-only audit observed Vercel Web Analytics enabled at project level but found no corresponding component/script in the application build. Actual event transmission was not tested.
- No application cookie-write call was found. That does not prove all provider-hosted cookie behaviour.
- Processed Stripe events target 90-day deletion; unresolved Stripe events remain until resolution; handled Clerk events have no automatic terminal policy.

Any future change to these facts requires a same-change Privacy Policy review. Publishing an absolute claim contradicted by actual practice creates an independent FTC Act § 5 deception risk.

## Legal sufficiency matrix

The quoted operative language below comes from official government sources. Secondary summaries may help research but are not authority for this specification.

| Regime | Applicability | Operative rule and current result |
|---|---|---|
| **FTC Act § 5, 15 U.S.C. § 45** | **APPLIES** to the operator's interstate commercial practices. | The Act prohibits “unfair or deceptive acts or practices in or affecting commerce.” A published privacy promise that contradicts the implementation is a deception risk. **SATISFIED only after the corrected copy is kept synchronized with practice.** The original absolute retention, deletion, Sentry, analytics, payment, cookie, security, and location claims were publication blockers and have been removed. |
| **ROSCA, 15 U.S.C. §§ 8401–8405** | **APPLIES** to this online negative-option offer. | 15 U.S.C. § 8403 requires clear and conspicuous material terms before billing information, express informed consent before charging, and a simple cancellation mechanism. **MISSING:** complete disclosure at every billing-information entry, an evidence-bearing consent path, and a durable acknowledgment. Stripe portal cancellation supports the cancellation element but does not cure the first two. |
| **California ARL, Bus. & Prof. Code § 17602** | **APPLIES ON NAMED TRIGGER:** an offer to a California consumer. The national site permits that trigger. | The statute requires terms “before the subscription or purchasing agreement is fulfilled” and in visual proximity to consent; affirmative and express affirmative consent; a retainable acknowledgment; verification for at least three years or one year after termination, whichever is longer; pre-confirmation billing notice; simple online cancellation; a separate annual reminder; annual-term renewal notice 15–45 days before renewal; retainable notice of a material change before implementation; and, specifically for a fee change, notice no less than 7 days and no more than 30 days before it takes effect. **MISSING** except for the existing online Stripe cancellation path. The seven-day trial is not subject to the statute's separate 3–21 day reminder for trials longer than 31 days, but the annual plan is subject to the separate annual-reminder and 15–45-day notice duties. |
| **New York GBL § 527-a** | **APPLIES ON NAMED TRIGGER:** an offer to a New York consumer. Operator location/governing law does not replace the consumer-location trigger, but a nationwide offer reaches it. | Current § 527-a requires material terms “before consent to the offer or billing information has been requested” and in visual proximity; affirmative consent; a prompt retainable notice; cancellation as easy and in the same medium; annual-term notice 15–45 days before the cancellation deadline; and material-change notice at least 5 business days, but no more than 30 days, before the change. **MISSING** except for the existing online cancellation path. Its >one-month trial reminder does not apply to a seven-day trial. |
| **New York SHIELD Act, GBL §§ 899-aa and 899-bb** | **APPLIES ON NAMED TRIGGER:** owning or licensing a New York resident's private information. Email/username plus an account password or security answer qualifies. If any NY account credential is already held through Clerk, it applies now; current resident/account state is not repository-verifiable. | § 899-bb requires reasonable administrative, technical, and physical safeguards; small-business proportionality is not an exemption. § 899-aa requires breach notice “in the most expedient time possible and without unreasonable delay” and within 30 days, plus regulator notices and prescribed content. **PARTIAL:** draft safeguards and incident procedures now exist under `docs/security/`, but live provider/device evidence, a tabletop, and owner adoption remain missing. The revised public breach sentence does not itself satisfy the program duty. |
| **CCPA/CPRA and 2026 CPPA regulations** | **DOES NOT CURRENTLY APPLY** on the recorded pre-revenue, no-active-user, no-sale/share facts. Reassess at $26,625,000 adjusted annual revenue; 100,000 consumers/households whose PI is bought, sold, or shared; or at least 50% of annual revenue from sale/sharing. | The prior checklist misstated the 100,000 threshold as general processing. If triggered, the regulations require a complete privacy policy and a separate Notice at Collection at or before collection, in close proximity to a webform or collection surface. The exclusively-online/direct-relationship rule permits email as the sole designated request method. Acknowledgment is generally due in 10 business days and response in 45 calendar days. **MISSING ON TRIGGER:** Notice at Collection on signup, feedback, and billing surfaces; state-specific appeal/agent/opt-out handling; and an evidence-based look-back response. Do not promise records “since January 1, 2022” when they may not exist. |
| **CPPA ADMT regulations** | **DOES NOT CURRENTLY APPLY** to practice scoring. | The audited scoring does not make a significant decision about employment, education admission, credit, housing, insurance, or healthcare access. The 2026 rules' ADMT compliance date is January 1, 2027. Reassess before any significant-decision use. |
| **CAN-SPAM, 15 U.S.C. § 7704; 16 C.F.R. Part 316** | **APPLIES ON NAMED TRIGGER:** each commercial email; mixed messages are classified per message by primary purpose. | The debt's **CONDITIONAL AND OPEN** framing is correct. The provider-owned Clerk and Stripe templates are not in the repository. Do not claim a blanket transactional exemption. Before relying on one, inventory every live template and apply 16 C.F.R. § 316.3's subject-line and message-body primary-purpose test. Any commercial message needs the statutory disclosures, opt-out, and valid physical postal address. |
| **Virginia, Colorado, Connecticut, Utah, and other comprehensive state privacy statutes** | **DO NOT CURRENTLY APPLY** on the recorded facts; **APPLY ON STATE-SPECIFIC TRIGGERS.** | Virginia and Colorado generally use 100,000-consumer or 25,000-plus-sale thresholds; Utah adds revenue criteria; Connecticut drops to a 35,000-consumer threshold on July 1, 2026 and has separate sensitive/consumer-health triggers. Iowa, Texas, Oregon, Montana, Delaware, New Jersey, Nebraska, New Hampshire, Tennessee, Minnesota, Maryland, Indiana, Kentucky, Rhode Island, and Florida also require state-specific review before their threshold or sensitive-data trigger. **MISSING ON TRIGGER:** notices, appeals, authorized-agent handling, opt-outs/GPC where applicable, assessments, and consent for sensitive or consumer-health data. Do not claim the voluntary universal request process is complete compliance with every state. |
| **Consumer-health privacy laws** | **DO NOT CURRENTLY APPLY** to question-bank performance on the audited facts. | The stored activity concerns hypothetical educational questions, not the user's health. **TRIGGER:** collecting or inferring a user's own diagnosis, condition, treatment, medication, or other consumer-health data. |
| **COPPA, 15 U.S.C. § 6502** | **DOES NOT CURRENTLY APPLY** absent a child-directed service or actual knowledge of an under-13 user. | The product is general-audience professional exam preparation. The Privacy Policy now states the actual trigger and response rather than making an unsupported under-18 collection promise. |

## Owner gates

- [x] Decide legal identity and governing-law preference.
- [x] Create privacy/legal email DNS records.
- [ ] Verify end-to-end delivery to `support@addictionboards.com` and separately verify the claimed catch-all. This is an external send and was deliberately not performed by the audit.
- [ ] Inventory the exact live Clerk and Stripe email templates; record each primary-purpose classification. Add a valid postal address and opt-out to every commercial template.
- [ ] Provide or approve the Terms of Service. This audit must not author it.
- [ ] Obtain focused review of these specific Terms questions before paid acquisition:
  - Is the educational/not-medical-advice disclaimer adequate for a professional board-prep product that presents clinical scenarios?
  - Are the limitation-of-liability, warranty disclaimer, New York choice-of-law, arbitration/class-waiver, cancellation/refund, and unilateral-change clauses enforceable for the intended nationwide consumer sale?
  - Is the proposed local consent ledger plus Stripe's Checkout consent field sufficient “verification” under California § 17602(a)(6), including after account deletion?
- [ ] Select a transactional-email delivery mechanism for retainable acknowledgments, annual reminders, annual renewal notices, and material-change notices. ImprovMX is inbound forwarding, not a sender. Adding a sender changes the six-provider inventory and Privacy Policy.
- [x] Create draft SHIELD Act security and incident procedures.
- [ ] Verify every live-account `OPEN` item, run the tabletop, and adopt the SHIELD program.
- [ ] After deploying both public pages, set Stripe's Privacy Policy and Terms links and re-verify the already-existing shortened descriptor and provider-owned notices. Do not change production Stripe during implementation/audit.

## Implementation specification

This is the code-discovery-complete implementation map. It still has explicit **OWNER-GATED** inputs above; those are authority/content decisions, not hidden engineering discovery. TDD is mandatory.

### 0. Publication transaction

Do not publish only one legal page, a dead `/terms` link, or a partial renewal flow. The publication unit is:

1. approved Privacy Policy and owner-supplied Terms;
2. public signed-out routes and footer links;
3. complete disclosure at pricing and every card/billing entry;
4. consent evidence and retainable acknowledgment;
5. cancellation and reminder paths;
6. adopted SHIELD program; and
7. Stripe legal URLs set only after the routes return signed-out 200 responses.

### 1. Stable routes and public-route guard

In `lib/routes.ts`, add to `ROUTES`:

```ts
PRIVACY: '/privacy',
TERMS: '/terms',
```

In `lib/public-routes.ts`, import `ROUTES` and add:

```ts
`${ROUTES.PRIVACY}(.*)`,
`${ROUTES.TERMS}(.*)`,
```

`proxy.ts` calls `auth.protect()` for every unmatched route. Raw strings would work, but deriving patterns from `ROUTES` is the DRY correction.

Tests:

- extend `lib/public-routes.test.ts` to assert both derived patterns;
- add unauthenticated E2E requests in `tests/e2e/legal-pages.spec.ts` that use `request.get`, assert status 200, and assert the final URL is not `/sign-in`;
- also assert `/privacy` and `/terms` render their expected headings so a custom 200 error page cannot pass.

### 2. Page and content seams

Create:

- `components/legal/legal-document.tsx` — server-only presentational component;
- `components/legal/legal-document.test.tsx`;
- `app/(marketing)/privacy/privacy-content.ts`;
- `app/(marketing)/privacy/page.tsx` and `page.test.tsx`;
- `app/(marketing)/terms/terms-content.ts`;
- `app/(marketing)/terms/page.tsx` and `page.test.tsx`.

Use the existing `MarketingLayout` composition from `app/pricing/page.tsx` and `featuresHref={`${ROUTES.HOME}#features`}`. Keep the provenance appendix internal; only the public-policy portion becomes content. Do not create the Terms files until the owner supplies the text.

Use one typed shape:

```ts
export type LegalSection = { heading: string; paragraphs: readonly string[] };
export type LegalDocumentContent = {
  title: string;
  effectiveDate: string;
  sections: readonly LegalSection[];
};
```

Tests must guard the six direct provider names, contact email, retention qualifications, Sentry/replay wording, educational disclaimer, renewal price/frequency/trial/cancellation terms, governing entity, and effective date.

### 3. Footer

Extend `components/marketing/marketing-layout.tsx` inside `MarketingFooter`'s existing link cluster, reuse `marketingNavLinkClass`, and link `ROUTES.PRIVACY` and `ROUTES.TERMS`. Extend `components/marketing/marketing-layout.test.tsx` using `findAnchorByHref`.

Footer links are discoverability only. They cannot satisfy the pre-billing visual-proximity rules.

### 4. Pre-billing disclosure and affirmative action

There are two separate billing-information entry surfaces:

1. plan subscription buttons in `app/pricing/pricing-view.tsx`; and
2. `TrialCountdownBanner`'s “Add a card to keep access” action in `app/(app)/app/layout.tsx`.

For each plan, immediately above the relevant CTA, render:

- product/plan;
- seven-day trial and no-card-to-start fact when applicable;
- exact post-trial or immediate amount;
- renewal interval;
- that it renews automatically until canceled;
- the deadline (“cancel before the next billing date”; for the trial card flow, “cancel or do not add a payment method before the displayed trial end”);
- the real cancellation method — the app's **Billing** page (nav item `Billing`, `ROUTES.APP_BILLING` → Stripe billing portal) — and `support@addictionboards.com`. **Corrected 2026-07-29: an earlier revision named "Account Settings → Billing", a navigation surface that does not exist in the app; `lib/pricing-data.test.ts` now pins the accurate path in all six disclosure strings;**
- `/terms` and `/privacy` links; and
- an unambiguous sentence tying the CTA to renewal authorization.

For a no-card trial, state accurately: without a payment method, Stripe is configured to cancel at trial end and no charge occurs. For an existing no-card trial, do not reuse the generic portal action as the consent mechanism. Replace it with a dedicated payment-method setup flow that presents the exact plan/amount/frequency before Stripe collects card information and records completion before the subscription can charge.

**Implemented in this audit branch:** `subscription.plan` now flows from `CheckEntitlementUseCase` through `getRequestAuthState` to `EntitledAppUser`, and both pricing cards plus the trial add-card banner use `PRICING_DATA[plan]` for plan-specific amount/frequency copy. Red tests were added first in:

- `src/application/use-cases/check-entitlement.test.ts`;
- `lib/auth-request-cache.test.ts`;
- `app/(app)/app/layout.test.ts`;
- `app/(app)/app/layout-shell.test.tsx`;
- `app/pricing/pricing-view.test.tsx`.

**Still required before publication:** add the Terms/Privacy links after those routes exist, replace the trial banner's generic portal action with the dedicated consent-bearing setup flow below, and persist the consent/acknowledgment. The new visible copy narrows the current risk but is not represented as complete ARL/ROSCA compliance.

### 5. Stripe consent

After the Terms URL exists in Stripe Business Settings, add `consent_collection: { terms_of_service: 'required' }` to subscription Checkout creation in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`. Extend `stripe-checkout-sessions.test.ts` and the trial/recovery variants before implementation.

Replace the trial banner's generic billing-portal entry with a dedicated Stripe Setup-mode Checkout or equivalent Stripe-hosted payment-method flow. It must:

- require the same Terms consent;
- identify plan, price, frequency, trial end, disclosure version, and user in signed server-side state;
- attach the completed payment method to the correct customer/subscription only after verified completion; and
- leave missing-payment-method cancellation unchanged when setup is abandoned.

The present `manageBillingAction` can continue to serve ordinary post-subscription management; it is not the correct seam for first billing consent.

### 6. Consent ledger

Generate a migration from `db/schema.ts`; do not hand-write migration SQL. Add `renewal_consent_records` with:

- UUID primary key;
- nullable local `userId` using `onDelete: 'set null'`;
- a stable pseudonymous consumer reference suitable for later matching;
- Stripe customer, subscription, and Checkout/Setup Session identifiers;
- plan, amount, currency, frequency, trial end, cancellation deadline/method;
- exact disclosure snapshot and version;
- Terms version/hash;
- consent source and accepted timestamp;
- subscription termination timestamp and computed `retainUntil`;
- created/updated timestamps.

This table is an intentional deletion exception. Retain each record until the later of three years after consent or one year after contract termination, then prune. The final Privacy Policy must disclose it.

Implement through Clean Architecture:

- domain entity/value object in `src/domain/`;
- repository port in `src/application/ports/`;
- fake in `src/application/test-helpers/fakes/`;
- record-consent use case in `src/application/use-cases/`;
- Drizzle repository in `src/adapters/repositories/`;
- composition-root factory in `lib/container/`;
- Stripe `checkout.session.completed`/setup completion handling in the existing Stripe webhook processor/controller seams.

Use fakes for owned code. Test account deletion retaining the consent record with `userId = null`, legal-retention pruning, replay/idempotency, cross-user rejection, and exact snapshot persistence.

### 7. Retainable acknowledgment and notices

**OWNER-GATED:** choose the sending provider before implementation. Then add a transactional-email gateway port and provider adapter rather than calling an SDK from a use case.

Immediately after verified consent, send a retainable acknowledgment containing the accepted renewal terms, amount/frequency, trial end, cancellation deadline/method, business contact, Terms, and Privacy links. Store send status/event ID without treating delivery as consent itself.

Implement a daily idempotent notice job with:

- California annual reminder content for annual subscriptions;
- California and New York annual-term notice 15–45 days before renewal/cancellation deadline;
- New York material-change notice at least 5 business days, but no more than 30 days, before change;
- California fee-change notice 7–30 days before change;
- retainable material-change notice and cancellation link;
- no seven-day-trial reminder claim under the >31-day statutory provisions, while preserving any provider courtesy reminder.

Provider-owned Stripe/Clerk templates must still be classified under CAN-SPAM. Do not assume the new provider's “transactional” label controls the legal primary-purpose test.

### 8. Cancellation verification

Keep the existing Stripe self-serve cancellation path. Before closure:

- signed-in browser/E2E test that the app's **Billing** page (`ROUTES.APP_BILLING`) reaches the Stripe portal entry;
- owner screenshot/export that portal cancellation is enabled;
- signed-out/offline fallback documented at `support@addictionboards.com`;
- test that pricing/acknowledgment copy names the same cancellation path;
- do not claim cancellation is immediate if the configured result is cancellation at period end.

### 9. New York SHIELD program

Active operational drafts now exist outside `docs/_archive/`:

- `docs/security/information-security-program.md`;
- `docs/security/incident-response-and-breach-notification.md`.

They name the owner/coordinator, system/data inventory, foreseeable risks, current administrative/technical/physical controls, provider selection and contractual safeguard review, access review, monitoring/testing cadence, retention/disposal, annual/event-driven review, incident severity/containment/evidence steps, provider escalation, affected-resident analysis, written no-notice determinations and five-year retention, the New York 30-day clock, required regulator notices, notice content, and decision log.

These are operational records, not marketing prose. Their `OPEN` assertions must be verified against actual provider/account settings, the tabletop must run, and the owner must sign the adoption record.

### 10. CCPA/state trigger checklist

At each annual review and before a material data/pricing/geographic change, record:

- revenue and state-consumer counts under the correct threshold definitions;
- sale/share/targeted-advertising status;
- sensitive and consumer-health data;
- ADMT significant-decision use;
- provider and cookie/analytics changes;
- whether just-in-time Notices at Collection, appeals, authorized agents, GPC/opt-outs, assessments, or consent are now required.

Do not add a present-tense “CCPA compliant” or “all state laws covered” claim.

### 11. Non-code publication checks

Only after the deployed pages return signed-out 200:

- set Stripe Privacy and Terms URLs;
- verify the existing shortened descriptor remains 2–10 characters and compatible with Stripe's suffix;
- inspect every Stripe and Clerk email template;
- verify support email delivery/catch-all;
- verify provider cancellation and notification settings;
- capture redacted evidence in the closure record; and
- run the authenticated billing E2E environment if credentials are available.

## Acceptance criteria

- [ ] Owner-supplied Terms exists and resolves every named clause question.
- [x] Privacy draft's factual claims match the audited codebase.
- [ ] Six-provider inventory remains exact or policy is updated in the same change.
- [ ] CCPA applicability and future-trigger statements use correct thresholds.
- [x] CAN-SPAM remains conditional/open; no blanket exemption survives.
- [ ] Renewal disclosures render in visual proximity before every billing-information request.
- [ ] Express consent and legal-duration evidence are persisted.
- [ ] Retainable acknowledgment, annual/renewal, and change notices exist.
- [ ] Cancellation is online, simple, and accurately described.
- [ ] `/privacy` and `/terms` are derived public patterns and pass signed-out 200 E2E checks.
- [ ] Footer and pre-billing links exist.
- [ ] SHIELD security and incident programs are adopted and evidence-backed.
- [ ] Stripe legal links are set only after deployment; existing descriptor reverified, not recreated.
- [ ] Full quality gate passes before push.
- [ ] CodeRabbit reviews the exact final pushed head before merge is requested.

## Primary sources

- [FTC — ROSCA, 15 U.S.C. §§ 8401–8405](https://www.ftc.gov/legal-library/browse/statutes/restore-online-shoppers-confidence-act)
- [California Business and Professions Code § 17602](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17602.)
- [New York General Business Law § 527-a](https://www.nysenate.gov/legislation/laws/GBS/527-A)
- [New York SHIELD Act safeguards, GBL § 899-bb](https://www.nysenate.gov/legislation/laws/GBS/899-BB) and [breach notice, § 899-aa](https://www.nysenate.gov/legislation/laws/GBS/899-AA)
- [California Civil Code § 1798.140](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140), [CPPA threshold adjustment](https://cppa.ca.gov/regulations/cpi_adjustment.html), and [2026 regulations](https://cppa.ca.gov/regulations/ccpa_updates.html)
- [CAN-SPAM Act, 15 U.S.C. § 7704](https://uscode.house.gov/view.xhtml?req=%28title%3A15+section%3A7704+edition%3Aprelim%29) and [16 C.F.R. Part 316](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-316)
- [FTC Act § 5, 15 U.S.C. § 45](https://uscode.house.gov/view.xhtml?req=%28title%3A15+section%3A45+edition%3Aprelim%29)
- [COPPA, 15 U.S.C. § 6502](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title15-section6502)
- [Virginia Consumer Data Protection Act](https://law.lis.virginia.gov/vacodefull/title59.1/chapter53/), [Colorado Privacy Act enforcement summary](https://coag.gov/press-releases/attorney-general-phil-weiser-launches-enforcement-of-colorado-privacy-act/), [Connecticut Data Privacy Act](https://portal.ct.gov/ag/sections/privacy/the-connecticut-data-privacy-act/), and [Utah Consumer Privacy Act](https://le.utah.gov/xcode/Title13/Chapter61/13-61.html)
