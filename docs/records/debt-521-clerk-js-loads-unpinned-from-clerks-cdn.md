# DEBT-521: Clerk JS Loads Unpinned From Clerk's CDN, So a Clerk Release Can Change Sign-In Without a Deploy

**Status:** Open — owner decision: pin Clerk JS and its UI bundle to lockfile versions, or keep them floating; due 2026-10-26
**Priority:** P3
**Date:** 2026-10-12

---

## Summary

The browser half of sign-in, Clerk JS and its UI bundle, is not part of the app's build. On every page load, `<ClerkProvider>` (`components/providers.tsx`) has the browser download them from Clerk's servers at "the latest 6.x" and "the latest 1.x". Neither `NEXT_PUBLIC_CLERK_JS_VERSION` nor `NEXT_PUBLIC_CLERK_UI_VERSION` is set, so `@clerk/nextjs` 7.9.11 (the lockfile's version) asks for the major of its built-in Clerk JS version, "6". A Clerk release therefore reaches every visitor at once: without a lockfile change, without review, and without the app's E2E.

## Evidence

- **No pin.** The repository and its environment examples set none of `NEXT_PUBLIC_CLERK_JS_VERSION`, `NEXT_PUBLIC_CLERK_JS_URL`, `NEXT_PUBLIC_CLERK_UI_VERSION` or `NEXT_PUBLIC_CLERK_UI_URL`. These are the settings `@clerk/nextjs` 7 reads; its version props are internal.
- **Seen in traces.** On 2026-10-12 the app requested `@clerk/clerk-js@6/dist/clerk.browser.js`, which Clerk redirected to `6.39.0`, released 2026-10-09. The UI bundle resolved to `1.40.0`, while the lockfile holds `@clerk/ui` `1.39.0`, which the app uses only for its themes.
- **Production.** None of the four settings is among the Vercel project's 48 environment variables (names checked 2026-10-12), so production uses the same default through the production Clerk domain.
- **No regression from it yet.** BUG-333's cookie race is the same in 6.38.0 and 6.39.0.

## Impact

- **A Clerk regression ships to users without passing the app's gates.** If sign-in breaks with no deploy of the app, rolling the app back to a deployment on the same `@clerk/nextjs` major does not help, since that major still loads the latest Clerk JS 6 and UI 1. The runbook note in the Clerk integration document says so.
- **Security fixes arrive automatically.** That is the benefit of the default.

## Options

1. **Keep the default.** Clerk fixes reach users at once, and so do Clerk regressions. Add the runbook note (done) and rely on Sentry for sign-in errors.
2. **Pin both halves to the lockfile.** For the UI, pass `@clerk/ui`'s `ui` export to `<ClerkProvider>`'s `ui` option, which Clerk documents for bundling the UI instead of loading it from the CDN; `@clerk/ui` is already a dependency. For Clerk JS, add `@clerk/clerk-js` as a dependency and set `NEXT_PUBLIC_CLERK_JS_VERSION` from its installed version at build time. Dependabot then proposes Clerk releases in its weekly grouped pull request, after a seven-day cooldown, and `main`'s E2E runs on them before production. A Clerk fix therefore waits one to two weeks, unless a security advisory makes Dependabot's daily security entry raise it sooner. *Recommended*: every other runtime dependency already works this way.
3. **Self-host the bundles.** This adds build and CSP work for little over option 2.

## Resolution

Not yet decided. It is the owner's call, because option 2 makes the team responsible for applying Clerk's security fixes. Engineering for option 2 is one small PR, with a test that the build takes both versions from the lockfile. Decide by 2026-10-26.

## Verification

- [ ] The owner's decision is recorded.
- [ ] If option 2: a test proves the build takes both versions from the lockfile, and a trace shows Clerk JS loading at that version with no UI fetch from the CDN.

## Related

- BUG-333 and BUG-337, where the floating version was first noticed.
