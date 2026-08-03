# Addiction Boards Incident Response and Breach Notification Procedure

> **STATUS: DRAFT FOR OWNER VERIFICATION AND ADOPTION — 2026-07-29.** This procedure supports the Information Security Program and the New York SHIELD Act. It must not be marked adopted until provider contacts, account access, and notification logistics are tested. It is not legal advice.

## 1. Owner and contact

**Incident lead and decision owner:** John H. Jung, MD, MS
**Internal contact:** `support@addictionboards.com`
**Out-of-band contact (required before adoption):** record a tested non-email owner contact (e.g., mobile number) for use when the support mailbox, its forwarding chain, or the email provider is itself compromised or unavailable — an email-provider incident must not sever the incident channel.
**Evidence log:** create a private, access-restricted incident record; do not put personal information, live secrets, or exploit details in a public GitHub issue. Record a **secure backup location** for the evidence log that does not depend on the potentially compromised system. Test both the out-of-band contact and the backup evidence location during the adoption tabletop.

The incident lead may delegate technical containment, forensics, provider coordination, and notification drafting, but retains the decision log and deadline.

## 2. Trigger and immediate actions

Start this procedure on suspected unauthorized access, acquisition, disclosure, alteration, loss, or destruction of personal/private information; credential or secret compromise; material availability/integrity failure; or a provider breach notice.

Immediately:

1. Record discovery time, reporter, affected system, and known facts.
2. Preserve relevant logs, provider notices, timestamps, and configuration state.
3. Contain the incident without destroying evidence: revoke exposed sessions/keys, restrict access, isolate a deployment/device, or disable a vulnerable path as appropriate.
4. Do not use destructive production/database operations without resolving the exact target and preserving necessary evidence.
5. Open provider support/security cases through verified channels.
6. Start the notification-deadline log at the earliest documented time the breach was discovered or a provider notified the operator of it. Later scope, impact, or legal analysis must not move that clock forward. Correct the timestamp only when evidence proves the original entry mistaken, and preserve the original entry, correction, reason, and supporting evidence.
7. Continue service only where safe; prioritize account/payment protection and reliable communication.

## 3. Triage record

Document:

- systems, providers, accounts, and time range;
- categories and approximate number of people/records;
- whether data was encrypted and whether a key was also exposed;
- evidence of access, viewing, copying, alteration, acquisition, or misuse;
- affected states/countries;
- whether online credentials, financial access data, medical information, biometrics, or other regulated data are involved;
- containment and recovery actions;
- provider findings and notification obligations;
- who made each decision, when, and on what evidence.

Do not close on “no evidence of misuse” alone. Record what evidence was available and its limits.

## 4. Severity and escalation

- **SEV-1:** confirmed or reasonably likely private-information access/acquisition; active credential/payment abuse; broad production compromise; destructive or unrecoverable event. Immediate owner/provider coordination and same-day notification analysis.
- **SEV-2:** suspected limited access, exposed secret, authorization defect, lost encrypted device, or provider incident with unresolved data impact. Same-day containment and analysis.
- **SEV-3:** blocked attempt, low-impact security defect, or near miss with no unauthorized data access. Fix and record; reassess if facts change.

Any incident involving an under-13 child, patient/health information, payment-card data, law enforcement, or multiple jurisdictions requires focused legal review of the notification decision.

## 5. New York decision path

New York “private information” includes personal information combined with specified financial, biometric, medical, or health-insurance information, and a username or email address combined with a password or security question/answer that permits online-account access.

For New York residents:

1. Decide whether private information was or is reasonably believed to have been accessed or acquired without valid authorization.
2. If yes, notice is due in the most expedient time possible without unreasonable delay and no later than 30 days after discovery, subject only to the statutory law-enforcement delay.
3. Notify the New York Attorney General, Department of State, and Division of State Police as required, without delaying resident notice. The regulator submission must state the **timing, content, and distribution** of the resident notice and the **approximate number of New York residents affected**, and must include **a copy of the template resident notice**. Notify the Department of Financial Services only if the operator is a covered entity under the cited rule; current status must be verified.
4. If more than 5,000 New York residents are to be notified **at one time**, notify consumer reporting agencies as to the timing, content, and distribution of the notices and the approximate number affected, without delaying resident notice (§ 899-aa(8)(b) — the "at one time" qualifier is statutory; separately batched notices below that threshold do not trigger this duty).
5. Preserve the notice, the template copy submitted to regulators, recipient/distribution record, regulator submissions, relevant state/federal breach-response contact records, and decision evidence. Test the regulator submission paths (portals/forms) during the adoption tabletop, and record them in the adoption checklist.

If the exposure was an inadvertent disclosure by an authorized person and the owner reasonably determines it is unlikely to cause misuse, financial harm, or—in the online-credential case—emotional harm, document the determination in writing and retain it for at least five years. If more than 500 New York residents are affected by that no-notice determination, provide it to the Attorney General within 10 days.

## 6. Notice content and delivery

A New York resident notice must include:

- business contact information;
- the relevant state/federal agency telephone numbers and websites for breach response and identity-theft protection; and
- the categories and specific elements of personal/private information reasonably believed accessed or acquired.

Use a permitted delivery method and keep the required log. **Credential-breach delivery exception — statutory scope (§ 899-aa(5)(d)(1), corrected 2026-08-03 against the codified text):** this exception applies to the **email component of substitute notice** only, and only when the breached information includes **an e-mail address in combination with a password or security question and answer that would permit access to the online account** — in that case, instead of emailing the compromised address, provide clear and conspicuous notice delivered to the consumer online when connected to the account from an IP address or online location the business knows the consumer customarily uses. A username-plus-password breach without an email address still counts as private information under the § 899-aa(1)(b) definition used in § 5 above, but does not trigger this specific delivery substitution. *(An earlier revision extended this delivery rule to non-email usernames on a review suggestion; the codified 5(d)(1) text is email-specific and the wording was narrowed back.)*

Other states may impose different definitions, deadlines, regulator notices, content, credit-monitoring, or attorney-general forms. Build a state-by-state affected-resident matrix before sending.

## 7. Recovery and post-incident review

Before closure:

- eradicate the cause and rotate affected credentials;
- restore from known-good state and validate integrity;
- verify access controls, monitoring, and deletion/retention impact;
- notify affected people/providers/regulators as decided;
- preserve the decision and notification record;
- add tests or controls that would prevent/detect recurrence;
- update the data inventory, provider review, Privacy Policy, and Information Security Program if facts changed;
- schedule a 30-day follow-up for incomplete provider or user actions.

## 8. Exercise and adoption record

Before adoption, run a tabletop using an exposed Clerk or operator credential and a second scenario involving Sentry/provider logs. Verify provider contact channels, owner account access, regulator-form locations, the 30-day clock, resident notice content, and evidence storage.

| Date | Action | Owner | Result/open exceptions |
|---|---|---|---|
| 2026-07-29 | Non-lawyer draft created from repository evidence and N.Y. GBL §§ 899-aa/899-bb | Codex audit; not adopted | Provider contacts, account settings, and tabletop remain open |

**Owner adoption:** `[DATE / SIGN-OFF / OPEN EXCEPTIONS]`

## Sources

- [New York General Business Law § 899-aa](https://www.nysenate.gov/legislation/laws/GBS/899-AA)
- [New York General Business Law § 899-bb](https://www.nysenate.gov/legislation/laws/GBS/899-BB)
