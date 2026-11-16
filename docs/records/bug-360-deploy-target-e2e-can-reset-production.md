# BUG-360: Deploy-Target E2E Can Reset Production

**Status:** Open — refuse every non-local E2E and integration target, the app server's included, and delete the remote mode (option 1)
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

E2E runs against any database once `ALLOW_NON_LOCAL_DATABASE_URL=true` is set, production included. Nothing identifies a production database: the preflight requires only a Stripe test-mode key (`sk_test_`), which works against any database. Pointed at production with the opt-in, global setup writes before any fixture check:
1. It upserts the shared test user and that user's Stripe customer and subscription rows.
2. The reset then republishes two placeholder fixtures, if both exist, even withdrawn ones.
3. It deletes the test user's practice data.
4. It inserts a fresh baseline.

Without the opt-in, the E2E code's own connections refuse a non-local host (#1584). The app server Playwright starts checks nothing. The integration lane keeps the same any-host opt-in.

## Evidence

- **The opt-in.** `tests/e2e/helpers/e2e-database-target.ts:31-33` accepts a loopback host, or any host when `ALLOW_NON_LOCAL_DATABASE_URL` is truthy. `scripts/test-lanes/e2e-local-orchestrator.ts:113-117` applies the same rule on the `pnpm test:e2e` path, and the preflight's `E2E_PREFLIGHT:DATABASE_URL_NOT_LOCAL` (`tests/e2e/helpers/credential-health-check.ts:554`) uses the first. The preflight checks only Stripe's key prefix (`:569`); the Clerk key is checked for validity, not mode.
- **Setup's first writes.** `tests/e2e/global.setup.ts:16-17` runs `seedTestSubscription` before `runE2EUserStateReset`. It upserts `users` by email (`tests/e2e/helpers/seed-test-user.ts:215-217`, `ON CONFLICT (email) DO UPDATE SET clerk_user_id`), so a production row holding the E2E email would be rebound to the test Clerk user. Then it writes `stripe_customers` (`:281`) and `stripe_subscriptions` (`:390-398`).
- **The reset** (`tests/e2e/helpers/reset-e2e-user-state.ts`). `ensurePlaceholderQuestionsPublished` (`:186-230`) throws `E2E_RESET:PLACEHOLDER_FIXTURES_MISSING` if either fixture is absent, after setup's subscription writes. Otherwise it publishes both, checking neither an active release nor a withdrawal. `clearUserState` (`:234-254`) deletes the user's practice data, and `seedDeterministicBaseline` (`:355-521`) inserts a new baseline.
- **The app server.** `playwright.config.ts:8-9` loads `.env.local` and `.env` without overriding exported variables, and the server command (`:88`, `pnpm build && pnpm start` outside CI) runs with that `DATABASE_URL`, unchecked. With `DATABASE_URL` unset, `next build` and `next start` would also read `.env.production(.local)`, which Playwright never loads. Playwright polls `/api/health` (`:104`) before setup runs, and the probe upserts a `rate_limits` row (`app/api/health/handler.ts:26`, `src/adapters/gateways/drizzle-rate-limiter.ts:107-118`). On 2026-10-19 `.env.local` named the Vercel Development database in every clone, and on 2026-11-15 the four numbered clones still name one shared Neon host, so that is where the probe writes. A `--no-deps` run of a spec that writes only through the app is not refused at all.
- **The integration opt-in.** `ALLOW_NON_LOCAL_DATABASE_URL=true` also admits any host in `tests/integration/setup.ts:46,61`, `tests/integration/helpers.ts:24-31`, `tests/integration/tag-taxonomy-census.integration.test.ts:17-24`, `tests/integration/actions.stripe.integration.test.ts:48-55` and `tests/integration/db.integration.test.ts:12-18`. `tests/shared/integration-database-host.ts:6-15` takes it as `allowNonLocal`. `docs/guides/testing/integration-tests.md:150-162` and `scripts/README.md:35` document it.
- **Nothing uses the remote mode.**
  - CI runs E2E and integration, and the hosted Checkout smoke runs E2E, against `localhost` (`.github/workflows/ci.yml:37,147,219`, `.github/workflows/stripe-hosted-checkout-smoke.yml:25,99`), and `pnpm test:e2e` resolves `127.0.0.1`. No workflow, package script or QA procedure sets the opt-in.
  - Only guide passages describe it, as an optional manual check: `docs/guides/testing/e2e-tests.md:231,239-249,504,520`, `docs/guides/release/promote-to-production.md:292-301` and `docs/architecture/environments.md:30,231-246`.
  - Its old purpose, catching a deployed database behind the migrations, is gone: deploys now migrate before they build.
  - A remote target must already hold both fixtures, and no seed can add them to a remote database since BUG-353's fix.
- **Not checked:** whether production holds the E2E email. No placeholder was published there on 2026-11-11 (BUG-353).

## Impact

With the opt-in, an operator's target mistake can write to production: the test user's subscription rows and the Clerk binding of any production row with the E2E email, that user's practice data, and, when both fixture rows exist, the visibility of two synthetic questions, withdrawn ones included. A remote integration run writes test rows into its target. Without the opt-in, the app server still writes to whatever `DATABASE_URL` names: the health probe's counter on every run, and whatever a `--no-deps` spec does through the app.

## Options

1. **Refuse every non-local target,** the app server's included, and delete the remote mode and its guide text.
2. Compare the target with Vercel Production's resolved database identity, and fail closed. Aliases, pooling endpoints and copied credentials make that hard to prove.
3. Stamp a production marker through the managed migration path, and refuse marked databases. Sticky, copied and missing markers each need a rule.

## Resolution (decided)

Option 1, decided 2026-11-15 by the reviewing session, at the owner's delegation of engineering calls for this review (records accuracy review, 2026-11-15). It replaces the lapsed 2026-10-25 owner decision on a fence: nothing runs the remote mode, so deleting it covers the risk with the least code. Options 2 and 3 would add identity machinery to keep a mode nobody uses.
- `tests/e2e/helpers/e2e-database-target.ts`: delete the opt-in (`:32-33`, `TRUTHY_ENV_VALUES`) and its remedy sentence (`:17-18`), so every non-loopback host is refused.
- `scripts/test-lanes/e2e-local-orchestrator.ts:113-117`: drop `allowNonLocal`. Keep `E2E_USE_EXISTING_DATABASE`, which CI uses with `localhost`.
- `playwright.config.ts:88`: run the same host check first in the server command, before `pnpm build` as well as `pnpm start`. It refuses an unset `DATABASE_URL` as well as a non-loopback one, since the server would otherwise fall back to `.env.production(.local)`. That stops a direct `pnpm exec playwright test` or a `--no-deps` run before the health probe writes. Not when the config loads: `playwright.config.test.ts` imports the config with whatever `.env.local` holds.
- The integration lane: remove the opt-in from the five integration files above, and the `allowNonLocal` parameter from `tests/shared/integration-database-host.ts`. Keep `INTEGRATION_USE_EXISTING_DATABASE`, which CI uses with `localhost`.
- Docs: delete the deploy-target and integration-override passages in the four guides above, update `scripts/README.md:35` to the single local-only rule, and remove the deploy-target wording from remedy text and test names.

## Verification

- [ ] Red first: the cases that accept a remote host with the opt-in become refusals: `tests/e2e/helpers/e2e-database-target.test.ts:30,57`, `scripts/test-lanes/e2e-local-orchestrator.test.ts:191`, `tests/e2e/helpers/credential-health-check.test.ts:356`, `tests/e2e/helpers/reset-e2e-user-state.test.ts:327` and `tests/shared/integration-database-host.test.ts:18`.
- [ ] Red first: the server-start check refuses an unset or remote `DATABASE_URL`, and `playwright.config.test.ts` pins that the server command runs it before `pnpm build` and `pnpm start`.
- [ ] Local and CI E2E and integration still pass.
- [x] Declined 2026-11-15 by the reviewing session, at the owner's delegation of engineering calls for this review: the owner's check for the two fixture rows. None was published on 2026-11-11 (BUG-353), and once option 1 ships no E2E run can reach production.
- [ ] The owner runs a read-only check in production for a `users` row with the shared E2E email, and for any `stripe_customers` or `stripe_subscriptions` rows linked to it, and records the result here. It shows only whether past harm happened, so it rides on the owner's pre-sale production reads and does not block the fix.

## Related

- BUG-353: the explicit seed flag, and the 2026-11-11 finding that no placeholder is published in production.
- DEBT-532: closed; its database-target "second rule" item moved here.

Corrected 2026-10-20: follow DEBT-532’s moved E2E planner and recheck its host-guard citation; the owner’s production-target decision is unchanged.

Corrected 2026-10-21: retain #1584’s partial E2E connection guard and recheck the moved host guard and updated preflight citations.

Corrected 2026-11-15: no workflow, script or QA procedure runs E2E or integration against a remote database, so option 1, decided by the reviewing session at the owner's delegation, replaces the lapsed 2026-10-25 owner decision. The preflight checks only Stripe's test mode, not Clerk's. The fix now covers the integration lane's opt-in in all its files (DEBT-532's "second rule" item), refuses an unset `DATABASE_URL`, and runs before `pnpm build`. Corrected the rate-limiter (`:107-118`), baseline (`:355-521`) and guide lines. The partial fix's build history is in git at 34d9aea0.
