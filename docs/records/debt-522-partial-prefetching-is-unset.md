# DEBT-522: Partial Prefetching Is Unset, So Every Build Warns

**Status:** Open
**Priority:** P3
**Date:** 2026-10-15

Corrected 2026-10-15: the challenge showed that `true` makes link prefetches render per visitor here, and a measurement confirmed it. The resolution changed from `true` to `false`, and the option dates from 16.3, not 16.4. A review that afternoon then weighed the cost: a few function invocations per visitor, cached for the session. So the record accepts `true` when Next.js forces it, and drops the move of the nonce read.

---

## Summary

Next.js 16.3 added `partialPrefetching`. Partial Prefetching changes what a `<Link>` downloads ahead of a click: one shared shell of the destination route, instead of the cached page render. Next.js 16.4 began warning when an app enables `cacheComponents` and leaves the option unset, as this app did. So every `next build` and `next start` printed a seven-line warning asking for `true` or `false`.

The warning printed in local builds, in CI's build and E2E web server, and in every Vercel production build. A warning on every build hides new ones: a real problem printed next to it looks like the same noise.

Left unset, the option acts like `false`. Next.js says both features will be on everywhere in the next major release, and the option removed. Turning it on here, though, is not free.
- Every route's shell reads request headers, because the root layout reads the CSP nonce from `headers()`.
- With the option on, a shell that reads headers is fetched by a per-visitor request, which the server renders.
- So each link's prefetch stops being a prerendered file and becomes a server render, once per visitor and route.

## Evidence

- **The warning's condition.** `next` 16.4.1 warns when `cacheComponents` is on and `partialPrefetching` is `undefined` (`node_modules/next/dist/server/config.js:454-461`). Its text: "The only reason to set `partialPrefetching` to `false` is if you're migrating an older Cache Components app. … Both Cache Components and Partial Prefetching will be enabled everywhere in the next major release, and the old configurations will be removed." A TODO beside it plans a warning for `false` too, before Next.js 17 (`:452-453`). The option's documentation dates it to 16.3.0. This app ran 16.3.8 before 16.4.1 without the warning.
- **Where it printed.**
  - The local `pnpm build` (2026-10-15).
  - CI's build step and its E2E web server on `main` after #1519.
  - Vercel's production build of `main` at `8354159a`. That build log has no other warning; the database lines in it are notices from migrations that skip what already exists.
- **No link uses a legacy full prefetch.** No `<Link>` in the repository sets `prefetch`, and nothing calls `router.prefetch`. Next.js's adoption guide therefore has no full prefetch here to migrate (`node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`).
- **Every route reads headers.** The root layout wraps every page in `<Suspense>` around `NonceBoundProviders`, which reads `headers().get('x-nonce')` (`app/layout.tsx:67-74`, `:95-97`). The option's documentation: "Routes that read `cookies()` or `headers()` produce an App Shell that includes session data. The framework auto-detects this and caches the shell per session on the client." Next.js's prefetch scheduler: "Routes without Partial Prefetching never use runtime requests for prefetches" (`node_modules/next/dist/client/components/segment-cache/scheduler.js:674`).
- **Measured (2026-10-15, local production builds served by `next start`).** A browser loaded `/` and then `/pricing`, scrolled each page, and recorded every prefetch request:

  | Setting | Prefetches answered from the prerender | Prefetches rendered on request |
  |---|---|---|
  | unset | 22 of 22 | 0 |
  | `false` | 22 of 22 | 0 |
  | `true` | 12 of 22 | 10, five per page (`next-router-prefetch: 3`, `Cache-Control: private, no-store`) |

  With `true`, the per-segment prefetches for `/pricing`, `/sign-in`, `/sign-up`, `/privacy` and `/terms` became runtime prefetches. `/privacy` and `/terms` render no per-request content of their own, so the root layout's `headers()` read is what makes them per visitor. The route table printed by `next build` was the same for all three settings.
- **What a runtime prefetch costs.** On Vercel, a response marked `private, no-store` is rendered by a function. The client caches each route's shell for the visitor's session. So the cost is one function invocation per linked route, about five here, the first time a visitor sees a page that links to them, and none after that. Every page view already invokes a function, because each page streams its nonce-bound content per request. Production runs on the Hobby plan until the first live sale (DEBT-512).

## Impact

- One seven-line warning on every build, in every environment, hiding new warnings.
- Next.js 17 turns Partial Prefetching on for every app. Here that adds a few function invocations per visitor, a small multiple of what each page view already costs.

## Options

1. **Set `false`.** The warning goes, and prefetching is unchanged: the measurement shows it identical to unset. Next.js plans to warn about `false` before Next.js 17.
2. **Set `true` now.** The warning goes, and the app takes on Next.js 17's behaviour early. It costs a few function invocations per visitor for no feature the app needs today, and a behaviour change does not belong in a warning fix.
3. **Leave it unset.** The warning stays, and nothing else changes.
4. **Take the nonce read out of the shell every route shares, so that `true` stays prerendered.** This is the standard place for a CSP nonce in Next.js, and the saving is a few cheap renders per visitor. Not worth the change at this app's scale.

## Resolution (decided)

Option 1, test-first. `next.config.test.ts` pins `partialPrefetching: false`, and a comment beside the setting gives the reason.

When Next.js forces the change, accept it. When it warns about `false`, or at the Next.js 17 upgrade, whichever comes first, set `true` and accept the cost measured above. Revisit option 4 only if function usage approaches the hosting plan's allowance. Both triggers announce themselves in every build, so no Waiting row is needed.

## Verification

- [x] Each setting measured against a local production build, and `true`'s cost traced to the root layout's `headers()` read (2026-10-15).
- [x] `next.config.ts` sets `partialPrefetching: false`, test-first, and the local build and `next start` print no warning (2026-10-15).
- [ ] CI's build and E2E web server print no `partialPrefetching` warning.
- [ ] After promotion, Vercel's production build prints none.

## Related

- BUG-344: found in the same sweep of build, test and CI output.
- DEBT-512: production's hosting plan, where function invocations count.
- DEBT-509: the Next.js 16.4.1 upgrade, which brought the warning.
