# SPEC-017: Rate Limiting

> **Status:** Resolved (MVP), archived 2026-09-21. E1–E5 remain conditional in the [spec register's Deferred table](../../specs/index.md#deferred-tails-not-resolved).
> **Priority:** P2 (Important for Production)
> **Author:** Claude
> **Created:** 2026-02-01
> **Updated:** 2026-09-20

---

## Current State

**Archive receipt (2026-09-21):** the Postgres-backed limiter, controller/route
callers and listed tests are present on promoted main `ce5439b0`; main CI
`35647115419` passed 4,503 unit, 411 browser, 349 integration and 46 required E2E
cases. Production `/api/health` returned 200 after the Deployment Check released
that commit. E1's owner deferral and unproven measurements below remain unchanged;
archival does not claim custom WAF rules, Redis, or additional controls shipped.

✅ **Implemented (MVP Complete):**
- `src/adapters/gateways/drizzle-rate-limiter.ts` — Postgres-backed **fixed-window** rate limiter (atomic `INSERT ... ON CONFLICT DO UPDATE`)
- `src/application/ports/gateways.ts` — `RateLimiter` interface (port)
- `src/adapters/shared/rate-limits.ts` — Centralized limit configuration (no magic numbers)
- `lib/request-ip.ts` — IP extraction trusting only `x-vercel-forwarded-for` in production (spoof-resistant)
- `db/schema.ts` — `rateLimits` table with composite PK `(key, window_start)` + migration `0002`
- `lib/container/gateways.ts` — `DrizzleRateLimiter` wired via constructor injection
- `src/application/test-helpers/fakes/fake-gateways.ts` — `FakeRateLimiter` for unit tests
- **14 policy constants, 13 limiter invocation sites in 10 production files, covering 18 named operations.** Recounted 2026-09-20 from `src/adapters/shared/rate-limits.ts:12-80` and the callers below. `ONE_MINUTE_MS` is a duration constant, not a fifteenth policy. All windows are 60 seconds.

| Policy (`_RATE_LIMIT` suffix) | Operation(s) and key | Limit/min | Invocation receipt |
| --- | --- | ---: | --- |
| `CHECKOUT_SESSION` | Checkout `billing:createCheckoutSession:{userId}`; trial setup `billing:createTrialPaymentMethodSetupSession:{userId}` (separate buckets) | 10 | `src/adapters/controllers/billing-controller.ts:166,220` |
| `PORTAL_SESSION` | `billing:createPortalSession:{userId}` | 20 | `billing-controller.ts:268` |
| `START_PRACTICE_SESSION` | `practice:startPracticeSession:{userId}` | 20 | `practice-controller.ts:190,239` |
| `PRACTICE_SESSION_MUTATION` | `practice:endPracticeSession:{userId}`, `practice:discardPracticeSession:{userId}`, `practice:finalizeExamAnswers:{userId}`, `practice:setPracticeSessionQuestionMark:{userId}` (four separate buckets) | 60 | `practice-controller.ts:190,202,313,342,381,477` |
| `EXAM_DRAFT_SAVE` | `practice:saveExamDraftAnswer:{userId}` | 120 | `practice-controller.ts:190,413` |
| `SUBMIT_ANSWER` | `question:submitAnswer:{userId}` | 120 | `question-controller.ts:253` |
| `BOOKMARK_MUTATION` | `bookmark:setBookmark:{userId}` (not the old toggle key) | 60 | `bookmark-controller.ts:117` |
| `QUESTION_RATING` | `question-feedback:rateQuestion:{userId}` | 60 | `question-feedback-controller.ts:152` |
| `QUESTION_REPORT` | `question-feedback:submitQuestionReport:{userId}` | 10 | `question-feedback-controller.ts:211` |
| `STRIPE_WEBHOOK` | `webhook:stripe:{ip}` | 1000 | `app/api/stripe/webhook/handler.ts:50` |
| `CLERK_WEBHOOK` | `webhook:clerk:{ip}` | 100 | `app/api/webhooks/clerk/handler.ts:59` |
| `HEALTH_CHECK` | `health:{ip}` | 600 | `app/api/health/handler.ts:26` |
| `CRON_RECONCILE_STRIPE_SUBSCRIPTIONS` | `cron:reconcile-stripe-subscriptions` | 5 | `app/api/cron/reconcile-stripe-subscriptions/route.ts:135` |
| `CRON_SEND_RENEWAL_NOTICES` | `cron:send-renewal-notices` | 5 | `app/api/cron/send-renewal-notices/route-handler.ts:104` |

Controller paths without a directory above are relative to `src/adapters/controllers/`. The practice controller's six operations share **one** `enforceRateLimit()` invocation site, with four using `mutationBeforeExecute()`. Count `RateLimiter.limit` calls, not SQL query-builder `.limit()` calls. Shared key literals are in `src/adapters/controllers/shared/idempotency-error-policy.ts:9-19`. Idempotent actions apply these policies through `beforeExecute`; successful cached replays do not consume a fresh execution's limit. Limits do not replace auth, entitlement, schema validation, or webhook verification.

This is an audited table, not an automatically enforced Markdown contract. A test proving every constant has a caller cannot detect an incorrect value/key in this table; no such self-maintenance claim is made.

**Response headers on route-handler 429s:** `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`

**Accepted risk:** Question fetching (read-only) is not rate limited. Content is non-secret medical knowledge. Add a read-rate limit key if scraping is observed.

---

## Problem

Without rate limiting, our APIs are vulnerable to:
1. **Abuse** — Malicious actors hammering endpoints
2. **Cost overruns** — Excessive Neon DB queries, Stripe API calls
3. **Degraded UX** — Legitimate users impacted by noisy neighbors
4. **Scraping** — Question content being harvested

This aligns with [OWASP API4:2023 "Unrestricted Resource Consumption"](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/), which broadened the earlier "Lack of Rate Limiting" (2019) to also cover payload sizes, array element counts, upload file sizes, and computational cost. Rate limiting addresses the request-count dimension; input validation (a separate concern) addresses the rest.

---

## Decision

### Defense-in-Depth Layers

| Layer | Protection | Notes |
|-------|------------|-------|
| **Vercel WAF** | Optional custom edge rate limiting | Available on Hobby; no saved custom configuration at the 2026-09-20 readback. See [E1](#e1-vercel-waf-rate-limiting). |
| **Vercel Edge** | DDoS protection | Automatic, no config needed |
| **Application** | Per-user, per-action fixed-window counters | Our `DrizzleRateLimiter` — the core of this spec |
| **Clerk** | Provider auth endpoint controls | Provider controls do not replace application limits. |
| **Stripe** | Provider API limits | Account/mode/endpoint limits are provider-owned; avoid a single universal threshold. |
| **Neon/Postgres** | Database capacity and connection limits | Capacity limits are not per-user abuse protection. |

### Why Postgres-Backed Fixed-Window Is Correct for Now

The current atomic fixed-window implementation is retained until attributable production evidence justifies replacement. This is a project tradeoff, not a universal throughput guarantee.

- Window boundaries can admit approximately twice the configured limit across adjacent windows.
- Do not assume the database is warm: `app/api/health/handler.ts:26` invokes the limiter before its health query, and authenticated cron requests can encounter a cold database too. Measure cold-start and limiter statement time separately.
- Controllers hold user/action-aware limits; routes hold IP/job limits. The optional custom WAF rule is absent, although baseline edge DDoS mitigation is active.

### IP Spoofing Mitigation

`lib/request-ip.ts` trusts only `x-vercel-forwarded-for` in production. This header is set by Vercel's Edge Network and stripped from client requests, making it immune to `X-Forwarded-For` spoofing attacks. This follows Vercel's documented recommendation.

### Response Headers

Our HTTP route handlers return `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` on 429 responses. This matches the de facto standard used by GitHub, Stripe, and most major APIs.

The IETF is drafting standardized headers (`RateLimit-Policy`, `RateLimit`) via [draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) (draft-11, still an active Internet-Draft at the 2026-09-20 readback). No action needed until ratified; when it becomes an RFC, consider dual-emitting both `X-RateLimit-*` and the standard headers during a transition period.

---

## Test Coverage

The executable suites, rather than copied case counts, are the coverage authority:

| Boundary | Current suite(s) |
| --- | --- |
| Postgres counter/pruning/error semantics | `src/adapters/gateways/drizzle-rate-limiter.test.ts`; `tests/integration/rate-limiter.integration.test.ts` |
| Maintained fake behavior | `src/application/test-helpers/fakes/fake-rate-limiter.test.ts` |
| Billing, answers, bookmarks, feedback | Colocated `billing-controller.test.ts`, `question-controller.test.ts`, `bookmark-controller.test.ts`, `question-feedback-controller.test.ts` |
| Practice shared-helper fanout | Colocated `practice-controller-session-admission.test.ts`, `practice-controller-session-lifecycle.test.ts`, `practice-controller-exam-draft.test.ts`, `practice-controller-mark-and-count.test.ts` and finalize/idempotency suites |
| Route rejection/header/error behavior | `app/api/health/route.test.ts`, `app/api/stripe/webhook/route.test.ts`, `app/api/webhooks/clerk/route.test.ts`, and both `app/api/cron/*/route.test.ts` suites |

Suite existence is not a proof of every policy's behavior. Follow `.claude/rules/testing.md` for fake/adapter fidelity, and record a changed-key/changed-limit or removed-enforcement red mutation for any new rate-limit contract. No new gate or claimed mutation score was added in this documentation iteration.

---

## Files

```text
src/
├── adapters/
│   ├── gateways/
│   │   ├── drizzle-rate-limiter.ts          # ✅ Postgres fixed-window implementation
│   │   └── drizzle-rate-limiter.test.ts     # ✅ Unit boundary tests
│   └── shared/
│       └── rate-limits.ts                   # ✅ Centralized limit configuration
├── application/
│   ├── ports/
│   │   └── gateways.ts                     # ✅ RateLimiter interface
│   └── test-helpers/
│       └── fakes/
│           ├── fake-gateways.ts            # ✅ FakeRateLimiter
│           └── fake-rate-limiter.test.ts   # ✅ Fake behavior tests
lib/
├── container/
│   └── gateways.ts                         # ✅ DrizzleRateLimiter wiring
└── request-ip.ts                           # ✅ Spoof-resistant IP extraction in production
db/
├── schema.ts                               # ✅ rateLimits table
└── migrations/
    └── 0002_curious_firelord.sql           # ✅ Table creation migration
tests/
└── integration/
    └── rate-limiter.integration.test.ts    # ✅ Real Postgres tests
```

---

## Future Enhancements

These remain conditional enhancements. A live domain does not establish paying-user count or an abuse threshold. Decisions below distinguish available measurements from evidence that actually meets a trigger.

### E1: Vercel WAF Rate Limiting

**Owner decision — CONFIRMED, 2026-09-20:** defer the custom blocking rule. Decline a log-only rule too. This supersedes the earlier “inspect traffic first” recommendation; the reason is the existing boundary design and shared-IP harm, not insufficient evidence. No rule or attack mode is applied by this decision.

**Project rule budget — UNPROVEN:** the claimed Hobby allowance of one rate-limit rule / 1,000,000 included requests has **not been verified in this project's dashboard**. The earlier review read published [Vercel limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), but that is not the project-specific confirmation the owner requires. Do not treat the allowance or available slot as an operational premise until that check is recorded. The authenticated team API does confirm `billing.plan: hobby`; the active custom-config 404 confirms no saved custom configuration, not absent baseline protection. [Existing state receipts](../../debt/assets/adversarial-2026-09-20/review.md#provider-receipts).

**REASON — structural:** the owner accepts the current residual abuse/capacity risk because:

- The question corpus requires authentication plus a currently entitled subscription (`question-controller.ts:200,226`, `require-entitled-user-id.ts:24-30`). “Active subscription” here includes the implemented trial and past-due grace statuses while the period remains current; it does not mean only Stripe status `active` (`src/domain/services/entitlement.ts:13-19`, `src/domain/value-objects/subscription-status.ts:29-33`).
- Clerk owns sign-in throttling ([Clerk system limits](https://clerk.com/docs/guides/how-clerk-works/system-limits)); the app does not expose its own password-validation endpoint.
- Both webhook ingress paths verify provider signatures before processing events (`app/api/stripe/webhook/handler.ts:80-100`, `app/api/webhooks/clerk/handler.ts:88-102`). Both cron routes require an Authorization header secret before job work (`app/api/cron/reconcile-stripe-subscriptions/route.ts:120`, `app/api/cron/send-renewal-notices/route-handler.ts:60-104`).
- The unauthenticated **page** surface is six PPR-enabled page families (`next.config.ts:4`, `lib/public-routes.ts:3-9`), including Clerk auth catch-alls. This is six page shells, not exactly six possible URLs or the exclusion of the five separately listed machine endpoints. These boundaries limit privileged work; they do not make health/webhook requests free of invocation or limiter-query cost.
- Vercel's automatic DDoS mitigation and system-level filtering apply by default ([platform protection](https://vercel.com/docs/vercel-firewall)); the project's observed `sys_dos_mitigation` denies/challenges independently confirm baseline filtering. A missing custom rule is not a missing firewall.

**Disqualifying hazard — owner first-hand account, 2026-09-20:** a default IP-keyed WAF rule shares one counter across every client behind a single public address, and institutional networks NAT many devices onto one address.

**Evidence class.** The owner is an addiction fellow and is a user of this product. The usage pattern below is first-hand practitioner testimony, not telemetry and not an inference drawn from the outreach plan. It is real evidence of a kind this project cannot currently measure; it is not a measured false-positive rate, and it should not be restated as one. It supersedes the earlier reviewer-inferred claim that the audience predominantly shares institutional egress, which overstated today's pattern.

**Stated pattern:** primarily home networks, with intermittent hospital use during downtime between clinical duties.

**Why this still disqualifies a guessed threshold — the hazard is conditional and inverts on success:**

- **Current exposure, inferred from that account:** predominantly residential use suggests less shared-egress concentration today. This is not a measured concurrency distribution, and a residential IP is not an identity guarantee.
- **Program-level adoption can concentrate users behind one address.** The owner-described growth plan targets program directors and coordinators. A cohort of roughly 6–10 fellows sharing institutional egress and overlapping study windows is the planning scenario, not an observed traffic distribution.
- **A threshold tuned against dispersed residential traffic can become inappropriate as that growth plan succeeds.** One shared bucket could block a legitimate program cohort together. The owner declines that avoidable failure mode; no false-positive rate, renewal impact or incident attribution difficulty is claimed as measured.

**Consequence for the trigger.** Institutional growth makes an IP-keyed blocking rule *more* hazardous, not less. Rising traffic therefore never authorizes one on volume grounds alone: a reopened E1 must first establish whether the increase is dispersed or concentrated, because the two imply opposite responses. The structural boundary protections above remain in force at any volume.

A log-only rule is also declined: it would consume custom-rule capacity merely to gather observations already available through invocation counts and Firewall events, while this project's precise allowance remains unverified. No custom-rule slot is reserved or assumed.

**TRIGGER — observable on the current plan:** reopen E1 when **Vercel dashboard function-invocation counts** show an unexpected increase, **Neon compute hours** increase unexpectedly, or **`GET /v1/security/firewall/events`** shows recurring traffic/mitigation events warranting investigation. The project owner is the decision owner: preserve the time window and comparable baseline (and route/source/action when exposed), attribute the cost or incident, then decide whether a narrowly scoped control is warranted despite the NAT hazard. An active attack follows the incident path below immediately; it does not wait for rule design or a collection rollout.

The Firewall endpoint is verified reachable now: authenticated CLI `vercel api '/v1/security/firewall/events?projectId=prj_vTWS0YcTJPcAAjgpPjovC0PydAP7&teamId=team_G6SwBNivWshoygtOPgu67vhE' --method GET` exited 0 on 2026-09-20 and returned `{"actions":[]}`. Empty events do not establish absence of all abuse, but they do prove that the read path is available. Use dashboard invocation counts, not the Observability Plus-only `vercel metrics` query that returned `payment_required` in the prior review. **Explicitly not Vercel Web Analytics:** DEBT-464 parks that collection path. No new SDK, log-only rule, plan upgrade or browser tracing is a prerequisite for these triggers.

**LEVER — incident path, pre-documented and unapplied:** for an observed attack, the operator runs `vercel firewall attack-mode enable` against the linked project. It challenges traffic at the edge without designing a rate threshold. Inspect effects and auth/integration health; run `vercel firewall attack-mode disable` to roll back or end incident mode. [Attack Mode](https://vercel.com/docs/vercel-firewall/attack-mode) allows known bots/internal requests but can block unrecognized automation, so keep rollback authority available. While unapplied it cannot itself cause false-positive blocking. The owner chooses this direct incident path over a guessed permanent threshold. **Measured mean-time-to-react — UNPROVEN:** no timed drill/incident receipt exists; a documented one-command path is not a measured response-time guarantee. Capture detection, enable and recovery times when used; this decision does not enable it or claim a known duration.

### E2: Redis-Backed Rate Limiting (Upstash)

**What:** Migrate from Postgres to Upstash Redis for lower-latency counters and sliding-window / token-bucket semantics.

**Trigger:** Production traces/Neon query analysis attribute material latency or load to the limiter statement, or a documented multi-region requirement needs distributed counters. Vercel function duration alone cannot identify the limiter query. Diagnose and compare alternatives before choosing Redis; client Web Vitals and Web Analytics are not prerequisites.

```typescript
// lib/rate-limit.ts (future)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export const apiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
  prefix: 'ratelimit:api',
});
```

**Dependencies:** `pnpm add @upstash/ratelimit @upstash/redis`

**File to create:** `lib/rate-limit.ts`

### E3: Next.js Middleware-Level Rate Limiting

**What:** Evaluate a request-entry limiter only if a named requirement remains after WAF/application controls. [Next.js Proxy defaults to Node.js](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#runtime), so the old Edge Runtime premise is stale. Re-establish deployment/cost semantics before claiming an invocation saving.

**Trigger:** When Vercel WAF's free tier is insufficient, or when you need custom logic (e.g., per-path limits at the edge).

**Note:** Cross-instance counters need shared storage. Redis/Upstash is one option, not an unconditional dependency or decision already made by this spec.

### E4: IETF Standard Rate Limit Headers

**What:** Dual-emit `RateLimit-Policy` and `RateLimit` headers alongside existing `X-RateLimit-*` headers per [draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/).

**Trigger:** When the IETF draft becomes an RFC.

### E5: OWASP Unrestricted Resource Consumption (Beyond Rate Limiting)

**What:** Address the non-rate-limiting dimensions of OWASP API4:2023 — max payload sizes, array element limits, upload file sizes, computational cost caps.

**Trigger:** When adding file upload, large payload, or computationally expensive endpoints. This is a separate concern from rate limiting and should be tracked in its own spec if needed.

---

## Historical Notes

### Pre-Implementation Plan (Superseded)

Before the Postgres-backed limiter existed, the MVP plan was to rely only on upstream protections (Clerk/Stripe/Vercel). That plan is now fully superseded by the current implementation.

### Monitoring Triggers (Current)

Reopen E1 on an unexpected increase in **Vercel dashboard function-invocation counts**, unexpected **Neon compute hours**, or actionable events from **`/v1/security/firewall/events`**, using the owner/receipt/incident procedure above. This replaces the former “Unusual traffic spikes in Vercel Analytics” trigger: DEBT-464 parks that collection path, so it cannot be the prerequisite. E2 still requires attribution to the limiter query; slow-response reports prompt diagnosis, not automatic Redis adoption. Server tracing remains sampled at 5% (SPEC-016), independently of browser collection.

---

## References

- [OWASP API4:2023 — Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
- [Vercel WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel WAF Rate Limiting SDK (`@vercel/firewall`)](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk)
- [IETF Rate Limit Headers Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
- [Vercel Edge Middleware Rate Limiting](https://vercel.com/templates/next.js/api-rate-limit-upstash)
- [Clerk Rate Limits](https://clerk.com/docs/reference/rate-limits)
- [node-rate-limiter-flexible PostgreSQL Benchmarks](https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL)
