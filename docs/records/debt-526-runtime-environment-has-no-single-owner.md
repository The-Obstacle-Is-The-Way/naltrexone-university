# DEBT-526: Which Environment the Code Runs In Is Decided in Many Places, by Different Rules

**Status:** Open — one runtime-environment module and a scan that bans other reads; fix the Clerk instance check that cannot fire
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

"Is this production?" and "is Clerk skipped?" have no single owner. Seven checks answer the first by four different rules, and eight sites read the Clerk skip switch raw. The rules agree on Vercel, where `VERCEL_ENV` is set, and disagree off it.

This family has been fixed before, in one file at a time:
- BUG-136 (the logger) and BUG-143 (Sentry) were the same inlined `NODE_ENV` mistake, fixed separately on the same day.
- DEBT-197 aligned `proxy.ts` on `VERCEL_ENV`. Two hours later, `dca45291`, a review-feedback commit, put the `NODE_ENV` fallback back.

The same pattern shows in four related places:
- **Clerk key pairing.** The check that the two Clerk keys come from one instance cannot fire on real keys, though the environments guide says it is enforced.
- **The env file.** CI's build and E2E server load `.env.test` as a hidden layer.
- **The site origin.** It has two owners.
- **Secret variables.** Their list has three owners.

## Evidence

**"Is this production?":**
- `lib/env.ts:163`: `VERCEL_ENV === 'production'`. Its comment at `:144-154` explains why `NODE_ENV` is unreliable: the build inlines it.
- `lib/env.ts:220-221`: production or preview.
- `proxy.ts:190-192`: `VERCEL_ENV`, else `NODE_ENV` when `VERCEL_ENV` is unset.
- `proxy.ts:269-274`: the `pk_live_` key prefix.
- `lib/logger.ts:6-8`: `test`, else `VERCEL_ENV || NODE_ENV`.
- `lib/request-ip.ts:3`: `NODE_ENV` only.
- `instrumentation.ts:17` and `lib/sentry-data-collection.ts` (`sentryEnvironmentFor`): `VERCEL_ENV`, else `'local'`.
- Further mode checks: `lib/db.ts:24`, `lib/report-client-error.ts:55`, `app/(app)/app/request-boundary.ts:4`.

**"Is Clerk skipped?":**
- `NEXT_PUBLIC_SKIP_CLERK` is read raw at `proxy.ts:186`, `lib/container.ts:66,75`, `components/providers.tsx:57`, `components/auth-nav.tsx:35`, `components/get-started-cta.tsx:24`, and both sign-in and sign-up page clients (`:15`).
- Only `lib/env.ts:233-234` and `proxy.ts:190-198` guard it, each with its own production rule.
- Off Vercel, they disagree. Take a `next start` of a skip build with no `VERCEL_ENV`: `env.ts` accepts the skip, and the components and container treat every visitor as signed out, while `proxy.ts` refuses the bypass and runs Clerk on dummy keys. Nothing serves that combination today.

**The Clerk instance check cannot fire:**
- `lib/env.ts:23-36` decodes the publishable key's middle part and requires `/^[a-z0-9-]+$/`.
- A real publishable key decodes to a host ending in `$`, such as `example-mole-12.clerk.accounts.dev$`, which fails the pattern, so the function returns null. A secret key carries no instance at all.
- So the comparison at `:198-209` never runs. Its test passes only on synthetic keys (`lib/env.test.ts:398-399`).
- `docs/architecture/environments.md` ("Clerk key pairing rule") says `lib/env.ts` validates both the environment type and the instance; only the type check (by prefix) works.

**`.env.test` loads in CI's build and app server:**
- `ci.yml:36` and `stripe-hosted-checkout-smoke.yml:24` set `NODE_ENV: test` for the job. Next then loads `.env.test` and skips `.env.local`, for both `next build` and `next start`.
- `.env.test:2` says it is for integration tests. It sets `NEXT_PUBLIC_SKIP_CLERK=true` (`:13`), `CLERK_WEBHOOK_SIGNING_SECRET=whsec_dummy` (`:17`) and `CRON_SECRET=cron_test_dummy` (`:30`).
- Only the step-level `NEXT_PUBLIC_SKIP_CLERK` values (`ci.yml:165,183`; the hosted workflow `:69,86`) keep the skip out of CI's E2E build. Removing one would ship a build without Clerk to E2E.

**Two owners of the site's origin:**
- `PUBLIC_SITE_ORIGIN` in `lib/public-routes.ts` feeds metadata, the sitemap and robots.
- `NEXT_PUBLIC_APP_URL` (`lib/env.ts`) feeds Stripe's return URLs and renewal-notice links.
- Nothing checks they agree in production. BUG-080 sent buyers to localhost through the second.

**Three lists of secret variables:**
- `SECRET_ENV_NAMES` in `lib/logger.ts:28-43`;
- the name pattern in `lib/logger.test.ts`;
- the sensitivity column in `environments.md`.

`SENTRY_DSN` is in the third, not the first.

**History:** BUG-002, BUG-136, BUG-143, DEBT-041, DEBT-129, DEBT-197 (environment and skip checks); BUG-040, BUG-064, BUG-079 (Clerk key pairing); BUG-080 (the app URL); DEBT-240 and DEBT-446 (database targets). BUG-327 and BUG-345 are open members of the same class.

## Impact

Nothing fails today on Vercel. The risk is the next consumer copying whichever check it finds first: a production-only branch, or a skip that holds in one layer and not another, which tests do not see. The dead Clerk check gives false confidence. P3.

## Options

1. **One `runtimeEnvironment()` module** keyed on `VERCEL_ENV`: it exports the deployment environment and the auth mode. Every reader imports it, and a source scan bans raw `VERCEL_ENV`, `NODE_ENV` and `NEXT_PUBLIC_SKIP_CLERK` reads elsewhere. *Recommended.*
   - Fix or delete the Clerk instance check: decode the host and compare it with the instance the secret key reports, or remove the claim from the guide.
   - Move the integration env file where Next does not load it, and give CI one declared env set.
   - In production, assert that `NEXT_PUBLIC_APP_URL`'s origin equals `PUBLIC_SITE_ORIGIN`.
   - Derive the logger's secret list from one registry.
2. **Align the four rules by hand.** DEBT-197 did, and it reverted the same night.

## Resolution (proposed)

Option 1, red first:
- the scan, failing on today's sites;
- a real-shaped Clerk key pair from two instances, which `env.ts` must refuse;
- a CI policy test that `.env.test` is not loaded by the build.

## Verification

- [ ] One module answers the deployment environment and the auth mode; a scan rejects other reads.
- [ ] Mismatched real-shaped Clerk keys fail `env.ts`, or the guide no longer claims the check.
- [ ] CI's build and server load no test-only env file.

## Related

- DEBT-197, BUG-136, BUG-143 (closed): the earlier one-file fixes.
- BUG-327 and BUG-345: open members of the environment-configuration class.
