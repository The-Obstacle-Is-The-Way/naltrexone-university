# DEBT-526: Which Environment the Code Runs In Is Decided in Many Places, by Different Rules

**Status:** Open — share explicit environment policies without conflating build, deployment, proxy trust or vendor mode; replace the ineffective Clerk pairing check and prove CI configuration
**Priority:** P3
**Date:** 2026-10-17

---

Corrected 2026-10-17: separated intentionally different environment policies, corrected CI receipts and build/runtime behavior, and withdrew the unsupported blanket DSN decision.

## Summary

Deployment environment and Clerk bypass policy are read in several places. Eight production expressions read `NEXT_PUBLIC_SKIP_CLERK` directly. The startup and middleware bypass guards disagree off Vercel. Other checks deliberately answer different questions: build mode, live Clerk instance, trusted proxy headers and telemetry labeling. Consolidation must preserve those distinctions.

This family has been fixed before, in one file at a time:
- BUG-136 (the logger) and BUG-143 (Sentry) were the same inlined `NODE_ENV` mistake, fixed separately on the same day.
- DEBT-197 aligned `proxy.ts` on `VERCEL_ENV`. Two hours later, `dca45291`, a review-feedback commit, added a `NODE_ENV` fallback for hosts without `VERCEL_ENV`, so `proxy.ts` again differs from `lib/env.ts` off Vercel.

The same pattern shows in four related places:
- **Clerk key pairing.** The check that the two Clerk keys come from one instance cannot fire on real keys, though the environments guide says it is enforced.
- **The env file.** CI's build and E2E server load `.env.test` as a hidden layer.
- **The site origin.** It has two owners.
- **Configuration visibility and log redaction.** Their classifications are partly independent and need explicit rules.

## Evidence

**Environment-dependent policies, an illustrative inventory rather than equivalent predicates:**
- `lib/env.ts:163`: `VERCEL_ENV === 'production'`. Its comment at `:144-154` explains why `NODE_ENV` is unreliable: the build inlines it.
- `lib/env.ts:220-221`: production or preview.
- `proxy.ts:190-192`: `VERCEL_ENV`, else `NODE_ENV` when `VERCEL_ENV` is unset.
- `proxy.ts:269-274,298-302,337-339`: the `pk_live_` prefix selects live Clerk allowance protection, deliberately independent of deployment environment (BUG-323/DEBT-503).
- `lib/logger.ts:6-8`: `test`, else `VERCEL_ENV || NODE_ENV`.
- `lib/request-ip.ts:3-9`: `NODE_ENV` controls trusted proxy-header handling. Replacing it with Vercel-production detection would change Preview trust.
- `instrumentation.ts:17` and `lib/sentry-data-collection.ts` (`sentryEnvironmentFor`): `VERCEL_ENV`, else `'local'`.
- Build-mode checks, correctly on `NODE_ENV`: `lib/db.ts:24` (the hot-reload cache), `lib/report-client-error.ts:55` (a development console line) and `app/(app)/app/request-boundary.ts:4` (skipped in tests). A single module must keep build mode separate from the deployment environment.

**"Is Clerk skipped?":**
- `NEXT_PUBLIC_SKIP_CLERK` is read raw at `proxy.ts:186`, `lib/container.ts:66,75`, `components/providers.tsx:57`, `components/auth-nav.tsx:35`, `components/get-started-cta.tsx:24`, and both sign-in and sign-up page clients (`:15`).
- Only `lib/env.ts:233-234` and `proxy.ts:190-198` guard it, each with its own production rule.
- With no `VERCEL_ENV`, the env validator permits a skip build, while middleware with compiled production `NODE_ENV` refuses that bypass. Direct skip consumers still treat visitors as signed out. With missing or dummy Clerk keys, authentication can fail. This is a source-derived mismatch, not a reproduced failure of a deployed configuration.

**The Clerk instance check cannot fire:**
- `lib/env.ts:23-36` decodes the publishable key's middle part and requires `/^[a-z0-9-]+$/`.
- A real publishable key decodes to a host ending in `$`, such as `example-mole-12.clerk.accounts.dev$`, which fails the pattern, so the function returns null. A secret key carries no instance at all.
- So the comparison at `:198-209` never runs. Its test passes only on synthetic keys (`lib/env.test.ts:398-399`).
- `docs/architecture/environments.md` ("Clerk key pairing rule") says `lib/env.ts` validates both the environment type and the instance; only the type check (by prefix) works.

**`.env.test` loads in CI's build and app server:**
- `ci.yml:36` and `stripe-hosted-checkout-smoke.yml:24` set `NODE_ENV: test` for the job. Next then loads `.env.test` and skips `.env.local`, for both `next build` and `next start`.
- `.env.test:2` says it is for integration tests. It sets `NEXT_PUBLIC_SKIP_CLERK=true` (`:13`), `CLERK_WEBHOOK_SIGNING_SECRET=whsec_dummy` (`:17`) and `CRON_SECRET=cron_test_dummy` (`:30`).
- The Build overrides (`.github/workflows/ci.yml:181`; hosted workflow :69) prevent compiling `.env.test`'s bypass into the bundle. The E2E overrides (`ci.yml:199`; hosted :86) align runtime validation. Removing only the runtime override cannot rewrite the already compiled public flag. The installed Next env loader was probed with `NODE_ENV=test`: it loaded `.env.test` and all three dummy settings.
- CI sets neither `CRON_SECRET` nor `CLERK_WEBHOOK_SIGNING_SECRET`, so CI's E2E server gets both only from `.env.test`. Moving the file needs CI to declare them.

**Two owners of the site's origin:**
- `PUBLIC_SITE_ORIGIN` in `lib/public-routes.ts` feeds metadata, the sitemap and robots.
- `NEXT_PUBLIC_APP_URL` (`lib/env.ts`) feeds Stripe's return URLs and renewal-notice links.
- Nothing checks they agree in production. BUG-080 sent a Preview checkout's return to localhost through the second.

**Configuration visibility and log redaction:**
- `SECRET_ENV_NAMES` in `lib/logger.ts:28-43` is an explicit redaction list.
- `lib/logger.test.ts:109,140` uses name heuristics to discover omissions; these are tests, not independent lists of the same secrets.
- `docs/architecture/environments.md` marks sensitive configuration. ADR-026 deliberately publishes the browser DSN but keeps the server DSN sensitive because it accepts operational events. `SENTRY_DSN` is absent from the logger list.

A registry must distinguish public visibility from log-redaction policy. No cited receipt supports the earlier claim that the owner declared every DSN nonsecret on October 5; preserve ADR-026's two trust levels.

**History:** BUG-002, BUG-136, BUG-143, DEBT-041, DEBT-129 and DEBT-197 concern environment/skip checks. BUG-040 concerns Clerk configuration; BUG-064 was a false alarm closed Won't Fix, and BUG-079 concerned expected cross-environment session cookies. BUG-080 concerns the app URL. DEBT-240/446 concern database targets. BUG-345's pooled timeout configuration is an adjacent boundary problem, not evidence of duplicate environment predicates.

## Impact

The confirmed liabilities are inconsistent bypass policies and an ineffective instance check. No deployed Vercel failure was verified. A new consumer can copy a predicate with different semantics; P3 reflects that maintenance risk.

## Options

1. **One typed environment-policy module with narrow adapters.** *Recommended.*
   - Keep deployment, build, auth bypass, live vendor instance, proxy trust and telemetry label as distinct policies. Server/client adapters expose only their permitted inputs; preserve BUG-323 and ADR-026.
   - Server code reads it. The current client env reads use `NEXT_PUBLIC_*` values fixed at build; expose the intended public auth mode through a narrow build-time export without exposing server configuration.
   - A scoped source scan enforces the named production-source invariants and permitted policy adapters. Tests and tooling can still read environment inputs; do not ban every environment read by keyword.
   - **The Clerk instance check.** `lib/env.ts` cannot learn a secret key's instance without a network call, which it must not make at module load. Remove the ineffective decoder and correct the guide to state only the prefix compatibility check. Add a separate bounded deployment/readiness check if authoritative provider instance evidence is available. The existing JWT check reads public JWKS and returns early without `CLERK_JWT_KEY`; it does not authenticate the secret key, so pairing must not depend on that optional path. Never log keys or weaken DEBT-503's public-JWKS behavior.
   - Move test-only env loading to explicit test configuration and declare CI build/server inputs, including the dummy secrets. Migrate integration callers with it and retain step-scoped real credentials. Prove build-and-serve behavior, not only file placement.
   - In production, assert that `NEXT_PUBLIC_APP_URL`'s origin equals `PUBLIC_SITE_ORIGIN`.
   - Derive logging redaction from a registry that separately states public visibility, preserving the sensitive server/public browser DSN distinction.
2. **Align the rules by hand.** DEBT-197 did, and a review commit diverged them again the same night.

## Resolution (proposed)

Option 1, red first:
- the scan, failing on today's sites;
- real-shaped key fixtures prove local prefix validation and the guide's corrected scope; an independent readiness check must prove pairing before the guide claims it;
- a production-mode build-and-serve check proves explicit CI configuration and real auth mode.

## Verification

- [ ] Shared explicit policies preserve deployment/build/vendor/proxy/telemetry distinctions; the scan rejects a demonstrated bypass-policy violation.
- [ ] Local Clerk validation and the guide agree. Any implemented pairing check uses authoritative instance evidence, independent of optional JWT configuration, and rejects mismatches without printing keys.
- [ ] CI build and server use declared inputs, with auth enabled and integration-test configuration migrated.
- [ ] Production app origin equals the public-site origin; the redaction registry preserves ADR-026's visibility distinctions.

## Related

- DEBT-197, BUG-136, BUG-143 (closed): the earlier one-file fixes.
- BUG-345: pooled database timeouts, an adjacent configuration boundary.
