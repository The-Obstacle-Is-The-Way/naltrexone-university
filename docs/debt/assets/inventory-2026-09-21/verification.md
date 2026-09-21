# Debt inventory and security-resource repair — 2026-09-21

## Snapshot and limits

This pass starts from dev `a9f5aa55` and main `d67a3e98`, common tree
`17bf46496358bf7f62f07f7b3965fae015e6105c`. Filesystem access and fetch succeeded;
the working tree was clean. The only four open PRs were Dependabot #970–#973.
No Dependabot head was executed locally. This ledger supplements, rather than
rewrites, [the earlier audit](../active-audit-2026-09-21/verification.md).

Current source/configuration, counts, merge ancestry, GitHub settings and public
HTTP were rechecked. Historical timings, legal conclusions, private owner
attestations and old provider/dashboard specimens remain attributed evidence,
not newly reproduced facts. In particular, this audit does not certify legal
compliance or retrieve live Stripe/Clerk customer data. Unknowns remain open.

## Branches and stashes

`git --no-pager merge-base --is-ancestor <head> origin/main` and the same
command against dev both returned 0 for these branches; neither had an open PR:

| Deleted local and remote branch | Head |
| --- | --- |
| docs/debt-473-verified-closeout | be1061ec1faed86776e28a336cef384fe72c37aa |
| docs/debt-audit-2026-09-21 | d4668f98b7098e742bc3428e55e8f724b68c817f |

Kept main, dev, this inventory branch, all four Dependabot branches and
`wip/debt-472-rate-limiter-integration`. The WIP and bot heads are not ancestors
of main or dev. No unmerged branch was deleted. Remote deletions were explicit
GitHub ref deletions followed by fetch/prune, not a code push.

All four stashes were inspected and their dispositions announced before deletion:

| Stash object | Evidence / disposition |
| --- | --- |
| ff3aff6831a55c2dcbc68aa7414268a1ec51bc91 | Old manifest-pinned Vercel seam, superseded by the owner's exact preinstalled-version ruling and main ancestor `6bd296b2`; current tests retain version/env-pull refusal behavior. Do not restore the rejected dependency-tree pin. |
| 01441d4e15fee7dba44ec7990a28068d37009d90 | Renewal workflow is byte-identical; script/tests are strengthened successors in main ancestors `2e962b0d` and `487c7a01`. |
| ffc5e0d04fdd0e48c0f54ebcb7794d59a1e6f442 | The placeholder-build/E2E receipt already appears in DEBT-474's dated implementation record. |
| 8b82e4f596f99ea4e614912c59ff728a224f4db8 | No tracked diff; only an empty untracked file named `=` (empty Git blob). |

Stash count after removal: **zero**. No unique implementation was discarded.

## Published rate-limiter WIP — ADAPT, do not land in this pass

Reviewed `9446b4592d5a1717de649954627253bb51c76133`. Its whole patch passes
`git apply --check` against current dev. The *published* parent is only seven
commits behind dev, not 47; the older number described the recovered stash.
Only its three test/floor files were overlaid temporarily, then fully restored.

At 17:27 and 17:29 UTC, the new 14-case suite plus the existing three real-Postgres
cases passed **17/17**; the retained error-translation unit passed **1/1**.
`pnpm lint:doubles` reported zero issues. Candidate floor totals are
**228 casts / 47 files**; the committed current floor remains **240 / 48**.
No WIP code or floor change is included in this pass.

Every new case failed under a targeted mutation (12 mutation runs, all exit 1):

| Mutation | Independently failing behavior |
| --- | --- |
| Retention 24 → 48 hours | Automatic pruning removes expired rows |
| Batch limit 100 → 101 | Automatic pruning respects the bound |
| Cutoff < → <= | Exact-boundary row survives |
| First-request-only cleanup → every increment | Increment does not prune |
| Remove input validation | All six invalid limit/window cases |
| Remove prune-limit validation | All three invalid prune-limit cases |
| Warning → info | Failed cleanup still warns after the successful upsert |
| Ignore nonpositive stored count | Corrupted real stored count rejects |
| Remove key join | Bounded pruning cannot delete the other key |
| Remove window join | Bounded pruning cannot delete the other window |
| Reverse key tie order | Oldest/key-ordered candidate is selected |
| Change empty-driver-result error code | Retained error-translation unit |

Deleted-unit mapping: automatic cleanup, incremental non-cleanup, cleanup
failure/result and warning map to the new real-DB scenarios; invalid inputs map
to the six table cases; invalid prune limits map to three cases; corrupt count
maps to the real stored-row case. Remaining clamp behavior is already covered
by three increments against limit two in the existing suite. Prune SQL-shape
assertions are replaced by the existing bound/SKIP LOCKED tests and new
key/window collision case. Empty driver rows remain a narrowly typed fault
unit. No deleted behavior lacks a named twin.

**Required adaptation:** refresh the WIP's aggregate receipts: this baseline is
4,495 → 4,484 unit and 349 → 363 integration, not its stale
4,243 → 4,232 and 291 → 305. Those are snapshot deltas, not the totals after
this security-resource change. Record this independently executed mutation
proof and update current register context before its own PR. No production
adapter change is needed by these results.

## Twelve active records — fresh disposition

| Record | Current evidence / real remainder |
| --- | --- |
| 414 | Legal pages still return 200; annual-only 15–45-day selection and paragraph-only message links remain. #902/#903 remain open. Engineering, operational/private specimens and licensed advice remain. The dated “every PR” E2E claim needs the decided Dependabot/fork qualification. |
| 465 | CRAP script exists; no Stryker config or acceptance directory; QA-001/002 remain Draft. Part 1's numbers are dated baseline measurements, not today's ranking. Parts 2–4 remain. |
| 468 | Tag/bookmark repository suites remain one/two cases; provider schedule run `35510373087` succeeded on `86336194`. Fake-extension/helper work remains; no metric gate is authorized. |
| 469 | 27 tracked size suppressions remain. Biome warn/800 plus error-on-warnings remain; the dated W5 observation period is not over. |
| 472 | Live floors remain 22/240/45; raw casts 278/59 files, RepoDb 138/21. F8's listed counts total **23**, not 25; with five type lies, **28**, not 30. The three setup factories remain. Published WIP is validated but unlanded. |
| 474 | Actions CRON_SECRET count **0**, Dependabot-secret count **0**. Vercel metadata still shows three scope rotations at 09:39:23.517 / 24.877 / 26.314 UTC on September 20, no branch overrides, cron enabled. At 17:40 UTC, a production cron-filtered 12-hour log query returned **0 retained records**. This is not proof of failure or success; Hobby retention prevents closing without captured scheduled 200s. |
| 476 | Alerts #51–54/#56–63 fixed; #55 dismissed not_used at September 16 13:45:31 UTC. Pin remains 3.1.7. Registry publication makes 3.1.8 eligible **September 22 07:36:25.444 UTC**, not today. |
| 479 | Production root/legal pages lack canonical/OG, robots/sitemap remain protected 404s; client/server sampling remains 0/5%. #936 is a main ancestor; spec corrections are done, not the remaining public-surface work. Security-resource repair belongs to 480 only. |
| 480 | Reproduced below and fixed narrowly in this pass; retain Open until promoted anonymous HTTP proof is captured. |
| 481 | 21 schema tables versus 14 in master; 29 controller action declarations. Warning banners do not reconcile the six copied contracts. |
| 483 | #952–#954 are main ancestors; managed corpus preparation still deletes before regeneration and sync uses per-question transactions. Whole-release staging/activation/rollback remains. |
| 484 | #951 is a main ancestor; graded-history guard exists, immutable revision/session binding does not. Active ungraded race and archived-question review remain. |

Pointer stubs 473, 475 and 486 resolve to existing archive records.
Ruleset 17666822 readback: active main+dev, no bypass, strict required Actions
`test`, thread resolution, deletion/non-fast-forward protection, zero approval
count. Exact-head CodeRabbit and merge-commit discipline remain process rules.
Successful main run `35608337793` serves `d67a3e98`; production readback was
READY with that SHA. Signed-out root/health/legal routes returned 200;
health returned `ok=true, db=true`.

## DEBT-480 red/green and scope

- 17:34 UTC: real installed Clerk matcher plus production proxy, exact and
  query-string forms red (two failures); five protected-path negatives green.
- Built app, empty storage, redirects disabled: both Accept forms red with 307.
- A first candidate public-route entry fixed `*/*` only. The HTML request
  remained 307: trace reason **dev-browser-missing**, redirect to Clerk's
  development handshake. This failure was preserved, not retried unchanged.
- A further red test proves the contact must be served without initializing
  Clerk. The final minimal fix uses an **exact pathname** early return in the
  proxy, with its path named in the shared public-route module. No wildcard,
  broader TXT exclusion, public-file content, expiry, or app route changed.
- Final focused checks: **45/45** across proxy/resource/public-route suites;
  typecheck and doubles scan pass. Built-app anonymous HTTP: **2/2**, both
  200/text-plain with the exact existing GitHub disclosure Contact and Canonical.
- Independent mutations at 17:38 UTC: remove exemption → three unit failures;
  prefix exemption → two negative failures; exempt dashboard → one failure.
  Source was restored after each. The initial built red establishes the
  no-exemption HTTP failure, not a fabricated production success.

Local failure artifacts are retained privately at
`/private/tmp/debt-inventory-2026-09-21.CBs1b7/`; no trace is committed or published.
Full gate, review, merge and deployed access are separate receipts below, not
implied by the focused checks.

## Dependabot #970–#973 — report only

All four currently have green hosted `test`; E2E omission is intentional.
No local execution or merge is authorized by this assessment.

| PR | Disposition and proposed order |
| --- | --- |
| #970 Codecov 7.1.0 | Small SHA-pinned action update, upstream adds opt-in cleanup (default false). **Wait**: immutable GitHub release published September 15 00:35:03 UTC; seven full days end September 22 00:35:03 UTC. Bot admission is not itself release-age proof. |
| #972 Biome 2.5.13 | First eligible low-risk tooling concern; published September 10 11:09:56.675 UTC. Keep separate; align schema URL in an owner-authored replacement if desired, retain all lint policy and run compatibility gates. |
| #971 eleven-package batch | All targets past seven days (latest eligibility: Lucide September 21 09:23:23.473 UTC). Clerk/Next, Vite, Zod and Stripe CLI affect auth/build/test/provider boundaries. Prefer owner-authored re-creation with full PR-time E2E, audit each upstream note and incidental lockfile moves; do not call the bot's no-E2E green full compatibility proof. |
| #973 Stripe 22.6.2 | Separate billing-sensitive owner PR. Upstream patch rejects empty webhook secrets; API-version source/types unchanged in the 22.6.1→22.6.2 compare. Current app already requires a nonempty signing secret. No API-pin advance inferred merely from a patch version. Require webhook/checkout/type contracts and full E2E. |

Recommended order today: #972, then the owner-audited #971 batch, then separate
#973; insert #970 when its release-age window opens. Reconcile each new base and
lockfile after preceding merges; never assume today's approvals cover a refreshed
head. Source releases:
[Codecov](https://github.com/codecov/codecov-action/releases/tag/v7.1.0),
[Biome](https://github.com/biomejs/biome/releases/tag/@biomejs/biome@2.5.13),
[Stripe](https://github.com/stripe/stripe-node/releases/tag/v22.6.2).
This is policy triage, not a completed eleven-package supply-chain audit.

## Reviewed dev merge and ancestry correction

PR #976 merged as `0b074cee` after formal CodeRabbit approval `5270082915`
on exact source head `97567220`, zero unresolved threads and successful
CI `35634701830`. Hosted E2E passed 46/46. Codecov patch and preview were green.
The full local gate passed 4,503 unit / 411 browser / 349 integration plus six
intentional provider skips / 23 build routes / 46 E2E, without retries. A
non-failing `destination stream closed early` server message near teardown is
disclosed, not investigated outside this pass's scope. The relative-link
comparison found zero new missing destinations (1,093 existing broken
occurrences / 319 destinations when relative assets are included); one Latest
stanza remains.

CodeRabbit withdrew both requested historical rewrites after checking the
adjacent dated corrections and current execution instructions. No new code
was added to satisfy those Minor comments.

Promotion #978 initially reported BEHIND: the executor omitted the
[deployment runbook's ancestry step](../../../dev/deployment-procedure.md#6-branch-ancestry-after-promotion)
before #976. Main `d67a3e98` had not been merged into the feature branch even
though the starting trees matched. #978 was closed temporarily; main's ancestry
is now carried through a normal follow-up PR to dev on the same inventory
branch, with a full gate and fresh review. The merge itself has no content
delta against dev. No direct protected-branch push, rebase, force-push or
override is used. DEBT-480 remains Open until the subsequent production proof.

## DEBT-480 production closeout

**2026-09-21, 19:01 UTC:** this receipt supersedes the pending-release labels
above. PR #979 merged as `43ec7be7` after formal approval of exact head
`2696877c` at 18:31:03 UTC, zero unresolved threads and green CI
`35638528510`. Promotion #978 merged as `ac9d0fba` after formal approval of
exact head `43ec7be7` at 18:44:36 UTC, zero unresolved threads and green CI
`35639721268`. All five check-runs/statuses, including Codecov patch, were
green separately from the local gates. No override was used.

Post-merge main CI `35640880064` passed at **19:00:18 UTC**: 4,503 unit /
411 browser / 349 integration with six intentional provider skips /
23 build routes / 46 E2E. Main/dev shared tree
`fe6851dbdc994a71880a523935138f25e76373b8`.

| Production-gate event | UTC receipt |
| --- | --- |
| Vercel build ready | 18:50:51.870 |
| Observed READY / STAGED, check pending, no domain assignment; previous main `d67a3e98` still served | 18:51:03.556 (still held at 18:58:15.756) |
| Main GitHub `test` completed successfully | 19:00:18 |
| Vercel deployment-alias check succeeded | 19:00:20.180 |
| Production domain assigned to `ac9d0fba` | 19:00:20.500 |

Fresh anonymous production GETs at 19:01 UTC used `redirect: 'manual'`:
`/` returned 200; `/api/health` returned 200 with `ok=true`, `db=true`;
`/.well-known/security.txt` returned 200 and `text/plain; charset=utf-8`
for both `Accept: */*` and `Accept: text/html`, with the response body exactly
equal to the unchanged tracked file. This is release/HTTP evidence, not an
inference from a local expiry test or a Ready build.

DEBT-480 is now Resolved and archived with an old-path pointer. **11 Active
records remain**; no other debt's missing receipt is inferred from this one.
The optional `PR` prefix requested by CodeRabbit on #979 is included in this
substantive ledger update; GitHub's renderer had already proved the original
`#976` paragraph correct, and the reviewer formally approved that adjudication.

The archive's like-for-like inline relative-Markdown-link check against
`ac9d0fba` found 777 existing broken occurrences / 323 destinations both before
and after, **zero new missing destinations**. This narrower parser's counts
are not a reduction from the earlier differently scoped link census. All four
473/475/480/486 pointer stubs resolve; the index has one Latest and 11 Active
rows. No unrelated historical link was repaired.

## Concurrent dependency-batch handoff

At 19:11:01 UTC another executor merged owner-authored #977 as `a7d88722`.
PRs #970–#973 were closed without merges at 19:11:38–49 UTC; their remote
branches were absent on fetch. This executor did not
merge those PRs or delete those four protected branches. The triage above is
the earlier snapshot, not a claim that they remain open. #977 had formal
CodeRabbit approval on exact head `e712c7fa` at 19:06:23 UTC and successful CI
`35641873942`. Its dependency changes are now part of the dev base, not changes
authored by the inventory/archive PR. Current dev was merged normally before
the archive's next full gate; no rebase or force-push was used.

The batch explicitly accepted the SHA-pinned, immutable Codecov action at about
6.5 days old. This differs from this audit's recommendation to wait until
September 22 00:35:03 UTC. The seven-day Actions cooldown is configured in
Dependabot; pnpm's npm release-age enforcement does not cover Actions. No
policy setting or age exception was changed by this inventory pass.
