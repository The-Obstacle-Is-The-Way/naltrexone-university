# BUG-344: The Advisory Watcher Fails Every Run While a New Advisory's Issue Is Open

**Status:** Open
**Priority:** P2
**Date:** 2026-10-15

---

## Summary

The upstream advisory watcher (DEBT-509) failed all four of its runs from 2026-10-14T17:17Z to 2026-10-15T11:37Z. It still did its main job: every new advisory got its issue, and the critical and high ones were assigned to the owner. What failed was its lookup of GitHub's review of an advisory.

With the Actions token, GitHub's endpoint for one global advisory, `GET /advisories/{ghsa_id}`, answers **403 "Resource not accessible by integration"** for an advisory that is not in GitHub's database. A person's token gets 404 for the same request. The watcher treats only 404 as "not in the database", so with the Actions token every lookup of a new advisory threw.

- **Raising swallowed the error.** It opens the issue whenever a lookup fails, so the issues opened.
- **The close sweep did not.** On every run it re-checks each open advisory issue against GitHub's review. Each failed lookup failed the run, for as long as any new advisory's issue stayed open, which is the normal state between raising an advisory and triaging it.
- **The failure named the wrong step.** It printed "Could not open or close issues for: …", so the 403 read as a failed issue write.

## Evidence

### The failing runs

| Run start (UTC) | Raised | 403 responses | Reported as "Could not open or close issues for" |
|---|---|---|---|
| 2026-10-14 17:17 | GHSA-xqc2-xf4c-x3h3, GHSA-h3gv-c5rc-p453, GHSA-qq8j-7v2v-3rwp | 4 | GHSA-xqc2-xf4c-x3h3 |
| 2026-10-14 21:46 | GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r | 8 | five advisories, all with open issues |
| 2026-10-15 04:48 | GHSA-59pf-q495-3c99 | 5 | four advisories, all with open issues |
| 2026-10-15 11:37 | none | 5 | GHSA-59pf-q495-3c99, GHSA-2464-fhr4-w9xw, GHSA-qq8j-7v2v-3rwp, GHSA-h3gv-c5rc-p453, GHSA-xqc2-xf4c-x3h3 |

- **The 403s come from the lookup, not from issue writes.** In the 17:17 run, each of the first three 403s is logged about a second before GitHub created that advisory's issue (#1503 at 17:20:23Z, #1504 at 17:20:26Z, #1505 at 17:20:30Z). That matches raising, which looks an advisory up and then creates its issue. The run's other 403 is the close sweep's lookup for #1503. The sweep's list did not yet include #1504 and #1505, which were seconds old.
- **The failures track open advisory issues.** Each run's failures name advisories whose issues were open at that point. After the five were triaged and closed on 2026-10-15, nothing was left for the sweep to fail on.
- **The first hosted lookup came on 2026-10-14.** The review lookup was written on 2026-10-08 (DEBT-509) and first ran in a scheduled run on 2026-10-10. From then until 2026-10-14 12:00Z, every run raised nothing, logged no 403, and found no open advisory issue to check, so no hosted run had looked an advisory up. The 2026-10-11 12:58Z failure is unrelated: a GitHub 502 while reading one repository's advisories, which the watcher reported as designed.

### The probe (2026-10-15)

A throwaway workflow, dispatched on a branch that was then deleted, called the API with the Actions token under three permission sets: `contents: read` with `issues: write` (the watcher's), no permissions, and `security-events: read`. The answers were the same in all three:

| Request | Actions token | A person's token |
|---|---|---|
| `advisories/GHSA-fv66-9v8q-g76r` (in GitHub's database, reviewed) | 200 | 200 |
| `advisories/GHSA-xqc2-xf4c-x3h3` (published upstream, not in the database) | 403 | 404 |
| `advisories/GHSA-zzzz-zzzz-zzzz` (does not exist) | 403 | 404 |
| `advisories?ghsa_id=GHSA-xqc2-xf4c-x3h3` | 200, `[]` | 200, `[]` |
| `advisories?ghsa_id=GHSA-fv66-9v8q-g76r` | 200, one advisory | 200, one advisory |

The list endpoint returns the same advisory object, with `github_reviewed_at` and `vulnerabilities[].vulnerable_version_range`.

### The code (before the fix)

- `githubAdvisoryDatabase().find` returns `null` only when `gh` reports `(HTTP 404)`, and rethrows anything else (`scripts/upstream-advisory-watch.ts:706-721`).
- Raising calls `database.find(...).catch(() => null)`: "A database that cannot be read rules nothing out, so the issue opens" (`:282-283`).
- `closeReviewedIssues` catches the lookup's error and lists the advisory under `failed` (`:782`, `:796-797`). The runner prints `failed` as "Could not open or close issues for: …" and returns 1 (`:948-952`).

### Why the tests and dry runs missed it

- The unit test models "GitHub's database has neither advisory yet" as `gh: Not Found (HTTP 404)` (`scripts/upstream-advisory-watch.test.ts:536-540`), which is what a person's token gets.
- Local dry runs use a person's token too.
- Only a hosted run sees the Actions token's answer, and none had looked an advisory up before 2026-10-14.

## Impact

- **No alert was lost.** All seven advisories in the window got their issues: #1503, #1504, #1505, #1508, #1509, #1510 and #1518. The critical and high ones were assigned to the owner. All seven are now triaged and closed: #1509 and #1510 on 2026-10-15 at 02:19Z, and the other five later that day.
- **A security job was red for 18 hours while it worked.** Once failing is routine, people stop reading the failures. A real failure, such as being unable to read a repository's advisories, would have looked the same.
- **The failure message misled diagnosis.** It blamed the issue writes, and a reviewing session read it that way.
- **It would recur with every new advisory.** Each new upstream advisory is absent from GitHub's database for hours to weeks. DEBT-509 found Next.js's 2026-09-30 advisories took a week.

## Options

1. **Treat 403 like 404.** Rejected: a 403 also means a token or permission problem. The watcher could no longer tell "not in the database" from "lost access", and lost access would pass silently.
2. **Look the advisory up with the list endpoint,** `GET /advisories?ghsa_id={id}`. It returns `[]` for an advisory not in the database and `[advisory]` for one that is, with either kind of token. Any other answer is then a real failure, and still fails the run. Unless asked, the list leaves out malware advisories: GHSA-r7f7-6833-rxh9 answers 200 from the single endpoint and `[]` from the list. The gap fails safe. The watcher reads advisories that maintainers publish in their repositories, which are not malware advisories; and a missing review rules nothing out, so the issue stays open.
3. **Give the job a personal access token.** Rejected: it adds a long-lived secret only to change a status code, and the list endpoint needs none.

## Resolution (decided)

Option 2, test-first.
- `find` reads `advisories?ghsa_id=` and returns `null` for an empty list. It does not ask for malware advisories (Option 2).
- The unit test models the database's answer as the list endpoint gives it, so it is the answer both token kinds get.
- A failed review lookup in the close sweep is reported as a failed lookup, not a failed issue write, so the message names the failing call.

## Verification

- [x] Root cause reproduced with the Actions token, under three permission sets (2026-10-15).
- [x] The five open advisory issues assessed against `main` and closed, each with its evidence (2026-10-15).
- [ ] The fix lands test-first: a red test for the 403 path, then green.
- [ ] A run of the fixed watcher, dispatched on the fix branch while an advisory issue is open, passes and leaves that issue open.
- [ ] A scheduled run on `main` passes after promotion.

## Related

- DEBT-509: the watcher, and its open check that an issue closed after GitHub's review carries correct evidence.
- DEBT-522: the warning sweep that found this.
