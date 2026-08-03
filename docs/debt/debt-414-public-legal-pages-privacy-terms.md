# DEBT-414: Public Legal Pages, Renewal Consent, and Security-Program Closure

**Priority:** P1 publication and billing-compliance blocker
**Created:** 2026-06-10
**Status:** **ACTIVE — adversarial audit completed 2026-07-29; not safe to publish or use for new paid conversion yet.** The Privacy Policy draft has been corrected against the codebase. **2026-08-03: the Terms of Service draft now exists** ([`docs/legal/terms-of-service.md`](../legal/terms-of-service.md)) — authored in house from the codified statutes and codebase facts, with internal *Decisions on record* and *Provenance* appendices; it awaits the owner's pre-acquisition legal review alongside the Privacy Policy. Consent evidence, acknowledgment/reminders, public delivery, destination-mailbox/transactional-sender identification, and the New York SHIELD Act operational program remain open.
**Owner:** John H. Jung, MD, MS, sole proprietor, New York
**Product:** Addiction Boards at `addictionboards.com`
**Contact:** `support@addictionboards.com`
**Branch baseline:** re-audited from `a9c17d90` on 2026-07-29
**Related:** [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md), [Privacy Policy draft](../legal/privacy-policy.md), [Debt Index](./index.md)

> This is a diligent non-lawyer implementation and evidence record, not legal advice. The owner has chosen in-house drafting while the product is pre-revenue with no active users and a focused legal review before paid user acquisition. “Lawyer review” below is limited to named clauses and evidentiary questions; it is not a substitute for finishing the engineering and operational work.

## Verdict

**Do not publish the current package or collect billing information from a new consumer through the current flow.** Five concrete blockers remain:

1. ~~`docs/legal/terms-of-service.md` is absent.~~ **Drafted 2026-08-03** with statute-grounded subscription terms (its trial/cancel/grace mechanics match the implementation; increased-price consent and notices remain implementation work), the medical-education disclaimer, and recorded decisions (no arbitration clause, cancel-forward refunds with two owner-adverse carve-outs, no indemnification). Remaining for this blocker: owner read-through + the deferred pre-acquisition legal review.
2. The live pricing and trial add-card entry do not yet implement the complete ROSCA, California, and New York pre-billing disclosure and affirmative-consent path.
3. The repository does not retain a durable consumer-level record of initial or increased-price consent, and does not produce the required retainable acknowledgment or annual-plan notices.
4. Draft New York SHIELD Act security and incident-response procedures now exist, but their live-account `OPEN` checks have not been verified and the owner has not adopted them.
5. The destination mailbox provider is unidentified, and the transactional renewal-message sender is unselected; the final direct-provider inventory and corresponding Privacy disclosure therefore cannot yet be completed. **This blocker also gates the email-cancellation channel the Terms and pricing disclosures advertise (added 2026-08-03, #724 final round):** before publication, verify end-to-end delivery to `support@addictionboards.com` with a real external send, and record the cancellation-processing procedure — identity verified by matching the sender to the account email (as § 4 now states), the cancellation executed in Stripe effective at period end, and owner monitoring coverage. The online Billing-page path independently satisfies the as-easy-as-signup cancellation requirement; email is an additional consumer-protective channel and must be operational, not decorative, once published.

The corrected Privacy Policy is suitable for focused review once those implementation facts are settled. It must not be copied into a public page before then, because the final policy must describe the final implementation rather than a planned one.

## Business facts and verification limits

| Fact | Result |
|---|---|
| Legal identity | **CONFIRMED:** John H. Jung, MD, MS, sole proprietor. Credentials are display text, not part of the legal name. The clinical PLLC is excluded. |
| Governing-law choice in the Terms draft | New York. Section 11 is drafted and remains part of the focused pre-acquisition review. |
| Product name/domain | Addiction Boards / `addictionboards.com`. |
| Privacy/legal email | DNS MX and SPF records for ImprovMX were independently confirmed on 2026-07-29. **UNVERIFIABLE without sending external mail:** end-to-end forwarding and the asserted catch-all. Do not describe either as tested. |
| Mailing address | No address is currently published. CCPA's request-channel rule does not require one for an exclusively online business with a direct consumer relationship. CAN-SPAM can require one in each commercial or mixed-primary-purpose email; that question remains open until provider-owned templates are inspected. |
| Revenue/users | Owner-recorded pre-revenue and no-active-user state. Not derivable from the repository. |
| Direct provider count | **Six named providers are confirmed:** Clerk, Stripe, Neon, Vercel, Sentry, and ImprovMX. **The complete count is UNVERIFIABLE:** the security inventory separately records the destination inbox that receives ImprovMX-forwarded support mail, but the repository does not identify that mailbox provider. Name it before publication. Preview-only tooling and a direct provider's own vendors are not direct additions; a separately selected destination mailbox is not established to be ImprovMX's vendor. |
| Stripe statement descriptor | The existing shortened descriptor was previously verified as present and compliant. It is a re-verification item, not a missing implementation item. This audit did not access or modify Stripe. |

## Codebase findings that bind the copy

The Privacy Policy's detailed [Provenance and adversarial verification](../legal/privacy-policy.md#provenance-and-adversarial-verification) table is the source of truth. The most important corrections are:

- Email is the only ordinary contact field in the local `users` row, but it is not the only identifier in the full schema. Clerk IDs, Stripe IDs, provider event IDs, free-text feedback, IP-derived rate-limit keys, diagnostics, and support email can identify or relate to a person.
- Full card numbers are not stored in the application database. Stripe Checkout can collect billing information, and the repository cannot support “we never see any payment details.”
- Twenty-four hours is a rate-limit cleanup target and the normal idempotency expiry, not a hard physical-deletion maximum. Both cleanup paths are request-triggered, batch-limited, and allowed to fail.
- User-linked local rows cascade on account deletion. Provider-event ledgers, the Clerk deletion tombstone, pending external cleanup, support mail, provider copies, and required records can survive.
- Sentry replay is off, client tracing is off, and server tracing is sampled at 5%. Raw exception/request capture means “Sentry cannot receive personal information” is false.
- Absence of an analytics dependency is not proof of deployment behaviour. No Vercel Web Analytics component/script exists in the application build, but the current dashboard setting is not exposed by the audited CLI path and remains an owner verification item. Actual event transmission was not tested.
- No application cookie-write call was found. That does not prove all provider-hosted cookie behaviour.
- Processed Stripe events target 90-day deletion; unresolved Stripe events remain until resolution; handled Clerk events have no automatic terminal policy.

Any future change to these facts requires a same-change Privacy Policy review. Publishing an absolute claim contradicted by actual practice creates an independent FTC Act § 5 deception risk.

## Legal sufficiency matrix

The quoted operative language below comes from official government sources. Secondary summaries may help research but are not authority for this specification.

| Regime | Applicability | Operative rule and current result |
|---|---|---|
| **FTC Act § 5, 15 U.S.C. § 45** | **APPLIES** to the operator's interstate commercial practices. | The Act prohibits “unfair or deceptive acts or practices in or affecting commerce.” A published privacy promise that contradicts the implementation is a deception risk. **SATISFIED only after the corrected copy is kept synchronized with practice.** The original absolute retention, deletion, Sentry, analytics, payment, cookie, security, and location claims were publication blockers and have been removed. |
| **ROSCA, 15 U.S.C. §§ 8401–8405** | **APPLIES** to this online negative-option offer. | 15 U.S.C. § 8403 requires clear and conspicuous material terms before billing information, express informed consent before charging, and a simple cancellation mechanism. **MISSING:** complete disclosure at every billing-information entry, an evidence-bearing consent path, and a durable acknowledgment. Stripe portal cancellation supports the cancellation element but does not cure the first two. |
| **California ARL, Bus. & Prof. Code § 17602** | **APPLIES ON NAMED TRIGGER:** an offer to a California consumer. The national site permits that trigger. | The statute requires terms “before the subscription or purchasing agreement is fulfilled” and in visual proximity to consent; affirmative and express affirmative consent; a retainable acknowledgment; verification for at least three years or one year after termination, whichever is longer; pre-confirmation billing notice; simple online cancellation; a separate annual reminder; annual-term renewal notice 15–45 days before renewal; retainable notice of a material change before implementation; and, specifically for a fee change, notice no less than 7 days and no more than 30 days before it takes effect. **MISSING** except for the existing online Stripe cancellation path. The seven-day trial is not subject to the statute's separate 3–21-day reminder for trials longer than 31 days, but the annual plan is subject to the separate annual-reminder and 15–45-day notice duties. |
| **New York GBL § 527-a** | **APPLIES ON NAMED TRIGGER:** an offer to a New York consumer. Operator location/governing law does not replace the consumer-location trigger, but a nationwide offer reaches it. | Current § 527-a requires material terms “before consent to the offer or billing information has been requested” and in visual proximity; affirmative consent; a prompt retainable notice; cancellation as easy and in the same medium; a renewal notice 15–45 days before the cancellation deadline **for offers with an initial paid term of one year or longer that renew for a paid term of six months or longer** (the $199 annual plan qualifies: one-year initial term, one-year renewals; the monthly plan does not); and material-change notice at least 5 business days, but no more than 30 days, before the change — the statute applies that window to **any** material change, “including any price increases.” Subdivision 1(b-1) separately prohibits charging an increased price unless the business either first obtains affirmative consent or allows cancellation for at least 14 days after the charge with a pro-rata refund of the remaining term; this package chooses affirmative consent before any increased charge. **MISSING** except for the existing online cancellation path. Its trial reminder (subdivision 1(h)) reaches only “a free gift or trial for a period of more than a month,” so it does not apply to the seven-day trial. **Verified against the codified statute text on 2026-08-03, not a bill draft — see the review-thread rebuttal on PR #720: an earlier review objection relied on the original S3008 amendment, which the enacted Part W superseded.** |
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
- [ ] Identify the destination mailbox provider, add it to the Privacy and security inventories, and determine whether it will also be the transactional-email sender. Do not certify an exact provider count until this is recorded.
- [ ] Inventory the exact live Clerk and Stripe email templates; record each primary-purpose classification. Add a valid postal address and opt-out to every commercial template.
- [ ] Read through and approve the existing Terms of Service draft as the owner-supplied publication copy.
- [ ] Confirm the intended content-source representation against a recorded question/source-rights review before restoring any claim that every item is original/licensed or that no actual examination question is present.
- [ ] Obtain focused review of these specific Terms questions before paid acquisition:
  - Is the educational/not-medical-advice disclaimer adequate for a professional board-prep product that presents clinical scenarios?
  - Are the limitation-of-liability, warranty disclaimer, New York choice-of-law, arbitration/class-waiver, cancellation/refund, and unilateral-change clauses enforceable for the intended nationwide consumer sale?
  - Is the proposed local consent ledger plus Stripe's Checkout consent field sufficient “verification” under California § 17602(a)(6), including after account deletion?
- [ ] Select a transactional-email delivery mechanism for retainable acknowledgments, annual reminders, annual renewal notices, and material-change notices. ImprovMX is inbound forwarding, not a sender. Reconcile the sender with the final provider inventory and Privacy Policy; it is another provider unless the selected destination mailbox provider also performs this role.
- [x] Create draft SHIELD Act security and incident procedures.
- [ ] Verify every live-account `OPEN` item, run the tabletop, and adopt the SHIELD program.
- [ ] After deploying both public pages, set Stripe's Privacy Policy and Terms links and re-verify the already-existing shortened descriptor and provider-owned notices. Do not change production Stripe during implementation/audit.

## Implementation specification

This is the code-discovery-complete implementation map. It still has explicit **OWNER-GATED** inputs above; those are authority/content decisions, not hidden engineering discovery. TDD is mandatory.

### 0. Publication transaction

Do not publish only one legal page, a dead `/terms` link, or a partial renewal flow. The publication unit is:

1. approved Privacy Policy and owner-approved Terms;
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

Use the existing `MarketingLayout` composition from `app/pricing/page.tsx` and `featuresHref={`${ROUTES.HOME}#features`}`. Keep the Privacy provenance appendix and the Terms decisions/provenance appendices internal; only the owner-approved public portions of the two existing drafts become content.

Use one typed shape that preserves the exact committed Markdown structure, including links, emphasis, lists, and tables:

```ts
export type LegalDocumentContent = {
  title: string;
  effectiveDate: string;
  bodyMarkdown: string;
};
```

`LegalDocument` must render `bodyMarkdown` as sanitized GitHub-flavoured Markdown with the existing `react-markdown`, `remark-gfm`, and `rehype-sanitize` dependencies and legal-specific semantic component styles. Keep this renderer server-renderable; do not reuse the question-specific `components/markdown/markdown.tsx`, which is a client component with clinical-pearl behavior. Tests must parse the output with `parseHtml` and use `findHeadingByText` / `findAnchorByHref` from `tests/shared/dom-helpers.ts`; they must also prove that representative lists and tables render and that the internal provenance/decision appendices do not.

Tests must guard every confirmed direct-provider name plus the owner-approved destination mailbox and transactional-email provider names, contact email, retention qualifications, Sentry/replay wording, educational disclaimer, renewal price/frequency/trial/cancellation terms, governing entity, and effective date.

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

After the Terms URL exists in Stripe Business Settings, add `consent_collection: { terms_of_service: 'required' }` to subscription Checkout creation in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`. Extend these exact existing tests before implementation:

- `src/adapters/gateways/stripe/stripe-checkout-sessions.test.ts`;
- `src/adapters/gateways/stripe/stripe-checkout-sessions-trials.test.ts`;
- `src/adapters/gateways/stripe/stripe-checkout-sessions-recovery.test.ts`; and
- `src/adapters/gateways/stripe/stripe-checkout-sessions-trial-recovery.test.ts`.

Replace the trial banner's generic billing-portal entry with a dedicated Stripe Setup-mode Checkout or equivalent Stripe-hosted payment-method flow. It must:

- require the same Terms consent;
- identify plan, price, frequency, trial end, disclosure version, and user in signed server-side state;
- attach the completed payment method to the correct customer/subscription only after verified completion; and
- leave missing-payment-method cancellation unchanged when setup is abandoned.

The present `manageBillingAction` can continue to serve ordinary post-subscription management; it is not the correct seam for first billing consent.

Use Stripe-hosted Checkout in `setup` mode for this existing-trial path. Stripe's current API requires `currency` in setup mode when dynamic payment methods are used, and exposes Terms acceptance on the completed Session. **Do NOT pass `customer` when creating the setup Session** — in setup mode Stripe attaches the completed PaymentMethod to a supplied Customer automatically at completion, i.e. *before* our webhook validation runs, which would break the fail-closed requirement below. Create the session customer-less, carry the customer/user/subscription/consent identifiers only in signed server-owned metadata, and attach the PaymentMethod to the verified customer explicitly in the validated webhook path. Do not add `payment_method_types`; preserve dynamic payment methods. *(Corrected 2026-08-03 per promo #724 review — an earlier revision passed the existing customer at session creation, which would have attached pre-validation.)* The provider-independent implementation map is:

- extend `CheckoutSessionCreateParams`, `StripeCheckoutSession`, and `StripeClient` in `src/adapters/shared/stripe-types.ts` for the setup-mode request, `setup_intent`, and `consent.terms_of_service` response;
- add the setup operation to `PaymentGateway` in `src/application/ports/gateways.ts` and `FakePaymentGateway` in `src/application/test-helpers/fakes/fake-gateways.ts`;
- implement `CreateTrialPaymentMethodSetupSessionUseCase` in `src/application/use-cases/create-trial-payment-method-setup-session.ts` with its colocated `.test.ts`, and export it from `src/application/use-cases/index.ts`;
- extend `src/adapters/gateways/stripe/stripe-checkout-sessions.ts` plus the four exact tests above to create `mode: 'setup'` with `currency: 'usd'`, **no `customer` parameter**, signed server-owned metadata carrying the expected customer/user/subscription identifiers, Terms consent, and a success URL containing `{CHECKOUT_SESSION_ID}`;
- expose `createTrialPaymentMethodSetupSession` through `src/adapters/controllers/billing-controller.ts` and its existing `.test.ts`, wire it through `lib/container/types.ts`, `lib/container/use-cases.ts`, `lib/container/controllers.ts`, and `lib/container.test.ts`, and call it from new `app/(app)/app/trial-payment-method-actions.ts` plus `.test.ts`;
- replace `manageBillingAction` with that new action only in `TrialCountdownBanner` at `app/(app)/app/layout.tsx`; extend `app/(app)/app/layout.test.ts` and `app/(app)/app/layout-shell.test.tsx`; and
- extend `src/adapters/gateways/stripe/stripe-webhook-schemas.ts`, `stripe-webhook-processor.ts`, their existing tests, `src/application/ports/gateways.ts`, and `src/adapters/controllers/stripe-webhook-controller.ts` plus its test so a verified setup-mode `checkout.session.completed` records the accepted snapshot and then **explicitly attaches the completed PaymentMethod to the verified customer and sets it as the existing subscription's default — attachment happens only here**, after the session's user/customer/subscription metadata matches local ownership and the accepted-Terms and pending-consent checks pass. A setup completion without accepted Terms, a matching pending consent snapshot, or the expected subscription must fail closed and must not attach or select the method; because the session was created customer-less, an unvalidated completion leaves the PaymentMethod unattached rather than silently bound to a customer. **Replay safety across the two Stripe writes:** derive **one stable operation key from the Checkout Session ID** (event IDs differ across duplicate deliveries; the Session is the operation's identity), persist an operation-outcome record under it (verified customer, PaymentMethod, subscription, accepted snapshot, per-write status), and take an **atomic pending→processing claim** on that record before attempting the attach and default-selection writes — both Stripe writes use idempotency keys derived from the operation key, success is marked only after both complete, and a crash between webhook success and either write must be reconcilable on replay (method attached but not default, or neither). Cover concurrent duplicate webhook deliveries of the same completed Session, not just serial replay;

### 6. Consent ledger

Generate a migration from `db/schema.ts`; do not hand-write migration SQL. Add `renewal_consent_records` with:

- UUID primary key;
- nullable local `userId` using `onDelete: 'set null'`;
- a stable pseudonymous consumer reference suitable for later matching;
- Stripe customer and subscription identifiers, plus nullable Checkout/Setup Session identifiers for consent paths that do not create such a session;
- plan, amount, currency, frequency, trial end, cancellation deadline/method;
- exact disclosure snapshot and version;
- Terms version/hash;
- consent source and accepted timestamp;
- consent kind (`initial_offer` or `price_increase`) and, for a price increase, the prior amount, proposed amount, and subscriber-specific effective renewal;
- subscription termination timestamp and computed `retainUntil`;
- created/updated timestamps.

This table is an intentional deletion exception. Retain each record until the later of three years after consent or one year after contract termination, then prune. The final Privacy Policy must disclose it.

Implement through these exact Clean Architecture files and seams:

- `src/domain/entities/renewal-consent-record.ts` and `src/domain/value-objects/renewal-consent.ts`, with exports in their existing `index.ts` barrels and behavior tests in `renewal-consent.test.ts`;
- `src/application/ports/renewal-consent-record-repository.ts`, exported by `src/application/ports/repositories.ts` and `src/application/ports/index.ts`;
- `src/application/test-helpers/fakes/fake-renewal-consent-record-repository.ts` plus `.test.ts`, exported by `src/application/test-helpers/fakes/index.ts`;
- `src/application/use-cases/record-renewal-consent.ts` plus `.test.ts` and `src/application/use-cases/prune-renewal-consents.ts` plus `.test.ts`, exported by `src/application/use-cases/index.ts`;
- `src/adapters/repositories/drizzle-renewal-consent-record-repository.ts` plus `.test.ts`, exported by `src/adapters/repositories/index.ts`;
- factory types and wiring in `lib/container/types.ts`, `lib/container/repositories.ts`, `lib/container/use-cases.ts`, `lib/container/controllers.ts`, and `lib/container.test.ts`;
- initial subscription and setup completion through the existing `src/adapters/gateways/stripe/stripe-webhook-processor.ts` and `src/adapters/controllers/stripe-webhook-controller.ts` seams and their existing tests; and
- real-database contract coverage in new `tests/integration/renewal-consent-records.integration.test.ts`.

Use fakes for owned code. Test account deletion retaining the consent record with `userId = null`, legal-retention pruning, replay/idempotency, cross-user rejection, and exact snapshot persistence.

### 7. Retainable acknowledgment and notices

**OWNER-GATED:** choose the sending provider before implementing its adapter. The provider-independent names are fixed: add `src/application/ports/transactional-email-gateway.ts`, export it from `src/application/ports/index.ts`, and add `src/application/test-helpers/fakes/fake-transactional-email-gateway.ts` plus `.test.ts` and its barrel export. Put the selected SDK adapter at `src/adapters/gateways/<provider>-transactional-email-gateway.ts` with a colocated test; replacing `<provider>` is the recorded owner input, not an engineering-discovery step. Wire it through `lib/container/gateways.ts`, `lib/container/types.ts`, and `lib/container.test.ts` rather than calling an SDK from a use case.

Immediately after verified consent, send a retainable acknowledgment containing the accepted renewal terms, amount/frequency, trial end, cancellation deadline/method, business contact, Terms, and Privacy links. **Durability requirement (added 2026-08-03 per promo #724 review):** create the acknowledgment dispatch record in `renewal_notice_deliveries` **in the same transaction that persists the verified consent record** — so a process failure after consent persistence cannot leave valid consent without a queued acknowledgment, and a retry cannot send duplicates. The sender reuses that record for retries, persisting delivery status and provider event ID on it. Delivery is never treated as consent itself. **Key shape:** acknowledgment rows key on (`notice_kind = 'acknowledgment'`, consent-record ID, destination) — an acknowledgment's identity is its consent record, so a later consent by the same subscriber always gets its own acknowledgment and duplicates of the same one are impossible.

Implement a daily idempotent notice job with:

- California annual reminder content for annual subscriptions;
- California and New York annual-term notice 15–45 days before renewal/cancellation deadline;
- New York material-change notice at least 5 business days, but no more than 30 days, before change;
- California fee-change notice 7–30 days before change;
- retainable material-change notice and cancellation link;
- no seven-day-trial reminder claim under the >31-day statutory provisions, while preserving any provider courtesy reminder.

Add a `renewal_notice_deliveries` table in `db/schema.ts` in the same generated migration as the consent table. **Uniqueness is per-notice-kind, not one generic key (corrected 2026-08-03, promo #724 final round — a single generic key shape either suppressed a later consent's acknowledgment or allowed duplicate acknowledgments):** *scheduled notices* (annual reminder, renewal notice, material-change/fee-change notice) key on notice kind + subscription + applicable renewal/change + disclosure version + destination, so cron retries cannot duplicate a notice; *acknowledgment rows* key on notice kind + consent-record ID + destination, deriving any renewal/change identity from their consent record and leaving it unbound when none applies. The generated migration and the repository's integration tests must enforce both key shapes explicitly (partial unique indexes per kind, not one nullable composite), and the test suite must cover repeated consent by the same subscriber plus cron replay. Implement `src/application/use-cases/send-renewal-acknowledgment.ts` plus `.test.ts`, `src/application/use-cases/send-due-renewal-notices.ts` plus `.test.ts`, and `src/adapters/jobs/send-due-renewal-notices.ts` plus `.test.ts`. Expose the job at new `app/api/cron/send-renewal-notices/route.ts` plus `route.test.ts`, copying the existing constant-time `CRON_SECRET`, fail-closed limiter, and structured-error pattern from `app/api/cron/reconcile-stripe-subscriptions/route.ts`. Add the daily route to `vercel.json`. Cover database idempotency/retry in new `tests/integration/renewal-notice-deliveries.integration.test.ts`.

Apply the stricter selected price-increase consent rule nationwide so the implementation does not depend on an unimplemented consumer-state classifier: before changing a Stripe subscription to an increased recurring price, require an explicit affirmative action tied to the proposed amount and effective renewal, persist a `price_increase` consent record, and verify it before the higher charge can occur. If consent is absent, do not renew at the increased price; schedule cancellation at the existing period end instead. Add unit/integration coverage for consent, refusal/absence, replay, and subscriber/price/version mismatch.

Model a pending increase in `subscription_price_change_offers` in `db/schema.ts` and the generated migration. Implement `src/application/use-cases/record-price-increase-consent.ts` plus `.test.ts` and `src/application/use-cases/apply-due-price-changes.ts` plus `.test.ts`; add the repository methods to the renewal-consent repository port/fake/Drizzle adapter above. Present the offer at `app/(app)/app/billing/price-change/[offerId]/page.tsx` plus `page.test.tsx`, and accept/refuse it through `app/(app)/app/billing/price-change/price-change-actions.ts` plus `.test.ts`. Extend `PaymentGateway`, the Stripe adapter/types, and `FakePaymentGateway` with narrowly named subscription-price-update and cancel-at-period-end operations. Invoke `ApplyDuePriceChangesUseCase` from the daily notice route after notice processing. Its transaction must verify subscriber, offer, old price, proposed price, effective renewal, disclosure/Terms versions, and unconsumed consent before the Stripe update; absence/refusal schedules period-end cancellation. **Replay safety (added 2026-08-03 per promo #724 review; hardened same day per #725 round 2):** each price-change application carries a durable operation key with persisted outcome state on the offer row (mirroring the notice-delivery uniqueness pattern). The use case first takes an **atomic pending→processing claim** on the offer row (conditional update recording claim owner and claim timestamp) so concurrent workers serialize — outcome state alone does not — then reconciles local state against the live Stripe subscription (price/period) so a failure between the Stripe update and the local commit is detected as already-applied rather than re-issued, and only then finalizes. **Stale-claim recovery (added same day, #724 final round):** a claim is a lease, not a tombstone — the daily run must return `processing` rows whose lease has expired to `pending` *after* reconciling against Stripe (already-applied → finalize; not applied → safe to re-claim), so a worker that dies after claiming but before the Stripe call cannot strand a consented price change in limbo where it neither applies nor triggers the required period-end cancellation. The Stripe price update is issued with the **operation key as its Stripe idempotency key** and explicit `proration_behavior: 'none'` — the change takes effect at the consented renewal, never as a mid-period prorated charge. Add `tests/integration/subscription-price-change-consent.integration.test.ts`, including a crash-between-Stripe-and-commit replay case, a concurrent-worker double-claim case, and a crash-after-claim-before-Stripe-call case proving stale-lease recovery. Until this flow is shipped and tested, changing an existing subscriber's recurring price remains operationally prohibited.

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

- [ ] Owner has approved the existing Terms draft and resolved every named clause question required before publication.
- [x] Privacy draft's factual claims match the audited codebase.
- [ ] Destination mailbox and transactional-email providers are identified and the final provider inventory is exact across Privacy and security documents.
- [x] CCPA applicability and future-trigger statements use correct thresholds.
- [x] CAN-SPAM remains conditional/open; no blanket exemption survives.
- [ ] Renewal disclosures render in visual proximity before every billing-information request.
- [ ] Express consent and legal-duration evidence are persisted.
- [ ] Retainable acknowledgment, annual/renewal, and change notices exist.
- [ ] An increased recurring price cannot be charged without a matching affirmative price-increase consent record.
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
- [Stripe Checkout setup mode](https://docs.stripe.com/payments/checkout/save-and-reuse) and [Checkout Session consent fields](https://docs.stripe.com/api/checkout/sessions/create)
