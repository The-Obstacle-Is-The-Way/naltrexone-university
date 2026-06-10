# DEBT-414: Public Legal Pages (Privacy Policy + Terms of Service) + Stripe Legal/Descriptor Wiring

**Priority:** P2 (a live paid, auto-renewing product with no published Privacy Policy or Terms of Service — a real privacy-law + auto-renewal-disclosure exposure; does **not** block the trial from functioning)
**Created:** 2026-06-10
**Status:** **Decided spec — no optionality.** Research-backed (Stripe primary sources + 2026 web research). Docs-first; legal copy to be drafted and lawyer-reviewed before publishing.
**Owner:** Founder / legal (engineering owns the on-site pages + Stripe wiring).
**Related:** [DEBT-410](./debt-410-free-trial-pathway-and-pricing-access-copy.md) (the live free trial this serves), [Debt Index](./index.md). The Stripe Account-settings legal-link and statement-descriptor fields surfaced during the DEBT-410 trial launch.

---

## Context — why this is debt now

The free trial launched (DEBT-410): the app now takes real signups into a **paid, auto-renewing subscription** (7-day no-card trial → $29/mo or $199/yr). Two obligations surfaced during the Stripe launch that are not yet met:

1. **No published Privacy Policy or Terms of Service.** Stripe's hosted billing/portal pages have fields for "Privacy policy and Terms of service links" — but those are set in **Stripe Account settings** and require the merchant to provide its **own** documents. We have none.
2. **Statement-descriptor truncation risk.** The "trial over" statement-descriptor message (enabled in the DEBT-410 launch) only renders if the base descriptor is short enough; a **shortened statement descriptor** must be set in Stripe Account settings.

## Research findings (primary + 2026 sources)

1. **Stripe does NOT provide your legal pages — you are legally required to have your own.** Stripe has its own Privacy Policy + Services Agreement governing *Stripe-as-processor*, but the merchant "must provide all necessary notices (including … a Privacy Policy) … and [is] solely responsible for the content of notices" to its customers ([Stripe SSA](https://stripe.com/legal/ssa)). Stripe's policies **cannot** be reused as ours; the Account-settings fields only *link* to our own.
2. **Auto-renewal / free-trial disclosure is legally required (even post-"Click-to-Cancel" vacatur).** The FTC's Click-to-Cancel / Negative Option Rule was vacated by the 8th Circuit on procedural grounds (2025) and the FTC re-opened rulemaking (ANPRM, Jan/Mar 2026) — but **ROSCA (Restore Online Shoppers' Confidence Act) remains in force** and requires, for online auto-renewing/trial sellers: (a) clear & conspicuous disclosure of all material terms **before** collecting billing info, (b) express informed consent before charging, and (c) a simple cancellation mechanism. **State Automatic Renewal Laws (e.g. California ARL)** impose equivalent requirements. Material terms: price, billing frequency, when the trial ends, cancellation deadline + method. (DEBT-410 already enabled Stripe self-serve cancel + trial-ending emails — the ToS must also disclose these terms.)
3. **Medical-education disclaimer is standard for a board-prep question bank.** Reputable board-review banks publish a disclaimer that content is **educational / exam-prep only, not medical or healthcare advice, not for diagnosis or clinical decisions**; users rely on their own professional judgment, verify against current guidelines, and use at their own risk.
4. **Tooling.** A reputable US-focused generator covers the US state-privacy-law landscape (CCPA/CPRA, Virginia, Colorado, Connecticut, …) and bundles Privacy + ToS + cookie policy with ongoing auto-updates. **Termly** is the strongest US-focused pick; **iubenda** is the EU-deep alternative; **TermsFeed** is comparable. Free generators exist but lack compliance monitoring. Generic open-source / CC-licensed policies (e.g. 37signals') need heavy customization and don't track US state-law changes.

## Decision (final)

**Roll our own legal pages from a reputable generator base, customized for our specifics, lawyer-reviewed, hosted on-site, and wired into Stripe.** Concretely:

1. **Generate** baseline Privacy Policy + Terms of Service (+ cookie policy) with a US-focused generator (**Termly** recommended — US state-law coverage, bundles privacy + ToS + cookie, auto-updates).
2. **Customize** the baseline for:
   - **Subscription + free-trial disclosure (ROSCA/ARL):** the 7-day no-card trial → paid conversion, price ($29/mo, $199/yr), billing frequency, that no card is required to start, how/when it converts, the self-serve cancel path (Stripe portal, at period end), and the trial-ending reminder emails.
   - **Medical-education disclaimer:** content is for board-exam preparation / education only; **not medical advice**, not for diagnosis or clinical decisions; verify against current guidelines; use at own risk.
   - **Subprocessors / third parties actually used:** Clerk (auth), Stripe (payments), Vercel (hosting), Neon (database), Sentry (error monitoring) — disclose data sharing.
3. **Lawyer review** before publishing (a live paid product collecting payment, plus the medical-education + auto-renewal angles, is liability-sensitive). **This doc is a framework, not legal advice.**
4. **Host on-site** at stable routes (e.g. `/privacy`, `/terms`) — simple marketing pages under `app/(marketing)/`, design-system compliant, linked from the footer **and** the signup/checkout entry (so disclosure is "before billing info" per ROSCA).
5. **Wire into Stripe Account settings:** set the Privacy Policy + Terms of Service URLs (so the hosted billing/portal pages show them) **and** set a **shortened statement descriptor** (so the DEBT-410 "trial over" message doesn't truncate).

## Constraints
- Trial/auto-renewal material terms must be disclosed **before** billing info is collected (ROSCA) — i.e. on the pricing/checkout entry, not buried only in the ToS.
- The medical-education disclaimer must be prominent given the clinical-adjacent content.
- On-site legal pages follow the design system; routes from `lib/routes.ts`.
- **Not legal advice** — final copy is owner/lawyer responsibility; the engineering scope is the generator baseline + on-site pages + footer/checkout links + the Stripe Account-settings wiring.

## Rejected alternatives
- **Use Stripe's own Privacy Policy / Terms as ours.** Rejected: Stripe's policies govern Stripe-as-processor; the merchant is solely responsible for its own customer notices and legally required to have its own. Not permissible.
- **Ship with no legal pages.** Rejected: operating a live paid auto-renewing subscription with no privacy policy violates privacy law, and no trial/auto-renewal disclosure violates ROSCA / state ARLs.
- **Generic free template, unmodified.** Rejected: misses the medical-education disclaimer, the trial/auto-renewal specifics, and US state-law coverage; higher liability than a maintained generator + lawyer review.
- **Hand-write the full legal text from scratch with no generator/lawyer.** Rejected: high legal risk for a paid, medical-adjacent product; a maintained generator base + targeted lawyer review is the disciplined path.

## Acceptance criteria
- [ ] Privacy Policy + Terms of Service (+ cookie policy) drafted from a reputable generator, customized for: subscription/free-trial disclosure, medical-education disclaimer, actual subprocessors.
- [ ] Lawyer-reviewed before publishing.
- [ ] Published on-site at stable routes, design-system compliant, linked from footer + the checkout/signup entry (disclosure before billing).
- [ ] Stripe Account settings: Privacy Policy URL + Terms of Service URL set; shortened statement descriptor set (DEBT-410 "trial over" renders without truncation).
- [ ] Trial/auto-renewal material terms (price, frequency, trial end, cancel method) clearly disclosed before billing info is collected.

## Dependencies
- The free trial is already live (DEBT-410); this closes its legal/compliance tail. Pairs with the DEBT-410 self-serve cancel + trial-ending emails already enabled.

## Sources
- [Stripe Services Agreement (merchant is responsible for own notices)](https://stripe.com/legal/ssa) · [Stripe Privacy Policy](https://stripe.com/privacy)
- [FTC — Click-to-Cancel / amended Negative Option Rule](https://www.ftc.gov/business-guidance/blog/2024/10/click-cancel-ftcs-amended-negative-option-rule-what-it-means-your-business) · [Goodwin — Click-to-Cancel revived (2026)](https://www.goodwinlaw.com/en/insights/publications/2026/02/alerts-practices-ba-ftcs-click-to-cancel-rule-gets-new-life)
- [Termly vs iubenda (2026 generator comparison)](https://cybernews.com/privacy-compliance-tools/termly-vs-iubenda/)
- [Board-prep question-bank educational disclaimer (example)](https://higherlogicdownload.s3.amazonaws.com/NEUROCRITICALCARE/b8b3b384-bfb9-42af-bb55-45973d5054a4/UploadedImages/Educational_Products_Disclaimer_Question_Bank.pdf)
