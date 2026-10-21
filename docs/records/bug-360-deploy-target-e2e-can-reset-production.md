# BUG-360: Deploy-Target E2E Can Reset Production

**Status:** Blocked — owner chooses a production-target fence for deploy-target E2E; due 2026-10-25
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

Nothing in the E2E setup identifies a production database.
- Every E2E database connection now refuses a non-local host, on any entry path, unless `ALLOW_NON_LOCAL_DATABASE_URL=true` is set (fixed in part; see below).
- With that opt-in, any host is accepted, production included.
- The preflight requires Stripe and Clerk test-mode credentials, but those do not identify the database.

Pointed at production with the opt-in, global setup writes before any fixture check:
1. It upserts the shared test user and that user's Stripe customer and subscription rows.
2. The reset then republishes two placeholder fixtures, if both exist, even withdrawn ones.
3. It deletes the test user's practice data.
4. It inserts a fresh baseline.

This is separate from BUG-353's ambient seed flag, and remains after that fix.

Corrected 2026-10-19: every E2E database connection now refuses a non-local host without the opt-in; the opt-in path remains.

## Evidence

- **The host check.**
  - `scripts/e2e-local-orchestrator.ts:137-143` checks the URL's host on the `pnpm test:e2e` path.
  - `playwright.config.ts:8` loads `.env.local` without overriding exported variables, so before the partial fix a direct `pnpm exec playwright test` reached setup with whatever `DATABASE_URL` was there, unchecked.
  - Both paths now refuse a non-local host unless `ALLOW_NON_LOCAL_DATABASE_URL=true`, which admits any host.
- **The preflight.** It refuses a non-test Stripe key (`tests/e2e/helpers/credential-health-check.ts:550-557`). Test-mode keys work against any database, so passing it does not prove a non-production target.
- **Setup's first writes.** `tests/e2e/global.setup.ts:16-17` runs `seedTestSubscription` before `runE2EUserStateReset`. That step:
  - upserts `users` by email (`tests/e2e/helpers/seed-test-user.ts:214-216`, `ON CONFLICT (email) DO UPDATE SET clerk_user_id`);
  - then writes `stripe_customers` (`:280`) and `stripe_subscriptions` (`:389-397`).

  A production row holding the E2E email would be rebound to the test Clerk user.
- **The reset** (`tests/e2e/helpers/reset-e2e-user-state.ts`):
  - **Fixture check and republish.** `ensurePlaceholderQuestionsPublished` (`:186-218`) counts the two slugs in `REQUIRED_QUESTION_SLUGS`, and throws `E2E_RESET:PLACEHOLDER_FIXTURES_MISSING` if either is absent. That is after setup's subscription writes. Otherwise it sets any non-published status to `published`. It does not check an active release or a recorded withdrawal; the seed refuses to reactivate a withdrawn question (`scripts/seed/question-syncer.ts:226-231`).
  - **Deletes.** `clearUserState` (`:233-253`) deletes the user's idempotency keys, attempts, bookmarks and practice sessions.
  - **Inserts.** `seedDeterministicBaseline` (`:354-507`) inserts a session, its question states, two attempts and a bookmark.
- **The guides.** The deploy-target examples in the E2E and promotion guides read a URL from `.env.local`, and that file does not prove a non-production identity.
- **How this was checked.** From the source and the existing reset tests only. No production connection or production reproduction was attempted. Whether production holds the E2E email or the two fixture rows is unknown; the fixtures belong to BUG-353's owner census.

## Fixed in part

Before this fix, only `pnpm test:e2e` checked the host. A direct `pnpm exec playwright test`, or a `--no-deps` run whose specs reset the test user, reached the database that `.env.local` names. On 2026-10-19 that was the Vercel Development database in every clone; it was compared against Vercel's Production and Development variables without printing either.

- **The guard.** `guardE2EDatabaseUrl` in `tests/e2e/helpers/e2e-database-target.ts` wraps every `postgres(...)` the E2E code opens. It refuses a non-local host without the opt-in, naming the host but no credentials.
- **The preflight.** It refuses one with `E2E_PREFLIGHT:DATABASE_URL_NOT_LOCAL` before any validator connects.
- **The scan.** `tests/e2e-database-connections.test.ts` fails on any unguarded connection.
- **The remedy text.** The preflight and reset no longer tell anyone to put `DATABASE_URL` in `.env.local`.

What remains:
- **The opt-in path.** A deploy-target check still accepts production, and that needs the owner's fence below.
- **The app server.** The server Playwright starts reads the same `DATABASE_URL`. Global setup now stops a normal run first, but a deliberate `--no-deps` run of a spec that writes only through the app is not refused. A check inside the server's start command would close it; guarding the URL when the config loads would not, because `playwright.config.test.ts` imports the config with whatever `.env.local` holds.

## Impact

With the opt-in set, an operator's target mistake can write to production:
- the test user's subscription rows, and the Clerk binding of any production row that holds the E2E email;
- that user's practice data;
- and, when both fixture rows exist, the visibility of two synthetic questions, withdrawn ones included.

A published row alone does not prove this reset published it, or that a learner saw it. Reads select published questions, and an active release does not fence this direct status change.

## Options

1. **Refuse every remote E2E target.** Simple, but it removes the deploy-target capability the guides document; the owner decides whether to keep it.
2. **Compare the target with Vercel Production's resolved database identity,** and fail closed if the comparison cannot be made. The environment seeds' exclusion is a starting point. It is not proof that aliases, pooling endpoints or copied credentials are covered.
3. **Have the managed migration path stamp a production marker,** and refuse marked databases. Before relying on it, define what happens with sticky markers, permissions, unstamped databases and cloned branches. A copied production marker should fail closed until someone authorized reclassifies the database as non-production.

## Resolution (proposed)

The owner decides whether deploy-target E2E remains, and which identity mechanism to use. Wherever the fence goes, it must run in Playwright's setup before `seedTestSubscription`, so that the direct Playwright path is covered too, not only the `pnpm test:e2e` wrapper. Until then, both guides forbid production targets. A warning alone does not close this record.

## Verification

- [ ] Red-first proof that the chosen fence refuses production before global setup's first write, on both `pnpm test:e2e` and a direct `pnpm exec playwright test`, including when both fixture rows exist.
- [ ] Local E2E still passes. Any remote mode that is kept has explicit non-production identity tests.
- [ ] The owner checks whether production has the fixture rows, and records the result through BUG-353's census.
- [ ] The owner runs a read-only check in production for a `users` row with the shared E2E email, and for any `stripe_customers` or `stripe_subscriptions` rows linked to it, and records the result here.

## Related

- BUG-353: the explicit seed flag and the production fixture census.
- #1560: the scripts directory audit, whose debt record covers database-target policy duplication.
