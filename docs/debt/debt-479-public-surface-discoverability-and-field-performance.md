# DEBT-479: Public Crawl/Sharing Metadata, Browser Field Measurement, and SPEC-016/017 Drift

**Status:** Open
**Priority:** P2
**Date:** 2026-09-20
**Updated:** 2026-09-20 — independent adversarial review; [claim-by-claim adjudication, live receipts, PR #932 review and execution order](./assets/adversarial-2026-09-20/review.md).
**Source:** Third-pass review requested by the owner after the CodeRabbit 30-day analytics radar showed review attention concentrated on Maintainability/Code Quality, Functional Correctness, and Data Integrity, with Performance and Scalability, Stability and Availability, and Security and Privacy comparatively unexercised. The owner then directed that [SPEC-016](../specs/spec-016-observability.md) and [SPEC-017](../specs/spec-017-rate-limiting.md) be checked for completeness and iterated where needed. Receipts read at `dev` `6199084a`, from production `https://addictionboards.com`, and from the Vercel API on 2026-09-20.

**What this filing does not claim.** Stability has real machinery: `src/adapters/shared/circuit-breaker.ts`, `src/adapters/gateways/stripe/stripe-retry.ts`, `lib/with-timeout.ts`, and the Resend provider timeout. Security headers are enforced *and* contract-tested: `next.config.ts:25-53` sets five headers and `next.config.test.ts:17-37` asserts them while leaving CSP ownership with `proxy.ts`. Application rate limiting is broader than the old spec table (F8). These receipts exonerate the named mechanisms; they do not prove the entire stability/security axes are defect-free or explain the CodeRabbit dashboard's scoring. The newly verified anonymous security-contact failure is separately filed as DEBT-480.

**The corrected through-line.** Crawl and social metadata are absent (F1–F4), browser performance sampling is off (F5), and there is no dedicated metadata contract (F6). **Server telemetry already exists.** The original claim that DEBT-450 and SPEC-017 triggers are “unfireable by construction” is withdrawn: server tracing is sampled at 5%, Sentry returns production spans, and Vercel Firewall exposes traffic observations without Web Analytics. No DEBT-450 threshold was demonstrated by this review. Its read-only census and server measurement work are actionable now, independently of browser telemetry or a Pro upgrade. SPEC-016/017 corrections are prepared for specs-only PR B and remain pending. The E1 owner decision is recorded in this filing/evidence as a structural deferral with observable triggers and an unapplied incident lever; its SPEC-017 update also belongs to B.

---

## Description

The application has six public **page route families**, not exactly six URLs. `lib/public-routes.ts:3-15` defines matchers: `/`, `/pricing(.*)`, `/privacy(.*)`, `/terms(.*)`, `/sign-in(.*)`, `/sign-up(.*)`, plus five machine endpoints (two cron routes, health, and the Stripe and Clerk webhooks). The question corpus lives behind `/app/questions/[slug]`, which `proxy.ts` protects via `auth.protect()`. That gating is a deliberate product decision and this filing does not propose changing it. The four intended indexable content URLs are `/`, `/pricing`, `/privacy`, `/terms`. Auth catch-all pages also serve subpaths: signed-out production `/sign-up/verify-email-address` returned 200 with the same inherited description and no noindex. Query variants are not separate sitemap entries. A live database census of the question count was not performed.

### F1 — No crawl files, and their URLs currently enter Clerk protection

Next generates these from `app/robots.ts` and `app/sitemap.ts`. Neither exists. A repository-wide search for `sitemap*`, `robots*`, `manifest*`, `opengraph*`, and `twitter-image*` outside `node_modules` returns zero files. `public/` contains only `.well-known/security.txt`.

| URL | Result (2026-09-20, signed out) |
| --- | --- |
| `https://addictionboards.com/robots.txt` | `Accept: */*`: 404, `x-clerk-auth-reason: protect-rewrite`; `Accept: text/html`: 307 to Clerk sign-in |
| `https://addictionboards.com/sitemap.xml` | Same 404/307 split |
| `https://www.addictionboards.com/` | Redirect-following GET ends at apex with 200 |

The `www` → apex redirect works. Missing crawl files do not make linked pages undiscoverable or establish actual crawler waste; crawler activity was not measured. More importantly, adding files alone is insufficient: `proxy.ts:196-201,246` protects these extensions because they are neither skipped assets nor public routes. Step 2 must explicitly expose the crawl resources. `/.well-known/security.txt` already suffers the same interception (DEBT-480).

### F2 — Every public page serves the same meta description, and none declares a canonical URL

`app/layout.tsx:9-13` exports the only `description` in the application. Each public page overrides `title` alone:

| Page | Line | `title` | Own `description`? |
| --- | --- | --- | --- |
| `app/page.tsx` | `:4-6` | `Home - Addiction Boards` | no |
| `app/pricing/page.tsx` | `:24-26` | `Pricing - Addiction Boards` | no |
| `app/(marketing)/privacy/page.tsx` | `:4-6` | `Privacy Policy - Addiction Boards` | no |
| `app/(marketing)/terms/page.tsx` | `:4-6` | `Terms of Service - Addiction Boards` | no |
| `app/sign-in/[[...sign-in]]/page.tsx` | `:4-6` | `Sign In - Addiction Boards` | no |
| `app/sign-up/[[...sign-up]]/page.tsx` | `:4-6` | `Sign Up - Addiction Boards` | no |

Verified against production, not inferred: `/pricing`, `/privacy`, `/terms`, and `/sign-in` each return the byte-identical string `Board-relevant questions with detailed explanations for Addiction Psychiatry and Addiction Medicine exam prep.` inherited from the root layout, and none returns a `robots` meta tag.

A production-source search across `app/` and `components/` found no `metadataBase`, `openGraph`, `canonical`, or `alternates`. `lib/env.ts:71` validates `NEXT_PUBLIC_APP_URL` as a URL, but that is not proof it is the canonical production apex in every environment. Set and test the intended production origin before adding relative metadata URLs. The original assertion that absent `metadataBase` necessarily silently drops future metadata is withdrawn: [Next's documentation](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) permits absolute URLs without it and documents an error for relative fields without a base.

The Next pages own metadata even when their body renders Clerk. Add `noindex, follow` to both auth catch-all pages, including verification subpaths; this changes crawler instructions, not Clerk auth, redirects, cookies or callbacks. Preserve an auth smoke check. Do not block these paths in robots if crawlers must read noindex ([Google guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)). Actual brand-query competition is unproven. The root title is a valid fallback; its absence on pages that override it is not a defect and does not require a title-template refactor.

### F3 — No explicit Open Graph/Twitter metadata or dedicated share image

The complete production `<head>` of `/` on 2026-09-20 contains, aside from stylesheet and script tags: `<meta charSet>`, `<meta name="viewport">`, `<meta name="theme-color" content="#090909">`, `<meta name="next-size-adjust">`, `<title>`, `<meta name="description">`, and `<link rel="icon">`. There is no `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `twitter:card`, or `twitter:image`.

This establishes missing explicit previews, not a universally bare URL: individual clients may fall back to the title, description or other assets. No real-channel unfurl was captured. Organic search and peer sharing are plausible acquisition channels, but the repo/probes do not establish their actual share of acquisition or the claimed outreach plan. `public/` holds no image; `app/favicon.ico` does exist. A dedicated share image could be generated with `ImageResponse` or supplied as an asset; a particular runtime or font-loading design is not yet proven.

### F4 — No structured data

There is no `application/ld+json` block in production page source or the app/components source scan. A narrow `Organization`/`Product`/`Offer` proposal may describe the actual product and displayed prices, but rich-result eligibility, ranking benefit and a `Course` classification are not established. Step 4 remains optional and owner-gated; do not create FAQ markup without visible FAQ content.

### F5 — Browser field measurement is disabled; server telemetry is already available

`sentry.client.config.ts:11-13` sets browser tracing and both replay rates to zero. `instrumentation.ts:21` sets **server** tracing to `0.05`. SPEC-016's old blanket “errors only” statement contradicted this; step 6 corrects it. DEBT-464 defers **Web Analytics** activation behind the owner Pro decision and explicitly excludes Speed Insights. The live project reports Speed Insights disabled with `hasData: false`; a Web Analytics dashboard toggle alone does not prove page collection.

No configured first-party browser performance collector was found. LCP, CLS and INP are Core Web Vitals; TTFB is a separate performance metric. “No field data from any source” is unproven because external datasets such as CrUX were not queried. Disabled browser tracing does not prevent server measurement, user reports, cost inspection or Firewall analysis.

The [independent trigger matrix](./assets/adversarial-2026-09-20/review.md#server-trigger-adjudication) distinguishes all four deferred DEBT-450 paths:

- Part 1 has an existing outer-finalize span and timeout/error path. A timeout can be investigated today; the p95 branch additionally requires dominant-loop and companion statement evidence, not just total request duration.
- Part 3b's monthly read-only 500-bookmark census is actionable without telemetry. The named bookmark span can measure its separate latency branch.
- Parts 4/5 have named outer action spans, but their **DB time/share** predicates require DB children plus Neon evidence; outer spans and Vercel function duration alone do not satisfy them. Part 5 also requires the pinned sanitized EXPLAIN proof.
- A fresh Sentry production query found accepted server spans but **no matching action/DB spans in the queried 30 days**. That does not prove missing instrumentation or that any threshold fired. Low traffic, sampling, ingestion and deployment timing remain possible causes; investigate before adding instruments.

SPEC-017 E1 traffic/cost/user-report observations are available today; E2 needs attributable limiter-query evidence. Raising browser sampling is neither a prerequisite nor a proven cheapest fix for those paths. Step 5 is a separate quota/privacy/source decision and must demonstrate actual production vitals if chosen.

### F6 — No dedicated metadata/performance budget; existing accessibility and static checks are narrower

`.github/workflows/ci.yml` runs a single `test` job: install, `typecheck`, `lint:ci`, `lint:doubles`, managed migrate, managed seed, `test:coverage`, `test:integration:coverage`, Chromium install, `test:browser:coverage`, `pnpm build`, `pnpm test:e2e`. The independently read promotion run `35512656914` passed in 9m53s; this is one receipt, not a guarantee of gate duration.

Scanning `package.json` for `axe`, `lighthouse`, `codeql`, `semgrep`, `snyk`, `size-limit`, `knip`, `depcheck`, `madge`, and `dependency-cruiser` finds no scripts/dependencies. No dedicated metadata gate, bundle budget or Core Web Vitals gate exists. However, “no automated accessibility” is false: `tests/e2e/marketing-contrast.spec.ts` checks computed contrast, alongside component/browser accessibility assertions. Biome's recommended rules include static security checks; no separate SAST job is narrower than “nothing performs SAST.” The CodeRabbit `SAST 0 / Linter 64` attribution was not independently verified and is not a coverage measure.

Metadata contracts should pin output behavior, following `next.config.test.ts:17-37`. They do not replace runtime accessibility/performance checks. A metadata unit can pass while Clerk blocks its URL, so an anonymous HTTP check is required for crawl files and the image too. Do not add a tool solely because a radar axis is low, and do not claim without measurement that every candidate adds minutes or flakes.

### F7 — SPEC-016 is stale and internally contradictory

At filing, SPEC-016 was dated `Updated: 2026-03-15` and had drifted in three ways (step 6 correction prepared on 2026-09-20; pending PR B):

1. **It contradicts the running configuration.** The spec says errors only, with performance tracing out of scope. `instrumentation.ts:21` sets `tracesSampleRate: 0.05`. Server performance tracing is *already on* at 5%; only the client is at zero. The spec describes a state the code left behind, which is why F5's true shape — server-sampled, client-blind — is not readable from the spec at all.
2. **A "future" goal has partly shipped.** Goal 3, *"Request tracing to follow requests across async boundaries (future)"*, is partly implemented: `lib/request-context.ts` supplies `createRequestContext`/`getRequestLogger`, consumed at `app/api/health/route.ts:12-13` among others, and DEBT-475 promoted a typed runtime-filtered span boundary on 2026-09-20. Explicit context passing is not universal async-local propagation; initial named span instrumentation was already shipped under DEBT-462.
3. **An acceptance criterion remains open and unmarked.** `- [ ] LOG_LEVEL documented in .env.example` is still unchecked, and `.env.example` indeed documents only `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` at `:48-53`. `pino-pretty` likewise remains unimplemented and is correctly marked optional.

### F8 — SPEC-017 undercounts its implementation; E1 owner decision now recorded

At filing, SPEC-017 was marked **Complete (MVP)** and presented a table of *"all 9 endpoints"* (step 7 prepares its correction for PR B). The code covers more than that:

- `src/adapters/shared/rate-limits.ts` defines **14** limit constants, not 9. Absent from the spec's table: `PRACTICE_SESSION_MUTATION_RATE_LIMIT` (60/min), `EXAM_DRAFT_SAVE_RATE_LIMIT` (120/min), `QUESTION_RATING_RATE_LIMIT` (60/min), `QUESTION_REPORT_RATE_LIMIT` (10/min), and `CRON_SEND_RENEWAL_NOTICES_RATE_LIMIT` (5/min).
- There are **13** non-test **RateLimiter** `.limit(` call sites across 10 files, including `app/api/cron/send-renewal-notices/route-handler.ts:104` and `src/adapters/controllers/question-feedback-controller.ts:152,211`, none of which the table lists.

The drift direction is favorable — coverage exceeds documentation — so this is documentation debt, not a security hole. It still matters: the table is the artifact a reviewer consults to decide whether a new endpoint needs a limit, and an undercounted table teaches the wrong baseline.

**E1 is an owner-approved deferral, not demonstrated abuse.** The old “before launch, or anytime” wording is a planning milestone; a live domain proves serving, not customer launch or an abuse threshold. The authenticated team API confirms Hobby. Published limits were read, but the project dashboard allowance is **UNPROVEN** under the owner's verification requirement; do not assume a rule slot. The active-config 404 establishes no saved custom configuration. It does not establish absent protection: the fresh overview reports baseline `sys_dos_mitigation` denies/challenges. Nor does every passing request hit Neon: the cron handler rejects invalid auth before constructing a limiter (`app/api/cron/send-renewal-notices/route-handler.ts:60-104`).

**Owner decision, 2026-09-20:** defer blocking and decline a log-only rule. PR B will put the full **reason / trigger / lever** in [SPEC-017 E1](../specs/spec-017-rate-limiting.md#e1-vercel-waf-rate-limiting); the decision recorded here is: auth plus subscription entitlement, Clerk throttling, signed webhooks, header-secret cron routes, six PPR-enabled page families and default Vercel filtering constrain the exposed work; shared institutional NAT makes a guessed IP bucket harmful to legitimate cohorts. The reason is structural, not “insufficient traffic evidence,” and does not disappear with traffic growth. Reopen on invocation-count/Neon-compute anomalies or Firewall events available today; the events API returned `{"actions":[]}` successfully. Web Analytics is explicitly excluded. Attack Mode enable/disable is the unapplied incident path; measured reaction time remains unproven. This supersedes both earlier offered options without changing the independent F5 server-telemetry adjudication.

---

## Impact

**Acquisition — UNPROVEN magnitude.** Four meaningful content pages lack explicit crawl/canonical/social metadata. The HTML gap is confirmed; ranking, channel conversion and unfurl impact have not been measured.

**Performance — OVERSTATED original blocker.** Browser vitals are unmeasured by configured collectors; server observations and DEBT-450's read-only census are available now. No latency threshold was proven to have fired.

**Availability/cost — UNPROVEN need for a custom rule.** Baseline edge filtering is active. Diagnose traffic and attributable query costs before adding blocking or Redis.

**Regression risk — CONFIRMED bounded gap.** There is no metadata contract or anonymous crawl-resource check. An exported handler test alone cannot detect proxy interception.

**Spec trust — CONFIRMED.** SPEC-016/017's verifiable drift is documented here; its correction remains pending PR B. Further current master-spec drift is separately filed under DEBT-481; do not copy those old implementation blocks as current contracts.

---

## Resolution

One mechanism per PR; red proof before green. Steps 6/7 documentation is prepared for PR B, not applied by this filing PR. Step 2 needs the public-resource auth seam; step 3 depends on step 1's URL convention and an anonymously reachable image. Steps 4/5 remain separate owner choices. See the [whole-backlog execution order](./assets/adversarial-2026-09-20/review.md#execution-order).

**Step 1 — Canonical metadata and auth noindex.**
Pin four content pages' meaningful descriptions and canonical apex URLs; pin noindex on both auth catch-all pages. Configure `metadataBase` using the verified environment-origin convention, excluding query strings and identifiers. Keep the existing title fallback unless a separate requirement needs a template. Do not require self-canonicals, unique descriptions or social cards for noindex auth interstitials. Extend frontend standards §15 with the adopted contract.

Red proof: the current four content pages have no canonical and share the root description, and auth pages lack noindex. The new suite must fail those assertions before implementation. Then remove one canonical or auth noindex entry and require a targeted failure. Verify signed-out rendered heads, including an auth subpath; existing auth journeys must still pass.

**Step 2 — Typed public URL policy, robots and sitemap.**
`PUBLIC_ROUTE_PATTERNS` contains matchers (`/pricing(.*)`), not URLs. Do not strip regex syntax. Use a small framework-layer policy keyed by existing `ROUTES` constants with a literal URL path, explicit exact/subtree matcher scope and `indexable` flag. Derive the page auth matchers from that policy; keep machine auth exemptions separate. Sitemap consumes only the four indexable paths. This gives one policy for indexability and matching without a second independently maintained URL list; do not move routing policy into domain/application layers.

Explicitly admit `/robots.txt` and `/sitemap.xml` through the actual proxy. Do not exempt all XML/TXT, `/api/*`, or private page prefixes. DEBT-480's exact security-contact exemption can land independently and should be reused at this seam. Robots declares the canonical sitemap, disallows private `/app/`, `/api/`, `/checkout/`, and permits fetching auth pages so their noindex is visible. Auth catch-all variants and query strings never enter the sitemap.

Red proof: signed-out current GETs fail the required 200/body assertions. Mutations must independently remove `/pricing` from the expected output, add an auth URL, add a matcher suffix to an emitted URL, and remove the sitemap's proxy exemption. The expectations must include the explicit four business URLs, not merely compare two transformations of the same policy. Assert `/app/dashboard` and a prefix-lookalike resource remain protected. Verify both Accept modes against the built app and then production.

**Step 3 — Social metadata and image.**
Add OG/Twitter metadata to the four content URLs using step 1's canonical origin and an appropriate site image. Choose generated or static image after checking the runtime/font implementation; no unnecessary dynamic runtime requirement. Ensure the generated resource, if extensionless, is public through the proxy.

Red proof: current production/source outputs lack the tags and image. A missing image URL, a private/unreachable image response, or a canonical/OG-origin mismatch must fail the corresponding test. Verify image status/content type and rendered absolute tags; obtain one authorized real-channel preview without sending unsolicited messages.

**Step 4 — Structured data (optional owner decision).**
Only if prioritized: `Organization` plus a truthful `Product`/`Offer` description. Reuse the source that renders monthly/annual prices; no parallel literals and no invented Course/FAQ content. Red proof: missing JSON-LD fails the proposed contract on the current tree; changing the price input must change both displayed price and parsed Offer amount, while mutating only the Offer amount must fail their agreement assertion. Eligibility/benefit remains unproven.

**Step 5 — Browser field measurement (owner decision).**
Choose a supported source, sampling/quota and privacy policy before raising browser Sentry sampling. Verify that the selected SDK/version emits the required LCP/CLS/INP measurements and excludes private identifiers/query payloads. Source configuration, collection-point/privacy changes if needed, and SPEC-016 amendment belong together. Red proof: with today's zero browser tracing, a controlled sampled navigation must yield no required measurement event and fail the new collector test; after implementation, force sampling back to zero or inject a private query token and require the appropriate collection/privacy assertion to fail. Retain captured production sample counts and window; do not invent percentiles from absent samples. This does not block DEBT-450. Web Analytics stays under DEBT-464; Speed Insights is outside that record's scope.

**Step 6 — Correct SPEC-016 (prepared; pending PR B).**
The prepared 2026-09-20 iteration states server 5% / browser 0%, explicit request correlation and named spans, and distinguishes those from universal async propagation. `LOG_LEVEL` is supported and documented in the spec; adding an example-file entry is explicitly declined as optional. No `.env.example` or runtime change was made.

**Step 7 — Correct SPEC-017 (prepared; pending PR B); E1 decision recorded here.**
The prepared table covers 14 policies, 13 invocation sites and 18 named operations, including shared-helper fanout and the actual bookmark key. The proposed “every constant has a caller” test is declined: changing a Markdown limit would leave it green. It cannot make this table self-maintaining. The prepared E1 text records the owner-approved structural deferral, observed baseline mitigation, currently observable invocation/compute/Firewall triggers and the unapplied Attack Mode incident path. Project rule allowance remains unverified pending the dashboard check; log-only is declined too. The prepared E2 text requires query attribution, not merely function duration.

**Not authorized or justified by this review:** a new numeric CI budget, mandatory Lighthouse/axe lane, Upstash adoption, blanket middleware limits, or a guessed WAF threshold. Absence of a dedicated tool is not itself a defect. Existing coverage/CRAP/mutation/acceptance work remains DEBT-468/465 under ADR-019.

---

## Verification

1. Every implemented mechanism records its specified red mutation before green; no floor/skip/suppression changes to obtain a pass.
2. Crawl resources and image must be anonymously reachable with correct bodies/content types after promotion. Sitemap contains the four indexable content URLs, no auth/API/private/query URLs.
3. Four content heads have correct descriptions, canonical URLs and the chosen social metadata. Both auth catch-all pages serve noindex; auth behavior still passes.
4. Social preview evidence comes from an authorized channel or preview inspector; none was produced by this docs-only review.
5. Browser measurement, if authorized, requires actual production measurements and privacy/quota review. Server trigger assessment is independent; see the dated matrix.
6. PR B must land the prepared SPEC-016/017 `Updated:` dates and scope/table corrections before steps 6/7 are complete. E1's dated owner decision contains the structural reason, observable trigger and unapplied incident lever; no custom-rule entitlement or measured response time is assumed.
7. Every future push follows AGENTS.md's full gate; each implementation PR needs exact-head review and production verification where applicable. A unit test, Ready deployment or green check alone proves less than this list.

---

## Related

- [SPEC-016](../specs/spec-016-observability.md) — F5/F7; amendments planned under Resolution steps 5–6
- [SPEC-017](../specs/spec-017-rate-limiting.md) — F8; amendment prepared under Resolution step 7
- `lib/public-routes.ts:3-15`, `lib/routes.ts`, `lib/env.ts:71`, `app/layout.tsx:9-13`, `proxy.ts`
- `next.config.ts:25-53` and `next.config.test.ts:17-37` — the enforced-and-tested precedent this debt should copy
- `sentry.client.config.ts:11-13`, `instrumentation.ts:21`, `lib/request-context.ts`, `src/adapters/shared/rate-limits.ts`
- `docs/frontend/standards.md:827-840` — §15 Page Metadata, currently tab-titles only
- [DEBT-464](../_archive/debt/debt-464-web-analytics-activation.md) — Vercel Web Analytics activation; parked, not duplicated here
- [DEBT-450](../_archive/debt/debt-450-hot-path-query-efficiency.md) — deferred parts; server measurement and the census are actionable independently of F5
- [DEBT-475](./debt-475-toolchain-coherence.md) — typed server-tracing boundary; the E2E helper-retry residual is evidenced in this review and its register correction is pending PR C
- [DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) — owns `/privacy` and `/terms` copy; this filing touches their metadata only, never their text
- [DEBT-465](./debt-465-test-quality-practices-adoption.md) — Gherkin/acceptance and mutation lanes; steps 1–3's contracts are ordinary Vitest and do not depend on it
