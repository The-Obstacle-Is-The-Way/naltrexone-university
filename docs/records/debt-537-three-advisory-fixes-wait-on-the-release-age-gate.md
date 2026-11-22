# DEBT-537: Four Advisory Fixes Wait on the 7-Day Gate: vite, brace-expansion, ws and Clerk

**Status:** Verifying — after promotion, a production sign-in survives a token refresh, and #1667, #1669 and #1683 close; due 2026-11-25
**Priority:** P3
**Date:** 2026-11-13

---

## Summary

Four advisories cover versions installed on `dev`; the fourth, `ws`, joined on 2026-11-13 (#1683). None is reachable as this app is configured, and none is urgent under `docs/policies/supply-chain.md` (When a fix is urgent). Each fix was published younger than the 7-day release-age gate, and the last cleared it on 2026-11-19. One repo-owned dependency bundle takes all four. The same bundle corrects the `postcss` and `nanoid` overrides, which no longer match their consumers.

| Advisory | Issue | Installed | Fixed in | Published | Clears the gate | Reachable here |
|---|---|---|---|---|---|---|
| GHSA-p4f5-76q4-ffq7, `vite`, critical: code execution through the dev server | #1667, open | 8.3.6, pinned in `package.json` | 8.3.7; 8.3.8 is npm's latest | 8.3.7: 2026-11-09T10:25:29Z; 8.3.8: 2026-11-11T02:49:46Z | 8.3.7: 2026-11-16T10:25:29Z; 8.3.8: 2026-11-18T02:49:46Z | No. Only a server exposed with `--host` or `server.host` is affected. Vite runs only under Vitest, on localhost |
| GHSA-6jwq-xf8q-xcwh, `brace-expansion`, high: CPU denial of service | #1669, open | 5.0.12, through the `brace-expansion@5` override | 5.0.13 | 2026-11-11T12:27:55Z | 2026-11-18T12:27:55Z | No. Only repository-controlled patterns reach it, through Stryker's and Sentry's bundler plugin's `minimatch` |
| GHSA-37g9-w4hg-h9qr, `ws`, high: memory exhaustion through unbounded pong replies | #1683, open | 8.22.2, through `@vitest/browser` 5.1.0's `^8.22.0` | 8.23.0 | 2026-11-12T21:39:13Z | 2026-11-19T21:39:13Z | No. It needs a malicious WebSocket peer; `ws` here is only the localhost channel between Vitest and the Chromium it drives |
| GHSA-wpqf-h9rq-rg73, `@clerk/backend`, medium: OIDC ID tokens accepted as session tokens | #1672, closed as not affected | 3.27.0, through `@clerk/nextjs` 7.9.25 | 3.28.0, with `@clerk/nextjs` 7.9.26 | 3.28.0: 2026-11-12T22:53:39Z. 7.9.26 also needs `@clerk/react` 6.18.7: 22:56:46Z | 2026-11-19T22:56:46Z, the last of the set | No. This Clerk instance issues no ID tokens, 3.27.0's `authenticateRequest()` rejects tagged ones, and nothing calls `verifyToken()` |

## Evidence

- **Each issue holds its assessment.** #1667, #1669 and #1683 were assessed on 2026-11-13 and #1672 on 2026-11-12, against the urgent-CVE policy.
- **No scanner reports them.** On 2026-11-13, and again on 2026-11-15, GitHub's advisory database held none of the four: `GET /advisories/<id>` answered 404 for each. So neither Dependabot nor `pnpm audit` reports them. The upstream advisory watch raised the issues from each repository's own advisory.
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
  - Dependabot #1718 confirmed it on 2026-11-21: with `@clerk/nextjs` 7.10.0, those four files failed 35 tests (2, 5, 27 and 1, in that order), such as "expected 'signed-out' to be 'handshake'".
  - The fifth, `proxy-clerk-signed-in-refresh.test.ts`, signs tokens for the app's own limiter and replaces `clerkMiddleware` with a stub.
- **The app's limiter mirrors Clerk.** `lib/clerk-backend-call-limit.ts` predicts which expired session token Clerk will refresh, from `@clerk/backend` 3.26.2's rules. It checks the signature and `alg` but not `cat`. Under 3.28.0, Clerk signs out an untagged token rather than refreshing it.
  - The limiter would then count a refresh Clerk never makes, an over-count.
  - Clerk's 3.28.0 release notes say only tokens without `cat` change: they are signed out, including OIDC ID tokens. Tests that sign their own session tokens must add `cat: 'cl_B7d4PD111AAA'`. So real session tokens are expected to carry it, but nothing here has checked one. If one did not, 3.28.0 would sign every visitor out. Verification below checks this before the bundle reaches `main`.
- **`postcss` and `nanoid` (no advisory).**
  - `pnpm-workspace.yaml` overrides `postcss` to 8.5.23, for GHSA-r28c-9q8g-f849 and GHSA-fxqj-rqcc-2cmp, both fixed by 8.5.23.
    - Its comment says that version satisfies Vite's `^8.5.23` and that Next.js 16.3.8 pins it exactly.
    - On `dev`, `vite` 8.3.6 and later declare `^8.5.32`, and `@tailwindcss/postcss` 4.3.5, which #1702 installed, declares `^8.5.25`. `next` 16.4.5 still pins 8.5.23 exactly.
    - So the override holds Vite and Tailwind below their declared ranges.
  - It also overrides `nanoid@3` to 3.3.18 and says that satisfies `postcss`. `postcss` 8.5.32 declares `^3.3.20`, which was published on 2026-10-05 and is past the gate.
  - Without the `postcss` override, `next` keeps its exact 8.5.23, and Vite and Tailwind resolve 8.5.32 or later. No copy falls below either advisory's fix.
- **Provenance.** `vite` 8.3.7, `@clerk/backend` 3.28.0 and `@clerk/nextjs` 7.9.26 carry SLSA v1 provenance on npm, as their predecessors do.

## Impact

Nothing reaches users or production. #1667, #1669 and #1683 stay open until the bundle reaches `main`; #1672 is closed as not affected. The two overrides are a compatibility risk, not a security one: Vite and Tailwind run on a `postcss` older than they declare. The gate passes today.

## Options

1. **Same-day `minimumReleaseAgeExclude` exceptions.** The policy reserves them for critical or high advisories whose affected configuration matches this app, or whose exposure the advisory text cannot rule out.
   - The `vite` text rules out a server not exposed to the network.
   - The `brace-expansion` text names its affected configuration under Impact: "An application passing an untrusted pattern to `expand()`, directly or through `minimatch` / `glob`". This app passes none. Only Stryker and Sentry's build-time bundler plugin reach it, with patterns the repository sets.
   - The `@clerk/backend` advisory is medium.
2. **One bundle per gate date: 11-16, 11-18 and 11-20.** That is three reviews, three E2E runs and three promotions for four unreachable advisories.
3. **One bundle after the last fix clears the gate (chosen).** `vite` waits four days past its gate, and `brace-expansion` two. Neither is reachable.

## Resolution (decided)

- **On or after 2026-11-19T22:57Z, one repo-owned bundle** by `docs/guides/dependencies/updating-dependencies.md`, from `dev` carrying `main`'s latest promotion:
  - `vite` pinned in `package.json` at the newest release past the gate, 8.3.8 or later;
  - the `brace-expansion@5` override raised to 5.0.13, with its comment updated;
  - `ws` 8.23.0 or later, which `@vitest/browser`'s `^8.22.0` takes with no override;
  - `@clerk/nextjs` 7.9.26 or later, so `@clerk/backend` resolves to 3.28.0 or later;
  - the four real-SDK tests' tokens gain `cat: 'cl_B7d4PD111AAA'`, the session category. Run them red on 3.28.0 first;
  - the limiter's mirrored refresh rules in `lib/clerk-backend-call-limit.ts` rechecked against 3.28.0. Its comments name 3.26.2, so if it should also skip untagged or non-session tokens, add that with a red test;
  - the `postcss` override removed, or restated with comments that match the installed consumers, decided on the bundle's lockfile. Raise the `nanoid@3` override to 3.3.20 or later, and correct its comment.
- **Some updates are added by hand.** Dependabot's #1718 proposes `vite` 8.3.8 and `@clerk/nextjs` 7.10.0, but no Dependabot PR proposes `ws` or the `brace-expansion`, `postcss` and `nanoid` override changes. So the bundle follows "Updates added beyond the sources" in `docs/guides/dependencies/updating-dependencies.md`, since CodeRabbit skips the lockfile. The scope check the owner deferred to this bundle on 2026-11-17 ships beside it in its own pull request, which adds `scripts/dependencies/verify-lockfile-drift.ts`, so the bundle's review does not wait on the new script's. Each added update here passes it.
- **If a fix reaches a later version first,** take the newest version past the gate.
- **Take the `vite`, `brace-expansion` or `ws` fix at once, through an exception, if it becomes reachable.** The policy allows one for these critical and high advisories once they match this app:
  - a `ws` connection that a peer outside the machine can reach;
  - a Vite server started with `--host` or `server.host`;
  - a request path that expands user-supplied glob or brace patterns.
- **The Clerk advisory is medium, so the policy gives it no exception.** If a path to it opens before the bundle, apply the advisory's workaround for that path at once. Otherwise the owner decides on a policy change.
  - **The owner enables an OAuth application, DCR or CIMD, or code sets `acceptsToken`.** Set `authorizedParties` in `clerkMiddleware()`. On 3.11.1 and later, `authenticateRequest()` then refuses a token with no `azp`, which ID tokens lack.
  - **Code calls `verifyToken()` directly.** `authorizedParties` in `clerkMiddleware()` does not reach that call. Before it, decode the header with `decodeJwt` from `@clerk/backend/jwt`. Refuse a token whose `cat` is `cl_B7d4PD444AAA`, the ID-token category, and treat a decode error as a refusal. `verifyToken()` still checks the signature as before.

## Verification

- [ ] The bundle merges into `dev`. The lockfile holds `vite` 8.3.7 or later, `brace-expansion` 5.0.13, `ws` 8.23.0 or later and `@clerk/backend` 3.28.0 or later. No override holds a package below a consumer's declared range. On the branch: `vite` 8.3.8, `brace-expansion` 5.0.13, `ws` 8.23.0 and `@clerk/backend` 3.29.0. The `postcss` override is removed: `next` keeps its exact 8.5.23, and Vite and Tailwind take 8.5.33. The `nanoid@3` override is 3.3.20.
- [x] The four real-SDK Clerk tests fail on 3.28.0 or later before their tokens carry `cat`, and pass after: on 3.29.0, 35 failed, then all passed. The limiter's recheck: Clerk refreshes only a token whose header carries the session category, a subset of what the limiter counts. So the limiter over-counts and never lets a refresh through uncounted, and stays unchanged. A test pins that Clerk calls nothing for an untagged token while the limiter counts it.
- [ ] Real session tokens carry the session category. The bundle's required E2E signs in through Clerk's development instance on 3.29.0, and passes only if they do; it passed locally. After promotion, a browser signed in to production, the owner's, still loads an `/app` page signed in more than a minute after its last load, which takes a refresh of a real token. Production has little signed-in traffic before launch, so its runtime logs alone could pass on no requests; they must also show no new run of redirects to sign-in. No token is copied or shared for any check.
- [ ] A promotion carries the bundle to `main`, and #1667, #1669 and #1683 close with it.

## Related

- #1667, #1669, #1672 and #1683: the upstream advisory watch's issues.
- #1681: the bundle that took `vite` 8.3.6 and `@clerk/backend` 3.27.0.
- DEBT-535: the `minimatch` advisory, GHSA-g3hv-75wg-m249, waits on Stryker.
- DEBT-503: the Clerk Backend API allowance, which `lib/clerk-backend-call-limit.ts` protects.
- `docs/policies/supply-chain.md`: Urgent CVE patches before the 7-day cooldown.

Corrected 2026-11-15: `ws` (#1683) joins the bundle, clearing the gate before Clerk, so the title names four advisories and Impact names the three open issues; `@tailwindcss/postcss` is 4.3.5 since #1702, with the same `^8.5.25`; the advisory database still lacked all four on 2026-11-15.

Corrected 2026-11-21: Resolution names the hand-added updates and the deferred scope-check script.

Corrected 2026-11-22: all four fixes are past the gate; the 2026-11-22 queue review moved the due date to 11-25 and recorded Dependabot #1718's Clerk failures.

Corrected 2026-11-22: the bundle takes #1718, #1717 and #1705, adds the `ws`, `brace-expansion`, `postcss` and `nanoid` changes with the drift check passing on each, tags the test tokens, and is Verifying on merge. The drift check ships in its own pull request.
