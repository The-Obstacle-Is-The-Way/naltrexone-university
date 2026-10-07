# DEBT-509: Pending Next.js Security Fixes Have No Watcher

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — response decided and watcher added (2026-10-07); waiting for its first hosted run and the two pending Next.js fixes
**Priority:** P2
**Date:** 2026-10-07
**Resolved:** —
**Verification receipts:** —

---

## Summary

Next.js's September 30 security release fixed seven advisories in 16.3.8. Two more, one critical and one high, were held back and will ship in a later release. When they ship, the 7-day release-age gate (`minimumReleaseAge: 10080`) keeps them out of this repository for a week unless an exception is taken.

Nothing here would have noticed that release. The seven September 30 advisories are not in GitHub's advisory database, so Dependabot raised no alert for any of them. This repository learned of the release only because CodeRabbit searched the web while reviewing #1409. On 2026-10-07 the owner delegated both decisions below: when a fix may skip the gate, and how to watch for advisories.

## Evidence

Checked on 2026-10-07 against `dev` at `3cf3b85c`.

- **The two pending fixes.** Next.js's [advance notice](https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026), updated on September 30: "This release now addresses seven vulnerabilities instead of nine. The remaining two (one **critical**, one **high**) are pending upstream coordination and will be addressed in a later Next.js release." The [release post](https://nextjs.org/blog/september-2026-security-release) lists seven advisories, none critical.
- **Still unreleased.** `vercel/next.js` has published no advisory since the seven on 2026-09-30. Next.js 16.4.0 (npm, 2026-10-06T18:35Z) lists no security fix; its security entries are upgrade-prompt tooling.
- **Versions.** `dev` and `main` run `next` 16.3.6. #1409 moves it to 16.3.7, and to 16.3.8 once that version clears the release-age gate at 2026-10-07T16:07:21Z.
- **A separate critical, already fixed.** GHSA-vcvr-r3jv-pc5j (remote code execution in `next/og`'s Node `ImageResponse`) was published on 2026-09-30 and is fixed in 16.3.6, which `dev` and `main` already run. The September 30 note still calls the critical fix pending, so it is not this one. `app/opengraph-image.tsx` renders constant content and reads no request input, so it was not exposed either.
- **No alerts.** `gh api 'advisories?ghsa_id=<id>'` returns nothing for any of the seven IDs, reviewed or unreviewed. They exist only as repository advisories on `vercel/next.js`, and several give their ranges as `16.3.?`, which may be why they were not imported. The repository has no Dependabot alert for any of them. Earlier `next` advisories did reach the database, including alerts #28–#31, #41–#42 and #59–#62, and GHSA-vcvr-r3jv-pc5j was reviewed on publication, so coverage is inconsistent rather than absent.

## Exposure to the Seven Published Advisories

| Advisory | Severity | Affected when | This app | Verdict |
|---|---|---|---|---|
| GHSA-cjq9-62q9-8jv4 | High | `images.remotePatterns` is configured | `next.config.ts` has no `images` key | Not affected |
| GHSA-4jqv-mc3x-m676 | Medium | Self-hosted Pages Router with SSG or ISR | App Router only, hosted on Vercel | Not affected |
| GHSA-mcj8-r9mp-w47p | Medium | A root-level catch-all page with SSG or ISR | The only catch-alls are `app/sign-in/[[...sign-in]]` and `app/sign-up/[[...sign-up]]` | Not affected |
| GHSA-f87g-xv8r-7p7x | Medium | Metadata image routes under dynamic segments, built with webpack | `app/opengraph-image.tsx` has no dynamic segment; builds use Turbopack (CI log: `Next.js 16.3.5 (Turbopack)`) | Not affected |
| GHSA-h694-7cp9-m8p3 | Medium | Nested `'use cache'` functions reading a root param | `cacheComponents: true`, with `'use cache'` in three marketing and pricing files; no root params | Not affected |
| GHSA-3w37-wq28-93x7 | Medium | `'use cache'` with Draft Mode | No `draftMode` | Not affected |
| GHSA-39w2-rjm5-chcv | Low | `next dev` only | Local development runs `next dev` | Developer machines only, until #1409 takes 16.3.8 |

No production surface is affected, so #1409 takes 16.3.8 through the normal gate, without an exception.

## Response When the Pending Fixes Ship — Decided 2026-10-07

The rule now lives in the supply-chain playbook, [When a fix is urgent](../dev/supply-chain-overrides.md#when-a-fix-is-urgent). In short: the 7-day gate defends against malicious publishes, which are usually pulled within hours to days, while a critical framework flaw can be exploited within hours of disclosure. So a critical or high fix that affects this app, or whose exposure cannot be ruled out, ships the same day under exact-version exceptions. Everything else waits for the gate.

For the two pending Next.js fixes:

1. **Assess** each advisory against this app:
   - App Router, built with Turbopack and hosted on Vercel;
   - `cacheComponents` with `'use cache'`, and a static `next/og` Open Graph image;
   - Clerk middleware in `proxy.ts`, and Server Actions;
   - no `images` configuration, Draft Mode, root params or root-level catch-all.
2. **If urgent,** list exact versions in `minimumReleaseAgeExclude`: `next` and each same-version companion pnpm refuses. `next` pins `@next/env` and eight `@next/swc-*` platform packages, published with it; for 16.3.8, `@next/env` was published 11 minutes earlier. Then run the full gate, get exact-head review, and promote.
3. **Otherwise,** take the fix through the normal path once it clears the gate.

## Watcher — Added 2026-10-07

[Advisories Dependabot cannot see](../dev/supply-chain-overrides.md#advisories-dependabot-cannot-see) describes it. `.github/workflows/upstream-advisory-watch.yml` runs `scripts/upstream-advisory-watch.ts` every six hours. The script reads `vercel/next.js`'s published advisories and opens one issue for each advisory published since 2026-10-01; the September 30 set is triaged here. Each issue copies the advisory's facts and ranges verbatim, because ranges can be malformed, and gives `package.json`'s pin for each affected package. An issue of any state settles its advisory, so a closed, triaged issue is never reopened.

A local run on 2026-10-07 read 69 published advisories and would have opened none: the newest is from 2026-09-30. Under AGENTS.md's evidence rule, the watcher is proven only after its first hosted run on `main`.

## Exit

Close when the watcher has a successful hosted run, and both pending advisories are published, assessed, and either fixed in production or recorded here as not applying.

## Verification

- [x] Primary sources read, and the seven published advisories assessed against this app (2026-10-07).
- [x] Response decided under the owner's delegation, and recorded in the supply-chain playbook (2026-10-07).
- [x] Watcher implemented test-first, with a local run against the live advisory list (2026-10-07).
- [ ] The watcher's first hosted run on `main` succeeds (dispatch it after promotion).
- [ ] Both pending advisories are published and assessed.
- [ ] The fix is in production, or this record says why it does not apply.
