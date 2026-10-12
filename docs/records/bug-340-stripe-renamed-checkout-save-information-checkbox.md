# BUG-340: Stripe Renamed Checkout's Save-Information Checkbox, So the Hosted Smoke Cannot Submit

**Status:** Verifying — the next scheduled hosted Checkout run on `main` passes after promotion; due 2026-10-19
**Priority:** P2
**Date:** 2026-10-12

---

## Summary

The hosted Checkout smoke drives Stripe's own Checkout page. Its helper unticks Stripe's "Save my information for faster checkout" box, because a ticked box makes Stripe ask for a phone number. On 2026-10-12 Stripe renamed the box "Save my information with Link for faster checkout". The helper's name match no longer finds it, so the box stays ticked and the phone field stays empty and invalid. Stripe then refuses to submit, and two of the seven hosted journeys time out on its page.

## Evidence

- **Main's scheduled run failed** on 2026-10-12 at 19:09Z (run 38295768828). The paid annual checkout and the trial add-card journeys both stopped on Stripe's page. The four earlier daily runs, 2026-10-08 to 10-11, passed.
- **Local gates.** The hosted lane passed on this branch at 17:48Z, then failed the same two journeys at 19:12Z, at 19:16Z and at 19:21Z. The last run had no other E2E or CI run beside it. This branch changes nothing in Checkout or the app.
- **What the page showed** in both failures:
  - `checkbox "Save my information with Link for faster checkout" [checked]`;
  - an empty `textbox "Phone number" [invalid]`;
  - the test card filled in.
- **The helper** (`tests/e2e/helpers/stripe-hosted-checkout.ts`, since e78e34a1 on 2026-09-29) looks for the role name "Save my information for faster checkout". Playwright matches a role name as a substring, ignoring case, and the inserted "with Link" breaks the match.

## Impact

- **Tests.** The scheduled hosted Checkout smoke on `main` fails, and so does every local gate's hosted lane, until the helper is fixed. Required PR E2E is not affected, because it stops at Stripe's origin.
- **Users: no new effect.** The box was already ticked by default under its old name, so customers see the same choice under a new label.

## Options

1. **Match the box by both labels, and untick it after filling the card as well.** It is test-only and keeps the journey Stripe's real one. *Chosen.*
2. **Turn Link off for the test account's Checkout.** That is a dashboard setting, and the owner's call, and the test account would then differ from live.
3. **Type a test phone number.** That would sign the shared E2E email up for Link, which changes later runs.

## Resolution (decided)

Option 1. The helper finds the box with a pattern that accepts both labels, "Save my information (with Link) for faster checkout", and unticks it both before and after filling the card, since Stripe can show the box once the card is entered. The hosted journeys, red three times on 2026-10-12, are the proof.

## Verification

- [x] With the fix, the hosted lane passed 7 of 7 locally (2026-10-12, 19:24Z), after three red runs.
- [ ] The scheduled hosted Checkout run on `main` passes after promotion, due 2026-10-19.

## Related

- BUG-308: the same helper, and the same Session's prefilled email.
