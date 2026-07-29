# DEBT-414: Public Legal Pages (Privacy Policy + Terms of Service) + Stripe Legal-Link Wiring and Descriptor Verification

**Priority:** P2 (a live paid, auto-renewing product with no published Privacy Policy or Terms of Service — a real privacy-law + auto-renewal-disclosure exposure; does **not** block the trial from functioning)
**Created:** 2026-06-10
**Status:** **Decided spec — no optionality.** Research-backed (Stripe DPA/SSA + Stripe docs + 2026 legal/regulatory sources). **Step 0 (business facts) CLOSED 2026-07-27** — entity decided, contact email live in DNS, mailing-address obligation researched and deferred with a named trigger. Remaining gate: generated + lawyer-reviewed copy, then the ~half-day engineering build now fully specced in **Implementation spec** below.
**Owner:** Founder / legal (engineering owns the on-site pages + Stripe wiring).
**Deferred:** 2026-06-10 — **tabled by owner as a known, accepted obligation, not a launch blocker.** The trial functions without it and current real-world exposure is low (pre-revenue, negligible live user base) — **but this must be completed before active user acquisition / marketing.** Originally gated on owner-supplied business facts; **that gate is now cleared (2026-07-27)** — the only remaining gate is generated + lawyer-reviewed copy. Everything needed to resume cold is in the **Owner copy-prep checklist** below.
**Related:** [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md) (the live free trial this serves), [Debt Index](./index.md). The Stripe Account-settings legal-link gap and descriptor-verification item surfaced during the DEBT-410 trial launch.
**Re-verified accurate against `ddad8eee` on 2026-07-18.**
**Updated 2026-07-27 against `b159e058`** — Step 0 closed with decided business facts, mailing-address requirement researched and deferred with a named trigger, template sources added, and a codebase-verified Implementation spec added (including the previously-missing public-route wiring, § 2).

---

## Context — why this is debt now

The free trial launched (DEBT-410): the app now takes real signups into a **paid, auto-renewing subscription** (7-day no-card trial → $29/mo or $199/yr). One unmet legal-link obligation and one descriptor guardrail surfaced during the Stripe launch:

1. **No published Privacy Policy or Terms of Service.** Stripe's hosted billing/portal pages have fields for "Privacy policy and Terms of service links" — but those are set in **Stripe Account settings** and require the merchant to provide its **own** documents. We have none.
2. **Statement descriptor already configured; keep it verified.** The live Stripe account already has a base statement descriptor and a shortened descriptor, and the shortened descriptor is short enough for Stripe's dynamic suffix path. This doc must not ask implementers to "set" a missing descriptor; the remaining work is to verify the existing shortened descriptor still remains 2-10 characters and still makes sense with Stripe's trial-ending descriptor suffix before closing the legal-page work.

## Research findings (primary + 2026 sources)

1. **Stripe does NOT provide your merchant legal pages or customer notices.** Stripe's Data Processing Agreement says the merchant must provide necessary notices, including a Privacy Policy, and is solely responsible for notice content; Stripe's Services Agreement and Privacy Policy govern Stripe-as-processor / Stripe's own relationship with users. Stripe's policies **cannot** be reused as ours; the Account-settings fields only *link* to our own.
2. **Auto-renewal / free-trial disclosure is legally required (even post-"Click-to-Cancel" vacatur).** The FTC's Click-to-Cancel / Negative Option Rule was vacated by the 8th Circuit on procedural grounds (2025), and the FTC issued a new Negative Option Rule ANPRM in March 2026 — but **ROSCA (Restore Online Shoppers' Confidence Act) remains in force** and requires, for online negative-option sellers: (a) clear & conspicuous disclosure of all material terms **before** collecting billing info, (b) express informed consent before charging, and (c) a simple cancellation mechanism. **State Automatic Renewal Laws (e.g. California ARL)** impose overlapping disclosure, consent, acknowledgment, and online-cancellation requirements. Material terms: price, billing frequency, when the trial ends, cancellation deadline + method. (DEBT-410 already uses Stripe self-serve cancellation and Stripe-native trial-ending email configuration; the ToS must also disclose these terms.)
3. **Medical-education disclaimer is standard for a board-prep question bank.** Reputable board-review banks publish a disclaimer that content is **educational / exam-prep only, not medical or healthcare advice, not for diagnosis or clinical decisions**; users rely on their own professional judgment, verify against current guidelines, and use at their own risk.
4. **Tooling.** A reputable US-focused generator covers the US state-privacy-law landscape (CCPA/CPRA, Virginia, Colorado, Connecticut, …) and bundles Privacy + ToS + cookie policy with ongoing auto-updates. **Termly** is the recommended US-focused pick for this implementation; **iubenda** is the EU-deep alternative; **TermsFeed** is comparable. Free generators exist but lack compliance monitoring. Generic open-source / CC-licensed policies (e.g. 37signals') need heavy customization and don't track US state-law changes.

## Decision (final)

**Roll our own legal pages from a reputable generator base, customized for our specifics, lawyer-reviewed, hosted on-site, and wired into Stripe legal links.** Concretely:

1. **Generate** baseline Privacy Policy + Terms of Service (+ cookie policy) with a US-focused generator (**Termly** recommended — US state-law coverage, bundles privacy + ToS + cookie, auto-updates).
2. **Customize** the baseline for:
   - **Subscription + free-trial disclosure (ROSCA/ARL):** the 7-day no-card trial → paid conversion, price ($29/mo, $199/yr), billing frequency, that no card is required to start, how/when it converts, the self-serve cancel path (Stripe portal, at period end), and the Stripe-native trial-ending reminder emails.
   - **Medical-education disclaimer:** content is for board-exam preparation / education only; **not medical advice**, not for diagnosis or clinical decisions; verify against current guidelines; use at own risk.
   - **Subprocessors / third parties actually used:** Clerk (auth), Stripe (payments), Vercel (hosting), Neon (database), Sentry (error monitoring) — disclose data sharing.
3. **Lawyer review** before publishing (a live paid product collecting payment, plus the medical-education + auto-renewal angles, is liability-sensitive). **This doc is a framework, not legal advice.**
4. **Host on-site** at stable routes: `/privacy` and `/terms` — simple marketing pages under `app/(marketing)/`, design-system compliant, with `ROUTES.PRIVACY` and `ROUTES.TERMS` added to `lib/routes.ts`, linked from the footer **and** the signup/checkout entry (so disclosure is "before billing info" per ROSCA).
5. **Wire into Stripe Account settings:** set the Privacy Policy + Terms of Service URLs so hosted billing/portal pages show them; verify the existing shortened statement descriptor remains 2-10 characters and still reads correctly with Stripe's trial-ending descriptor suffix. Do not treat the descriptor as missing.

## Constraints

- Trial/auto-renewal material terms must be disclosed **before** billing info is collected (ROSCA) — i.e. on the pricing/checkout entry, not buried only in the ToS.
- The medical-education disclaimer must be prominent given the clinical-adjacent content.
- On-site legal pages follow the design system; add and consume `ROUTES.PRIVACY` and `ROUTES.TERMS` from `lib/routes.ts`.
- **Not legal advice** — final copy is owner/lawyer responsibility; the engineering scope is the generator baseline + on-site pages + footer/checkout links + Stripe Account-settings legal-link wiring + descriptor verification.

## Rejected alternatives

- **Use Stripe's own Privacy Policy / Terms as ours.** Rejected: Stripe's policies govern Stripe-as-processor / Stripe's own user relationship; Stripe's DPA still makes the merchant responsible for necessary customer notices. Not permissible.
- **Ship with no legal pages.** Rejected: operating a live paid auto-renewing subscription with no privacy policy creates material privacy-law exposure, and no trial/auto-renewal disclosure creates ROSCA / state-ARL exposure.
- **Generic free template, unmodified.** Rejected: misses the medical-education disclaimer, the trial/auto-renewal specifics, and US state-law coverage; higher liability than a maintained generator + lawyer review.
- **Hand-write the full legal text from scratch with no generator/lawyer.** Rejected: high legal risk for a paid, medical-adjacent product; a maintained generator base + targeted lawyer review is the disciplined path.

## Acceptance criteria

**Step 0 — business facts (CLOSED 2026-07-27):**

- [x] Legal entity decided: **sole proprietorship, John H. Jung** — clinical PLLC explicitly excluded; LLC deferred to the revenue / pre-acquisition trigger.
- [x] Contact email for privacy/legal requests **live and DNS-verified**: `support@addictionboards.com`.
- [x] Privacy-request contact channel satisfied by email alone (CCPA online-only provision) — no mailing address needed for that purpose.
- [ ] **CAN-SPAM postal-address obligation: OPEN, not cleared.** Enumerate every live Clerk and Stripe email template, classify each by primary purpose, and add a valid physical postal address (plus an opt-out for anything commercial) if any template is commercial or mixed-purpose. Templates are provider-dashboard-owned and cannot be verified from this repository.
- [x] Governing law: New York. Public product name: Addiction Boards @ `addictionboards.com`.

**Remaining:**

- [ ] Privacy Policy + Terms of Service (+ cookie policy) drafted from a reputable generator or open-licensed base (see **Template sources**), customized for: subscription/free-trial disclosure, medical-education disclaimer, actual subprocessors.
- [ ] Lawyer-reviewed before publishing.
- [ ] Published on-site at stable routes, design-system compliant, linked from footer + the checkout/signup entry (disclosure before billing).
- [ ] **`/privacy` and `/terms` added to `PUBLIC_ROUTE_PATTERNS`, with a unit guard and an E2E check proving both return 200 while signed out** (see Implementation spec § 2 — without this the pages redirect to sign-in and silently defeat their own purpose).
- [ ] Mandatory-clause tests in place: medical-education disclaimer, auto-renewal terms, and subprocessor list cannot be dropped without failing CI.
- [ ] Stripe Account settings: Privacy Policy URL + Terms of Service URL set; existing shortened statement descriptor verified as 2-10 characters and compatible with Stripe's trial-ending descriptor suffix.
- [ ] Stripe-native trial-ending customer emails manually rechecked in the Dashboard (Dashboard-owned; not API-verifiable).
- [ ] Trial/auto-renewal material terms (price, frequency, trial end, cancel method) clearly disclosed before billing info is collected.
- [ ] Annual + event-driven policy review cadence recorded (Step 5), with `effectiveDate` bumped on each review.

## Dependencies

- The free trial is already live (DEBT-410); this closes its legal/compliance tail. Pairs with the DEBT-410 Stripe self-serve cancel path and Stripe-native trial-ending email configuration.

## Owner copy-prep checklist (the gating work — owner-driven)

*A framework to drive the copy. **Not legal advice**; the Step 3 lawyer review is the gate. This is the cold-start resume point — when you have clear time, work top to bottom.*

**Step 0 — Business facts — ✅ CLOSED 2026-07-27.** All values below are decided and ready to paste into the generator / lawyer brief.

| Fact | Value | Notes |
|---|---|---|
| **Legal entity** | **Sole proprietorship — John H. Jung** (displayed as "John H. Jung, MD, MS") | No filing, no fee. Credentials are display-only, not part of the legal identity. |
| **Clinical PLLC** | **NOT USED — explicitly excluded** | A professional entity is purpose-restricted to the licensed profession, and routing a consumer software product through the entity holding the clinical practice couples two liability surfaces that must stay separate. Off the table permanently for this product. |
| **LLC** | **Deferred** — trigger: first paying revenue *or* immediately before active user acquisition | NY costs ~$1,000–1,500 all-in (the $200 filing plus the NY newspaper publication requirement), which is why deferral is rational while pre-revenue. Same trigger as publishing these pages. |
| **Public product name** | Addiction Boards @ `addictionboards.com` | Matches the existing marketing header/footer brand string. |
| **Contact email** | **`support@addictionboards.com` — LIVE as of 2026-07-27** | ImprovMX free-tier forwarding → owner inbox. DNS written into Vercel DNS (nameservers `ns1/ns2.vercel-dns.com`): `MX 10 mx1.improvmx.com`, `MX 20 mx2.improvmx.com`, `TXT v=spf1 include:spf.improvmx.com ~all`. Verified propagated via `dig @8.8.8.8`. A catch-all alias is active, so `legal@` / `privacy@` also resolve without further setup. No collision with Clerk mail, which lives entirely on subdomains (`clkmail`, `clk._domainkey`, `clk2._domainkey`); there was no pre-existing root SPF or MX. |
| **Mailing address** | **NOT REQUIRED at the current stage — deferred with a named trigger** | See "Mailing-address finding" below. |
| **Governing law** | New York | |

**Mailing-address finding (researched 2026-07-27 — this narrows a previously assumed requirement):**

**Privacy-policy contact channel — settled.** CCPA lets an online-only business use email alone: the regulation provides that a business operating *exclusively online* with a direct relationship to the consumer is required to provide **only an email address** for access/deletion/correction requests — the two-method (incl. toll-free number) rule does not attach. `support@addictionboards.com` satisfies this outright. Separately, CCPA's coverage thresholds (gross revenue, 100k+ consumers, or ≥50% of revenue from selling personal information) are not met pre-revenue, so it does not yet apply at all. **No published mailing address is needed to satisfy the privacy-request channel.**

**CAN-SPAM postal-address obligation — CONDITIONAL, not cleared.** CAN-SPAM's valid-physical-postal-address requirement attaches to **commercial** messages; transactional and relationship messages are exempt from it. But the classification is a **per-message "primary purpose" test, not a per-company one**, and a message that mixes transactional content with promotional content is treated as commercial when promotion is its primary purpose. Two consequences:

- **A blanket "all our mail is transactional" conclusion is not supportable, and is not asserted here.** An earlier revision of this doc claimed it; that claim was withdrawn on 2026-07-27 after review.
- **The content is not verifiable from this repository.** The app ships **no email-sending library** (`package.json` — no Resend/Nodemailer/SendGrid/Postmark/Mailgun/SES) and makes no send calls; every outbound message is sent by **Clerk** (authentication) or **Stripe** (billing, receipts, trial-ending notices) from **templates configured in their dashboards**. Their current wording cannot be read from source, and Stripe's trial-ending template in particular is a plausible mixed-purpose candidate if it promotes a plan upgrade.

**Required before relying on the exemption (open item):** enumerate every live Clerk and Stripe email template, classify each by primary purpose, and record the result. Add the postal address (and, for anything commercial, an opt-out mechanism) if **any** template is commercial or mixed-purpose.

**Two distinct triggers — do not conflate them:**

1. **Earliest commercial or mixed-purpose message.** This may *already* be satisfied by a live provider template; it is unknown until the classification above is done. When satisfied, a valid physical postal address becomes mandatory in that message.
2. **Active user acquisition / marketing.** Independently requires the published pages, and is the pre-existing trigger for LLC formation.

Trigger 1 could fire before trigger 2. Treat them separately.

When the trigger fires, options (verified pricing, 2026): a **USPS PO Box** (~$25–90 per 6 months) is explicitly named as acceptable by CAN-SPAM and is the cheapest compliant answer, but is not a street address and won't serve later bank/LLC needs; **Anytime Mailbox** or **iPostal1** (both from ~$9.99/mo, real street addresses, largest location networks) or **PostScan Mail** (from ~$10/mo, ~400 locations) provide a street address. All virtual options require a notarized USPS Form 1583, generally completed online. Ship the pages with email-only contact now and add the address in the same pass that adds it to marketing email.

**Authored drafts (in progress):** [`docs/legal/privacy-policy.md`](../legal/privacy-policy.md) — drafted 2026-07-28 in-house from primary sources, with every factual claim derived from the codebase and a *Provenance* table mapping each claim to the file that proves it. Terms of Service draft to follow. Owner decision on record: draft in-house rather than block on counsel, given a pre-revenue product with no active users; obtain legal review before spending on user acquisition.

**Step 1 — Generate the baseline text.** Privacy Policy + Terms of Service + Cookie Policy. Answer: paid SaaS subscription; collects email/account + usage data; payments via a third-party processor; cookies yes (auth/session; Sentry only); does **not** sell data; **paid subscription + auto-renewal + free trial = YES** (this triggers the trial clauses — the critical part); US audience, no under-13. Source options in **Template sources** below.

> **Superseded 2026-07-27 — the earlier "prefer Termly's *embed*" preference is withdrawn.** Generate with Termly (or a CC0/CC-BY base), then **commit the resulting text into the repo** rather than embedding a third-party script. Rationale is recorded under *Rendering approach* in the Implementation spec: an embed cannot be design-system-compliant or server-rendered, it would add CSP report noise under the app's report-only strict policy (and break outright if enforcement is ever flipped), and in-repo copy is the only form that can be **test-guarded** so a future edit cannot silently drop a mandatory clause. Trade-off accepted: policy updates become a manual review rather than automatic — mitigated by the annual review reminder in Step 5.

**Step 2 — Three mandatory customizations** (generic generator output won't have these):

- **A. Trial/auto-renewal disclosure (ROSCA / state ARL):** 7-day free trial, no card to start; auto-renews after the trial to **$29/mo or $199/yr**, charged each period until cancelled; no card ⇒ trial ends, no charge; cancel anytime in the billing portal, effective at period end, access retained until then; reminder emails before trial-end/renewal. Material terms must be clear/conspicuous **before** billing info is collected.
- **B. Medical-education disclaimer (prominent):** "[Product] provides educational content for medical board-exam preparation only. NOT medical or healthcare advice; not a substitute for professional clinical judgment; not for diagnosis, treatment, or patient-care decisions. Verify against current guidelines; use at your own risk; consult a qualified clinician for medical concerns."
- **C. Subprocessors (in the Privacy Policy):** Clerk (auth) · Stripe (payments/billing — Stripe stores card data, we don't) · Vercel (hosting) · Neon (database) · Sentry (error monitoring). Data collected: account email/identity, billing identifiers (not card numbers), and product-usage (sessions, answers, bookmarks, feedback).

**Step 3 — Lawyer review (before publishing):** focus on (1) auto-renewal/trial compliance — ROSCA + state ARL (disclosure adequacy/placement, consent, cancellation); (2) the medical-education disclaimer's liability adequacy; (3) data-practice accuracy + user-rights language (CCPA/CPRA + state laws); (4) governing law, limitation of liability, dispute resolution.

**Step 4 — Hand to engineering (the buildable part, ~half a day):** provide the lawyer-approved text + the Step-0 facts (all now filled in above). The build is fully specced against the live codebase in **Implementation spec** below — an agent can execute it end-to-end with no further discovery. The shortened Stripe descriptor is already present + compliant.

**Step 5 — Post-publish review cadence (the cost of choosing static copy over an auto-updating embed):** set a recurring **annual** reminder to re-read both documents against current US state-privacy and negative-option law, plus an **event-driven** review whenever any of these change: the subprocessor list (adding/removing Clerk, Stripe, Vercel, Neon, Sentry), pricing or trial mechanics, or the entity (LLC formation). Record the review date in the `effectiveDate` field of each content module so the published page always shows when it was last reviewed.

## Template sources (baseline wording — researched 2026-07-27)

Two families. Use a **generator** if you want the questionnaire to assemble state-law coverage for you; use an **open-licensed corpus** if you'd rather start from battle-tested prose written by a company with real lawyers and adapt it. Either way the output is a *baseline* — the three mandatory customizations in Step 2 are what make it ours, and Step 3's lawyer review is the gate.

### Generators (questionnaire → assembled policy)

| Tool | Notes |
|---|---|
| **Termly** (recommended) | US-focused; covers the CCPA/CPRA + Virginia/Colorado/Connecticut/etc. landscape; bundles Privacy + ToS + Cookie policy; has an explicit **auto-renewal / free-trial** question path — that path is the reason it's the pick. |
| iubenda | EU-deep alternative; more than we need for a US-only audience. |
| TermsFeed | Comparable US generator; viable substitute. |

### Open-licensed corpora (copy, adapt, attribute per licence)

**Licence differences are load-bearing — check before adapting:**

| Source | Licence | Consequence |
|---|---|---|
| **GitHub `github/site-policy`** | **CC0-1.0** (public domain dedication) | **Cleanest option.** No attribution required, no share-alike obligation, usable even in part. Note CC0 grants **no trademark rights** — strip every GitHub name/mark. Strong, plain-English SaaS ToS + privacy prose. |
| **Basecamp / 37signals policies** | **CC BY** (attribution) | Attribution required, but **no share-alike** — our adapted policy stays under our own terms. Includes ToS, privacy, cancellation, refund, and use-restriction policies; the cancellation/refund ones map well onto our Stripe self-serve flow. |
| **Automattic `legalmattic`** | **CC BY-SA 4.0** (attribution + **ShareAlike**) | ⚠️ ShareAlike is viral: a derivative must be released under the same licence. Usable, but it constrains how our own published policy is licensed — prefer CC0/CC-BY sources unless there's a specific reason to start here. |

**Recommended blend:** Termly for the assembled state-law + auto-renewal skeleton, cross-read against GitHub's CC0 ToS for plain-English clarity, then apply the Step-2 customizations. Do **not** ship any of them unmodified — none contains the medical-education disclaimer, our trial mechanics, or our subprocessor list.

---

## Implementation spec (verified against the live tree at `b159e058`, 2026-07-27)

Every path, constant, and seam below was read from the working tree, not assumed. An agent can execute this without further discovery. **TDD is mandatory** — write each test before the code it covers.

### 1. Route constants — `lib/routes.ts`

Add to the public/marketing block of the `ROUTES` object (above the `APP_*` entries):

```ts
PRIVACY: '/privacy',
TERMS: '/terms',
```

### 2. ⚠️ Public-route wiring — `lib/public-routes.ts` (MISSING FROM THE ORIGINAL SPEC — hard blocker)

`PUBLIC_ROUTE_PATTERNS` is consumed by `proxy.ts`, which calls `auth.protect()` on **every** route that does not match. Legal pages must be readable while signed out — that is the entire compliance point, since ROSCA disclosure has to happen *before* signup. Add:

```ts
'/privacy(.*)',
'/terms(.*)',
```

**Failure mode if skipped:** `/privacy` and `/terms` 302 to `/sign-in` in production. The pages would look shipped, pass a naive review, and defeat their own purpose — an unauthenticated visitor could never read the disclosure. Guard it with a test (§ 6) and an E2E check (§ 7); do not rely on manual verification.

### 3. Pages — `app/(marketing)/privacy/page.tsx`, `app/(marketing)/terms/page.tsx`

The `(marketing)` route group exists (currently holding only `checkout/`) and has **no group-level `layout.tsx`** — pages compose the layout themselves, exactly as `app/pricing/page.tsx` does:

```tsx
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = { title: 'Privacy Policy - Addiction Boards' };

// ...
<MarketingLayout featuresHref={`${ROUTES.HOME}#features`}>…</MarketingLayout>
```

`featuresHref={`${ROUTES.HOME}#features`}` is the established value for non-home marketing pages (mirrors `app/pricing/page.tsx`; the home page itself uses the bare `'#features'`).

### 4. Rendering approach — typed content modules + one presentational shell

- `components/legal/legal-document.tsx` — **server** component (no `'use client'`), presentational only, design-system compliant. Renders `title`, a "Last reviewed: {effectiveDate}" line, and the section list with correct heading levels.
- `app/(marketing)/privacy/privacy-content.ts` and `app/(marketing)/terms/terms-content.ts` — the lawyer-approved text as typed data:

```ts
export type LegalSection = { heading: string; body: string[] };
export type LegalDocumentContent = {
  title: string;
  effectiveDate: string; // ISO yyyy-mm-dd — bump on every review (Step 5)
  sections: LegalSection[];
};
```

**Rejected alternatives (recorded so they are not re-litigated):**

- **Termly embed / any third-party script.** The app runs a Clerk-managed **strict CSP that is currently in report-only mode** (`proxy.ts`, `reportOnly: true` — see `docs/_archive/debt/debt-420-csp-enforcing-mode-flip.md` for why enforcement is not flipped). So a third-party embed would **not** be blocked today — it would be *reported*, generating CSP report noise into Sentry, and would break if enforcement is ever enabled. The rejection does not rest on the CSP alone: an embed also cannot inherit the design system, requires JS for legally-required text, and makes the copy untestable. Rejected.
- **Reusing `components/markdown/markdown.tsx`.** It is `'use client'` and carries question-explanation-specific behavior (the `Clinical Pearl` transform). Wrong seam — it would couple legal rendering to question rendering. Rejected.
- **Raw HTML string / `dangerouslySetInnerHTML`.** Unnecessary sanitization surface for content we author. Rejected.

### 5. Footer + pre-billing disclosure

- **Footer** — `components/marketing/marketing-layout.tsx`, inside `MarketingFooter`'s link cluster (alongside the existing Features / Pricing / Sign in / Sign up links), reusing `marketingNavLinkClass`. Note the fragment is `'use cache'`; static links are fine inside it.
- **Pre-billing disclosure (ROSCA)** — the material terms (price, billing frequency, when the trial ends, cancellation method) plus links to `/terms` and `/privacy` must appear on the **pricing/checkout entry** (`app/pricing/pricing-view.tsx`), not only inside the ToS. This is the substantive compliance requirement; footer links alone do **not** satisfy "clear and conspicuous, before billing information is collected."

### 6. Tests (TDD — write first)

| File | Asserts |
|---|---|
| `lib/public-routes.test.ts` (extend) | `PUBLIC_ROUTE_PATTERNS` contains `/privacy(.*)` and `/terms(.*)` — regression guard for § 2 |
| `components/legal/legal-document.test.tsx` | Heading structure, `effectiveDate` rendering, section order |
| `app/(marketing)/privacy/page.test.tsx` | **Mandatory-clause guards**: subprocessor list names Clerk, Stripe, Vercel, Neon, Sentry; contact email present |
| `app/(marketing)/terms/page.test.tsx` | **Mandatory-clause guards**: medical-education disclaimer present; auto-renewal terms present (price, frequency, trial length, cancellation method) |
| `components/marketing/marketing-layout.test.tsx` (extend) | Footer links to both routes, via `findAnchorByHref` from `tests/shared/dom-helpers.ts` |
| `app/pricing/pricing-view.test.tsx` (extend) | Pre-billing disclosure text + legal links render on the pricing entry |

`*.test.tsx` files use `renderToStaticMarkup` with `// @vitest-environment jsdom` as the first line, and assert through parsed-DOM seams per `.claude/rules/testing.md` — not raw HTML fragments.

The mandatory-clause tests are the point of choosing in-repo copy: they make it **mechanically impossible** to ship a policy that has silently lost the medical disclaimer or the auto-renewal terms.

### 7. E2E

Add to `tests/e2e/`: unauthenticated `GET /privacy` and `GET /terms` return **200, not a redirect to `/sign-in`**. This is the only check that proves § 2 end-to-end through the real middleware.

### 8. Non-code / dashboard steps (owner)

- Stripe **Account settings** → set Privacy Policy URL + Terms of Service URL (`https://addictionboards.com/privacy` / `/terms`) so hosted billing + portal pages surface them.
- Verify the existing **shortened statement descriptor** is still 2–10 characters and still reads correctly with Stripe's trial-ending descriptor suffix. **It already exists and is compliant — do not treat it as missing.**
- Recheck Stripe-native **trial-ending customer emails** in the Dashboard (Dashboard-owned, not API-verifiable).

### 9. Out of scope (deliberately)

No `sitemap.ts` / `robots.ts` exists in `app/`, and none is required for this work — nothing currently blocks indexing of the new routes. If SEO work later adds a sitemap, include `/privacy` and `/terms`.

---

## Sources

- [Stripe Data Processing Agreement (merchant notice responsibility)](https://stripe.com/legal/dpa) · [Stripe Services Agreement](https://stripe.com/legal/ssa) · [Stripe Privacy Policy](https://stripe.com/privacy)
- [Stripe statement descriptors](https://docs.stripe.com/get-started/account/statement-descriptors) · [Stripe trial compliance / trial-ending descriptor suffix](https://docs.stripe.com/billing/subscriptions/trials/manage-trial-compliance)
- [FTC — Restore Online Shoppers' Confidence Act](https://www.ftc.gov/legal-library/browse/statutes/restore-online-shoppers-confidence-act) · [FTC — Negative Option Rule ANPRM (2026)](https://www.ftc.gov/system/files/ftc_gov/pdf/p064202negativeoptionruleanprm.pdf) · [Eighth Circuit vacatur of the 2024 Negative Option Rule](https://law.justia.com/cases/federal/appellate-courts/ca8/24-3388/24-3388-2025-07-08.html)
- [California Business and Professions Code § 17602 (ARL)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17602.)
- [Termly vs iubenda (2026 generator comparison)](https://cybernews.com/privacy-compliance-tools/termly-vs-iubenda/)
- [Board-prep question-bank educational disclaimer (example)](https://higherlogicdownload.s3.amazonaws.com/NEUROCRITICALCARE/b8b3b384-bfb9-42af-bb55-45973d5054a4/UploadedImages/Educational_Products_Disclaimer_Question_Bank.pdf)

**Added 2026-07-27 (Step 0 closure + template research):**

- [California AG — CCPA](https://oag.ca.gov/privacy/ccpa) · [CPPA FAQs](https://cppa.ca.gov/faq.html) · [CCPA text (Sidley)](https://www.sidley.com/en/sidley-pages/ccpa-text) — the online-only / email-address-only provision
- [FTC — CAN-SPAM Act Compliance Guide for Business](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) — the sole authority relied on for CAN-SPAM here: the commercial-message scope of the postal-address requirement, the per-message "primary purpose" test, the transactional/relationship carve-out, and that a USPS-registered PO Box or a CMRA private mailbox both qualify as a valid physical postal address
- [github/site-policy](https://github.com/github/site-policy) ([CC0-1.0 licence](https://github.com/github/site-policy/blob/main/LICENSE.md)) · [Automattic/legalmattic](https://github.com/Automattic/legalmattic) (CC BY-SA 4.0) — open-licensed policy corpora and their differing reuse obligations
- [Virtual mailbox pricing comparison (2026)](https://www.postscanmail.com/blog/top-virtual-mailbox-services.html) · [iPostal1 vs Anytime Mailbox (2026)](https://ecommerceparadise.com/ipostal1-vs-anytime-mailbox-2026/) — deferred-purchase options and current entry pricing
