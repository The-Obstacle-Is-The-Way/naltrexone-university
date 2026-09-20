# Adversarial review — DEBT-479, PR #932 and forward direction

**Date:** 2026-09-20. **Reviewed tree:** `5bc118f3` on `docs/debt-479-public-surface-discoverability`, parent `6199084a`. Production independently identified as `f8300d25` via Vercel. File-line receipts below refer to that pre-edit tree unless stated otherwise. This pass changes documentation only. No provider setting, runtime code, floor, suppression, CI policy, secret or production database was mutated.

**Highest-risk false assurance:** PR #932 removes Playwright product retries, but a green run still cannot prove no visible product error recovered inside a test. Two shared helpers do that today. Do not claim “a product failure cannot become green through retry.” The separate claim that server optimization is blocked on new browser telemetry is also wrong.

## DEBT-479 adjudication

Every verdict evaluates the filing at `5bc118f3`, not the corrected text. `UNPROVEN` means evidence is insufficient, not false. Provider receipts and precise limits follow the table. Recommendations are conditional designs, not findings about defects already demonstrated.

| Claim | Verdict | Independently obtained receipt / boundary |
| --- | --- | --- |
| Stability machinery exists | CONFIRMED | `src/adapters/shared/circuit-breaker.ts`, `src/adapters/gateways/stripe/stripe-retry.ts`, `lib/with-timeout.ts`, `src/adapters/gateways/resend-transactional-email-gateway.ts:57-93`. These are mechanisms, not an availability SLO. |
| Five security headers are enforced and tested | CONFIRMED | `next.config.ts:25-53`, `next.config.test.ts:17-37`; focused suite passed below. CSP remains in `proxy.ts`. |
| Entire stability/security radar axes are measurement artifacts and exonerated | OVERSTATED | Those mechanisms exist; no radar scoring model or whole-axis audit proves the explanation. Anonymous security contact fails (HTTP receipt below). |
| Exactly six public routes | OVERSTATED | `lib/public-routes.ts:3-15` has six **page matcher families** plus five API matchers. Auth catch-all `/sign-up/verify-email-address` also returned 200. Four canonical content URLs are the sitemap candidates. |
| Auth protects the question corpus | CONFIRMED | `proxy.ts:196-201`; signed-out `/app/dashboard` goes to Clerk. This verifies routing, not every authorization path. |
| Approximately 958 currently seeded questions | UNPROVEN | Files are not a live published-row census. No production DB census was performed; remove the incidental count. |
| No robots/sitemap/manifest/OG/Twitter-image files | CONFIRMED | `rg --files app public` has no matching basenames. `public/` contains `.well-known/security.txt`; `app/favicon.ico` exists separately. |
| Production robots/sitemap return 404 | CONFIRMED | `curl` with `Accept: */*` returned 404 for both, with Clerk `protect-rewrite`; HTML Accept returned 307 instead. Claim must specify the probe. |
| Adding Next metadata files alone fixes crawl access | REFUTED | `proxy.ts:246` matches TXT/XML; `PUBLIC_ROUTE_PATTERNS` exempts neither. HTTP results show Clerk interception. |
| `www` redirects to apex | CONFIRMED | Redirect-following `GET https://www.addictionboards.com/` ended at `https://addictionboards.com/`, status 200. |
| Missing robots means every leaked private URL is fetched/discarded; missing sitemap makes site undiscoverable | OVERSTATED | There are ordinary public links (`components/marketing/`, landing and pricing markup); no crawler logs or indexing data were inspected. Robots is not an access-control mechanism. |
| Six page components override only title; inherited descriptions match | CONFIRMED | `app/layout.tsx:9-13`; `app/page.tsx:4`, `app/pricing/page.tsx:24`, privacy/terms/auth page metadata at line 4; fresh six-page HTML probe gives the same description. |
| No canonical, metadataBase, OG or Twitter metadata | CONFIRMED | Source scan of production `app/`/`components/` and six served heads; no matching tags. Source scan excludes tests. |
| Future relative metadata silently drops/misresolves in production without metadataBase | OVERSTATED | [Next metadata docs](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) permit absolute values and document relative-value errors. Missing base does not prove the asserted future failure mode. |
| A typed `NEXT_PUBLIC_APP_URL` is already the correct canonical base | OVERSTATED | `lib/env.ts:71` validates URL syntax, not production apex, no query, or preview policy. |
| Auth pages omit noindex and can emit indexable subpaths | CONFIRMED | Six-page probe plus `/sign-up/verify-email-address`: 200, no robots meta/header observed. `app/sign-in/[[...sign-in]]/page.tsx:4` and signup equivalent own metadata. |
| Clerk ownership makes Next auth noindex irrelevant or breaks auth | REFUTED | Next page metadata surrounds the Clerk component; crawler instructions do not change route auth/cookies. [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing). Preserve actual auth verification when changing it. |
| Auth pages currently compete with home/pricing in brand search | UNPROVEN | No Search Console or search ranking receipt. Noindex is a crawl-policy choice, not demonstrated acquisition recovery. |
| Root fallback title never appears on these six pages | CONFIRMED | All six page metadata exports override it. |
| Therefore fallback title is a defect requiring a template | REFUTED | A fallback need not be used by pages with their own title; no failing behavior is identified. |
| No explicit share metadata/dedicated OG image | CONFIRMED | Served home head and absent metadata files. Favicon still exists. |
| Every Slack/iMessage/etc share is a bare URL | UNPROVEN | No real-channel unfurl receipt; HTML title/description exist and clients may use fallbacks. |
| Peer outreach and organic search are established acquisition channels | UNPROVEN | No attribution/outreach receipt located in the filing's cited repo surfaces. Keep as a hypothesis, not impact evidence. |
| JSON-LD absent | CONFIRMED | No `application/ld+json` in production app/components or served heads. |
| Course/FAQ/rich-result benefit necessarily follows from paid question-bank prices | OVERSTATED | Prices exist in `lib/pricing-data.ts`; course content, visible FAQ and rich-result eligibility are separate requirements. Product/Organization remains optional. |
| Client Sentry traces/replay rates are zero | CONFIRMED | `sentry.client.config.ts:9-14`. This does not turn off server spans. |
| No Core Web Vitals data exists from any source / is unknowable | OVERSTATED | No configured browser collector found; external datasets were not queried. TTFB is not one of LCP/CLS/INP. |
| DEBT-464 parks both Web Analytics and Speed Insights | REFUTED | DEBT-464 explicitly excludes Speed Insights. Live project: Web Analytics toggle exists; Speed Insights disabled, `hasData: false`; no collection script in served page probe. |
| Nothing emits telemetry; DEBT-450/E1/E2 cannot fire | REFUTED | Server config 5%; production Sentry span query returns data; Firewall returns traffic counts; user reports and monthly census need neither SDK. Matrix below preserves the stronger DB predicates. |
| Any DEBT-450 latency threshold has already fired | UNPROVEN | No matching action/DB samples in queried 30 days; no census/EXPLAIN collected. Do not revive SQL implementation on config alone. |
| Raising browser sampling is the cheapest/sufficient remedy | UNPROVEN | No alternatives/quota/privacy comparison, ingestion test or Web Vitals completeness proof. It is irrelevant to server-only triggers. |
| CI sequence named in F6 exists | CONFIRMED | `.github/workflows/ci.yml`; hosted run `35512656914` log independently read. |
| Eight recent CI runs were successful, about 8.9–10.3 minutes | CONFIRMED | `gh run list --workflow ci.yml --limit 8`: IDs `35512656914`, `35512136469`, `35511099388`, `35505691274`, `35504721507`, `35502924978`, `35499839823`, `35497380295`, all success, created-to-updated range 8m56s–10m19s. Rounded historical observation, not a bound. |
| No named Lighthouse/axe/bundle-budget/dedicated SAST package or job | CONFIRMED | `package.json`, three workflows; package keyword scan returned no matches. This is a narrow inventory, not an a11y/security coverage verdict. |
| No automated accessibility checks / no static security tooling | REFUTED | `tests/e2e/marketing-contrast.spec.ts`; Biome recommended rules and project security contracts. |
| CodeRabbit SAST=0/Linter=64 is caused by these tool choices | UNPROVEN | Dashboard values/attribution were not independently rederived. Review comment counts are not tested-surface coverage. |
| No dedicated metadata/crawl contract | CONFIRMED | Current metadata/source tests do not assert canonical/OG/robots/sitemap output and anonymous reachability. `next.config.test.ts` is only a precedent. |
| Metadata contracts make runtime a11y/performance tools unnecessary; each adds minutes/flake | OVERSTATED | Exported-object tests do not measure rendering, interaction, network access or field performance. No runtime/cost comparison was supplied. |
| SPEC-016 says errors only while server samples 0.05 | CONFIRMED | Old SPEC-016 Current State/Scope vs `instrumentation.ts:21`; corrected here. |
| Request tracing is wholly no longer future | OVERSTATED | `lib/request-context.ts:10-24` implements explicit context/child logger, not universal async-local propagation. Named spans shipped under DEBT-462; DEBT-475 typed the boundary. |
| LOG_LEVEL is supported but absent from .env.example | CONFIRMED | `lib/logger.ts:4-16`; `rg LOG_LEVEL .env.example` has no match. Example addition now explicitly declined as optional; behavior documented. |
| Optional pino-pretty is unimplemented | CONFIRMED | No package dependency/transport in `package.json` or `lib/logger.ts`. No new work needed. |
| SPEC-017 lists 9 of 14 policies | CONFIRMED | Old table nine rows; `rate-limits.ts:12-80` fourteen `_RATE_LIMIT` objects, plus duration constant. |
| 13 non-test .limit calls across 10 files | OVERSTATED | True specifically for **RateLimiter** calls; unqualified `.limit()` also counts SQL pagination. Six practice operations share one call; total named operations is 18. Updated spec lists every policy/caller. |
| Implementation is broader than rate-limit documentation | CONFIRMED | Question rating/report, save-draft, practice mutations and renewal cron policies were absent; trial setup also shares an existing policy. No uncovered endpoint defect follows from the old table. |
| E1 launch trigger has fired and demands a WAF rule | OVERSTATED | Serving the apex is proven; actual launch/real-user volume is not. “Before launch, or anytime” is a planning milestone, not an observed abuse predicate. |
| Published Hobby limits list the stated WAF capability | CONFIRMED | The review actually read [Vercel limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), not only SPEC-017. This is a publication receipt, not a project dashboard entitlement check. |
| This project has the asserted rule allowance/available slot | UNPROVEN | No project dashboard entitlement check was performed. The owner requires that check before using the allowance as an operational premise; SPEC-017 now marks it unverified. |
| Config 404 means no saved custom config, not absent baseline protection | CONFIRMED | Config GET 404; overview active/draft null; system mitigation deny/challenge counts nonzero. |
| Every abusive request reaches a function and Neon | REFUTED | Edge mitigation already denies/challenges; cron auth rejects before limiter creation (`route-handler.ts:60-104`). |
| Institutional NAT makes a guessed IP rule risky | CONFIRMED | Shared-IP counting structurally shares a bucket. Actual audience NAT prevalence and likelihood/magnitude of blocking remain unmeasured. |
| A WAF rule is warranted now | UNPROVEN | Aggregate project traffic is not a per-path abuse rate or safe threshold. Owner subsequently declined blocking on structural/NAT grounds; see the dated decision below. No incident threshold is asserted. |
| Attack Mode is available as an emergency lever | CONFIRMED | [Provider procedure](https://vercel.com/docs/vercel-firewall/attack-mode); current overview shows disabled. Known bots/internal traffic are exempt; unrecognized automation can be blocked. No measured time-to-react. |
| Sitemap can derive URLs from PUBLIC_ROUTE_PATTERNS directly | REFUTED | Matcher strings contain `(.*)` and machine routes; indexability is not encoded. Correct seam is explicit route policy over ROUTES, projecting matchers and four indexable URLs separately. |
| Steps 1–3 are independent | REFUTED | Social URLs depend on canonical convention; generated images and crawl files need anonymous proxy access. |
| Every-constant-has-a-caller makes the Markdown table self-maintaining | REFUTED | Exact counterexample mutation: change the Markdown `QUESTION_REPORT` limit from 10 to 100; caller usage stays identical, so that test passes. Declined. |
| All six pages need unique descriptions, self-canonicals and social cards | OVERSTATED | Four content URLs need content metadata; noindex auth pages do not need an acquisition card/canonical contract. |

## HTTP receipts

At 2026-09-20 13:41Z and the subsequent no-redirect readback, commands were GETs, not HEADs:

```sh
curl -sS -D - -o /dev/null -H 'Accept: */*' https://addictionboards.com/robots.txt
curl -sS -D - -o /dev/null -H 'Accept: text/html' https://addictionboards.com/robots.txt
```

Repeat for `/sitemap.xml` and `/.well-known/security.txt`. All three returned:

```text
Accept */*: HTTP/2 404
content-type: text/html; charset=utf-8
x-clerk-auth-reason: protect-rewrite, session-token-and-uat-missing
x-clerk-auth-status: signed-out

Accept text/html: HTTP/2 307
location: https://accounts.addictionboards.com/sign-in?redirect_url=<encoded original URL>
x-clerk-auth-status: signed-out
x-clerk-redirect-to: true
```

Following the HTML redirect reached the identity host's 403 bot challenge; that **is not the site's resource status**. Six root page URLs plus `/sign-up/verify-email-address` returned 200, each with the description `Board-relevant questions with detailed explanations for Addiction Psychiatry and Addiction Medicine exam prep.` and no canonical/robots/OG/Twitter/JSON-LD. This proves served output for this signed-out probe, not Google indexing or a preview client's output.

## Provider receipts

Vercel reads used the existing authenticated CLI, project `prj_vTWS0YcTJPcAAjgpPjovC0PydAP7`, team `team_G6SwBNivWshoygtOPgu67vhE`. No secrets were printed. Relevant output excerpts:

```text
GET /v2/teams/{teamId}: billing.plan = hobby
GET /v1/security/firewall/config/active?projectId=...&teamId=...:
  404 Config not found
vercel firewall overview --json:
  active: null; draft: null; attackMode.enabled: false
  period: 2026-09-19T13:00Z through 2026-09-20T14:00Z, hourly
  stats: attacksMitigated=0, allow=962, deny=18, challenge=13
  topRules: sys_dos_mitigation / DDoS Mitigation / total=31
```

The period has 25 aligned hourly buckets. Counts are not unique users, production-only customer traffic, or proof of an attack (`attacksMitigated` is zero). Baseline filtering is nevertheless empirically present. Current capability documentation was read separately; 404 does not establish plan entitlement.

```text
vercel metrics vercel.function_invocation.count --prod --since 1d --group-by httpStatus --json
  exit 1: payment_required (Observability Plus required)
GET /v9/projects/{projectId}?teamId=...:
  webAnalytics: enabledAt present
  speedInsights: hasData=false, disabledAt present
  production target: READY, source f8300d25599db9370cc0aa6ec529d6d937289283
GET /v2/projects/{projectId}/checks?teamId=...:
  name=test; requires=build-ready; blocks=deployment-alias;
  targets=[production]; source.kind=git-provider;
  source.provider=github; source.externalCheckName=test; timeout=3600
```

The paid metrics-query refusal does not mean runtime logs/basic dashboard observations are absent. Nor does an Analytics toggle prove script execution. The actual production deployment-check configuration is confirmed; the **new promotion's** eventual alias behavior still needs verification after merge.

## Server-trigger adjudication

**CONFIRMED:** server 5% / browser 0% (`instrumentation.ts:21`, `sentry.client.config.ts:11`). Named families are in `src/adapters/shared/server-tracing.ts:7-39`, with finalize at `lib/container/use-cases.ts:174`, bookmarks at `bookmark-controller.ts:148`, stats at `stats-controller.ts:46`, attempted questions at `review-controller.ts:68`. The installed Sentry Node SDK includes default database integrations when tracing is enabled, but that is not proof of DB children reaching this deployed project.

Authenticated Sentry `GET /api/0/organizations/novamindnyc/events/`, `dataset=spans`, `project=4510829539164160`, `statsPeriod=30d`, `query=environment:production`, grouped by `span.op`, returned HTTP 200 with `function.nextjs`, `http.server.middleware`, `stripe.api`, `http.client`, `http.server`, `default`, `stripe.webhook`. The [sanitized API readback](./sentry-readback.json) preserves exact parameters and responses. `count()` can be sampling-weighted: do not call these raw event counts or independent requests.

Filtering the same project/window to `span.op:server.action` returned `data: []`. `span.op:db` returned count 0 and p95 null; the all-op result contains no DB operation group either. A separate transaction/action-name search also returned no rows. These are bounded queries, not a claim that the app never emits those spans. No production user flow was fabricated to generate samples. The absence's cause is **UNPROVEN**.

| DEBT-450 deferred part | What is satisfiable/actionable today | What would actually revive implementation | Verdict on “already fired” |
| --- | --- | --- | --- |
| 1 — finalize loop | Existing outer transaction span can measure total time; logged/reported 30-second timeout can be investigated now. | A recorded 30-second timeout **or** p95 ≥3s over at least 100 production finalizations or 30 days (whichever first), with the loop dominant for the p95 branch. Companion Neon/slow-statement evidence is still required before choosing SQL. Outer p95 alone cannot prove loop dominance. | UNPROVEN — no matching action data/timeout receipt collected. |
| 3b — bookmark pagination | Monthly read-only cardinality census is directly actionable; existing bookmark span supports the separate duration branch. | Any user with ≥500 bookmarks in the census **or** post-width-fix getBookmarks p95 ≥300ms for seven consecutive days. | UNPROVEN — no census performed or matching span distribution returned. |
| 4 — dashboard lifetime aggregates | Inspect existing outer stats spans and available Neon analysis now; verify DB child visibility before calculating share. | Sampled DB spans plus Neon analysis: p95 ≥300ms for seven days **or** the two lifetime aggregates ≥20% of dashboard DB time. Sanitized EXPLAIN before an index. | UNPROVEN — outer span instrumentation is not the DB denominator; no DB samples/Neon receipt. |
| 5 — attempted-question duplicate ranking | Inspect outer attempted-question span and Neon statement evidence now; collect DB children if missing. | DB p95 ≥300ms for seven days **or** two rank statements ≥20% of route DB time, **and** sanitized EXPLAIN proves dominant duplicate rank/sort work. | UNPROVEN — no samples/plan demonstrating the predicate. |

Thus the telemetry-based **blanket blocker is REFUTED**. Part 1's timeout route and Part 3b's census need no new browser instrumentation; their latency branches have named server spans. Parts 4/5 cannot be declared fully measurable from outer spans alone. If current SDK/Neon views lack the required breakdown, the bounded missing server measurement is the next work, not a client SDK increase or speculative query rewrite. Read-only inspection is authorized work today; no threshold or owner ruling is weakened.

SPEC-017's user reports, costs and Firewall observations are independently actionable. E2 needs attribution to the limiter statement, not any slow request. Web Analytics/Speed Insights/client Sentry do not supply a DB query-share denominator.

## PR #932

**CONFIRMED:** the change sets global retries to zero and gives only setup CI=2/local=1 (`playwright.config.ts:16,28-30`). Required `chromium`, hosted and cleanup inherit zero. Current spec/wrapper search found no project retry override. Setup includes credential preflight, subscription seed, state reset and Clerk authentication; it is not a provider-outage classifier.

**OVERSTATED:** the wider first-product-failure claim. Reachable counterexamples predate #932:

- `tests/e2e/helpers/session.ts:340-367` clicks visible `Try again` up to twice before accepting answer choices. Its “dev compilation” comment does not describe the current build/start webServer (`playwright.config.ts:52-53`). It does not distinguish a product error from provider/bootstrap failure.
- `tests/e2e/helpers/bookmark.ts:181-215` revisits an explicit bookmarks error up to three times. `bookmark.test.ts:598` supplies `['error', 'populated']`, succeeds, and asserts two visits. This unit is an executable witness of recovery, not proof of a live production incident. Required bookmarks/core/cross-navigation journeys call the helper.
- These recoveries happen **inside** a test, so Playwright can report one passing attempt with zero flaky cases. `failOnFlakyTests` would not detect them. The config contracts correctly test their narrower property.

Disposition: retain #932's improvement and narrow its evidence claim. Exact-head review completed during this audit (dated receipt below). Add helper recovery work to existing DEBT-475, not a duplicate debt. A separate helper PR must make the same first-visible-error/then-success fixture reject before implementation (currently it resolves), and fail if either retry loop is reintroduced. Dedicated tests of product recovery may deliberately press Retry, with that purpose explicit; ordinary success-path helpers may not silently erase the error.

### Promotion evidence

**CONFIRMED — full lane execution:** `/tmp/codex-e2e-retry-policy.2MTOW4/final-gate.log` was actually read, not just cited. It records `tsc --noEmit`; Biome 1,217 files/no fixes; fidelity `issues=0`; unit 463 files/4,285 tests; browser 65/411; integration 43 passed/2 skipped files, 293 passed/6 opt-in skipped tests; successful production build; local authenticated E2E 44 passed in 3.7m. The original failed full gate and combined 6/32 red, 32/32 green receipts remain in the same directory. This is historical source-change evidence, not a gate run for this docs commit, nor cryptographic proof of its working-tree identity.

**CONFIRMED — independent hosted evidence:** [promotion CI 35512656914](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35512656914), job `106083179307`, 13:09:05–13:18:58Z, succeeded with 4,285 unit / 411 browser / 293 integration plus six opt-in skips / build / 44 E2E. The log was downloaded and inspected. No Playwright-retried product tests were reported; helper recoveries are not observable from that count. Source PR CI `35512136469` also succeeded.

**CONFIRMED — review completed during the audit:** the initial API read showed no reviews and a rate-limit comment (`5750000854`, 13:09:07Z); a later read showed PENDING. Final readback records CodeRabbit **APPROVED at 13:56:00Z** on exact head `6199084a1a4407d4d9d800bd798b37c422662b66`, zero unresolved threads, and merge at **13:57:14Z**, commit **`b58949e8870415d95a8c17df65cf569902a9e345`**. This supersedes the earlier pending-review observation; no approval was inferred from the status badge.

CodeRabbit's sole requested change concerned JavaScript truthiness for `CI=false`/`CI=0`; the reviewer withdrew it after adjudication (`4057106331`). Independent fresh `pnpm exec tsx -e` imports of the actual config returned setup=1 with CI unset, setup=2 with `true`, `1`, `false`, `0`, and product/cleanup=0 in all five cases. **CONFIRMED:** truthiness behavior; **REFUTED:** that it breaks this PR's setup-only runner property. Do not expand this PR into a four-behavior environment-policy rewrite without a supported invocation requirement.

**Production closeout pending at last readback:** main CI `35515003421` on `b58949e8` was in progress; Vercel deployment `dpl_Fg7R2mumKfTQsghmfEy5TgNSQVfZ` was BUILDING. A direct `GET /v4/aliases/addictionboards.com` still named prior deployment `dpl_DhRsr1rtA3MumE2YTyakzmiNS3ob`. Project `targets.production` can show the incoming build; it is not by itself proof of which deployment the public alias serves. No production completion is claimed here.

The AGENTS full pre-push requirement is supported by the source local receipt and hosted lanes. It does not waive review, permit a follow-up push without another full gate, or prove production promotion. No push/merge occurs in this docs pass.

**CONFIRMED — ordering hazard, now avoided by #932 merging first:** while #932 was open as `dev → main`, landing this branch on dev would have changed its head and invalidated the exact-head evidence. Verify its production closeout, then use the reviewed ancestry workflow for this docs branch. `git diff f8300d25...6199084a --stat` is nine files; `5bc118f3` adds only the debt filing/index but this review also edits existing debt/spec docs. Shared index/DEBT-475 edits may need ordinary conflict resolution. There is no demonstrated runtime incompatibility or reason to mix the mechanisms.

## Toolchain / CI-CD adjudication

Scope read: all three `.github/workflows` files, `package.json` scripts, `biome.json`, unit/browser/integration Vitest configs, provider config, Playwright, Next, Vercel, `pnpm-workspace.yaml`, scripts and their boundary tests, GitHub rules and Vercel checks. Exoneration is limited to the properties below, not universal safety.

| Claim/property | Verdict | Receipt and disposition |
| --- | --- | --- |
| Production waits for the real GitHub test check | CONFIRMED | Vercel project-check API above: build-ready → `test` → deployment-alias, production only. It does not delay build-time DB migrations. |
| Both branches enforce required CI/thread resolution | CONFIRMED | `gh api repos/The-Obstacle-Is-The-Way/naltrexone-university/rulesets/17666822`: active on main/dev, strict required `test`, integration 15368; PR/thread resolution; deletion/non-fast-forward; no bypass actors. |
| CodeRabbit approval and merge-commit-only are enforced by that ruleset | REFUTED | Same response: approvals=0, allowed merge methods merge/squash/rebase. AGENTS requires these procedurally. Existing DEBT-473 owns this distinction; no duplicate record. |
| Current workflow puts provider secrets at job scope | REFUTED | `.github/workflows/ci.yml` uses dummy job credentials and approved step-scoped secrets; `tests/ci-workflow.test.ts` pins the boundary. The stale master-spec example does put them at job scope (DEBT-481). |
| Immutable workflow actions need another debt | REFUTED | All three workflows use SHA action refs; existing DEBT-474 already owns and completed this mechanism. Its remaining tail is production cron evidence. |
| Drizzle subprocess exit alone proves migrations applied | REFUTED | Known swallowed/zero-exit failure class; `vercel.json:3` independently runs pre-ledger → managed migration → post-ledger → build. `scripts/migration-ledger.ts` and integration tests own ledger checks. Retain both sides; existing DEBT-445 owns this. |
| Required check protects production schema from a failed deploy | REFUTED | `vercel.json:3` migrates during build before alias approval. DEBT-445 preview isolation remains owner-gated; existing deployment procedure documents the ordering. No new record. |
| Coverage upload establishes a numeric coverage gate | REFUTED | All three coverage configs lack thresholds/runtime include scope; Codecov upload uses `fail_ci_if_error: false`. `codecov.yml` does exist, but contains only the E2E ignore. Corrected DEBT-468's “no codecov.yml”; its enforcement remains ADR-gated. |
| CRAP high scores should fail current CI | REFUTED | `scripts/crap-report.ts`, ADR-019 and DEBT-465 intentionally make metrics observational. Malformed/missing coverage inputs fail; a high score is not a current failure condition. |
| Mutation/Gherkin/QA work was missed and needs new records | REFUTED | DEBT-465 Parts 2/3/4 already own pilot, acceptance harness and QA activation. Baseline Part 1 is complete. No runtime gate added. |
| Test growth floors prove behavior fidelity | OVERSTATED | `tests/test-double-fidelity-ratchet-floors.ts` prevents growth; DEBT-472's real-Postgres replacement map supplies behavioral evidence before deleting old doubles. Existing 22/240/45 floors and 27 size suppressions remain unchanged. |
| Splitting every large test first improves quality | UNPROVEN | DEBT-469 owns size; DEBT-472/468 replacements/fixtures may delete tests first. Work in that dependency order. No test-count target. |
| Missing cleanup, runtime npx CLI, scanner complexity are new | REFUTED | DEBT-475 already has separate signal-cleanup, unpinned `npx vercel`, syntax-rule equivalence, Docker red-proof and net-deletion rows. Retain its bounded one-mechanism order. |
| Security file test proves public publication | REFUTED | `tests/security-txt.test.ts:5-24` reads disk only; live resource is Clerk-protected. DEBT-480 is new; expiry-warning work already belongs to DEBT-475. |
| Retry contracts cannot fail | REFUTED | Historical restored-old-config mutation failed 6/32, then green 32/32 in both environments. The missing property is in-helper recovery, not a vacuous config assertion. |
| Browser bootstrap exception permits ignoring ordinary browser failures | REFUTED | AGENTS permits exactly one retry of the named ~1s/no-tests bootstrap failure; later integration/build still required. DEBT-469 owns the observed residue. |
| Next/Vitest/pnpm need blanket modernization now | UNPROVEN | `.mts`/ESM Vitest split, browser React lane, Next TS6/TS7 seam and pnpm strict build/release-age policy have named existing owners (469/460/475/476). No failing current requirement found in this review. |

## All current specs audit

`rg --files docs/specs` returned eight Markdown files (not just SPEC-016/017). The five master files are one duplicated implementation contract; the table samples concrete contradictions, not a claim that every line was mechanically verified. Archived specifications are historical references, outside the requested current directory audit.

| File | Verdict | Receipt / disposition |
| --- | --- | --- |
| `spec-016-observability.md` | CONFIRMED | Sampling/request-context/logger-copy drift; corrected here, including true scope and optional LOG_LEVEL disposition. |
| `spec-017-rate-limiting.md` | CONFIRMED | 9-policy table, old bookmark key, unsupported warm-DB claim and ambiguous triggers; table and E1/E2/E3 wording corrected here. The [IETF readback](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) is draft-11, still an Internet-Draft: E4's RFC trigger has not fired. No Redis/WAF runtime work. |
| `master_spec.md` | CONFIRMED | “Complete” schema has 14 tables vs 21 in `db/schema.ts`; old rate-limit key at §4.5, obsolete CI at lines 2730–2860, and time-spent “always zero” at 3007. DEBT-481 owns reconciliation. |
| `master_spec_part1.md` | CONFIRMED | Schema at 87 contains 14 `pgTable` declarations; misses trial setup operations, renewal consent/deliveries, Clerk events, deleted Clerk users, pending Stripe cancellations, question feedback. Runtime has 21. |
| `master_spec_part2.md` | CONFIRMED | Lines 252–266 omit newer limits and name `bookmark:toggleBookmark`; header claims all 17 actions while current controller exports count 29. `shared/idempotency-error-policy.ts:13` uses `bookmark:setBookmark`. |
| `master_spec_part3.md` | CONFIRMED | Lines 94–143 claim exact schema but omit wrong-choice explanations; `lib/content/schemas.ts:105-122` requires them. Lines 208–211 delete/reinsert choices; `scripts/seed/question-syncer.ts:273-379` protects referenced choices and preserves IDs. Hash representation also omits reference/choice explanation fields (`question-parser.ts:27-42`). |
| `master_spec_part4.md` | CONFIRMED | CI example uses pnpm 10.9/Node22 and provider secrets at job scope (lines 145–205), unlike actual SHA-pinned/step-scoped Node24 CI. “Time spent=0/no timing” at 410 contradicts `finalize-exam-answers.ts:215-258`, `submit-answer.ts:193-208`, and even Part 2's validated timing contract. |
| `index.md` | CONFIRMED | Labels master a complete SSOT and links all five current copies; dated June29. Updated to identify the reconciliation warning and link DEBT-481; no new spec ID required. |

The master schema omission is documentation drift, not a missing database migration. The obsolete CI sample is not current CI behavior. No broad rewrite or new docs scanner is justified merely by these samples: first remove duplicate exact implementation claims, designate authoritative source links, then reconcile semantic decisions individually.

## Execution order

Each numbered implementation slice remains its own PR; parallel **read-only inspection** does not couple their mechanisms. This is priority/dependency guidance, not authorization to deploy, purchase or activate collection.

1. **Finish #932's production closeout.** Exact-head approval and merge to main completed during the audit; main CI/alias promotion were still pending at the last readback. Verify the production alias gate and sync through the documented reviewed ancestry workflow. The merge happened before this docs branch landed; preserve that separation. Record the helper limitation now; fix that separately under DEBT-475 next. Red witness: error-then-success currently passes; desired ordinary helper must reject its first visible product error. This is actionable, not blocked on a telemetry decision.
2. **Merge these documentation corrections through normal review.** DEBT-479 steps 6/7 (spec text) are done here. E1 owner decision is now recorded: structural deferral, currently observable triggers, unapplied incident lever; log-only declined and project allowance unverified. Reconcile current master ownership under **DEBT-481** before copying its old workflow/seed examples. The doc mechanism can proceed now without an ADR for runtime behavior.
3. **Fix anonymous security contact (DEBT-480).** Narrow exact-route access + actual signed-out reachability proof. Keep expiry checks and private-route protection. This uses the same boundary later needed by crawl resources but does not depend on SEO or client sampling.
4. **Maintain DEBT-414 as the P1 product/compliance stream.** It already owns annual/monthly notice windows, separate renewal consent, alternate portal paths, delivery/cancellation evidence and owner/legal activation questions (§2026-09-16 review). Some proposed implementation still needs the explicit owner go required there; do not call all engineering blocked by counsel, or silently reopen owner-deferred price/material changes. Privacy copy verification already shipped. Before first paid acquisition, complete its named licensed-review/operational gates. This review adds no new legal conclusion or duplicated record.
5. **Close external evidence tails when real events exist:** DEBT-473's next actual Dependabot omission-reason receipt; DEBT-474's two post-rotation **scheduled** cron 200s. Read logs now if retained; a manual cron call or another credential rotation would not prove the scheduled property. Do not close them on main CI alone. Rules/action pins are already shipped.
6. **Run server evidence work now, independently:** inspect Sentry's missing action/DB rows and the DEBT-450 monthly read-only bookmark census; get Neon/EXPLAIN evidence only as its per-part predicate requires. No threshold was proven here. Revive only the specific SQL/pagination part whose predicate fires. Do not wait for DEBT-464/479 step 5; do not infer database p95/share from function duration.
7. **DEBT-479 step 1, then step 2, then step 3:** canonical/auth metadata → typed route policy/crawl resources with proxy access → social tags/public image. Step 2 can share the already-reviewed exact-resource exemption design from 480. Validate built HTTP reachability and production, not only exported objects. Actual channel benefit remains unmeasured.
8. **Continue DEBT-475's remaining independent rows:** after helper recovery, prioritize pinned Vercel CLI and signal-safe local child cleanup; keep Docker subprocess red proofs; replace only syntactic checks with proven real-lint equivalents, retaining semantic architecture/privacy checks. Shared reader only if net deletion; security expiry warning remains its own monthly-issue mechanism. No global scanner rewrite.
9. **DEBT-472 → DEBT-468/469 per file:** establish real adapter/maintained-fake behavior before removing chain doubles; extract shared fixtures and dispose obsolete tests before splitting remaining large suites. Ratchets/suppressions only fall with named replacement evidence. Existing integration flow gaps are already closed; finish remaining UI/fixture work. Coverage include/threshold activation is blocked on the ADR-019 decision, not fixture cleanup.
10. **DEBT-465:** keep CRAP Part 1 observational; prepare the subscription-candidate fixture from 468 before the mutation pilot, then triage survivors. Acceptance/Gherkin driver begins with features #1/#4 and must fail on renamed/missing steps before green; revenue scenarios follow. QA register activation can run independently with human evidence. No new numeric gate without its ADR.
11. **DEBT-476 dated dependency tail:** recheck `fast-uri` 3.1.8 after **2026-09-22T07:36Z** and then use the ordinary full gate/review/promotion. This wait is real; no release-age exception. Existing alerts/remediation are not reopened.
12. **Optional/gated product measurement/markup:** DEBT-479 step 4 needs owner prioritization and truthful shared pricing data; step 5 needs source/quota/privacy approval plus actual vitals. Neither is a prerequisite for server investigation. **DEBT-464** remains first-real-users/earlier-owner-authorized Pro upgrade + Web Analytics/privacy activation, not Speed Insights. A paid domain/pricing page alone does not establish the first-real-users trigger. Other Deferred index rows retain their own triggers, particularly DEBT-445 preview DB isolation before schema-bearing preview reliance.

## Review validation

Executed against the unchanged runtime tree:

```text
pnpm test --run tests/playwright-lane-policy.test.ts playwright.config.test.ts \
  tests/e2e/helpers/bookmark.test.ts tests/e2e/helpers/session.test.ts \
  tests/security-txt.test.ts next.config.test.ts
Test Files 6 passed; Tests 69 passed (2026-09-20)
```

The green bookmark recovery test and security file-only test are part of the evidence limitations above. They do not exonerate the broader claims. No runtime mutation/red experiment was performed in this docs-only pass; future red mutations are specified, and historical red results are identified as historical. Documentation validation: `pnpm typecheck` passed; the first lint run found only the new JSON receipt formatting, which was fixed with Biome, then `pnpm lint` passed (1,218 files; fidelity issues=0). Relative-file link validation passed 740 targets after repairing DEBT-450 links left relative to its pre-archive directory. `git diff --check` passed. No full pre-push gate is claimed for this docs commit; no push was requested.

## E1 owner decision after the initial review — 2026-09-20

**CONFIRMED:** the owner explicitly deferred the blocking rule and rejected both the earlier insufficient-data/inspect-first framing and a log-only rule. [SPEC-017 E1](../../../specs/spec-017-rate-limiting.md#e1-vercel-waf-rate-limiting) now carries the full structural reason, observable trigger and unapplied incident lever. The source boundaries limit privileged work; the owner identifies institutional shared NAT as the disqualifying hazard for a guessed IP threshold. Entitlement includes current trials/grace, and “six pages” means six PPR-enabled families plus separately accounted machine endpoints; neither is silently simplified into a false implementation claim.

**CONFIRMED:** the current-account Firewall events read works. `vercel api '/v1/security/firewall/events?projectId=prj_vTWS0YcTJPcAAjgpPjovC0PydAP7&teamId=team_G6SwBNivWshoygtOPgu67vhE' --method GET` exited 0 and returned `{"actions":[]}`. The OpenAPI operation is `getSecurityFirewallEvents`, with required `projectId` and optional `startTimestamp`, `endTimestamp`, `hosts`, `teamId`, `slug`. This verifies access, not a claim of zero abuse. Invocation-count/Neon-compute anomalies and these events replace the Web Analytics dependency; the independent F5 server-telemetry correction remains unchanged.

**UNPROVEN:** project-specific custom-rule allowance and a measured mean-time-to-react. Published provider limits were independently read during the earlier review, but the owner's required dashboard check has not occurred. The allowance is no longer an operational premise. Attack Mode is documented, not applied; one command does not establish a measured response time. No extra rule, SDK, alert integration, purchase or numeric threshold is introduced.

Follow-up validation: docs-only diff; `pnpm typecheck` and `pnpm lint` passed (1,218 files, fidelity issues=0), 532 relative file-link targets resolved, and `git diff --check` passed. No runtime test/policy or provider configuration changed.
