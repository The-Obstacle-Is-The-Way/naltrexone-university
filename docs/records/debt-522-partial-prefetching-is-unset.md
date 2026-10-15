# DEBT-522: Partial Prefetching Is Unset, So Every Build Warns

**Status:** Open
**Priority:** P3
**Date:** 2026-10-15

---

## Summary

Next.js 16.4 added `partialPrefetching`. Partial Prefetching changes what a `<Link>` downloads ahead of a click: one shared shell of the destination route, instead of the cached page render. This app enables `cacheComponents` and never set the new option. So every `next build` and `next start` prints a seven-line warning asking for `true` or `false`.

The warning prints in local builds, in CI's build and E2E web server, and in every Vercel production build. Left unset, the option acts like `false`, the old prefetch behaviour. Next.js says both features will be on everywhere in the next major release and the option removed. Leaving it unset would therefore change navigation in the middle of the Next.js 17 upgrade, untested.

A warning on every build also hides new ones: a real problem printed next to it looks like the same noise.

## Evidence

- **The warning's condition.** `next` 16.4.1 warns when `cacheComponents` is on and `partialPrefetching` is `undefined` (`node_modules/next/dist/server/config.js:454-460`). Its text: "The only reason to set `partialPrefetching` to `false` is if you're migrating an older Cache Components app. … Both Cache Components and Partial Prefetching will be enabled everywhere in the next major release, and the old configurations will be removed." A TODO beside it plans a warning for `false` too, before Next.js 17 (`:452-453`).
- **Where it prints.**
  - The local `pnpm build` (2026-10-15).
  - CI's build step and its E2E web server on `main` after #1519.
  - Vercel's production build of `main` at `8354159a`. That build log has no other warning; the database lines in it are notices from migrations that skip what already exists.
- **This app has no legacy full prefetches.** Next.js's adoption guide (`node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`) has existing apps first review every `<Link>` whose prefetch is effectively `true`. Those links lose their uncached dynamic content when the flag goes on. It adds: "New projects can enable the flag without this audit because they have no legacy full prefetches to migrate." This app has none either:
  - no `<Link>` in `app/`, `components/`, `src/` or `lib/` sets `prefetch`;
  - no code calls `router.prefetch`.
- **What else changes.** A default `<Link>` prefetches the destination's shared shell instead of its cached page render. Content that reads URL data (`params`, `searchParams`) outside a `<Suspense>` boundary is left out of that shell and streams after the click. Seven pages read URL data: billing, bookmarks, history, the practice session, the question page, checkout success, and pricing. Next.js reports such reads only as development hints, "instant navigation" insights, which never block a build.

## Impact

- One seven-line warning on every build, in every environment, hiding new warnings.
- An untested behaviour change waiting in the Next.js 17 upgrade.

## Options

1. **Set `false`.** This silences the warning and keeps the old prefetch, but only defers the change to Next.js 17. Next.js plans to warn about `false` before then, and calls it a migration setting.
2. **Set `true` now.** This adopts the behaviour Next.js 17 makes permanent, on our schedule. With no legacy full prefetches, the guide's audit has nothing to migrate.
3. **Leave it unset.** The warning stays, and the change still arrives with Next.js 17.

## Resolution (decided)

Option 2, test-first.
- A unit test pins `partialPrefetching: true` beside `cacheComponents: true` in `next.config.test.ts`.
- The full gate and E2E show that navigation still works and that builds no longer print the warning.
- Where one of the seven pages reads URL data outside `<Suspense>`, moving that read inside would let more of the page arrive with the shell. That is an optional speed-up, not part of this fix. Each page stays correct without it, and Next.js marks it only in development.

## Verification

- [ ] `next.config.ts` sets `partialPrefetching: true`, test-first.
- [ ] The local build prints no `partialPrefetching` warning, and the full gate and E2E pass.
- [ ] CI's build and E2E web server print no `partialPrefetching` warning.
- [ ] After promotion, Vercel's production build prints none, and navigation from `/` to `/pricing` and into the app works in production.

## Related

- BUG-344: found in the same sweep of build, test and CI output.
- DEBT-509: the Next.js 16.4.1 upgrade that brought this option.
