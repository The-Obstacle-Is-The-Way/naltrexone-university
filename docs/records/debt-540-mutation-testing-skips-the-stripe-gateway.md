# DEBT-540: Mutation Testing Skips the Stripe Gateway

**Status:** Open — add `src/adapters/gateways/stripe/` to the weekly mutation run by waves, the checkout adapter first, after measuring the job's time with static mutants
**Priority:** P3
**Date:** 2026-11-25

---

## Summary

The weekly mutation run changes production code in small ways and reports each change no test notices. It covers the domain layer, the application layer's shared code and use cases, and one controller policy file. It does not cover `src/adapters/gateways/stripe/`, which holds checkout creation, the webhook processor and the webhook signature check. So nothing reports when a change to billing code weakens a test. A fix there gets a one-off check at best: BUG-343's option 9 got a scoped run on 2026-11-25, and nothing repeats it.

## Evidence

- **The scope.** `stryker.config.json`'s `mutate` list names `src/domain/**`, `src/application/shared/**`, `src/application/use-cases/**` and `src/adapters/controllers/shared/idempotency-error-policy.ts`. The mutation guide's scope rule admits any file the unit lane pins (`docs/guides/testing/mutation-testing.md`, section 2), and the unit lane pins most of the Stripe gateway through `FakeStripeCheckoutClient`.
- **A one-off baseline,** 2026-11-25, on the branch that built BUG-343's option 9: `pnpm exec stryker run --force --ignoreStatic --mutate` over the folder's production files, without its barrel and with a scratch incremental file. Stryker made 1,974 mutants. Leaving out 153 static ones it did not really test (next bullet), 1,821 remain: 1,471 killed, 5 timed out, 308 survived and 37 ran no test, which is 81.05%. It took six minutes on a nine-worker laptop.

  |File|Score|Survived|No test|
  |----|----:|----:|----:|
  |`stripe-checkout-sessions.ts`|75.82%|187|26|
  |`stripe-webhook-processor.ts`|81.24%|71|8|
  |`stripe-errors.ts`|82.80%|16|0|
  |`stripe-call-budget.ts`|79.59%|9|1|
  |`stripe-customers.ts`|86.00%|7|0|
  |`stripe-subscription-normalizer.ts`|88.16%|7|2|
  |`stripe-portal-configurations.ts`|90.77%|6|0|
  |`stripe-customer-subscriptions.ts`|90.91%|2|0|
  |`stripe-portal.ts`|86.67%|2|0|
  |`stripe-webhook-schemas.ts`|92.86%|1|0|

  Seven files scored 100%: `stripe-cancellation.ts`, `stripe-consent-state.ts`, `stripe-request-client.ts`, `stripe-request-limits.ts`, `stripe-retry.ts`, `stripe-subscription-status.ts` and `stripe-webhook-signature.ts`. The last two have 2 and 18 mutants that are not static.
- **Static mutants are unmeasured.** A static mutant changes code that runs once, when its file loads, such as a constant. A first run without `--ignoreStatic` counted 156 of them, 8% of the total, and Stryker estimated them at 97% of the run's test time: each runs every related test, about 1,730 here. It was stopped unfinished after about ten minutes. With `--ignoreStatic`, on Stryker 10.1.1, the run did not mark them ignored: it reported 153 as survived, with the note "Ran all tests for this mutant". Those results are not real. One of them removes `'active'` from the set of statuses that block a checkout, and making that change by hand fails 17 unit tests. The 153 sit in the webhook schemas (101), the status table (18), the signature check (16), the checkout adapter (11), customers (4) and portal configurations (3).
- **What the undetected mutants are.** Of the 345, 130 are changed strings or object literals; a rough count puts about 50 of those in log calls. The other 215 change conditions, operators, blocks, optional chaining, booleans and calls. Nobody has triaged them. A low score does not show a weak test by itself: the unit lane may not be where a behavior is pinned.
- **The weekly job's budget.** `.github/workflows/mutation.yml` allows 60 minutes. The three scheduled runs from 2026-11-09 to 2026-11-23 took 23, 18 and 20 minutes.
- **What triage finds.** During BUG-343, a run scoped to the changed checkout code left nine survivors in older lines. One group was a real gap, a guard no test pinned, now pinned by "leaves alone a Session the request set aside as ended, though the open listing still returns it". The rest were equivalent mutants, a log label, and one fallback no test reaches.

## Impact

A change to checkout, webhook or signature code can drop or weaken an assertion, and no report shows it. No defect is known to have come from this. The product has no paying customers yet; the code is the part that charges them.

## Options

1. **Add the whole folder to the weekly run now.** A few lines of configuration. The static mutants would probably take the job past its 60 minutes, and the report would gain 345 untriaged mutants at once.
2. **Add it by waves,** as DEBT-465 added the domain and application layers: one file or group at a time, each triaged by the guide's rules (a missing assertion gets a test, an equivalent mutant a suppression with its reason, dead code is deleted, a file pinned in another lane stays out), with files not yet triaged excluded by name. The checkout adapter goes first: it has the most undetected mutants and the most recent fixes.
3. **Ignore static mutants,** for the whole run or in a second configuration for adapters. It keeps the job short. It leaves the status sets and other constants that encode billing rules unmeasured, and on this Stryker version the flag reports them as survived, which reads as weak tests.
4. **Leave the scope, and run a scoped check by hand** when billing code changes. Nothing enforces it, and nothing repeats it.

## Resolution (decided)

Option 2, decided 2026-11-25 by the building session, after the owner asked it to weigh this gap and do what is best. Not built here: it is several pull requests of triage, and BUG-343's fix should not wait for them.

- **First pull request:** `stripe-checkout-sessions.ts` and `stripe-customer-subscriptions.ts` join `mutate`, triaged. Static mutants stay measured (option 3 is declined for them). A dispatched run of the weekly workflow on that branch measures the job's time; if it passes 60 minutes, the pull request raises `timeout-minutes` and says by how much. The run still never gates (ADR-019).
- **Later pull requests:** the webhook processor, then the rest of the folder, in the order of the table.
- **Until a file joins,** a change to it gets a run scoped to the changed lines, `pnpm exec stryker run --force --mutate "<file>:<first line>-<last line>"`, with its result in the pull request, as BUG-343's fix did.
- The guide's score table gains each file's baseline and triaged score as it joins.

## Verification

- [ ] `stripe-checkout-sessions.ts` and `stripe-customer-subscriptions.ts` are in `mutate`, with every survivor triaged and their scores in the guide's table.
- [ ] A hosted run of the weekly workflow with them finishes inside its time limit and passes its report-integrity check.
- [ ] The rest of `src/adapters/gateways/stripe/` joins the same way, or a file is left out with the lane that pins it named.

## Related

- DEBT-465 (closed): the waves that brought the domain and application layers to the weekly run. Its Waiting row covers the QA procedures, not this.
- BUG-343: the fix whose scoped run showed the gap.
- ADR-019: mutation scores are reports and never gate.
