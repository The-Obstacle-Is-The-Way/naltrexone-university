# DEBT-521: Clerk JS Loads Unpinned From Clerk's CDN, So a Clerk Release Can Change Sign-In Without a Deploy

**Status:** Open — closes as Accepted in this pull request: the owner keeps Clerk JS floating (2026-11-15); a Waiting row carries the pin trigger
**Priority:** P3
**Date:** 2026-10-12

---

## Summary

The browser half of sign-in, Clerk JS and its UI bundle, is not part of the app's build. On every page load, `<ClerkProvider>` (`components/providers.tsx`) has the browser download them from Clerk's servers at "the latest 6.x" and "the latest 1.x". Neither `NEXT_PUBLIC_CLERK_JS_VERSION` nor `NEXT_PUBLIC_CLERK_UI_VERSION` is set, so `@clerk/nextjs` 7.9.25 (the lockfile's version) asks for the major of its built-in versions: Clerk JS 6.42.3 becomes `@6`, and UI 1.42.4 becomes `@1` (`@clerk/shared` 4.44.1, `versionSelector`). A Clerk release therefore reaches every visitor at once: without a lockfile change, without review, and without the app's E2E.

## Evidence

- **No pin.** The repository and its environment examples set none of `NEXT_PUBLIC_CLERK_JS_VERSION`, `NEXT_PUBLIC_CLERK_JS_URL`, `NEXT_PUBLIC_CLERK_UI_VERSION` or `NEXT_PUBLIC_CLERK_UI_URL` (checked 2026-11-15). These are the settings `@clerk/nextjs` 7 reads (`mergeNextClerkPropsWithEnv.js`); its version props are internal.
- **Production.** None of the four is among the Vercel project's environment variables (names checked 2026-11-15), so production uses the same default through the production Clerk domain.
- **Seen in traces.** On 2026-10-12 the app requested `@clerk/clerk-js@6/dist/clerk.browser.js`, which Clerk redirected to the then-latest 6.39.0. The app uses its `@clerk/ui` dependency (1.42.4) only for themes (`components/providers.tsx:3`).
- **No regression from it yet.** BUG-333's cookie race was the same in 6.38.0 and 6.39.0.

## Impact

- **A Clerk regression ships to users without passing the app's gates.** If sign-in breaks with no deploy of the app, rolling the app back to a deployment on the same `@clerk/nextjs` major does not help, since that major still loads the latest Clerk JS 6 and UI 1. The runbook note in `docs/architecture/integrations/clerk.md` says so.
- **Clerk's fixes, security fixes included, arrive at once.** That is the benefit of the default.

## Options

1. **Keep the default.** Clerk fixes reach users at once, and so do Clerk regressions. The runbook note is in place, and Sentry reports sign-in errors. No code.
2. **Pin both halves to the lockfile.** For the UI, pass `@clerk/ui`'s `ui` export to `<ClerkProvider>`'s `ui` option, which Clerk documents for bundling the UI instead of loading it from the CDN. For Clerk JS, add `@clerk/clerk-js` as a dependency, used only for its version, and set `NEXT_PUBLIC_CLERK_JS_VERSION` from it at build time, with a test that the build takes both versions from the lockfile. An ordinary Clerk release then waits for the 7-day release-age gate and Dependabot's 7-day cooldown, and arrives in its weekly grouped pull request, where `main`'s E2E runs before production: one to two weeks. A security fix has a faster path: the upstream advisory watch reads `clerk/javascript`'s advisories every 3 hours (`.github/workflows/upstream-advisory-watch.yml`, `scripts/watchers/upstream-advisory-watch.mts`), and the supply-chain policy takes a reachable critical or high advisory's fix the same day (`docs/policies/supply-chain.md`, When a fix is urgent). A medium or low advisory, such as Clerk's GHSA-wpqf-h9rq-rg73 (DEBT-537), waits for the gate.
3. **Self-host the bundles.** This adds build and CSP work for little over option 2.

## Resolution (decided)

**Option 1, the owner, 2026-11-15: keep Clerk JS and its UI floating.** Option 2 buys determinism against a risk not seen since this record opened, at the cost of a new dependency, build-time version plumbing and a bundled UI, and it delays Clerk's ordinary browser fixes by one to two weeks. The app's server half, `@clerk/nextjs` and `@clerk/backend`, stays pinned by the lockfile either way.

The decision was due 2026-10-26. No session held it and the queue review lapsed (due 2026-10-30), so it was re-dated 2026-11-22; the owner made it on 2026-11-15.

This record closes as Accepted, and a Waiting row carries the pin: when a sign-in regression is traced to a Clerk JS or UI release that reached users with no deploy of the app, pin both halves to the lockfile (option 2).

## Verification

- [x] The owner's decision is recorded (2026-11-15, option 1).
- [ ] The Waiting row is added, and this record closes as Accepted, in this pull request.

## Related

- BUG-333 and BUG-337, where the floating version was first noticed.
- DEBT-537: Clerk's advisory that GitHub's database had not listed.

Corrected 2026-11-15: `@clerk/nextjs` is 7.9.25 and `@clerk/ui` 1.42.4 in the lockfile, and the defaults resolve to Clerk JS 6.42.3's and UI 1.42.4's majors; the four settings and the Vercel names were re-checked; option 2's lag counts the 7-day release-age gate, and its security fixes keep a fast path through the upstream advisory watch and the urgent-fix policy; the decision, due 2026-10-26 and re-dated because no session held it and the queue review lapsed, was made by the owner on 2026-11-15: option 1, closing as Accepted with a Waiting row.
