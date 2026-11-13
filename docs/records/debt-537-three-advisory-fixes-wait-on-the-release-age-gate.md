# DEBT-537: Three Advisory Fixes Wait on the 7-Day Gate

**Status:** Open — one repo-owned bundle takes the vite, brace-expansion and @clerk/backend fixes once the last clears the gate (2026-11-19 22:57Z); due 2026-11-20
**Priority:** P3
**Date:** 2026-11-13

---

## Summary

Three advisories cover versions installed on `dev`. None is reachable as this app is configured, and none is urgent under `docs/policies/supply-chain.md` (When a fix is urgent). Each fix is published but younger than the 7-day release-age gate. One repo-owned dependency bundle takes all three once the last fix clears the gate. The same bundle corrects the `postcss` and `nanoid` overrides, which no longer match their consumers.

| Advisory | Issue | Installed | Fixed in | Published | Clears the gate | Reachable here |
|---|---|---|---|---|---|---|
| GHSA-p4f5-76q4-ffq7, `vite`, critical: code execution through the dev server | #1667, open | 8.3.6, pinned in `package.json` | 8.3.7; 8.3.8 is npm's latest | 8.3.7: 2026-11-09T10:25:29Z; 8.3.8: 2026-11-11T02:49:46Z | 8.3.7: 2026-11-16T10:25:29Z; 8.3.8: 2026-11-18T02:49:46Z | No. Only a server exposed with `--host` or `server.host` is affected. Vite runs only under Vitest, on localhost |
| GHSA-6jwq-xf8q-xcwh, `brace-expansion`, high: CPU denial of service | #1669, open | 5.0.12, through the `brace-expansion@5` override | 5.0.13 | 2026-11-11T12:27:55Z | 2026-11-18T12:27:55Z | No. Only repository-controlled patterns reach it, through Stryker's and Sentry's bundler plugin's `minimatch` |
| GHSA-wpqf-h9rq-rg73, `@clerk/backend`, medium: OIDC ID tokens accepted as session tokens | #1672, closed as not affected | 3.27.0, through `@clerk/nextjs` 7.9.25 | 3.28.0, with `@clerk/nextjs` 7.9.26 | 3.28.0: 2026-11-12T22:53:39Z. 7.9.26 also needs `@clerk/react` 6.18.7: 22:56:46Z | 2026-11-19T22:56:46Z, the last of the set | No. This Clerk instance issues no ID tokens, 3.27.0's `authenticateRequest()` rejects tagged ones, and nothing calls `verifyToken()` |

## Evidence

- **Each issue holds its assessment.** #1667 and #1669 were assessed on 2026-11-13 and #1672 on 2026-11-12, against the urgent-CVE policy.
- **No scanner reports them.** On 2026-11-13 GitHub's advisory database held none of the three: `GET /advisories/<id>` answered 404 for each. So neither Dependabot nor `pnpm audit` reports them. The upstream advisory watch raised the issues from each repository's own advisory.
- **Clerk.**
  - The owner's dashboard check of the production instance on 2026-11-12, recorded on #1672, found no OAuth applications and Publish CIMD support and Publish DCR support both off. Those are the three ways an instance issues ID tokens.
  - A throwaway test against the installed SDK, not committed, ran the real `clerkMiddleware`. It signed out a token tagged `cl_B7d4PD444AAA`, the ID-token category, whether sent in a cookie or an Authorization header.
  - Nothing in `app/`, `lib/`, `src/` or `proxy.ts` calls `verifyToken()` or sets `acceptsToken` or `authorizedParties`.
  - `@clerk/nextjs` 7.9.26 requires `@clerk/backend` `^3.28.0`, `@clerk/react` `^6.18.7` and `@clerk/shared` `^4.45.0`. `minimumReleaseAgeStrict` is on, so the install fails until the newest of them, `@clerk/react` 6.18.7, is 7 days old.
- **Clerk 3.28.0 rejects an untagged token.** `isNonSessionJwtCategory()` was true only for a present, non-session category in 3.27.0. In 3.28.0 it is also true for a missing `cat`. `authenticateRequest()` checks it before verifying or refreshing a token, and 3.28.0's `verifyToken()` now checks it too. In 3.27.0, `verifyToken()` refused only the M2M category.
  - `git grep "typ: 'JWT'"` finds five test files that sign tokens with no `cat`.
  - Four run Clerk's real SDK and will fail on 3.28.0:
    - `lib/clerk-jwt-key-sdk.test.ts`;
    - `lib/clerk-call-failures-sdk.test.ts`;
    - `lib/clerk-backend-call-limit-sdk.test.ts`;
    - `proxy-authorization-header-sdk.test.ts`. Its cookie case expects Clerk to refresh the token.
  - The fifth, `proxy-clerk-signed-in-refresh.test.ts`, signs tokens for the app's own limiter and replaces `clerkMiddleware` with a stub.
- **The app's limiter mirrors Clerk.** `lib/clerk-backend-call-limit.ts` predicts which expired session token Clerk will refresh, from `@clerk/backend` 3.26.2's rules. It checks the signature and `alg` but not `cat`. Under 3.28.0, Clerk signs out an untagged token rather than refreshing it.
  - The limiter would then count a refresh Clerk never makes, an over-count.
  - Clerk's 3.28.0 release notes say only tokens without `cat` change: they are signed out, including OIDC ID tokens. Tests that sign their own session tokens must add `cat: 'cl_B7d4PD111AAA'`. So real session tokens are expected to carry it, but nothing here has checked one. If one did not, 3.28.0 would sign every visitor out. Verification below checks this before the bundle reaches `main`.
- **`postcss` and `nanoid` (no advisory).**
  - `pnpm-workspace.yaml` overrides `postcss` to 8.5.23, for GHSA-r28c-9q8g-f849 and GHSA-fxqj-rqcc-2cmp, both fixed by 8.5.23.
    - Its comment says that version satisfies Vite's `^8.5.23` and that Next.js 16.3.8 pins it exactly.
    - On `dev`, `vite` 8.3.6 and later declare `^8.5.32`, and `@tailwindcss/postcss` 4.3.4 declares `^8.5.25`. `next` 16.4.5 still pins 8.5.23 exactly.
    - So the override holds Vite and Tailwind below their declared ranges.
  - It also overrides `nanoid@3` to 3.3.18 and says that satisfies `postcss`. `postcss` 8.5.32 declares `^3.3.20`, which was published on 2026-10-05 and is past the gate.
  - Without the `postcss` override, `next` keeps its exact 8.5.23, and Vite and Tailwind resolve 8.5.32 or later. No copy falls below either advisory's fix.
- **Provenance.** `vite` 8.3.7, `@clerk/backend` 3.28.0 and `@clerk/nextjs` 7.9.26 carry SLSA v1 provenance on npm, as their predecessors do.

## Impact

Nothing reaches users or production. The three issues stay open, or closed with a pending update, until the bundle reaches `main`. The two overrides are a compatibility risk, not a security one: Vite and Tailwind run on a `postcss` older than they declare. The gate passes today.

## Options

1. **Same-day `minimumReleaseAgeExclude` exceptions.** The policy reserves them for critical or high advisories whose affected configuration matches this app, or whose exposure the advisory text cannot rule out.
   - The `vite` text rules out a server not exposed to the network.
   - The `brace-expansion` text names no limiting configuration. Its call rests on the dependency graph: only Stryker and Sentry's build-time bundler plugin reach it, with repository-set patterns.
   - The `@clerk/backend` advisory is medium.
2. **One bundle per gate date: 11-16, 11-18 and 11-20.** That is three reviews, three E2E runs and three promotions for three unreachable advisories.
3. **One bundle after the last fix clears the gate (chosen).** `vite` waits four days past its gate, and `brace-expansion` two. Neither is reachable.

## Resolution (decided)

- **On or after 2026-11-19T22:57Z, one repo-owned bundle** by `docs/guides/dependencies/updating-dependencies.md`, from `dev` carrying `main`'s latest promotion:
  - `vite` pinned in `package.json` at the newest release past the gate, 8.3.8 or later;
  - the `brace-expansion@5` override raised to 5.0.13, with its comment updated;
  - `@clerk/nextjs` 7.9.26 or later, so `@clerk/backend` resolves to 3.28.0 or later;
  - the four real-SDK tests' tokens gain `cat: 'cl_B7d4PD111AAA'`, the session category. Run them red on 3.28.0 first;
  - the limiter's mirrored refresh rules in `lib/clerk-backend-call-limit.ts` rechecked against 3.28.0. Its comments name 3.26.2, so if it should also skip untagged or non-session tokens, add that with a red test;
  - the `postcss` override removed, or restated with comments that match the installed consumers, decided on the bundle's lockfile. Raise the `nanoid@3` override to 3.3.20 or later, and correct its comment.
- **If a fix reaches a later version first,** take the newest version past the gate.
- **Take the `vite` or `brace-expansion` fix at once, through an exception, if it becomes reachable.** The policy allows one for these critical and high advisories once they match this app:
  - a Vite server started with `--host` or `server.host`;
  - a request path that expands user-supplied glob or brace patterns.
- **The Clerk advisory is medium, so the policy gives it no exception.** If a path to it opens before the bundle, apply the advisory's workaround for that path at once. Otherwise the owner decides on a policy change.
  - **The owner enables an OAuth application, DCR or CIMD, or code sets `acceptsToken`.** Set `authorizedParties` in `clerkMiddleware()`. On 3.11.1 and later, `authenticateRequest()` then refuses a token with no `azp`, which ID tokens lack.
  - **Code calls `verifyToken()` directly.** `authorizedParties` in `clerkMiddleware()` does not reach that call. Before it, decode the header with `decodeJwt` from `@clerk/backend/jwt`. Refuse a token whose `cat` is `cl_B7d4PD444AAA`, the ID-token category, and treat a decode error as a refusal. `verifyToken()` still checks the signature as before.

## Verification

- [ ] The bundle merges into `dev`. The lockfile holds `vite` 8.3.7 or later, `brace-expansion` 5.0.13 and `@clerk/backend` 3.28.0 or later. No override holds a package below a consumer's declared range.
- [ ] The four real-SDK Clerk tests fail on 3.28.0 before their tokens carry `cat`, and pass after. The limiter's recheck is recorded in the bundle's description.
- [ ] Real session tokens carry the session category. The bundle's required E2E signs in through Clerk's development instance on 3.28.0, and passes only if they do. After promotion, production's Vercel runtime logs still show signed-in `/app` requests answering 200, with no new run of redirects to sign-in. No token is copied or shared for either check.
- [ ] A promotion carries the bundle to `main`, and #1667 and #1669 close with it.

## Related

- #1667, #1669 and #1672: the upstream advisory watch's issues.
- #1681: the bundle that took `vite` 8.3.6 and `@clerk/backend` 3.27.0.
- DEBT-535: the `minimatch` advisory, GHSA-g3hv-75wg-m249, waits on Stryker.
- DEBT-503: the Clerk Backend API allowance, which `lib/clerk-backend-call-limit.ts` protects.
- `docs/policies/supply-chain.md`: Urgent CVE patches before the 7-day cooldown.
