# DEBT-414: Public Legal Pages, Renewal Consent, and Security-Program Closure

**Priority:** P1 publication and billing-compliance blocker
**Created:** 2026-06-10
**Status:** **ACTIVE — Stage 1 production-verified 2026-08-05; Stage 2 engineering completed 2026-08-06.** Stage 1 published the corrected Privacy Policy and Terms of Service at signed-out public routes, and its adversarial-review fixes are live (see the review record below). On 2026-08-05 the owner cleared both between-stages items, which are independent of each other. (1) **Stripe:** both Business Settings legal URLs are set; the **Terms of Service URL is the only Checkout precondition** for `consent_collection[terms_of_service]=required` — Stripe's Checkout customization guide states it verbatim: *"Before requiring agreement to your terms, set your terms of service URL in your public details of your business. **Setting a privacy policy URL is optional**"* ([docs.stripe.com/payments/checkout/custom-components](https://docs.stripe.com/payments/checkout/custom-components); the API reference names only the Terms URL and is silent on the Privacy URL, so cite the guide, not the reference). (2) **Support mail:** external delivery to the Google Workspace inbox is verified — an operational gate for the published support and cancellation channel, and **not** a Checkout precondition; support-mail state cannot cause Checkout Session creation to fail. Remaining owner work is Resend account/domain/key activation and a real delivery test, cancellation-setting/procedure evidence, the New York SHIELD Act operational program, provider-template CAN-SPAM classification, owner read-through, and focused legal review. Price-change consent/apply machinery is owner-deferred under the 2026-08-06 ruling below; existing subscriber recurring prices must remain unchanged until that machinery ships.
**Owner:** John H. Jung, MD, MS, sole proprietor, New York
**Product:** Addiction Boards at `addictionboards.com`
**Contact:** `support@addictionboards.com`
**Branch baseline:** re-audited from `a9c17d90` on 2026-07-29; Stage 1 built, adversarially reviewed, and promoted 2026-08-05 (production merge `874f1599`); Stage 2 shipped through promo #747 on 2026-08-07 (CodeRabbit approval review `4882980598`; merge `19f8a31efb466aebe86ff40257824f5fd2854304`)
**Related:** [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md), [Privacy Policy draft](../legal/privacy-policy.md), [Debt Index](./index.md)

> This is a diligent non-lawyer implementation and evidence record, not legal advice. The owner has chosen in-house drafting while the product is pre-revenue with no active users and a focused legal review before paid user acquisition. “Lawyer review” below is limited to named clauses and evidentiary questions; it is not a substitute for finishing the engineering and operational work.

## Verdict

**Stage 1 is published and its gate is SATISFIED (2026-08-05). Stage 2's required-Terms Checkout field, trial add-card consent flow, initial-consent ledger, durable acknowledgment, annual reminder/renewal job, and fail-closed Resend adapter shipped through promo #747 on 2026-08-07.** DEBT-414 remains active for these five workstreams:

1. ~~`docs/legal/terms-of-service.md` is absent.~~ **Drafted 2026-08-03** with statute-grounded subscription terms (its trial/cancel/grace mechanics match the implementation; increased-price consent and notices remain implementation work), the medical-education disclaimer, and recorded decisions (no arbitration clause, cancel-forward refunds with two owner-adverse carve-outs, no indemnification). Remaining for this blocker: owner read-through + the deferred pre-acquisition legal review.
2. **Engineering complete:** every billing-information entry has the pinned disclosure/link placement, subscription Checkout requires Terms consent, and the trial add-card flow uses a customer-less Setup Session with verified webhook completion rather than the billing portal.
3. **Initial-offer engineering complete, price-change portion deferred:** the repository retains legal-duration initial-consent evidence and atomically queues a retainable acknowledgment; the daily job creates per-kind annual reminders and 15–45-day annual renewal notices, quarantines stale claims, and remains queued without a Resend key. The owner deferred price-increase offer/consent/apply machinery on 2026-08-06; no existing subscriber's recurring price may change until that separate flow ships.
4. Draft New York SHIELD Act security and incident-response procedures now exist, but 17 live-account checklist rows remain unchecked after separating the completed support-mail receipt check from the still-open Google Workspace retention/access check, and the owner has not signed either adoption block.
5. **Provider identification and adapter engineering are closed:** Google Workspace (Google LLC) is the destination mailbox and Resend is the transactional renewal-message sender. **End-to-end delivery to `support@addictionboards.com` was verified 2026-08-05 and independently corroborated from the connected destination mailbox 2026-08-06.** The Resend adapter, durable queue, state machine, and container wiring now exist. **The operational tail remains open:** create/verify the Resend account and domain, configure `RESEND_API_KEY`, test one real delivery, and record the cancellation-processing procedure — identity verified by matching the sender to the account email (as § 4 states), the cancellation executed in Stripe effective at period end, and owner monitoring coverage. The online Billing-page path independently satisfies the as-easy-as-signup cancellation requirement; email is an additional consumer-protective channel. **Its delivery state is an operational gate, not a Checkout precondition — support-mail status cannot cause Checkout Session creation to fail and therefore does not gate Stage 2** *(corrected 2026-08-06: this sentence previously made support-mail verification a Stage 2 precondition, the same conflation CodeRabbit flagged Major on the Status line).*

Stage 1 published the corrected Privacy Policy and Terms together before the remaining implementation and owner-tail work was complete, under the two-stage sequence above: verify both public routes in production, then set the Stripe Business Settings Terms URL before promoting required Terms consent in Stage 2. (Support-email delivery was verified in the same window but is an independent operational gate, not part of the Stage 2 precondition.) The public Privacy copy now describes the implemented Resend boundary condition rather than a stale phase label: messages send when configured and otherwise remain queued without contacting Resend. The remaining owner work and deferred price-change flow keep DEBT-414 active before paid acquisition.

## Business facts and verification limits

| Fact | Result |
|---|---|
| Legal identity | **CONFIRMED:** John H. Jung, MD, MS, sole proprietor. Credentials are display text, not part of the legal name. The clinical PLLC is excluded. |
| Governing-law choice in the Terms draft | New York. Section 11 is drafted and remains part of the focused pre-acquisition review. |
| Product name/domain | Addiction Boards / `addictionboards.com`. |
| Privacy/legal email | **MEASURED:** DNS MX and SPF records for ImprovMX were independently confirmed on 2026-07-29. The connected Google Workspace destination mailbox contains the 2026-08-05 external message addressed to `support@addictionboards.com`; raw headers confirm delivery, TLS, the ImprovMX envelope-sender rewrite, and the original Gmail DKIM pass. **OWNER-REPORTED:** it arrived in Inbox, not spam, within about one minute; the retained message no longer has either label, so original placement is not reconstructable. **Still not tested:** the asserted catch-all, strict-DMARC sender domains, and outbound sending as `support@addictionboards.com` (free-tier ImprovMX is inbound-only). Do not describe those as tested. |
| Mailing address | No address is currently published. CCPA's request-channel rule does not require one for an exclusively online business with a direct consumer relationship. CAN-SPAM can require one in each commercial or mixed-primary-purpose email; that question remains open until provider-owned templates are inspected. |
| Revenue/users | Owner-recorded pre-revenue and no-active-user state. Not derivable from the repository. |
| Direct provider count | **Eight named providers:** Clerk, Stripe, Neon, Vercel, Sentry, ImprovMX, Google Workspace (Google LLC), and Resend. The owner identified Google Workspace as the destination inbox and selected Resend for transactional notices on 2026-08-04. The adapter and durable queue are implemented; provider calls remain inactive while `RESEND_API_KEY` is absent. Preview-only tooling and a direct provider's own vendors are not direct additions. |
| Stripe statement descriptor | **SATISFIED on the recorded owner verification; corroborated in test mode 2026-08-06.** `ADDICTIONBOARDS.COM` is the 19-character full descriptor. It does not identify or refute the separate shortened field: the test-mode Account API independently returns `settings.card_payments.statement_descriptor_prefix = "ADDICTION"` (9 characters), within Stripe's 2–10-character rule. The prior audit reopened the shortened-descriptor check merely from seeing the full field; that inference was invalid. Live-field verification remains owner-reported rather than API-measured because no live key is available. |
| Agent access to Stripe | **MEASURED:** the audit did not access or modify *live* Stripe. It did access **test mode** on 2026-08-05 and again on 2026-08-06: probes authenticated with the `sk_test_` key from `.env.local`, retrieved the test-mode Account object, and **created test-mode Checkout Sessions** (`cs_test_…`) to measure the `consent_collection` behavior — see Implementation specification § 5. That is authenticated access plus object creation in test mode, not read-only inspection. No live key is available in this audit environment; prior session records report that no agent used one. No live Stripe state was read or written in this audit. *(Corrected 2026-08-06: this row previously said flatly "This audit did not access or modify Stripe," which the probes made false.)* |

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
| **ROSCA, 15 U.S.C. §§ 8401–8405** | **APPLIES** to this online negative-option offer. | 15 U.S.C. § 8403 requires clear and conspicuous material terms before billing information, express informed consent before charging, and a simple cancellation mechanism. **IMPLEMENTED IN STAGE 2:** visual-proximity disclosures, Stripe Terms consent, verified trial add-card consent, legal-duration evidence, durable acknowledgment, and the existing Billing-page cancellation path. |
| **California ARL, Bus. & Prof. Code § 17602** | **APPLIES ON NAMED TRIGGER:** an offer to a California consumer. The national site permits that trigger. | The statute requires terms “before the subscription or purchasing agreement is fulfilled” and in visual proximity to consent; affirmative and express affirmative consent; a retainable acknowledgment; verification for at least three years or one year after termination, whichever is longer; pre-confirmation billing notice; simple online cancellation; a separate annual reminder; annual-term renewal notice 15–45 days before renewal; retainable notice of a material change before implementation; and, specifically for a fee change, notice no less than 7 days and no more than 30 days before it takes effect. **PARTIAL:** initial-offer disclosure/consent/evidence/acknowledgment, annual reminder and 15–45-day annual notice code, and Billing cancellation are implemented. Material/fee changes remain operationally prohibited because their offer/consent/apply source was owner-deferred on 2026-08-06. The seven-day trial is not subject to the statute's separate 3–21-day reminder for trials longer than 31 days. |
| **New York GBL § 527-a** | **APPLIES ON NAMED TRIGGER:** an offer to a New York consumer. Operator location/governing law does not replace the consumer-location trigger, but a nationwide offer reaches it. | Current § 527-a requires material terms “before consent to the offer or billing information has been requested” and in visual proximity; affirmative consent; a prompt retainable notice; cancellation as easy and in the same medium; a renewal notice 15–45 days before the cancellation deadline **for offers with an initial paid term of one year or longer that renew for a paid term of six months or longer** (the $199 annual plan qualifies: one-year initial term, one-year renewals; the monthly plan does not); and material-change notice at least 5 business days, but no more than 30 days, before the change — the statute applies that window to **any** material change, “including any price increases.” Subdivision 1(b-1) separately prohibits charging an increased price unless the business either first obtains affirmative consent or allows cancellation for at least 14 days after the charge with a pro-rata refund of the remaining term; this package chooses affirmative consent before any increased charge. **PARTIAL:** initial-offer disclosure/consent/evidence/acknowledgment, 15–45-day annual notice code, and Billing cancellation are implemented. Material changes remain operationally prohibited until the deferred source/consent/apply flow ships. Its trial reminder (subdivision 1(h)) does not apply to the seven-day trial. **Verified against the codified statute text on 2026-08-03, not a bill draft — see the review-thread rebuttal on PR #720.** |
| **New York SHIELD Act, GBL §§ 899-aa and 899-bb** | **APPLIES ON NAMED TRIGGER:** owning or licensing a New York resident's private information. Email/username plus an account password or security answer qualifies. If any NY account credential is already held through Clerk, it applies now; current resident/account state is not repository-verifiable. | § 899-bb requires reasonable administrative, technical, and physical safeguards; small-business proportionality is not an exemption. § 899-aa requires breach notice “in the most expedient time possible and without unreasonable delay” and within 30 days, plus regulator notices and prescribed content. **PARTIAL:** draft safeguards and incident procedures now exist under `docs/security/`, but live provider/device evidence, a tabletop, and owner adoption remain missing. The revised public breach sentence does not itself satisfy the program duty. |
| **CCPA/CPRA and 2026 CPPA regulations** | **DOES NOT CURRENTLY APPLY** on the recorded pre-revenue, no-active-user, no-sale/share facts. Reassess at $26,625,000 adjusted annual revenue; 100,000 consumers/households whose PI is bought, sold, or shared; or at least 50% of annual revenue from sale/sharing. | The prior checklist misstated the 100,000 threshold as general processing. If triggered, the regulations require a complete privacy policy and a separate Notice at Collection at or before collection, in close proximity to a webform or collection surface. The exclusively-online/direct-relationship rule permits email as the sole designated request method. Acknowledgment is generally due in 10 business days and response in 45 calendar days. **MISSING ON TRIGGER:** Notice at Collection on signup, feedback, and billing surfaces; state-specific appeal/agent/opt-out handling; and an evidence-based look-back response. Do not promise records “since January 1, 2022” when they may not exist. |
| **CPPA ADMT regulations** | **DOES NOT CURRENTLY APPLY** to practice scoring. | The audited scoring does not make a significant decision about employment, education admission, credit, housing, insurance, or healthcare access. The 2026 rules' ADMT compliance date is January 1, 2027. Reassess before any significant-decision use. |
| **CAN-SPAM, 15 U.S.C. § 7704; 16 C.F.R. Part 316** | **APPLIES ON NAMED TRIGGER:** each commercial email; mixed messages are classified per message by primary purpose. | The debt's **CONDITIONAL AND OPEN** framing is correct. The provider-owned Clerk and Stripe templates are not in the repository; the new Resend templates are committed but still require a recorded per-message primary-purpose classification before the owner activates sending. Do not claim a blanket transactional exemption. Inventory every live template and apply 16 C.F.R. § 316.3's subject-line and message-body primary-purpose test. Any commercial message needs the statutory disclosures, opt-out, and valid physical postal address. |
| **Virginia, Colorado, Connecticut, Utah, and other comprehensive state privacy statutes** | **DO NOT CURRENTLY APPLY** on the recorded facts; **APPLY ON STATE-SPECIFIC TRIGGERS.** | Virginia and Colorado generally use 100,000-consumer or 25,000-plus-sale thresholds; Utah adds revenue criteria; Connecticut drops to a 35,000-consumer threshold on July 1, 2026 and has separate sensitive/consumer-health triggers. Iowa, Texas, Oregon, Montana, Delaware, New Jersey, Nebraska, New Hampshire, Tennessee, Minnesota, Maryland, Indiana, Kentucky, Rhode Island, and Florida also require state-specific review before their threshold or sensitive-data trigger. **MISSING ON TRIGGER:** notices, appeals, authorized-agent handling, opt-outs/GPC where applicable, assessments, and consent for sensitive or consumer-health data. Do not claim the voluntary universal request process is complete compliance with every state. |
| **Consumer-health privacy laws** | **DO NOT CURRENTLY APPLY** to question-bank performance on the audited facts. | The stored activity concerns hypothetical educational questions, not the user's health. **TRIGGER:** collecting or inferring a user's own diagnosis, condition, treatment, medication, or other consumer-health data. |
| **COPPA, 15 U.S.C. § 6502** | **DOES NOT CURRENTLY APPLY** absent a child-directed service or actual knowledge of an under-13 user. | The product is general-audience professional exam preparation. The Privacy Policy now states the actual trigger and response rather than making an unsupported under-18 collection promise. |

## Owner gates

- [x] Decide legal identity and governing-law preference.
- [x] Create privacy/legal email DNS records.
- [x] **Verify end-to-end delivery to `support@addictionboards.com`. VERIFIED 2026-08-05, 2:32 PM ET and independently corroborated 2026-08-06** from the connected Google Workspace destination mailbox. The retained message is from the reported personal `@gmail.com` sender and addressed to `support@addictionboards.com`; raw headers confirm final delivery, TLS, an ImprovMX-rewritten return path at `addictionboards.com`, Gmail DKIM pass, and DMARC pass under `p=none`. **OWNER-REPORTED:** delivery was in Inbox, not spam, within about one minute. The message no longer carries either label, so original placement cannot be reconstructed from current mailbox state. One delivered message is not proof of a general deliverability property; it is evidence that the published channel worked for that ordinary external message. **Still unverified:** the claimed catch-all (only the published `support@` alias was exercised; no copy represents a catch-all, so nothing depends on it) and outbound sending *as* `support@addictionboards.com` (ImprovMX free tier forwards inbound only, so owner replies currently originate from the Google Workspace address — see the cancellation-procedure gate below). **INFERRED RISK, not tested — forwarding of strict-DMARC senders.** DNS measurement confirms that the successful sender, `gmail.com`, publishes `p=none`; the measured rewritten return path means the original sender's SPF identity is not preserved. The test therefore says nothing about `p=quarantine`/`p=reject` sender domains, a plausible class for the product's intended hospital, university, and health-system users. If such mail is quarantined after forwarding, cancellation and privacy requests could be missed. **Test this class before relying on the email channel:** send from a `p=reject` domain and confirm Inbox delivery. *(A first attempt sent from the destination mailbox itself never arrived. ImprovMX's own notice attributes this to Google dropping self-addressed mail that reuses a just-emitted Message-ID, plus their rewrite/re-sign workaround tripping spoofing heuristics — **that mechanism is the provider's explanation, not something observed here**, since the message never arrived and no headers or logs existed to inspect. Neither `addictionboards.com` nor `novamindnyc.com` publishes a DMARC record (reverified by `dig` on 2026-08-06), so no DMARC policy of ours was involved either way.)*
- [x] Identify the destination mailbox provider and transactional sender: Google Workspace (Google LLC) receives forwarded support mail; Resend sends transactional notices. Both are recorded in the Privacy and security inventories.
- [ ] Inventory the exact live Clerk and Stripe email templates and classify the committed Resend acknowledgment/reminder/notice templates; record each per-message primary-purpose classification before activating `RESEND_API_KEY`. Add a valid postal address and opt-out to every commercial template.
- [ ] Read through and approve the existing Terms of Service as the owner-supplied copy before paid acquisition.
- [ ] Confirm the intended content-source representation against a recorded question/source-rights review before restoring any claim that every item is original/licensed or that no actual examination question is present.
- [ ] Obtain focused review of these specific Terms questions before paid acquisition:
  - Is the educational/not-medical-advice disclaimer adequate for a professional board-prep product that presents clinical scenarios?
  - Are the limitation-of-liability, warranty disclaimer, New York choice-of-law, arbitration/class-waiver, cancellation/refund, and unilateral-change clauses enforceable for the intended nationwide consumer sale?
  - Is the proposed local consent ledger plus Stripe's Checkout consent field sufficient “verification” under California § 17602(a)(6), including after account deletion?
- [x] Select Resend as the transactional-email delivery mechanism for retainable acknowledgments, annual reminders, annual renewal notices, and material-change notices. ImprovMX remains inbound forwarding, not a sender.
- [x] Create draft SHIELD Act security and incident procedures.
- [ ] Verify every live-account `OPEN` item, run the tabletop, and adopt the SHIELD program.
- [x] **After deploying both public pages, set Stripe's Privacy Policy and Terms links. OWNER-REPORTED DONE 2026-08-05** in the live Stripe Dashboard (Settings → Business → Business details → Public details → Edit), after both routes were production-verified: Privacy policy URL `https://addictionboards.com/privacy`, Terms of service URL `https://addictionboards.com/terms`. The owner reported that the summary card lists both under "Also provided", which satisfies the documented Checkout precondition that "there must be a valid terms of service URL set in your Dashboard settings" before `consent_collection[terms_of_service]=required` can be used. The owner also reported setting **Customer support email `support@addictionboards.com`** in the same panel, leaving Customer support URL blank and the phone off receipts. The observed `ADDICTIONBOARDS.COM` value is the full descriptor; it neither verifies nor refutes the separate shortened field. The test-mode API reports the separate prefix as `ADDICTION` (9 characters), corroborating the earlier owner record that the shortened descriptor exists and is compliant. Test-mode Session creation succeeded without any separately observed test-mode Public-details setup, but the probe cannot distinguish shared settings from skipped enforcement — see Implementation specification § 5. No live key is available in this audit environment; prior session records report no agent live-key use.

## Implementation specification

This is the code-discovery-complete implementation map. It still has explicit **OWNER-GATED** inputs above; those are authority/content decisions, not hidden engineering discovery. TDD is mandatory.

### 0. Publication transaction

Do not publish only one legal page or a dead legal link. Delivery is intentionally split to avoid enabling Stripe's required Terms consent before Stripe has a live Terms URL:

1. **Stage 1:** publish the corrected current-practice Privacy Policy and Terms together at signed-out routes, add the footer and pricing-disclosure links, and verify both production routes return 200 with mandatory copy present;
2. **Between stages (the only Stage 2 gate):** the owner sets the Stripe Business Settings **Terms of Service URL**. That single setting is what Stripe validates at Checkout Session creation. Setting the Privacy Policy URL is documented as optional and was done anyway; verifying external support-mail delivery is a separate operational gate that **does not** block Stage 2, because support-mail state cannot cause Session creation to fail. *(Corrected 2026-08-06 — this step previously required both URLs plus mail verification as joint confirmations, the same conflation CodeRabbit raised as Major against the Status line.)* Both were in fact completed 2026-08-05; and
3. **Stage 2:** only after that confirmation, promote required Stripe Terms consent, durable consent evidence, retainable acknowledgment, and the specified cancellation/reminder delivery code.

Resend activation, SHIELD adoption, provider-template classification, owner read-through, and focused legal review remain explicit owner-tail items before paid acquisition. The Stage 1 public copy must not claim those controls are already active.

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

**Stage-1 page work:** the Terms/Privacy links are implemented in the marketing footer and both pricing disclosure blocks, and the routes pass the committed signed-out E2E guard. Production verification completed at 2026-08-05T05:54Z after main merge `9ba33bad9bd35dd1675125d309c597c3716c8531`: redirects were disabled, `/privacy` and `/terms` each returned direct 200 responses with their mandatory clause present, `/pricing` returned 200 with both legal links, and the deployed `dev`/`main` trees matched at `db057573adb5ff79d9c6cd16cdecd1f18b4abcbd`. **Still required before billing-consent closure:** replace the trial banner's generic portal action with the dedicated consent-bearing setup flow below and persist the consent/acknowledgment. The new visible copy narrows the current risk but is not represented as complete ARL/ROSCA compliance.

### 5. Stripe consent

This work requires a two-stage production promotion: publish and verify both legal routes first, set the Stripe Business Settings Terms URL between stages, and only then promote `consent_collection`, because live Stripe Checkout Session creation fails when required Terms consent is enabled without a configured Terms URL. (The Privacy Policy URL is optional for this API precondition; it was set anyway and Checkout links it when present.)

**Test-mode precondition — what was MEASURED on 2026-08-05, and the sharp limits of it.**

*Measured, by probes on 2026-08-05 and independently reverified 2026-08-06:* against **test mode of the live account** (`acct_1SvkizKItmaHAwgU`, resolved from the `sk_test_` key in `.env.local` — the same key the E2E suite uses), a **`mode: 'setup'` Session carrying `consent_collection[terms_of_service]=required` was created successfully**, returning `consent.terms_of_service = 'required'`; a subscription-mode session with the same field also succeeded; and that account's test-mode `business_profile` came back with null `url` and `support_email`. The 2026-08-06 Account response separately returned full descriptor `ADDICTIONBOARDS.COM` and shortened prefix `ADDICTION`.

*NOT measured, and stated as report or inference only:* the live account's Public details contents (no live key is available in this audit environment; the live side rests on the owner's Dashboard report of 2026-08-05). The **ToS URL itself is not exposed on the Stripe Account object**; null `business_profile.url` and `support_email` do not establish that the separate Public-details ToS field is empty.

*Which construct was tested:* **the account's test-mode sandbox, NOT an additional Stripe sandbox account.** Stripe documents that the test-mode sandbox shares settings with live mode, while additional sandboxes isolate settings and copy them from live at creation ([Stripe, Testing use cases](https://docs.stripe.com/test-mode#compare-sandboxes)). The probe did not exercise an additional sandbox and cannot support a claim about its Public-details state.

*Unresolved mechanism:* the successful test-mode Sessions plus adjacent null Account fields do **not** distinguish between (a) a live Public-details ToS URL shared into test mode but absent from the Account API response and (b) the ToS check not being enforced in test mode. The earlier audit asserted (b) as the root cause; the evidence does not decide between them.

Consequences for the build:

1. **The current test-mode key can create the required Sessions without any separately observed test-mode Public-details setup.** That is the measured operational result, not proof that no configuration is required. An additional sandbox is out of scope and must be checked on its own before Stage 2 is pointed at one.
2. **`consent_collection` is confirmed compatible with `mode: 'setup'`.** Every Stripe doc example uses `payment` or `subscription` mode, and the setup-mode flow specified below depends on the combination; it is now verified against the real API rather than assumed. This is the durable win from the probe.
3. **⚠️ Green runs prove setup/subscription mode compatibility, not the missing-live-URL failure case.** The current harness neither observes nor removes the live ToS URL, so it cannot tell whether a later missing or cleared live setting would be detected in test mode. Because the ToS field is absent from the Account API response used here, the available evidence for its live value is the owner's Dashboard report — **re-confirm it in the Dashboard immediately before promoting Stage 2, and treat any later Public-details edit as a release-blocking change.**

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

The signed setup state uses a dedicated `CONSENT_STATE_SECRET` of at least 32 characters, never `STRIPE_WEBHOOK_SECRET`; the same dedicated secret signs Session metadata and verifies completed/expired setup events. There is deliberately no legacy-key window because the owner's recorded state was zero in-flight setup Sessions when the key boundary changed. If the secret is absent, setup Session creation and setup-event verification fail closed while ordinary subscription webhooks continue. Generate it with `openssl rand -hex 32` and configure it before activating the trial add-card flow. A changed setup request that collides with Stripe's retained primary idempotency key recovers under a deterministic request-fingerprint key; an inactive replayed Session similarly recovers under a Session-ID-plus-fingerprint key.

The pending operation's signed identity and accepted snapshot remain exact. At completion, re-read current local billing state: user/customer/subscription/plan must still match, but trial status and billing-period timestamps may legitimately have advanced. Persist the live period as the cancellation deadline and retain a trial end only if the live subscription is still in trial. A billing-ownership mismatch is a terminal non-retry outcome: atomically claim the operation, idempotently detach the Session PaymentMethod if attached, persist the terminal reason, and acknowledge the event. A failed worker remains recoverable through the existing five-minute claim lease, preserving already-completed provider writes. A signed `checkout.session.expired` marks only a matching pending operation expired; the daily renewal-notice job prunes expired setup operations after 30 days. Completed setup-operation rows are excluded from that abandoned-row prune; the separately persisted accepted-consent record remains governed by § 6's legal-retention rule. The published Privacy Policy already covers the stored Setup Session/payment identifiers and user-linked application-record retention; this lifecycle does not add a new public data category.

Operator-created or other out-of-band subscription Checkout Sessions must not be used. Subscription activation is intentionally decoupled from consent-evidence extraction so malformed or missing consent metadata cannot suppress a valid Stripe subscription update; either condition emits a structured warning naming the event/Session and reason, and therefore requires operator investigation rather than creating a consent record.

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

Both Stripe-webhook persistence and the Stripe-subscription reconciliation backstop must start the one-year post-termination retention clock when they persist a canceled subscription. Reconciliation performs `markSubscriptionTerminated` in the same transaction as its canceled subscription/customer observation so a missed cancellation webhook cannot leave consent evidence in the active-contract retention state indefinitely.

### 7. Retainable acknowledgment and notices

**OWNER-SELECTED PROVIDER: Resend.** The provider-independent names are fixed: add `src/application/ports/transactional-email-gateway.ts`, export it from `src/application/ports/index.ts`, and add `src/application/test-helpers/fakes/fake-transactional-email-gateway.ts` plus `.test.ts` and its barrel export. Put the SDK adapter at `src/adapters/gateways/resend-transactional-email-gateway.ts` with a colocated test. Wire it through `lib/container/gateways.ts`, `lib/container/types.ts`, and `lib/container.test.ts` rather than calling an SDK from a use case. Delivery failure must not roll back Checkout, webhook validation, consent persistence, or the durable acknowledgment row. Use this one canonical persisted state machine: missing `RESEND_API_KEY` makes no provider call and leaves the row `queued`; an atomic claim moves an eligible row to `processing` before the provider call; provider acceptance moves it to `delivered`; only a provider response that proves non-acceptance and is retryable (currently Resend quota/rate-limit errors) moves it to `transient_failure` with capped exponential backoff in `nextAttemptAt`; a terminal request/configuration error moves it to `terminal_failure`; and a provider 5xx, unrecognized future provider error, thrown/timeout result, invalid success response, concurrent-idempotency result, or stale processing claim moves it to `outcome_unknown`. Automatic notice-job selection includes only `queued` rows and `transient_failure` rows whose `nextAttemptAt` is due. `terminal_failure` and `outcome_unknown` are excluded until an operator requeues them; an unknown outcome additionally requires confirmation in Resend that no send occurred. Return successfully from the consent path for every non-delivered outcome so the durable row remains available for the permitted retry or requeue path. Every gateway send must receive a stable provider idempotency key derived from the delivery-row UUID (for example, `renewal-notice/<delivery-id>`), pass it through the Resend SDK's `idempotencyKey` option, and keep the payload immutable across retries. Before calling Resend, persist the processing claim's attempt ID and start time; a worker who disappears after the provider call therefore leaves an auditable in-flight attempt. [Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys), so an ambiguous timeout or process-loss outcome must never be blindly resubmitted by the daily job after that window. Model gateway results as `delivered`, `transient_failure`, `terminal_failure`, or `outcome_unknown`, matching the persisted outcome names exactly. Cover missing-key, atomic-claim concurrency, crash-after-claim, stable-key replay, payload mismatch, known-transient, terminal, ambiguous-outcome, backoff-selection, and requeue behavior through the gateway, fake, adapter, container, acknowledgment-use-case, and route/job tests in PR-C.

Queue creation is isolated per scheduled notice: validation rejections and persistence conflicts are counted separately, structured without recipient-address logging, and cannot prevent later notices from queueing or the due-delivery phase from running. Unknown provider outcomes emit a structured operator signal keyed by failure code, without recipient data, after the durable quarantine is persisted. The cron function has a 300-second ceiling; its subscription scan is capped at 40 (at most 80 scheduled notices), and its dispatch batch is capped at 80 with four workers and a 10-second provider timeout, bounding provider wait to 200 seconds (below the 210-second, 70% runtime budget) before database and route overhead.

Immediately after verified consent, send a retainable acknowledgment containing the accepted renewal terms, amount/frequency, trial end, cancellation deadline/method, business contact, Terms, and Privacy links. **Durability requirement (added 2026-08-03 per promo #724 review):** create the acknowledgment dispatch record in `renewal_notice_deliveries` **in the same transaction that persists the verified consent record** — so a process failure after consent persistence cannot leave valid consent without a queued acknowledgment, and a retry cannot send duplicates. The sender reuses that record for retries, persisting delivery status and provider event ID on it. Delivery is never treated as consent itself. **Key shape:** acknowledgment rows key on (`notice_kind = 'acknowledgment'`, consent-record ID, destination) — an acknowledgment's identity is its consent record, so a later consent by the same subscriber always gets its own acknowledgment and duplicates of the same one are impossible.

Implement a daily idempotent notice job with:

- California annual reminder content for annual subscriptions;
- California and New York annual-term notice 15–45 days before renewal/cancellation deadline;
- New York material-change notice at least 5 business days, but no more than 30 days, before change;
- California fee-change notice 7–30 days before change;
- retainable material-change notice and cancellation link;
- no seven-day-trial reminder claim under the >31-day statutory provisions, while preserving any provider courtesy reminder.

Add a `renewal_notice_deliveries` table in `db/schema.ts` in the same generated migration as the consent table. Store the provider idempotency key, immutable payload snapshot/hash, status, provider event ID, attempt count, attempt/claim ID and start time, last-attempt timestamp, nullable `nextAttemptAt`, failure class/code, requeue reason/audit fields, and timestamps; the allowed statuses are exactly `queued`, `processing`, `delivered`, `transient_failure`, `terminal_failure`, and `outcome_unknown`, with selection and transition rules defined in the canonical state machine above. **Uniqueness is per-notice-kind, not one generic key (corrected 2026-08-03, promo #724 final round — a single generic key shape either suppressed a later consent's acknowledgment or allowed duplicate acknowledgments):** *scheduled notices* (annual reminder, renewal notice, material-change/fee-change notice) key on notice kind + subscription + applicable renewal/change + disclosure version + destination, so cron retries cannot duplicate a notice; *acknowledgment rows* key on notice kind + consent-record ID + destination, deriving any renewal/change identity from their consent record and leaving it unbound when none applies. The generated migration and the repository's integration tests must enforce both key shapes explicitly (partial unique indexes per kind, not one nullable composite), and the test suite must cover repeated consent by the same subscriber plus cron replay. Implement `src/application/use-cases/send-renewal-acknowledgment.ts` plus `.test.ts`, `src/application/use-cases/send-due-renewal-notices.ts` plus `.test.ts`, `src/application/use-cases/requeue-renewal-notice-delivery.ts` plus `.test.ts`, and `src/adapters/jobs/send-due-renewal-notices.ts` plus `.test.ts`. The requeue use case must preserve the row and its audit history, reject delivered rows, and require an operator-confirmation reason for an unknown outcome. Expose the job at new `app/api/cron/send-renewal-notices/route.ts` plus `route.test.ts`, copying the existing constant-time `CRON_SECRET`, fail-closed limiter, and structured-error pattern from `app/api/cron/reconcile-stripe-subscriptions/route.ts`. Add the daily route to `vercel.json`. Cover database idempotency, retry selection, terminal/unknown exclusion, stale-processing recovery to unknown, concurrent claims, and auditable requeue in new `tests/integration/renewal-notice-deliveries.integration.test.ts`.

Apply the stricter selected price-increase consent rule nationwide so the implementation does not depend on an unimplemented consumer-state classifier: before changing a Stripe subscription to an increased recurring price, require an explicit affirmative action tied to the proposed amount and effective renewal, persist a `price_increase` consent record, and verify it before the higher charge can occur. If consent is absent, do not renew at the increased price; schedule cancellation at the existing period end instead. Add unit/integration coverage for consent, refusal/absence, replay, and subscriber/price/version mismatch.

Model a pending increase in `subscription_price_change_offers` in `db/schema.ts` and the generated migration. Implement `src/application/use-cases/record-price-increase-consent.ts` plus `.test.ts` and `src/application/use-cases/apply-due-price-changes.ts` plus `.test.ts`; add the repository methods to the renewal-consent repository port/fake/Drizzle adapter above. Present the offer at `app/(app)/app/billing/price-change/[offerId]/page.tsx` plus `page.test.tsx`, and accept/refuse it through `app/(app)/app/billing/price-change/price-change-actions.ts` plus `.test.ts`. Extend `PaymentGateway`, the Stripe adapter/types, and `FakePaymentGateway` with narrowly named subscription-price-update and cancel-at-period-end operations. Invoke `ApplyDuePriceChangesUseCase` from the daily notice route after notice processing. Its transaction must verify subscriber, offer, old price, proposed price, effective renewal, disclosure/Terms versions, and unconsumed consent before the Stripe update; absence/refusal schedules period-end cancellation. **Replay safety (added 2026-08-03 per promo #724 review; hardened same day per #725 round 2):** each price-change application carries a durable operation key with persisted outcome state on the offer row (mirroring the notice-delivery uniqueness pattern). The use case first takes an **atomic pending→processing claim** on the offer row (conditional update recording claim owner and claim timestamp) so concurrent workers serialize — outcome state alone does not — then reconciles local state against the live Stripe subscription (price/period) so a failure between the Stripe update and the local commit is detected as already-applied rather than re-issued, and only then finalizes. **Stale-claim recovery (added same day, #724 final round):** a claim is a lease, not a tombstone — the daily run must return `processing` rows whose lease has expired to `pending` *after* reconciling against Stripe (already-applied → finalize; not applied → safe to re-claim), so a worker that dies after claiming but before the Stripe call cannot strand a consented price change in limbo where it neither applies nor triggers the required period-end cancellation. The Stripe price update is issued with the **operation key as its Stripe idempotency key** and explicit `proration_behavior: 'none'` — the change takes effect at the consented renewal, never as a mid-period prorated charge. Add `tests/integration/subscription-price-change-consent.integration.test.ts`, including a crash-between-Stripe-and-commit replay case, a concurrent-worker double-claim case, and a crash-after-claim-before-Stripe-call case proving stale-lease recovery. Until this flow is shipped and tested, changing an existing subscriber's recurring price remains operationally prohibited.

**OWNER DEFERRAL — 2026-08-06:** the owner removed the price-change offer/consent/apply machinery above from this Stage 2 execution wave. The design remains the pinned contract for any future implementation, but this wave must not scaffold `subscription_price_change_offers`, its use cases, UI, Stripe mutation, or cron application path. Until that future flow ships with its consent, claim, reconciliation, and notice tests, every existing subscriber's recurring price must remain unchanged. The scheduled job implemented in this wave therefore sources annual reminders and annual renewal notices only; material-change and fee-change payload support is inert unless a future validated source supplies a due change.

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

- [ ] Owner has read through the existing Terms and resolved every named clause question required before paid acquisition.
- [x] Privacy draft's factual claims match the audited codebase.
- [x] Destination mailbox and transactional-email providers are identified and the final provider inventory is exact across Privacy and security documents.
- [x] CCPA applicability and future-trigger statements use correct thresholds.
- [x] CAN-SPAM remains conditional/open; no blanket exemption survives.
- [x] Renewal disclosures render in visual proximity before every billing-information request.
- [x] Initial-offer express consent and legal-duration evidence are persisted.
- [x] Retainable acknowledgment plus annual-reminder and annual-renewal notice code exists; missing `RESEND_API_KEY` leaves rows queued without a provider call.
- [ ] Material-change and fee-change production sourcing remains deferred under the **OWNER DEFERRAL — 2026-08-06** in § 7; no such change may be implemented before the required windowed notice path exists.
- [ ] An increased recurring price cannot be charged without a matching affirmative price-increase consent record. **OWNER-DEFERRED 2026-08-06; see § 7's named deferral. Until it ships, every existing subscriber's recurring price must remain unchanged.**
- [ ] Cancellation is online, simple, and accurately described.
- [x] `/privacy` and `/terms` are derived public patterns and pass signed-out 200 E2E checks.
- [x] Footer and pre-billing links exist in committed code.
- [x] Production signed-out requests return 200 for both legal routes with mandatory copy present, and production pricing renders both legal links.
- [ ] SHIELD security and incident programs are adopted and evidence-backed.
- [x] Stripe legal links are set only after deployment. **Owner-reported done 2026-08-05** — both URLs set in live Public details after production signed-out 200s; support email set to the published `support@addictionboards.com`. Current test-mode Session creation succeeds without any separately observed test-mode setup; the shared-settings-versus-skipped-enforcement mechanism is unresolved (see § 5).
- [x] **Shortened statement descriptor is 2–10 characters and suffix-compatible.** The settled owner record is corroborated, not replaced, by the 2026-08-06 test-mode Account API: full descriptor `ADDICTIONBOARDS.COM`; separate shortened prefix `ADDICTION` (9 characters). The prior reopening confused the full and shortened fields.
- [x] Full quality gate passes before push (2026-08-07 third corrective promo-review head: typecheck; lint with the accepted 24-warning baseline; 3,816 unit; 398 browser; 241 integration passed plus 2 skipped; 23-page build; 38 E2E).
- [x] Stage 2's exact promoted head received CodeRabbit approval review `4882980598` before promo #747 merged as `19f8a31efb466aebe86ff40257824f5fd2854304` on 2026-08-07. Each later hardening head remains subject to the same exact-head rule.

## Stage 1 adversarial review record (2026-08-05)

After Stage 1 was production-verified, a five-angle adversarial review (line-by-line diff, security/route exposure, draft-vs-shipped conformance, design-system conventions, test quality) ran against the full shipped diff. Chain, content, and gate claims in the Stage 1 report all verified at source. Confirmed findings and their resolutions, all fixed in the same follow-up change unless marked accepted:

1. **Renderer emitted invalid HTML** — react-markdown's `node` prop was spread onto external/mailto anchors, serializing `node="[object Object]"` into production markup (10 anchors across both pages). Fixed by destructuring `node` out of `LegalLink`.
2. **Autolinked support emails opened blank tabs** — remark-gfm autolinks every bare `support@addictionboards.com`, and the link renderer's binary internal/external branch forced `target="_blank"` onto `mailto:` — including § 4's email-cancellation contact. Fixed with a dedicated same-tab mailto branch, pinned by test.
3. **Table row separators broke on the last column** — `last:border-b-0` on `td` targets each row's last cell, not the last row. Fixed with a last-row-scoped variant.
4. **Scrollable disclosure tables were keyboard-unreachable** — the `overflow-x-auto` wrapper had no `tabIndex`, failing WCAG 2.1.1/axe `scrollable-region-focusable` on the provider/retention tables. Fixed: focusable wrapper carrying the canonical focus ring, covered by the theme-token regression guard. *(Amended 2026-08-06: the first fix used a labelled `<section>`, which gave each of a page's several tables an identically-named `region` landmark and failed axe `landmark-unique` instead — one violation traded for another. The shipped wrapper is a **role-less, unlabelled focusable `div`**, which is all `scrollable-region-focusable` requires; rationale recorded in Pattern Registry § 12.5.)*
5. **Published Resend row read as an operating sender** — see the Verdict annotation above. Fixed in the published row, the draft (mirror-enforced), and the security-program inventory.
6. **Under-specified guards** — the route default-export tests only asserted "resolves defined," which caught rejection/undefined but did not prove delegation (now element-tree equality against the renderer); the unsafe-link-protocol test could pass with no anchor (now asserts the anchor exists); one E2E assertion was logically redundant (removed); the pricing legal-consent links lacked theme-token regression coverage (added).
7. **ACCEPTED, recorded, no code change:** `PUBLIC_ROUTE_PATTERNS` uses the file's pre-existing `(.*)` prefix convention, so `/privacy*`/`/terms*` namespace routes added in the future would silently be public. No colliding route exists; any future route in either namespace must revisit this (tighten to exact patterns or add a boundary test).
8. **ACCEPTED, documented:** the legal-document type scale and its `###`→`h2`/`####`→`h3` heading mapping shipped undocumented; now recorded in the Pattern Registry. Test fixture dates were also aligned to August 5.

## Stage 2 adversarial review record (2026-08-07)

Each candidate was first tested against the shipped implementation rather than accepted from the review report. The verdicts and minimal fix-forward decisions are:

| ID | Verdict | Evidence and disposition |
|---|---|---|
| H1 | **REAL** | One scheduled-notice `saveQueued` conflict could abort later queue rows and dispatch. Per-row isolation, `queueFailures`, recipient-free structured errors, and a conflict-then-success regression test shipped in the first hardening PR. |
| H2 | **OVERSTATED, with real defects** | Exact millisecond/status matching rejected legitimate temporal drift, and ownership mismatch had no terminal cleanup outcome. The claim was wrong that every failure was permanently stranded: the existing five-minute lease already reclaims `processing` operations and preserves per-write progress. The fix keeps that lease and exact signed identity, re-derives live period state, and adds idempotent detach plus a terminal outcome for ownership mismatch. |
| H3 | **REAL** | Consent state was signed with the routine Stripe webhook secret, coupling rotation and broadening forge authority. Signing and verification now use dedicated `CONSENT_STATE_SECRET`; absence is an explicit fail-closed activation gate with no dual-key window. |
| H4 | **REAL** | Only webhook cancellation started consent termination retention. Reconciliation now calls `markSubscriptionTerminated` in the same canceled-subscription observation transaction, without advancing an already-recorded termination date. |
| H5 | **REAL** | Ambiguous Resend 5xx/unknown outcomes were retryable despite the provider's 24-hour idempotency window. Only proven non-acceptance (rate limit/quota) remains transient; 5xx, timeout, thrown, unknown, invalid-success, and concurrent-idempotency outcomes are quarantined as `outcome_unknown`. |
| H6 | **REAL** | The route's prior 60-second ceiling was below its possible provider wait. The route is pinned to 300 seconds; subscription scan 40, dispatch 80, four workers, and 10-second timeout bound provider wait at 200 seconds, within the 210-second budget. |
| H7 | **REAL** | Consent-extraction failure could discard a valid subscription activation, while missing evidence produced no signal. Subscription persistence is now independent; missing, malformed, or identity-mismatched evidence produces a structured warning and no consent record. Out-of-band subscription Sessions are prohibited. |
| H8 | **REAL** | Expired setup Sessions were ignored and abandoned operations had no terminal retention path. Signed expirations now mark matching pending rows expired, and the daily notice job prunes expired rows after 30 days. Completed operations remain under consent-record retention. No public-copy edit was needed: the policy already covers Setup Session/payment identifiers and user-linked application records. |
| H9 | **OVERSTATED, with a latent boundary defect** | Function-valued dependency objects are not currently deserializable as attacker-controlled Server Action input, so the stated exploit was not present. The exported `'use server'` function nevertheless exposed a non-wire dependency parameter. The wire action now accepts only validated `FormData`; dependency injection moved to a non-exported-boundary helper used by tests. |
| H10 | **REAL** | Setup Session idempotency omitted request freshness, so changed signed terms could hit a Stripe parameter-mismatch dead end. The setup path now uses the same deterministic request-fingerprint and inactive-Session recovery pattern as subscription Checkout. |
| H11 | **NOT REAL** | No lock-order cycle was demonstrated: webhook consent pruning locks/deletes consent rows and does not subsequently request the subscription lock held by termination. The proposed removal would relocate working cleanup without deleting a proven cycle, so no code changed. |
| H12 | **REAL** | Test integrity gaps existed: the setup-operation concurrency integration test used one database handle, schema predicate guards were too shallow, acknowledgment replay identity needed real-DB proof, and a mocked consent row used a non-UUID ID. Two independent handles now exercise setup claims; the schema/integration guards and UUID fixture were hardened in the first hardening PR. |
| H13 | **REAL** | The debt/index status lagged the shipped Stage 2 promo and lacked this review record. Promo #747's approval/merge evidence and the activation gates are now recorded. |

**Activation gate:** do not configure `RESEND_API_KEY` until the deployed head contains the H1–H8 resolutions above; a local or PR-only green run is not activation evidence. Independently, do not activate the trial add-card flow until the deployed environment has `CONSENT_STATE_SECRET`. Neither secret is added by this repository change. `RESEND_API_KEY` activation also remains blocked on the owner-run Resend account/domain setup, per-message CAN-SPAM classification, and real-delivery check already listed in this debt.

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
