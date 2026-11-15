# BUG-360: Deploy-Target E2E Can Reset Production

**Status:** Open — refuse every non-local E2E target, the app server's included, and delete the remote mode (option 1)
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

E2E runs against any database once `ALLOW_NON_LOCAL_DATABASE_URL=true` is set, production included. Nothing identifies a production database: the preflight requires Stripe and Clerk test-mode credentials, and those work against any database. Pointed at production with the opt-in, global setup writes before any fixture check:
1. It upserts the shared test user and that user's Stripe customer and subscription rows.
2. The reset then republishes two placeholder fixtures, if both exist, even withdrawn ones.
3. It deletes the test user's practice data.
4. It inserts a fresh baseline.

Without the opt-in, the E2E code's own connections refuse a non-local host (#1584). The app server Playwright starts checks nothing.

## Evidence

- **The opt-in.** `tests/e2e/helpers/e2e-database-target.ts:31-33` accepts a loopback host, or any host when `ALLOW_NON_LOCAL_DATABASE_URL` is truthy. `scripts/test-lanes/e2e-local-orchestrator.ts:113-117` applies the same rule on the `pnpm test:e2e` path, and the preflight's `E2E_PREFLIGHT:DATABASE_URL_NOT_LOCAL` (`tests/e2e/helpers/credential-health-check.ts:554`) uses the first.
- **Setup's first writes.** `tests/e2e/global.setup.ts:16-17` runs `seedTestSubscription` before `runE2EUserStateReset`. It upserts `users` by email (`tests/e2e/helpers/seed-test-user.ts:215-217`, `ON CONFLICT (email) DO UPDATE SET clerk_user_id`), so a production row holding the E2E email would be rebound to the test Clerk user. Then it writes `stripe_customers` (`:281`) and `stripe_subscriptions` (`:390-398`).
- **The reset** (`tests/e2e/helpers/reset-e2e-user-state.ts`). `ensurePlaceholderQuestionsPublished` (`:186-231`) throws `E2E_RESET:PLACEHOLDER_FIXTURES_MISSING` if either fixture is absent, after setup's subscription writes. Otherwise it publishes both, checking neither an active release nor a withdrawal. `clearUserState` (`:234-254`) deletes the user's practice data, and `seedDeterministicBaseline` (`:355-521`) inserts a new baseline.
- **The app server.** `playwright.config.ts:8` loads `.env.local` without overriding exported variables, and the server command (`:88`) runs with that `DATABASE_URL`, unchecked. Playwright polls `/api/health` (`:104`) before setup runs, and the probe upserts a `rate_limits` row (`app/api/health/handler.ts:26`, `src/adapters/gateways/drizzle-rate-limiter.ts:107-118`). A `--no-deps` run of a spec that writes only through the app is not refused at all.
- **Nothing uses the remote mode.**
  - CI and the hosted Checkout smoke run E2E against `localhost` (`.github/workflows/ci.yml:37,219`, `.github/workflows/stripe-hosted-checkout-smoke.yml:25,99`), and `pnpm test:e2e` resolves `127.0.0.1`. No workflow, package script or QA procedure sets the opt-in for E2E.
  - Only three guide passages describe it, as an optional manual check: `docs/guides/testing/e2e-tests.md:231,239-247`, `docs/guides/release/promote-to-production.md:292-301` and `docs/architecture/environments.md:30,231-244`.
  - Its old purpose, catching a deployed database behind the migrations, is gone: deploys now migrate before they build.
  - A remote target must already hold both fixtures, and no seed can add them to a remote database since BUG-353's fix.
- **Not checked:** whether production holds the E2E email or the two fixture rows. No placeholder was published there on 2026-11-11 (BUG-353).

## Impact

With the opt-in, an operator's target mistake can write to production: the test user's subscription rows and the Clerk binding of any production row with the E2E email, that user's practice data, and, when both fixture rows exist, the visibility of two synthetic questions, withdrawn ones included. Without it, the app server still writes to whatever `DATABASE_URL` names: the health probe's counter on every run, and whatever a `--no-deps` spec does through the app.

## Options

1. **Refuse every non-local E2E target,** the app server's included, and delete the remote mode and its guide text.
2. Compare the target with Vercel Production's resolved database identity, and fail closed. Aliases, pooling endpoints and copied credentials make that hard to prove.
3. Stamp a production marker through the managed migration path, and refuse marked databases. Sticky, copied and missing markers each need a rule.

## Resolution (decided)

Option 1, chosen 2026-11-15. The open question was whether deploy-target E2E stays; nothing runs it, so deleting it covers the risk with the least code. Options 2 and 3 would add identity machinery to keep a mode nobody uses.
- `tests/e2e/helpers/e2e-database-target.ts`: delete the opt-in (`:32-33`, `TRUTHY_ENV_VALUES`) and its remedy sentence, so every non-loopback host is refused.
- `scripts/test-lanes/e2e-local-orchestrator.ts:113-117`: drop `allowNonLocal`. Keep `E2E_USE_EXISTING_DATABASE`, which CI uses with `localhost`.
- `playwright.config.ts:88`: run the same host check before the server command, so a direct `pnpm exec playwright test` or a `--no-deps` run refuses before the health probe writes. Not when the config loads: `playwright.config.test.ts` imports the config with whatever `.env.local` holds.
- Delete the deploy-target passages in the three guides and `scripts/README.md:35`, and the deploy-target wording in remedy text and tests.
- Retire the same any-host opt-in from the integration lane in the same pull request (`tests/integration/helpers.ts:24-29`, `tests/integration/setup.ts:46`, and the integration half of `scripts/README.md:35`). Nothing uses it either, since CI's integration run uses `localhost`, and a remote run writes test rows into its target. This settles DEBT-532's "second rule" item. Red tests: the integration helper refuses a remote host even with the variable set.

## Verification

- [ ] Red first: the cases that accept a remote host with `ALLOW_NON_LOCAL_DATABASE_URL=true` become refusals: `tests/e2e/helpers/e2e-database-target.test.ts:57`, `scripts/test-lanes/e2e-local-orchestrator.test.ts:191`, `tests/e2e/helpers/credential-health-check.test.ts:356` and `tests/e2e/helpers/reset-e2e-user-state.test.ts:327`.
- [ ] Red first: the server-start check refuses a remote `DATABASE_URL` before the server starts, and `playwright.config.test.ts` pins that the server command runs it.
- [ ] Local and CI E2E still pass.
- [x] Declined 2026-11-15 by the reviewing session, at the owner's delegation: the owner's check for the two fixture rows. None was published on 2026-11-11 (BUG-353), and once option 1 ships no E2E run can reach production.
- [ ] The owner runs a read-only check in production for a `users` row with the shared E2E email, and for any `stripe_customers` or `stripe_subscriptions` rows linked to it, and records the result here. It shows only whether past harm happened, so it rides on the owner's pre-sale production reads and does not block the fix.

## Related

- BUG-353: the explicit seed flag, and the 2026-11-11 finding that no placeholder is published in production.
- DEBT-532: its database-target "second rule" item ends with this fix.

Corrected 2026-10-20: follow DEBT-532’s moved E2E planner and recheck its host-guard citation; the owner’s production-target decision is unchanged.

Corrected 2026-10-21: retain #1584’s partial E2E connection guard and recheck the moved host guard and updated preflight citations.

Corrected 2026-11-15: no workflow, script or QA procedure runs E2E against a remote database, so option 1 replaces the lapsed 2026-10-25 owner decision; the Resolution names the files and tests. Corrected the rate-limiter (`:107-118`) and baseline (`:355-521`) lines. The partial fix's build history is in git at 34d9aea0. The integration lane's identical opt-in is retired in the same fix.
