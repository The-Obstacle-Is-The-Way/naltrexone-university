# DEBT-414: Public Legal Pages (Privacy Policy + Terms of Service) + Stripe Legal-Link Wiring and Descriptor Verification

**Priority:** P2 (a live paid, auto-renewing product with no published Privacy Policy or Terms of Service — a real privacy-law + auto-renewal-disclosure exposure; does **not** block the trial from functioning)
**Created:** 2026-06-10
**Status:** **Decided spec — no optionality.** Research-backed (Stripe DPA/SSA + Stripe docs + 2026 legal/regulatory sources). Docs-first; legal copy to be drafted and lawyer-reviewed before publishing.
**Owner:** Founder / legal (engineering owns the on-site pages + Stripe wiring).
**Related:** [DEBT-410](./debt-410-free-trial-pathway-and-pricing-access-copy.md) (the live free trial this serves), [Debt Index](./index.md). The Stripe Account-settings legal-link gap and descriptor-verification item surfaced during the DEBT-410 trial launch.

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

- [ ] Privacy Policy + Terms of Service (+ cookie policy) drafted from a reputable generator, customized for: subscription/free-trial disclosure, medical-education disclaimer, actual subprocessors.
- [ ] Lawyer-reviewed before publishing.
- [ ] Published on-site at stable routes, design-system compliant, linked from footer + the checkout/signup entry (disclosure before billing).
- [ ] Stripe Account settings: Privacy Policy URL + Terms of Service URL set; existing shortened statement descriptor verified as 2-10 characters and compatible with Stripe's trial-ending descriptor suffix.
- [ ] Trial/auto-renewal material terms (price, frequency, trial end, cancel method) clearly disclosed before billing info is collected.

## Dependencies

- The free trial is already live (DEBT-410); this closes its legal/compliance tail. Pairs with the DEBT-410 Stripe self-serve cancel path and Stripe-native trial-ending email configuration.

## Sources

- [Stripe Data Processing Agreement (merchant notice responsibility)](https://stripe.com/legal/dpa) · [Stripe Services Agreement](https://stripe.com/legal/ssa) · [Stripe Privacy Policy](https://stripe.com/privacy)
- [Stripe statement descriptors](https://docs.stripe.com/get-started/account/statement-descriptors) · [Stripe trial compliance / trial-ending descriptor suffix](https://docs.stripe.com/billing/subscriptions/trials/manage-trial-compliance)
- [FTC — Restore Online Shoppers' Confidence Act](https://www.ftc.gov/legal-library/browse/statutes/restore-online-shoppers-confidence-act) · [FTC — Negative Option Rule ANPRM (2026)](https://www.ftc.gov/system/files/ftc_gov/pdf/p064202negativeoptionruleanprm.pdf) · [Eighth Circuit vacatur of the 2024 Negative Option Rule](https://law.justia.com/cases/federal/appellate-courts/ca8/24-3388/24-3388-2025-07-08.html)
- [California Business and Professions Code § 17602 (ARL)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17602.)
- [Termly vs iubenda (2026 generator comparison)](https://cybernews.com/privacy-compliance-tools/termly-vs-iubenda/)
- [Board-prep question-bank educational disclaimer (example)](https://higherlogicdownload.s3.amazonaws.com/NEUROCRITICALCARE/b8b3b384-bfb9-42af-bb55-45973d5054a4/UploadedImages/Educational_Products_Disclaimer_Question_Bank.pdf)
