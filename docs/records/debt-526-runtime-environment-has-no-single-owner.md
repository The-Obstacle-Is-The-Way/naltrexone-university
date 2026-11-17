# DEBT-526: Which Environment the Code Runs In Is Decided in Many Places, by Different Rules

**Status:** Open — delete the dead Clerk instance check, share one production predicate between `lib/env.ts` and the proxy, redact `SENTRY_DSN`, and check the app URL's origin in production
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

The Clerk bypass is guarded twice, by different production rules, and `lib/env.ts` carries a Clerk instance check that can never fire. The server's Sentry DSN, sensitive under ADR-026, is missing from the logger's redaction list. The site's origin has two owners that nothing ties together in production.

DEBT-197 aligned the proxy's guard on `VERCEL_ENV`; two hours later a review commit (`dca45291`) added a `NODE_ENV` fallback, and the two have differed since.

## Evidence

Checked at `34d9aea0`.

- **Two bypass guards.** `lib/env.ts:163` treats only `VERCEL_ENV === 'production'` as production, and refuses `NEXT_PUBLIC_SKIP_CLERK=true` there (`:233-235`); its comment (`:144-162`) explains why `NODE_ENV` is unreliable: the build inlines it. `proxy.ts:168-170` also falls back to `NODE_ENV` when `VERCEL_ENV` is unset. Off Vercel, a production build with the bypass on therefore passes `lib/env.ts`, while the proxy enforces Clerk and the other consumers treat everyone as signed out. No test covers the fallback (`proxy.test.ts:96-99` sets `VERCEL_ENV`). The app deploys only to Vercel, where both guards agree.
- **A deliberate `NODE_ENV` read.** `lib/request-ip.ts:3` trusts `x-forwarded-for` and `x-real-ip` only when `NODE_ENV` is not `production`, so Preview, a production build, ignores those spoofable headers. Switching it to the Vercel-production rule would make Preview trust them.
- **The bypass reads.** Eight expressions read the flag raw, all as `=== 'true'`: `proxy.ts:164`, `lib/container.ts:73,82`, `components/providers.tsx:57`, `components/auth-nav.tsx:35`, `components/get-started-cta.tsx:24`, and both sign-in and sign-up page clients (`:15`). They agree with each other.
- **The dead instance check.** `lib/env.ts:12-36` decodes the publishable key and keeps the result only if it matches `/^[a-z0-9-]+$/`. A real key decodes to a host ending in `$`, such as `example-mole-12.clerk.accounts.dev$`, so the function returns null, and a secret key carries no instance. The comparison at `:198-209` never runs; its test (`lib/env.test.ts:384-407`) passes only on synthetic keys. `docs/architecture/environments.md:121` already says `lib/env.ts` does not establish instance equality.
- **`SENTRY_DSN`.** `SECRET_ENV_NAMES` (`lib/logger.ts:28-43`) omits it. The coverage test (`lib/logger.test.ts:95-121`) scans only `app`, `lib`, `src`, `tests` and `scripts` (`:98`), and its name pattern (`:111-116`) cannot match a `_DSN`. `SENTRY_DSN` is read only in root files: `instrumentation.ts:14` and its test, `sentry-config.test.ts`.
- **The origin.** `PUBLIC_SITE_ORIGIN` (`lib/public-routes.ts:4`) feeds metadata, the sitemap and robots. `NEXT_PUBLIC_APP_URL` (`lib/env.ts:92`) feeds Stripe's return URLs and renewal-notice links. BUG-080 sent a Preview checkout's return to localhost through the second.
- **CI's `.env.test`.** With `NODE_ENV: test` (`ci.yml:36`; `stripe-hosted-checkout-smoke.yml:24`), Next loads `.env.test` for `next build` and `next start` (`@next/env` 16.4.5 reads `.env.test.local`, `.env.test`, `.env`). The steps set every value the app needs (`ci.yml:189,218`; hosted `:81,98`). The file still supplies `CRON_SECRET` and `CLERK_WEBHOOK_SIGNING_SECRET` dummies, which no E2E test uses.

## Impact

No deployed failure. The guard mismatch shows only in a local production build with the bypass on. The dead check suggests a protection that does not exist. A logged server DSN would let a log reader send events to the error project. A wrong production app URL would put another host in Stripe returns and renewal notices.

## Options

1. **The four small fixes below.** *Recommended.*
2. **One environment-policy module, a source scan over every environment read, a redaction registry, an instance-pairing readiness check, and moving `.env.test`.** Rejected 2026-11-15 by the reviewing session, at the owner's delegation: each adds machinery the evidence does not need. The eight bypass reads agree; the CI file supplies only unused dummies; the guide has pairing verified in the Clerk Dashboard (`environments.md:121`), and a local check cannot learn a secret key's instance.

## Resolution (decided)

Option 1, decided 2026-11-15 by the reviewing session, at the owner's delegation, red first:

1. **Delete the instance check.** Remove `lib/env.ts:12-36` and `:198-209`, and the synthetic test. The prefix check (`:187-196`) and its tests stay. A source-scan test keeps it deleted: it fails while `lib/env.ts` decodes a key (`decodeBase64Utf8`, `getClerkInstanceSlug`, or a `'base64'` decode), red first on today's file.
2. **One production rule.** Export one predicate, `isVercelProduction()`, from a small `lib/` module (not `lib/env.ts`, which validates on import), and call it from both `lib/env.ts:163` and `proxy.ts:168-170`. Red tests: the predicate is false with `VERCEL_ENV` unset and `NODE_ENV=production`, and in that case the proxy honors the bypass. That is the one behavior change: off Vercel, a production build with the bypass on no longer enforces Clerk in the proxy. It is acceptable because a bypassed visitor is treated as signed out (`lib/container.ts:73,82`). The same pull request adds a comment at `lib/request-ip.ts:3` saying why it reads `NODE_ENV`, so nobody aligns it.
3. **Redact `SENTRY_DSN`.** Add it to `SECRET_ENV_NAMES`. Extend the coverage test to root `*.ts` files and add `DSN` to its pattern; `NEXT_PUBLIC_` names stay excluded, and the public `CLERK_JWT_KEY` (`proxy.ts:192`) is an explicit, commented exception. Red test: the extended test fails on `SENTRY_DSN` until the name is added.
4. **Tie the origins.** On Vercel production, `lib/env.ts` refuses a `NEXT_PUBLIC_APP_URL` whose origin is not `PUBLIC_SITE_ORIGIN`. Red test in `lib/env.test.ts`. Before merging, the owner confirms production's value in Vercel.

**Net code effect.** About 60 lines deleted (the decoder, the comparison and its test, the fallback); about 20 added (the predicate module, its tests and the comments).

## Verification

- [ ] `lib/env.ts` has no instance decoder, its source-scan guard red then green, and its prefix tests pass.
- [ ] The proxy and `lib/env.ts` call one production predicate, with the red tests above, and `lib/request-ip.ts:3` says why it keeps `NODE_ENV`.
- [ ] `SENTRY_DSN` is redacted, and the coverage test, now reading root files, would catch another server DSN.
- [ ] A production build refuses an app URL off the public origin.

## Related

- DEBT-197, BUG-136, BUG-143 (closed): the earlier one-file fixes.
- ADR-026: the server DSN is sensitive.

Corrected 2026-11-15: resolution narrowed to four fixes, with the policy module, source scan, redaction registry, pairing check and `.env.test` move declined by the reviewing session, at the owner's delegation; `environments.md` no longer claims the instance check; the `.env.test` values CI relies on are unused dummies; line drift corrected (`proxy.ts:164,168-170`, `lib/container.ts:73,82`, `ci.yml:189,218`); the illustrative inventory is in git at `34d9aea0`; fix 2 names the shared predicate and its one behavior change, and keeps `lib/request-ip.ts`'s deliberate `NODE_ENV` read; fix 3's red test now scans root files, where `SENTRY_DSN` is read, since the old pattern change could not fail.
