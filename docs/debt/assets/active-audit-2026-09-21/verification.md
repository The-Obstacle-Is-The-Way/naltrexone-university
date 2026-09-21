# Active-debt audit — 2026-09-21

## Scope and limits

Audit snapshot: `origin/dev` `e5ca21661594dafa80b9751e63c7957a7499d41a`,
`origin/main` `76e65e9c0e06581d92100998a173bf9946428bea`; both have tree
`694aa4247114f3c1fe0b578082e7c77f9e9faee4`. Fetch succeeded, the working tree
was clean, and GitHub reported no open PRs. The 14 Active records were read
against their current implementation and available external evidence. This
change is documentation only; no runtime, workflow, dependency, floor or test
assertion is changed.

Evidence categories matter: current code/settings and reproducible counts are
rechecked below; historical test timings and red mutations remain attributed
receipts, not experiments rerun by this sweep. Historical source anchors refer
to their named snapshots. A mechanical file/line-existence check cannot prove
the sentence at that line. Private owner attestations, live billing/dashboard
templates, legal applicability facts and previously captured Sentry observations
cannot be certified from this TEST-only audit. They are not silently promoted
to current verified facts. No live Stripe mutation, cron invocation, customer
message, database migration or content seed was used for the read-only audit.

## Disposition of all fourteen records

| Record | Verified current result | Finished but not correctly recorded | Real remainder / disposition |
| --- | --- | --- | --- |
| 414 | Public legal routes return 200; annual-only 15–45-day notice selection and nonlinked message paragraphs remain in code. Issues #902/#903 remain Open. | Revised Privacy publication was already recorded; the old July baseline SHA is retrievable from GitHub even though absent locally. | Keep Active: F01–F07/F15/F19 engineering, operational/source evidence, focused licensed review and frozen existing-subscriber change policy. Owner go and private/counsel evidence are still needed. This is not a new legal opinion. |
| 465 | `quality:crap` exists; no Stryker config/dependencies, no acceptance directory; both QA procedures Draft. | Part 1 is implemented. The 445-file/2,177-function ranking is the August 22 baseline, not today's ranking. | Keep Open: mutation pilot, acceptance harness and two evidenced runs per QA procedure; no numeric gate without ADR authorization. |
| 468 | Required provider-success/redirect boundary remains distinct from scheduled hosted DOM. Thin tag/bookmark integration suites still contain one/two cases. | Scheduled provider run `35510373087` passes all six cases; the activation checkbox was stale. DEBT-486 narrows the old parser gap but does not establish all hashing-helper coverage. | Keep Open: bounded direct behavior tests, provider-fake/fixture migrations and accepted-residual decisions. Proposed numeric thresholds are owner/ADR-gated. |
| 469 | 27 tracked test-file size suppressions; warn/800 and both error-on-warning flags still active. | Attempt-repository suppression retired in #922; #919 no longer blocks cron-suite work. “Warnings cannot block” and “no codecov.yml” were stale. | Keep Open: concern-based split burn-down. W5's dated observation duty remains; the six-month period has not elapsed. |
| 472 | Floors 22/240/45; raw casts 278 in 59 files; RepoDb casts 138 in 21 files; 24 contract-register rows (three shared contracts, 21 waivers). | Five real-Postgres filter twins and two repository dispositions are promoted; #923 replaced the old alias-resolution classifier. Index guard convention and migration order already exist. | Keep Active: remaining doubles/factories, three setup factories outside the walk, five type lies, 21 RepoDb files, provider-fake migrations, live legacy-ruling adjudication. |
| 473 | All eight steps implemented, reviewed/promoted. Ruleset and empty Dependabot store rechecked. | Old step-6/7 pending-merge qualifiers are superseded by #926/#927/#928. | Keep Open until an actual Dependabot-authored CI run records the decided E2E omission; a schedule alone is insufficient. |
| 474 | Actions CRON_SECRET count zero; Dependabot secret count zero; three Vercel rotation timestamps and zero branch overrides match the recorded operation. Schedules enabled. | Scoping/pins, policy, standard and rotation are shipped, not pending code. | Keep Open: no retained post-rotation scheduled 200 for either cron was retrieved. Hobby retention is one hour; lack of retained logs does not establish a failed run. |
| 476 | Original alerts: twelve fixed, #55 dismissed `not_used`; current override still 3.1.7. | Sentry/Lucide #892 and promotion #893 are merged, contrary to the old pending note. | Keep Open until 3.1.8 is eligible and a separately approved implementation lands; no version change in this audit. |
| 479 | Public metadata/crawl gaps still reproduce; client sampling zero, server sampling 5%; 14 rate policies. | SPEC-016/017 corrections and E1 deferral shipped in #936; helper recovery is resolved by #960/#961. | Keep Open: metadata/crawl/social work; structured data and browser measurement are owner choices, not required work inferred from an empty dashboard. |
| 480 | Anonymous security.txt GET is 404 for `*/*`, 307 for HTML; exact public exemption remains absent. | Renewal reminder shipped under 475, but is not HTTP access proof. | Keep Open: exact-resource exemption with positive/negative proxy and HTTP proofs. No new channel/expiry mechanism is needed. |
| 481 | Schema 21 tables vs master 14; 29 action declarations vs the old copied inventory; stale CI/seed/timing examples remain. | #936's warning banners are shipped containment, not a pending PR or reconciliation. | Keep Open: one source of truth per contract, reconcile master and four copies without changing product rules. |
| 483 | Managed corpus preparation still deletes before regeneration; sync still commits per question. | #952/#953/#954 safeguards are on deployed main, not dev-only. | Keep In Progress: managed staging, immutable release/freshness/atomic activation/rollback and archived-question review. No production incident is asserted. |
| 484 | Graded-history guard checks substantive content before updates; attempts/sessions have no immutable content-revision binding. | #951 guard is on deployed main, not pending release. | Keep In Progress: revision/session identity, ungraded-session race and archived-question review. Separate content-repository policy was not reauthenticated. |
| 486 | Real seed parser is called from import; 958/958 local MDX parse; zero uncited authored files; implementation is on deployed main. | Only the release readback was missing. | Resolve/archive with pointer stub; do not conflate this validator with 483's corpus atomicity or 484's revision work. |

## Executed current-tree checks

- `git fetch --prune origin`; `git --no-pager rev-parse origin/{dev,main}^{tree}`:
  identical snapshot tree above. `gh pr list --state open`: `[]`.
- Imported the three floor maps from `tests/test-double-fidelity-ratchet-floors.ts`:
  **22 / 13 files**, **240 / 48 files**, **45 / 18 files**. A tracked test/spec
  text census gives **278** `as unknown as` occurrences / **59** files and
  **138** `as unknown as RepoDb` occurrences / **21** files. Textual occurrences
  include fixture strings and are not the AST ratchet count. The same tracked
  test census finds **27** size-suppression directives.
- `tests/integration/controllers.integration.test.ts:615-619` still spreads
  the repository instance; private-field casts remain at
  `lib/container.test.ts:528,531,560` and
  `src/application/test-helpers/fakes/fake-practice-session-repository.test.ts:22`.
  The browser setup's three factory calls remain at
  `practice-session-page-model.browser.setup.ts:32,37,43`.
- `db/schema.ts`: **21** `pgTable` declarations; master spec: **14**.
  Controller source: **29** exported `createAction` declarations.
  `src/adapters/shared/rate-limits.ts`: **14** policy constants.
  [SPEC-017](../../../specs/spec-017-rate-limiting.md) distinguishes these from its **13 invocation sites / 18 operations**.
- Read-only filesystem census (including ignored generated MDX, not merely
  `git ls-files`) invokes `parseSeedQuestionFile(raw, path)`:
  **958 files / 958 parsed / 948 authored / 10 synthetic / 0 uncited authored**.
  Only ten question fixtures are tracked; this is not a production DB count.
- Current validator anchors: `scripts/draft-question-import.ts:360-362`
  invokes `parseSeedQuestionFile`; `scripts/seed/question-parser.ts:92-131`
  restricts the synthetic exception and validates the canonical body.
  `scripts/seed/question-syncer.ts:199-204` prevalidates before iteration,
  but `:261` still opens a per-question transaction. Managed replacement is
  still delete/regenerate at `scripts/seed-environment-runtime.ts:108-123`.
- Focused command: `pnpm test --run scripts/draft-question-body.test.ts scripts/seed.test.ts scripts/import-draft-questions.test.ts scripts/draft-question-import.test.ts scripts/draft-question-split.test.ts tests/ci-workflow.test.ts tests/playwright-lane-policy.test.ts tests/shared/stripe-provider-gate.test.ts scripts/run-stripe-provider-contracts.test.ts scripts/run-stripe-provider-contracts-process.test.ts`:
  **10 files / 232 tests passed**, September 21 11:59 UTC. No new behavior was
  implemented, so this is a regression/readback check, not a new red proof.
- Historical anchor census: removed trial-clock wrapper filenames and the
  deleted attempt-unit line numbers belong to the explicit pre-fix snapshots.
  Tree hashes are not commit IDs. Rebased review heads need not be ancestors
  of main; merged implementation commits below are. GitHub resolves the
  otherwise-unavailable `a9c17d90` to its full historical commit. No valid
  historical identifier is silently replaced with a newer one.

## GitHub, schedules and credentials (metadata only)

`gh api repos/The-Obstacle-Is-The-Way/naltrexone-university/rulesets/17666822`:
active `main-and-dev-protection`, targets main and dev, no bypass actors,
strict `test` from GitHub Actions, required PR/thread resolution, deletion and
non-fast-forward protection, zero required approvals. It allows merge/squash/
rebase methods; merge commits and exact-head CodeRabbit remain process rules.
Codecov is not in the required-context list. `codecov.yml` only ignores E2E;
no Vitest numeric threshold was found.

Actions-secret metadata: **zero** entries named CRON_SECRET. Dependabot-secret
metadata: **zero total entries**. Vercel metadata (no value retrieval) records:

| Scope | CRON_SECRET last updated, UTC | Branch-specific override |
| --- | --- | --- |
| Production | 2026-09-20 09:39:23.517 | no |
| Preview | 2026-09-20 09:39:24.877 | no |
| Development | 2026-09-20 09:39:26.314 | no |

Both project cron definitions are enabled and match `vercel.json`: reconciliation
at 08:00 and renewal notices at 09:00 UTC. The team API reports **Hobby**.
`vercel logs --project naltrexone-university --environment production --since 12h --json`
returned only three recent middleware records; the `/api/cron/` filtered query
returned zero records. An absolute time-range query returned HTTP 400 and is
not evidence of an empty invocation window. The [documented one-hour retention](https://vercel.com/docs/logs/runtime)
means a post-11:49 UTC query cannot establish today's earlier outcomes. Hobby
cron timing is approximate within the scheduled hour, not a promise of firing
at minute zero ([Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)).
Capture during/just after each next window or obtain a previously saved owner
receipt. Neither a manual probe nor deployment health can close 474.

`gh run list --user 'dependabot[bot]' --created '>=2026-09-20'` returned `[]`
before 13:00 UTC. The weekly npm schedule is Monday 09:00 America/New_York
(13:00 UTC on this date); scheduling does not guarantee a PR/CI run. Do not
fabricate a bot receipt by relabeling a human run or manually executing a
Dependabot head with shared credentials.

The latest completed scheduled provider run is
[35510373087](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35510373087),
head `86336194`, event `schedule`, success. Its log at **2026-09-20 12:22:37 UTC**
contains **`[stripe-provider] PASS executed=6 passed=6 skipped=0`**. Activation
run `33038731445` is independently confirmed successful (manual, August 27).
The scheduled trigger's actual start was later than its configured 07:17 UTC;
configuration is not a punctuality guarantee. No new live-provider run was
needed for this documentation audit.

Alert API readback: #51–54, #56–63 remain fixed; #55 remains dismissed
`not_used` at **2026-09-16 13:45:31 UTC**. The installed Solana builds import
`jayson/lib/client/browser`, whose only imports are `uuid` and
`../../generateRequest` (itself only `uuid`); the separate `jayson/lib/utils`
imports stream-json. No app Web3/Solana strategy was found. This preserves the
bounded reachability rationale, not a claim the package has no vulnerability.
`pnpm view fast-uri time --json` reports 3.1.8 publication
**2026-09-15T07:36:25.444Z**; eligibility is exactly seven days later.
The pin remains 3.1.7; no release-age exception is added. Sentry/Lucide #892
merged as `a0d4378e` and promotion #893 as `58a99635` on September 16.

## Reviewed implementation and release proof

GitHub REST review objects, Actions run metadata and local merge ancestry were
checked independently of PR summaries:

| PR | Exact approved source head | Formal review | Merge | Successful CI |
| --- | --- | --- | --- | --- |
| 936 — spec corrections | `605a72cf` | `5260949383` | `327f95ef` | source approval and main ancestry rechecked; no new local spec implementation |
| 949 — 486 validator | `852c26d5` | `5261681489` | `b2efba9c` | `35535698571` |
| 951 — 484 history guard | `d8bf8adc` | `5261726459` | `269ffeec` | `35536461282` |
| 952 — 483 seed preflight | `936de53e` | `5261750605` | `31d3a718` | `35537614430` |
| 953 — 483 withdrawal | `0aeda526` | `5261806134` | `8da15de2` | `35538749320` |
| 954 — 483 staging guard | `844cc5cb` | `5261882451` | `65bd70c0` | `35540192530` |

Every merge above passes `git --no-pager merge-base --is-ancestor <merge> origin/main`.
Promotion #959 merged as `4cd9d442` with the recorded one-time owner waiver
for an exact-head formal approval object; its formal approval was on
`1316e415`, not final `68608edc`. This audit does not rewrite that as ordinary
approval. Current promotion #967 **does** have formal review `5263111572`
approving exact head `e5ca2166` and merged as `76e65e9c`.

Readback at **2026-09-21 12:04 UTC** confirmed production serves `76e65e9c`,
READY/PROMOTED, matching the production alias. Main
[CI 35562531386](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35562531386)
is successful. Its previously captured lane ledger is 4,495 unit / 411 browser /
349 integration plus six intentional provider skips / 44 required E2E. The
release-gate timestamps read back from Vercel are:

- Build ready: **04:54:06.311 UTC**.
- Main GitHub `test` completed: **05:02:25 UTC**.
- Vercel's required `test` succeeded: **05:02:27.464 UTC**.
- Production alias assigned: **05:02:27.646 UTC**.

The prior staged observation and full main check ledger are retained in
[the #967 release receipt](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/967#issuecomment-5755642836).
These are already deployed implementation receipts, not advance claims that
the new documentation PR has merged.

## Production HTTP readback

Signed-out GETs, redirects disabled, September 21 shortly before 12:00 UTC:

| Path | Accept | Status / observation |
| --- | --- | --- |
| `/` | `*/*` | 200; no canonical or Open Graph tags |
| `/api/health` | `*/*` | 200; `ok=true`, `db=true` |
| `/privacy`, `/terms` | `*/*` | 200; same inherited description; no canonical/Open Graph |
| `/robots.txt`, `/sitemap.xml` | `*/*` | 404; Clerk `protect-rewrite` |
| `/.well-known/security.txt` | `*/*` | 404; Clerk `protect-rewrite` |
| `/.well-known/security.txt` | `text/html` | 307 to sign-in |
| `/sign-in`, `/sign-up/verify-email-address` | `*/*` | 200; inherited description; no noindex |

Only the named public paths were requested. No authenticated production
mutation was made, no secret/provider object ID is included, and a public 200
is not used to certify legal adequacy, private content or cron execution.

## Proposed next work — requires owner approval, not executed here

Relative Markdown file/directory link audit over `docs/**` and `AGENTS.md`:
baseline **630 broken occurrences / 316 missing destinations**; after this
change **630 / 316**, **zero new missing destinations**. Anchors are excluded
from this count. The archived 486 record's relocated links resolve, and its
old path is a compatibility pointer. Unrelated historical broken links were
not repaired in this audit.

Highest-value small next item: **DEBT-480**, because a real production security
contact is inaccessible and a narrow exact-resource fix has a clear red/green
contract. Then address DEBT-483's managed staging before broader release/revision
work, and reconcile DEBT-481 before copying stale specs into further changes.
Collect 473/474 receipts independently, and handle 476 after its precise age
gate. Resume 472 migrations with 468/469, not as a new scanner project. Public
metadata steps 479.1–3 are separable from optional 479.4–5 decisions; 465's new
testing practices follow the existing fixture prerequisite. 414 is the highest
pre-paid-acquisition owner/counsel gate, not a claim that small engineering
cleanup can close legal compliance.

New observation (report only): issue #423 still describes the older cron
verification deferral; no issue or new debt record was changed in this sweep.

## Follow-up receipt — DEBT-473, 2026-09-21 13:18 UTC

This dated receipt supersedes only the earlier snapshot's DEBT-473 Open
disposition. The audit was promoted by #969 (`3f3eed65`); main CI `35602596483`
passed 4,495 unit / 411 browser / 349 integration plus six intentional provider
skips / 44 required E2E, without failures or retries. Dev/main tree is
`b88f541a18409f65687d5e5c7be0b570346f1972`. Vercel held the ready build at
13:00:11 UTC, observed main `test` success at 13:08:19.840, then assigned the
production domain at 13:08:20.021; home/health returned 200.
[Promotion receipt](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/969#issuecomment-5761024141).

The scheduled Actions updater `35603829211` opened Dependabot #970. Its actual
[CI run 35603926345](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35603926345)
at head `10568e0e73b784344220330c99e981973a1643c9` finished successfully at
13:16:36 UTC: all four non-E2E lanes passed, E2E was skipped, and the executed
evidence summary warned at 13:16:32.006 that shared TEST credentials are withheld
from Dependabot and main E2E gates production promotion. Unit/browser/integration
counts are 4,495 / 411 / 349, with the existing six opt-in provider skips. The
separate npm updater was still running when this receipt was captured; its
completion is not needed to prove the same actor-based CI policy. No Dependabot
head was executed locally and no dependency PR was merged by this audit.

DEBT-473 can now be Resolved and archived with its old-path pointer. This leaves
**12 Active records**. DEBT-474 still needs retained scheduled cron 200s;
DEBT-476 is still date-gated. No new implementation is included.
