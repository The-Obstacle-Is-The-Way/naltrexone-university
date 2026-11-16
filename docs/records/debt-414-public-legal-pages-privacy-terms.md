# DEBT-414: Renewal-Law Gaps and Legal Review Before Paid Launch

**Status:** Open — F21's notice tagging; F07 waits on Resend's first real report; owner, counsel and tax items remain
**Priority:** P1
**Date:** 2026-06-10

---

> An engineering and evidence record by non-lawyers, not legal advice. The shipped decisions are in [ADR-027](../adr/adr-027-free-trial-renewal-consent-and-notices.md). The published texts are the [Terms](../policies/legal/terms-of-service.md) and the [Privacy Policy](../policies/legal/privacy-policy.md).

## Summary

The Privacy Policy and Terms are public, and the owner adopted the New York SHIELD program on 2026-08-27. The renewal-consent and notice work the owner authorized on 2026-09-27 has shipped (ADR-027). What remains:
- one engineering gap (F21);
- one production check (F07's first real delivery report);
- Massachusetts' notice rules (F19);
- the owner's evidence tasks;
- counsel's questions Q1–Q6 and Q8, and the tax question Q7.

Existing subscribers' prices stay frozen until the parked price-change machinery ships.

## Evidence

- **Shipped, in production.** F01, F02, F03a and F03b, F04, F05, F06, F07's three parts (revalidation, the `accepted` status, the signed Resend webhook), F15a–c and F23. The 2026-09-16 copy and procedure fixes covered F08, F09, F11–F14, F16 and F18. The revised Privacy copy was verified in production on 2026-09-17.
- **F21 is not built.** Dispatch claims the row (`src/application/use-cases/dispatch-renewal-notice-delivery.ts:110-115`), sends, and only then stores Resend's email ID (`:119-134`). A report that arrives first finds no row. The repository answers `'unknown'` (`src/adapters/repositories/drizzle-renewal-notice-delivery-repository.ts:361-367`), and the controller discards that (`src/adapters/controllers/resend-webhook-controller.ts:91-95`). The route then answers 200 (`app/api/webhooks/resend/handler.ts:103`), so Resend does not retry. Neither the gateway, the controller nor dispatch sends or reads Resend tags.
- **F07's webhook.** On 2026-10-24 the owner created the Resend webhook with the four events the controller maps, and set `RESEND_WEBHOOK_SECRET` for Production. An unsigned POST then answered 400, not 503. No real report is recorded yet. A no-card trial start records consent and queues an acknowledgment (`src/adapters/controllers/stripe-webhook-controller.ts:686-696`). So BUG-364's no-card live trial check, or the first live sale, sends the first real email.
- **Massachusetts, 940 CMR 38.05, enforced since 2025-09-02.**
  - (4): a term over 31 days needs a notice 5–30 calendar days before the cancellation deadline. Our reminders start 39 days out and are refused after 30, so they cannot land in that window.
  - (6): a monthly plan needs a notice of each charge's amount and how to cancel, or compliant advance notice. The Attorney General's January 2026 guidance accepts a compliant receipt.
  - (1): the trial copy must show the calendar dates of cancellation and charge, with a time zone. It gives relative days.
  - (5): sets the notice medium.
  - Ruled out on 2026-10-07: Stripe's upcoming-renewal email as the notice. It goes to Stripe's unsynced copy of the address, and we cannot evidence its content or delivery (DEBT-511).
- **Stripe receipts.** On 2026-08-13 the owner turned on successful-payment and refund receipts. The same check found that Stripe's public support address is the owner's residential address, and its support phone the owner's personal number. Both can appear on receipts.
- **Provider templates (F08).** The 2026-08-13 inventory names the enabled Clerk and Stripe templates but keeps no subject or body. Clerk's Invitation can solicit a purchase, so its classification depends on its content and recipient.

The full history is in git at `34d9aea0`: the implementation spec, the stage reviews, the 2026-09-16 review with its statute tables, and the remediation log.

## Impact

- **F21.** A failure report that beats the email-ID write leaves a notice `accepted`. It counts as sent, so the missed-deadline alert never fires. The window is milliseconds, and no case has been seen.
- **F07.** Until a real report arrives, the delivery-evidence path is proven only by tests and an unsigned probe.
- **Massachusetts.** No annual notice lands in the 5–30-day window. Monthly plans rely on an unchecked Stripe receipt. The trial copy lacks calendar dates.
- **Counsel and tax.** Without answers first, paid acquisition and the first taxable sale go ahead on non-lawyer analysis.

## Options

For F21, the early failure report:
1. **Tag each send with its delivery row's ID** (decided 2026-10-06, kept 2026-11-15). Resend's bounced, failed and suppressed payloads carry the send's tags in `data.tags`, so the webhook can match a failure by its tag before the email ID is stored.
2. **A retryable webhook response** (rejected 2026-10-06). It still loses an early delivery report.
3. **A durable inbox of unmatched reports** (rejected 2026-10-06). It would store outcomes for unrelated mail.
4. **Accept the gap** (rejected 2026-11-15 by the reviewing session, at the owner's delegation). A suppression is decided without contacting the recipient's server, so its report can be the fastest. A crash between the send and the ID write is already covered: it ends in `outcome_unknown`, the daily job quarantines a claim stale for 15 minutes and raises its alert (`src/application/use-cases/send-due-renewal-notices.ts:200-221`). An early failure report is not covered.

## Resolution (decided)

**Engineering: F21 (P4).** Option 1. Ship it before the first live sale.
- Send the delivery row's ID as a tag. When a failure report's email ID is unknown, match it by that tag.
- `persistOutcome` never replaces a recorded failure. Untagged mail stays acknowledged and ignored. A lost send response stays `outcome_unknown`.
- Files: `src/adapters/gateways/resend-transactional-email-gateway.ts`, `resend-webhook-controller.ts`, the delivery repository's port, fake and Drizzle adapter, and `dispatch-renewal-notice-delivery.ts`.
- Red tests first: an early failure report matched by its tag; a duplicate report; reports before and after the ID is stored; untagged mail left unchanged.

**Owner, counsel and tax.** Each item names who decides, when, and what closes it.
- **F07, the first real report.** Owner. When the first acknowledgment is sent in production, at BUG-364's live trial check or the first live sale. Done when Resend's webhook log shows a 200 for a real report, and that notice's row reads `delivered` or `terminal_failure`.
- **F19a, Massachusetts' annual notice.** The owner, with counsel's Q1. Decided when DEBT-501 item 7 records the first live sale (set 2026-10-19). If the rule applies, the fix ships before 39 days ahead of the first live annual renewal. Recommended: our own reminder about 25 days before the cancellation deadline (the renewal instant), with its own send-by limit and missed-deadline alert. The 39-to-30-day reminder stays, and no schema change is needed.
- **F19b, calendar dates in the trial copy.** Owner. It changes consent evidence, so it merges only on the owner's instruction (DEBT-478). No date is set. Done when the owner instructs the build, or holds it for counsel.
- **F19c, Massachusetts' per-charge notice.** The owner, with counsel's Q1. Before the first live sale (set 2026-10-19). Check DEBT-501 item 7's live receipt for the amount charged and how to cancel. Then the owner accepts it as the notice, or our own per-charge notice ships before the first live monthly charge.
- **F19d, the notice medium.** Counsel, with Q1. Done when counsel picks (5)'s route: a medium substantially like the online signup, or a recorded, affirmative choice of email.
- **Support address and phone.** Owner. Recorded on 2026-08-13 as "before scale". Recommended: decide at DEBT-501 item 7's live purchase, since the first live receipt would show them. Done when Stripe's public details show a commercial mail-receiving address and a business line.
- **Support mailbox coverage.** Owner, before accepting users. Done when the procedure names who covers the support mailbox when the owner is away, so a timely cancellation request cannot turn into a late renewal.
- **F08, template specimens.** Owner, before counsel's review. Done when each enabled Clerk and Stripe template has its sanitized subject and body, purpose, trigger and recipient relationship kept, and Invitation is reclassified or its use restricted.
- **F14, entity and threshold facts.** Owner, before counsel's review, then at each annual program review. Done when the merchant's legal identity, any assumed-name filing and other businesses are verified privately, and revenue and state-consumer counts are recorded. The Workspace label "John H Jung MD LLC" is not evidence of an LLC.
- **F09 and F12, incident channel and stores.** Owner. Before relying on electronic breach notice, or before first storing affected-person data. Done when the channel tabletop is repeated, and the Apple Notes/iCloud and Bitwarden reviews are documented ([incident procedure](../policies/security/incident-response-and-breach-notification.md), 2026-09-16 supplement).
- **Q1–Q6.** Counsel. Before the first paid acquisition, or earlier if accepting a consumer contract requires it (#902). Done when written answers are recorded. A Terms change ships as a new `TERMS_VERSION` and hash, keeps the old accepted text, updates the disclosure, consent and acknowledgment evidence, and follows the notice or assent process. No frozen text is replaced in place.
- **Q7.** A tax adviser or counsel. Before the first taxable charge, and so before the first live sale. Done when the classification and any registration are recorded.
- **Q8.** IP counsel. Before paid launch. Done when the answers are recorded.
- **Price-change machinery.** Owner. Parked on 2026-08-06. Before planning or announcing the first change to an existing subscriber's price or material terms, build it with its notice, consent, claim, reconciliation and audit tests (design in git at `34d9aea0`, § 7). Until then no existing subscriber's price changes (ADR-027). The design must also show changed renewal terms in at least 12-point bold (North Carolina § 75-41(a)(4)).

**Questions for counsel.** Hand over this record, the 2026-09-16 review at `34d9aea0`, the frozen Terms (`TERMS_VERSION` `2026-08-09`), and specimens of checkout, the add-card dialog, the portal and the notices.
1. **Assent.** Do the separate opt-in, bold terms, acknowledgment and versioned ledger make assent enforceable for physicians buying their own exam preparation (VT § 2454a; CA § 17602(a)(4), (6))? It includes whether Massachusetts applies (F19), and Wisconsin § 134.49's signed disclosure for business contracts (F20). It also covers Link: the add-card consent says "card", but Link can fund renewals from a bank account (DEBT-501 item 7).
2. **Clinical disclaimer.** Should Terms § 3 delete or qualify "verify anything you rely on clinically"?
3. **Warranties, cap and refunds.** Should §§ 9–10 preserve the service and refund promises and statutory remedies? What should the cap be for a former payer whose twelve-month paid amount is zero?
4. **Venue.** Is § 11's New York forum enforceable? Which urgent-relief, limitations and statutory exceptions must its 30-day wait before a claim carry?
5. **Changes (F10).** How should § 7's feature changes, § 4's notice promise and § 13's continued-use assent be reconciled? Which non-price changes need renewed assent?
6. **Cancellation and deletion (F16).** Is period-end, non-refundable cancellation permissible nationwide? What warning should come before a deletion that ends prepaid access? Also:
   - does an emailed cancellation take effect when received (F04)?
   - what is the remedy for a missed statutory notice deadline (F01, F07)?
   - which renewal is the yearly one for a monthly plan (F02)?
7. **New York sales tax.** Is the subscription taxable prewritten software, an information service, or exempt education? Which registration must come before the first taxable sale?
8. **Intellectual property (added 2026-10-12).** AI agents wrote most of the code, and the question-drafting instructions (`content/drafts/questions/AGENTS.md`) address agents. The owner states the human authorship to counsel. What does the "All rights reserved" `LICENSE` protect? Should the question bank be registered, as text or as a compilation, before paid launch, for 17 U.S.C. § 412 remedies? Should "Addiction Boards" be registered as a trademark? Until a recorded source-rights review supports one, the Terms make no claim that every item is original or licensed (Terms decisions table).

**Standing owner rulings, until they have another home.**
- **2026-08-10, CAN-SPAM.** Email stays transactional until the owner decides otherwise. Classify each new template before it ships, and keep marketing out of required notices. A postal address and an opt-out come before any marketing email (#772).
- **2026-09-16.** The owner read the Terms in full and asked for no changes.

**Standing rules, until they have another home.** The Stripe rules moved to `docs/architecture/integrations/stripe.md` on 2026-11-15. The first three below belong in owner-adopted policy, so they move only with the owner's OK. The last moves with the next code change to its file.
- **Support log and refunds (F04, F14, F16).**
  - Keep a private log of each cancellation, privacy or refund request: when it arrived, the account match, the action, its basis and cutoff, and the confirmation.
  - Where the person has lost access to the account's email, accept proportionate alternative proof. Account recovery must not become an obstacle to cancelling.
  - On discontinuing the service, or terminating a subscriber without cause, refund the unused paid period from the actual end time. Apply any more favorable mandatory remedy, such as Delaware § 2735(c), and escalate a disputed tax or partial-day calculation.

  Proposed home: the support cancellation procedure.
- **Privacy copy.** A change to any practice the Privacy Policy states needs a Privacy Policy review in the same change. Never publish an absolute claim, such as "CCPA compliant" or "all state laws covered", that practice could contradict. Proposed home: the Privacy Policy's maintenance note, or the security program.
- **Annual state-law checklist (the old § 10).** At each annual review, and before a material data, pricing or geographic change, record:
  - revenue and state-consumer counts;
  - sale, share and targeted-advertising status;
  - sensitive and health data;
  - automated-decision use;
  - provider and cookie changes;
  - which notices, opt-outs or assessments are now required.

  Proposed home: the information security program's annual review.
- **`/privacy(.*)` and `/terms(.*)` are public by prefix** in `PUBLIC_ROUTE_PATTERNS` (accepted 2026-08-05). A new route under either must tighten the pattern or add a boundary test. Proposed home: a comment in `lib/public-routes.ts`.

## Verification

- [ ] F21 ships with its red tests.
- [ ] F07: Resend's log shows a 200 for a real report, and its notice's row reads `delivered` or `terminal_failure`.
- [ ] F19a, F19b and F19c are decided, and anything decided is built. F19d is answered.
- [ ] The support address and phone are replaced.
- [ ] F08's specimens and F14's facts are recorded.
- [ ] Q1–Q6 and Q8 are answered by counsel, and Q7 by a tax adviser or counsel.
- [ ] Support mailbox coverage is named.
- [ ] At closing, the conditional items (F09 and F12, the price-change machinery) become Waiting rows with their triggers, and the standing rulings and rules move to their homes.

## Related

- ADR-027: the shipped decisions and counsel's open questions.
- BUG-364: carries F22 (a trial cancelled in the portal is still offered "Add a card"). F22 closes with it.
- BUG-377 and DEBT-505: an operational alert reaching the owner. Before 2026-11-15 this record held that as an open limit.
- DEBT-501 item 7: the live purchase. It supplies F19c's specimen and starts F19a's decision.
- DEBT-511: notices go to the address Clerk verifies.
- GitHub issues: #902 (counsel), #903 (engineering and evidence), #1543 (the Resend webhook), #1544 (F19a and F19b), #772 (marketing email).
- [Support cancellation procedure](../policies/security/support-cancellation-procedure.md) and the [requeue guide](../guides/operations/requeue-renewal-notice.md).

Corrected 2026-11-15: rewritten as a live record of the open items. The finished build history is in git at `34d9aea0`: the spec, the stage reviews, the 2026-09-16 review tables, the remediation log and the earlier Corrected lines. Retitled from "Public Legal Pages, Renewal Consent, and Security-Program Closure". F22 moves to BUG-364, and the operator-alert limit to BUG-377 and DEBT-505. F23 is done, and so is the Georgia retrieval: ADR-027 cites the official code PDF (288ba0cf). F21's line references are updated, and its option to accept the gap is rejected. The Stripe public-details and out-of-band Session rules move to the Stripe integration doc. ADR-027's citations of this record's § 5 and § 7 refer to the text at `34d9aea0`.
