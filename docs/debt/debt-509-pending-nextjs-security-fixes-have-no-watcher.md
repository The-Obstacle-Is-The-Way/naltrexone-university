# DEBT-509: Pending Next.js Security Fixes Have No Watcher

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — rule decided; the watcher now covers every repository behind `pnpm-lock.yaml`; waiting for a scheduled run that reads them, `vite` 8.3.3 and the two pending Next.js fixes
**Priority:** P2
**Date:** 2026-10-07
**Resolved:** —
**Verification receipts:** —

---

## Summary

Next.js's September 30 security release fixed seven advisories in 16.3.8. Two more, one critical and one high, were held back and will ship in a later release. When they ship, the 7-day release-age gate (`minimumReleaseAge: 10080`) keeps them out of this repository for a week unless an exception is taken.

Nothing here would have noticed that release. The seven September 30 advisories stayed out of GitHub's advisory database for a week, so Dependabot raised no alert for any of them until 2026-10-08, and one is still missing. This repository learned of the release only because CodeRabbit searched the web while reviewing #1409. On 2026-10-07 the owner delegated both decisions below: when a fix may skip the gate, and how to watch for advisories.

## Evidence

Checked on 2026-10-07 against `dev` at `3cf3b85c`.

- **The two pending fixes.** Next.js's [advance notice](https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026), updated on September 30: "This release now addresses seven vulnerabilities instead of nine. The remaining two (one **critical**, one **high**) are pending upstream coordination and will be addressed in a later Next.js release." The [release post](https://nextjs.org/blog/september-2026-security-release) lists seven advisories, none critical.
- **Still unreleased.** `vercel/next.js` has published no advisory since the seven on 2026-09-30. Next.js 16.4.0 (npm, 2026-10-06T18:35Z) lists no security fix; its security entries are upgrade-prompt tooling.
- **Versions.** `dev` and `main` run `next` 16.3.6. #1409 moves it to 16.3.7, and to 16.3.8 once that version clears the release-age gate at 2026-10-07T16:07:21Z.
- **A separate critical, already fixed.** GHSA-vcvr-r3jv-pc5j (remote code execution in `next/og`'s Node `ImageResponse`) was published by Next.js on 2026-09-22, alongside 16.3.6, which `dev` and `main` already run. It reached GitHub's advisory database only on 2026-09-30, eight days later. The September 30 note still calls the critical fix pending, so it is not this one. `app/opengraph-image.tsx` renders constant content and reads no request input, so it was not exposed either.
- **No alerts.** `gh api 'advisories?ghsa_id=<id>'` returns nothing for any of the seven IDs, reviewed or unreviewed. They exist only as repository advisories on `vercel/next.js`, and several give their ranges as `16.3.?`, which may be why they were not imported. The repository has no Dependabot alert for any of them. Earlier `next` advisories did reach the database, including alerts #28–#31, #41–#42 and #59–#62, and GHSA-vcvr-r3jv-pc5j was reviewed on publication, so coverage is inconsistent rather than absent.
- **Update, 2026-10-08.** Six of the seven reached the database as reviewed advisories at 2026-10-07T20:30–20:32Z, seven days after Next.js published them. Dependabot raised alerts #84–#95 at 2026-10-08T05:50Z, one per advisory for each of `package.json` and `pnpm-lock.yaml`, and opened security PR #1425 into `main` for 16.3.8. GHSA-h694-7cp9-m8p3 is still missing. As with #1404, the fix reaches `main` through `dev`, here in #1409, and Dependabot then closes its PR.

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

[Advisories Dependabot cannot see](../dev/supply-chain-overrides.md#advisories-dependabot-cannot-see) describes it. `.github/workflows/upstream-advisory-watch.yml` runs `scripts/upstream-advisory-watch.ts` every six hours.

- **What it watches.** The repository of every direct dependency, listed in the script's `DEPENDENCY_REPOSITORIES` map from each package's npm `repository` field: 41 repositories for 54 dependencies. Only `server-only`, a marker package, names none. A test fails CI when `package.json` and the map disagree, so a new dependency cannot go unwatched. Since 2026-10-08 it also watches the repositories behind every other package in `pnpm-lock.yaml`, resolved when it runs; see below.
- **What it opens.** One issue per advisory published since 2026-10-01; the September 30 set is triaged here. Each issue copies the advisory's facts and ranges verbatim, because ranges can be malformed, and gives `package.json`'s pin for each affected package. An issue of any state settles its advisory, so a closed, triaged issue is never reopened.
- **Failure handling.** Only advisories published since the start are validated, so one malformed historical entry cannot fail every run. One unreadable repository, or one issue that cannot be opened, does not block the others: the run raises what it can, then fails and names what it could not. Only a failure to list existing issues fails the run outright, because without that list nothing can be deduplicated.
- **Who it notifies.** An issue alone notifies only people watching the repository, which a repository owner can turn off. Critical and high advisories are therefore assigned to the repository owner, because GitHub notifies an assignee whatever their watch setting. Medium and low advisories open unassigned. The volume makes this split matter: in the 12 months to 2026-10-07 the watched repositories published 81 advisories, 45 of them critical or high, about one a week. 45 of the 81 were Next.js's.

**Why every dependency, not a list.** The first version watched only Next.js. On 2026-10-07 a reviewer asked whether Clerk should be added. Measuring every dependency repository answered it: Clerk's 5 published advisories had all reached GitHub's database, but Sentry and Vite each had advisories that had not. That makes a hand-picked list the wrong shape, and the map plus its test the right one. The measurement is in the playbook's table.

**Vite, found by the measurement.** Three Vite advisories from 2026-10-06 (GHSA-rq7h-c2jc-7f22 and GHSA-vfpm-58rq-9qcg, medium; GHSA-9jrq-w75r-8gcw, low) affect `vite` 8.3.0 to 8.3.2. This repository runs 8.3.0, and #1409 moves it to 8.3.1. They concern Vite's development server, which runs only on developer machines and in CI test runs, so under the playbook rule they are not urgent. The fix, 8.3.3, was published at 2026-10-06T04:10:19Z and clears the release-age gate at 2026-10-13T04:10:19Z; take it in the next dependency update.

**Indirect dependencies, added 2026-10-08.** The first version left indirect packages to Dependabot, so a reviewer asked whether that was enough. Measured, it was not. 55 of this repository's 90 Dependabot alerts were in indirect packages, such as `undici`, `fast-uri`, `braces` and `shell-quote`. In the year to 2026-10-08, the repositories reached only through indirect dependencies published 109 advisories, 48 critical or high. 106 reached GitHub's database, a median of 5 days after publication, and 41 took more than a week, against a median of 1.8 days for direct dependencies. `pnpm audit` and OSV read the same database, so neither closes the gap. The watcher now reads all 465 repositories behind `pnpm-lock.yaml`. From the 424 reached only indirectly it raises critical and high advisories, plus any of unknown severity. Medium and low ones are left to Dependabot: 106 of the 109 arrived, and none of the other three affected this app. Each issue shows every version the lockfile resolves beside the advisory's range, because ranges are free text: of the year's 340 ranges for packages in this lockfile, 28 could not be read as semver ranges, and `7.0.0 < 7.28.0` parses as valid but with the wrong meaning. The playbook has the details.

**Fewer false alarms, added 2026-10-08.** Indirect dependencies would have raised about two critical or high issues a week, and 13 of the 33 in the 16 weeks to 2026-10-08 never affected this app. The upstream ranges cannot be trusted to rule an advisory out. Read as GitHub's syntax, they would have ruled out two that did affect it: `brace-expansion`'s high GHSA-rgw5-rvv9-x895, whose commas meant "or", and `next`'s GHSA-3w37-wq28-93x7, whose bare `16.3.0` covered 16.3.5. So issues still open on the upstream advisory. Once GitHub's review, which Dependabot reads, rules out every locked version, the watcher closes the issue with the evidence. Across the 95 advisories of those 16 weeks, that would have closed 10 of the 13 and none that Dependabot alerted on. The same check means an advisory already reviewed and ruled out when first seen opens no issue. The repository is public, so only the watcher's and the owner's issues settle an advisory; a stranger's issue titled with its GHSA ID would otherwise have kept its alert from opening.

**Local dry run (2026-10-07).** The real advisory and issue reads, with issue creation replaced by a recorder, read all 41 repositories without error and would open exactly the three Vite issues. The first hosted run on `main` should therefore open those three; triage them as above. Under AGENTS.md's evidence rule, the watcher is proven only after that hosted run.

**First hosted run (2026-10-08).** Run 37817779642, dispatched on `main` at 17:35:43Z, succeeded in 31 seconds and opened exactly the three Vite issues, #1432–#1434, unassigned. Each was triaged as not urgent: `vite` is a devDependency used only by tests, and `vite-plus` is not installed. All three were closed at 17:36Z. GitHub can start a scheduled run late, or drop it, under load ([GitHub docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). Here the delay is hours: in the 30 days to 2026-10-08, the daily 09:23Z Stripe Checkout smoke started 3.6 to 9.2 hours late, 5.0 at the median. The watcher, due at 18:23Z, 00:23Z, 06:23Z and 12:23Z, started at 23:27:53Z (run 37859575180) and 06:22:35Z (run 37893200724), and had not started again by 13:01Z on 2026-10-09. GitHub does not record which slot a run belongs to. Both runs succeeded in about 31 seconds and raised nothing. So a new advisory can wait about half a day before a run reads it, longer if GitHub drops a run.

**Local dry run with indirect dependencies (2026-10-08).** Real registry, advisory and issue reads, with issue creation replaced by a recorder, resolved all 976 locked packages in 12 seconds. The run read 464 of the 465 repositories in 170 seconds and would open no issue: the Vite issues already exist, and no indirect repository has published a critical or high advisory since 2026-10-01. Not watched: `client-only` and `eyes`, which name no repository, and `commondir`'s deleted `substack/node-commondir`.

## Exit

Close when the watcher has a successful scheduled run that reads the indirect dependencies' repositories, the Vite fix has landed, and both pending Next.js advisories are published, assessed, and either fixed in production or recorded here as not applying.

## Verification

- [x] Primary sources read, and the seven published advisories assessed against this app (2026-10-07).
- [x] Response decided under the owner's delegation, and recorded in the supply-chain playbook (2026-10-07).
- [x] Watcher implemented test-first, covering every direct dependency's repository, with a local dry run against all 41 (2026-10-07).
- [x] The watcher's first hosted run on `main` succeeded and opened the three Vite issues, unassigned because they are medium and low: run 37817779642, issues #1432–#1434 (2026-10-08).
- [x] The three Vite advisories triaged as not urgent, and their issues closed (2026-10-08).
- [x] Indirect dependencies watched, implemented test-first, with a local dry run that read 464 of 465 repositories (2026-10-08).
- [x] Issues that GitHub's review rules out close themselves, implemented test-first and checked against the 95 advisories of 2026-06-14 to 2026-10-08 with no wrong closure (2026-10-08).
- [ ] A scheduled run on `main` succeeds after the indirect change, within the 15-minute timeout and the token's 1,000 requests an hour.
- [ ] The first issue closed after GitHub's review carries correct evidence.
- [ ] The first critical or high issue confirms the owner receives the assignment notification.
- [ ] `vite` 8.3.3 or later lands after 2026-10-13T04:10:19Z.
- [ ] Both pending advisories are published and assessed.
- [ ] The fix is in production, or this record says why it does not apply.
