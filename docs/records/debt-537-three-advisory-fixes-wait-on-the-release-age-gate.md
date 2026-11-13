# DEBT-537: Three Advisory Fixes Wait on the 7-Day Gate

**Status:** Open — one repo-owned bundle takes vite 8.3.7, brace-expansion 5.0.13 and @clerk/backend 3.28.0 once the last clears the gate (2026-11-19 22:54Z); due 2026-11-20
**Priority:** P3
**Date:** 2026-11-13

---

## Summary

Three advisories cover versions installed on `dev`. None is reachable as this app is configured, and none is urgent under `docs/policies/supply-chain.md` (When a fix is urgent). Each fix is published but younger than the 7-day release-age gate. One repo-owned dependency bundle takes all three once the last fix clears the gate. The same bundle corrects the `postcss` override, which no longer matches its consumers.

| Advisory | Issue | Installed | Fixed in | Published | Clears the gate | Reachable here |
|---|---|---|---|---|---|---|
| GHSA-p4f5-76q4-ffq7, `vite`, critical: code execution through the dev server | #1667, open | 8.3.6, pinned in `package.json` | 8.3.7 | 2026-11-09T10:25:29Z | 2026-11-16T10:25:29Z | No. Only a server exposed with `--host` or `server.host` is affected. Vite runs only under Vitest, on localhost |
| GHSA-6jwq-xf8q-xcwh, `brace-expansion`, high: CPU denial of service | #1669, open | 5.0.12, through the `brace-expansion@5` override | 5.0.13 | 2026-11-11T12:27:55Z | 2026-11-18T12:27:55Z | No. Only repository-controlled patterns reach it, through Stryker's and Sentry's bundler plugin's `minimatch` |
| GHSA-wpqf-h9rq-rg73, `@clerk/backend`, medium: OIDC ID tokens accepted as session tokens | #1672, closed as not affected | 3.27.0, through `@clerk/nextjs` 7.9.25 | 3.28.0, with `@clerk/nextjs` 7.9.26 (`^3.28.0`) | 2026-11-12T22:53:39Z (7.9.26: 22:53:12Z) | 2026-11-19T22:53:39Z | No. This Clerk instance issues no ID tokens, 3.27.0's `authenticateRequest()` rejects tagged ones, and nothing calls `verifyToken()` |

## Evidence

- **Each issue holds its assessment.** #1667 and #1669 were assessed on 2026-11-13 and #1672 on 2026-11-12, against the urgent-CVE policy.
- **Clerk.**
  - The owner's dashboard check on 2026-11-12 found no OAuth applications in Development or Production, and Publish CIMD support and Publish DCR support both off. Those are the three ways an instance issues ID tokens.
  - A throwaway test against the installed SDK, not committed, ran the real `clerkMiddleware`. It signed out a token tagged `cl_B7d4PD444AAA`, the ID-token category, whether sent in a cookie or an Authorization header.
  - Nothing in `app/`, `lib/`, `src/` or `proxy.ts` calls `verifyToken()` or sets `acceptsToken` or `authorizedParties`.
  - On 2026-11-13 GitHub's advisory database did not yet hold this advisory: `GET /advisories/GHSA-wpqf-h9rq-rg73` answered 404. So neither Dependabot nor `pnpm audit` reports it. The upstream advisory watch raised #1672 from Clerk's repository advisory.
- **Clerk 3.28.0 changes what tests must sign.** Its `verifyToken()` rejects a token with no `cat` header, because `isNonSessionJwtCategory(undefined)` is true. 3.27.0 rejected only a present, non-session category. These tests sign tokens whose header carries only `alg`, `typ` and `kid`:
  - `lib/clerk-jwt-key-sdk.test.ts`;
  - `lib/clerk-call-failures-sdk.test.ts`;
  - `lib/clerk-backend-call-limit-sdk.test.ts`.
- **`postcss` (no advisory).**
  - `pnpm-workspace.yaml` overrides `postcss` to 8.5.23 for GHSA-r28c-9q8g-f849 and GHSA-fxqj-rqcc-2cmp.
  - Its comment says that version satisfies Vite's `^8.5.23` and that Next.js 16.3.8 pins it exactly. On `dev`, `vite` 8.3.6 (and 8.3.7) declares `^8.5.32` and `@tailwindcss/postcss` 4.3.4 declares `^8.5.25`. `next` 16.4.5 still pins 8.5.23 exactly.
  - So the override holds both packages below their declared ranges. Every path already resolves to a fixed version without it: 8.5.23 is the advisories' fixed version, and 8.5.32 cleared the gate on 2026-11-02.
- **Provenance.** `vite` 8.3.7, `@clerk/backend` 3.28.0 and `@clerk/nextjs` 7.9.26 carry SLSA v1 provenance on npm, as their predecessors do.

## Impact

Nothing reaches users or production. The three issues stay open, or closed with a pending update, until the bundle reaches `main`. The `postcss` override is a compatibility risk: Vite and Tailwind run on a `postcss` older than they declare. The gate passes today.

## Options

1. **Same-day `minimumReleaseAgeExclude` exceptions.** The policy reserves them for critical or high advisories whose affected configuration matches this app. None matches.
2. **One bundle per gate date: 11-16, 11-18 and 11-20.** That is three reviews, three E2E runs and three promotions for three unreachable advisories.
3. **One bundle after the last fix clears the gate (chosen).** `vite` waits four days past its gate, and `brace-expansion` two. Neither is reachable.

## Resolution (decided)

- **On or after 2026-11-19T22:54Z, one repo-owned bundle** by `docs/guides/dependencies/updating-dependencies.md`, from `dev` carrying `main`'s latest promotion:
  - `vite` 8.3.7, pinned in `package.json`;
  - the `brace-expansion@5` override raised to 5.0.13, with its comment updated;
  - `@clerk/nextjs` 7.9.26, so `@clerk/backend` resolves to 3.28.0 or later;
  - the three SDK tests' tokens gain `cat: 'cl_B7d4PD111AAA'`, the session category. Run them red on 3.28.0 first;
  - the `postcss` override removed, or restated with comments that match the installed consumers. Decide this on the bundle's lockfile: without the override, `next` keeps its exact 8.5.23 and Vite and Tailwind resolve 8.5.32 or later.
- **If a fix reaches a later version first,** take the newest version past the gate.
- **Take a fix at once through an exception if it becomes reachable:**
  - a Vite server started with `--host` or `server.host`;
  - a request path that expands user-supplied glob or brace patterns;
  - code that calls `verifyToken()` or sets `acceptsToken`, or an OAuth application, DCR or CIMD enabled in Clerk.

## Verification

- [ ] The bundle merges into `dev`. The lockfile holds `vite` 8.3.7, `brace-expansion` 5.0.13 and `@clerk/backend` 3.28.0 or later, and no `postcss` below a consumer's declared range.
- [ ] The three Clerk SDK tests fail on 3.28.0 before their tokens carry `cat`, and pass after.
- [ ] A promotion carries the bundle to `main`, and #1667 and #1669 close with it.

## Related

- #1667, #1669 and #1672: the upstream advisory watch's issues.
- #1681: the bundle that took `vite` 8.3.6 and `@clerk/backend` 3.27.0.
- DEBT-535: the `minimatch` advisory, GHSA-g3hv-75wg-m249, waits on Stryker.
- `docs/policies/supply-chain.md`: Urgent CVE patches before the 7-day cooldown.
