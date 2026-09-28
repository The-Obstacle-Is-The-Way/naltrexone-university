# Support Cancellation Procedure

**Status:** Adopted 2026-09-28 (DEBT-414 F04)
**Owner:** the support coordinator named in the [information security program](./information-security-program.md)
**Applies to:** requests to cancel a subscription sent to support@addictionboards.com

The Terms of Service offer two ways to cancel: the Billing page, which opens Stripe's Billing portal, and email to support from the address on the account (Terms § 4, "How to cancel"). This procedure makes the email route as dependable as the portal. It also gives a learner who can no longer reach the account's email address a verified way to cancel. Cancellation is never withheld to make a retention offer, and no call or live chat is required.

## 1. Request from the account's email address

A `From` header can be forged, so a matching address alone is not proof (#1179 review).

1. Find the account in Clerk by the sender's address, and its customer in the Stripe Dashboard.
2. Confirm control of the mailbox. Write a **new** message to the account's address, not a reply to the request, asking the learner to reply to confirm the cancellation. Act only on a reply that comes from that mailbox. The request still takes effect as of when it was received (§ 3).
3. In Stripe, cancel the subscription **at the end of the current period** (or trial). Do not cancel immediately unless the learner asks for that.
4. Reply in writing, to the account's address, confirming:
   - that the cancellation is recorded;
   - the date service ends;
   - that access continues until then;
   - that no further charges will be made.

   This reply is the learner's retainable confirmation.
5. Complete these steps within **one business day** of receiving the confirmation.

## 2. Locked-out request from another address

When the request comes from an address other than the account's, verify before acting. Never disclose account details while doing so.

1. Ask for **both** of the following, and check each against the Stripe customer. Facts about the account alone (its email address, when it started) do not prove control of it and are not accepted (#1179 review).
   - the card brand and last four digits of the payment method;
   - the date and amount of the most recent charge.
2. If both match, cancel as in § 1 (steps 3–4), and send the confirmation to **both** the requesting address and the account's address. The account's owner therefore learns of it even if the request was not theirs, and can undo it from the Billing page.
3. If they do not match, do not cancel. Explain which facts are needed, and keep the request open.
4. A trial with no payment method needs no cancellation, because it ends without a charge. Tell the learner so, and send the same note to the account's address.

## 3. Timing and charges

- A verified request takes effect as of when it was **received**, not when it was processed.
- If a renewal charge posts after a timely, verified request, refund that charge in full. This is company policy, whatever the law requires in a given state. Counsel has not yet confirmed the legal rule (DEBT-414 is engineering evidence, not legal sign-off), so this procedure does not rest on it (#1179 review).

## 4. Record

For every request, keep a note of:
- when the request was received;
- the sender's address;
- the verification route (the mailbox confirmation, or the two payment facts checked, without recording the facts themselves);
- the action taken in Stripe and when;
- when the confirmation was sent.

Keep these notes for as long as renewal-consent evidence is kept (at least three years).

## Related

- [DEBT-414 F04](../debt/debt-414-public-legal-pages-privacy-terms.md): completed-cancellation evidence for the Billing portal and this email path.
- [Terms of Service](../legal/terms-of-service.md) § 4.
