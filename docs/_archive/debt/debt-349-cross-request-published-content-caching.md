# DEBT-349: Cross-Request Published Content Caching

**Priority:** P4
**Status:** **Deferred / archived (NOT resolved) — 2026-06-15.** No code shipped. Moved off the active register because it is not currently actionable: it is a pure scale optimization with no measured bottleneck (tracing is disabled, so the trigger metrics cannot even be collected today) and no Next-runtime invalidation seam for script-driven content updates. Revive into the active register only when **both** reactivation conditions in the Verdict below are met. The DEBT-344 Tier-1 request-scoped dedup that this split off from *is* shipped; this cross-request Tier-2 layer is the deferred remainder.
**Created:** 2026-04-03
**Source:** Follow-up split from DEBT-344 after Tier 1 request-scoped dedup shipped
**Related:** [ADR-010 Caching Strategy](../../adr/adr-010-caching-strategy.md), [DEBT-344 Request-Scoped Auth/Entitlement Dedup + Static Read Caching](./debt-344-request-scoped-caching.md), [SPEC-016 Observability](../../specs/spec-016-observability.md)

**Audit verified:** 2026-06-15 against `b5fc4056`.

---

## Verdict

Keep parked. Do not add cross-request caching for published question or tag
reads now.

DEBT-344 already shipped request-scoped `React.cache` dedup for the safe
published-content repository reads, and the current repository still rechecks
published question reads on a new server render. The live repo has no production
query-volume, latency, profiling, or tracing evidence showing that remaining
cross-request question/tag reads are a bottleneck. The content mutation path is
also script-driven, not Next-runtime-driven, so there is no clean
`revalidateTag` invalidation surface today.

Reactivate this debt only when both conditions are true:

1. Neon Query Analytics shows, for 7 consecutive production days, the published
   question/tag SELECTs corresponding to `DrizzleQuestionRepository`'s
   `findPublishedById`, `findPublishedBySlug`, `findPublishedByIds`, and
   `DrizzleTagRepository.listAll` at 50,000 or more executions/day or at least
   20% of total database time; and Vercel Observability or Sentry
   Performance tracing for the same window shows p95 latency of at least 300 ms
   on `getNextQuestion`, `getQuestionBySlug`, or `getTags` requests with those
   DB reads as the dominant contributor.
2. Published question/tag mutations run through a Next Server Action or Route
   Handler, or the deploy pipeline calls an authenticated Next Route Handler,
   so `revalidateTag` can run inside the Next runtime. Standalone scripts must
   not call Next cache invalidation APIs under ADR-010.

If those named metrics are unavailable, enabling measurement is the prerequisite;
cross-request caching is not the measurement substitute.

## Current Runtime Facts

The stack is Next.js 16.2.7 with React 19.2.7, and `cacheComponents` is enabled.
The app already uses Cache Components `'use cache'` for static public marketing
and pricing skeleton fragments. That corrects the stale older statement that no
explicit app-level read caching exists anywhere in the repo.

That existing `'use cache'` usage does not cover published question/tag
repository reads. The only live application invalidation import is the bookmarks
Server Action's `revalidatePath(ROUTES.APP_BOOKMARKS)`, which is unrelated to
published content. Whole-tree search found no live application use of
`cacheTag`, `cacheLife`, `revalidateTag`, or `unstable_cache`.

Next 16's current primitive for any future implementation is Cache Components:
function-level `'use cache'` plus `cacheTag`, explicit `cacheLife`, and
`revalidateTag` from a Server Action or Route Handler. `unstable_cache` is not
the chosen vehicle because Next 16 documents it as replaced by `'use cache'`.
Route-segment `revalidate` is also rejected because the app routes are
entitlement- and attempt-aware; only the pure published-content read should ever
be cached across requests.

## Verified Safe Scope

The only cacheable content class remains immutable published content:

- `findPublishedById(id)`
- `findPublishedBySlug(slug)`
- `findPublishedByIds(ids)` keyed by normalized id lists
- `listAll()` tag reads for tags attached to published questions

This explicitly excludes subscription status, entitlement output beyond the
current request, attempts, stats, practice-session state, bookmarks, question
feedback, idempotency replay rows, webhooks, and any other user-specific data.
Those reads must stay fresh across requests.

## Read Seams

The default server-action/controller path still goes through
`loadAppContainer()`, which wraps the production question and tag repositories
with DEBT-344 request-scoped caches. Explicit injected dependencies and custom
container loaders remain test seams that bypass the production cache path.

The main published-content read paths are:

| Read | Live callers | Request shape |
| --- | --- | --- |
| Question by slug | `getQuestionBySlug` in the question-view controller, called by the question page's client model after the server page renders a client shell | Separate client-triggered Server Action request |
| Question by id | `getNextQuestion`, `submitAnswer`, review hydration, bookmarks, question feedback, exam draft saves, and question reports | Mostly separate client-triggered Server Action requests around user-specific state |
| Question batch by ids | dashboard recent activity, session history, attempted-question history, session review, completed-session feedback | Some shared server renders, already covered by request-scoped dedup |
| Tag list | history questions tab and practice-session tag filters | History can share one server render; practice filters load in a client effect |

These paths explain why cross-request caching remains only a possible scale
optimization. It would reduce repeated DB reads across users/actions if traffic
is high enough, but the repo has no evidence that this is currently material.

## Invalidation Surface

There is no Next-runtime content management surface today.

Content publish/update/archive currently flows through standalone scripts:

- `scripts/import-draft-questions.ts` writes MDX files with a requested
  `draft`, `published`, or `archived` status.
- `scripts/seed.ts` opens a standalone Postgres connection and calls
  `syncQuestionsFromFiles(...)`.
- `scripts/seed/question-syncer.ts` inserts new questions, updates existing
  question content/status, deletes and reinserts question/tag joins, and upserts
  choices.
- `scripts/seed/tag-manager.ts` inserts missing tags but rejects name/kind drift
  for existing tag slugs; there is no live tag rename/delete operation.
- `scripts/seed/placeholder-archiver.ts` archives placeholder questions by
  status update.

ADR-010 forbids calling Next cache invalidation APIs from standalone scripts.
Therefore a correct future implementation must first introduce a Next-runtime
invalidation seam, such as an authenticated Route Handler called by the deploy
pipeline after seeding. Until that seam exists, long-lived cross-request caches
would create stale published question/tag risk after content updates.

## Rejected Alternatives

**Resolve now.** Rejected. The repo has no query-volume or latency evidence, and
the only content mutation path is outside the Next runtime. Implementing cache
tags now would add freshness risk and an invalidation obligation without a
measured bottleneck.

**Close as won't-do.** Rejected. Published content remains an allowed cache
class under ADR-010, Next 16 has the right primitives enabled, and future traffic
could make this worthwhile once measurement and invalidation prerequisites are
real.

**Use `unstable_cache`.** Rejected. Next 16 documents `unstable_cache` as
replaced by `'use cache'`; this repo already has Cache Components enabled.

**Use route-segment `revalidate`.** Rejected. The relevant app routes include
fresh entitlement, attempts, stats, practice state, and user-specific controls.
Only the inner published-content repository read is eligible for cross-request
caching.

## Audit Log

All checked claims below were verified against `b5fc4056`.

| Claim checked | Confirming or refuting evidence | SHA |
| --- | --- | --- |
| Current stack is Next 16.2.7 and React 19.2.7 | `package.json:57`, `package.json:62`, `package.json:63` | `b5fc4056` |
| Cache Components are enabled | `next.config.ts:3`, `next.config.ts:4` | `b5fc4056` |
| Existing app-level `'use cache'` exists beyond DEBT-349 | `app/pricing/pricing-view-skeleton.tsx:42`, `app/pricing/pricing-view-skeleton.tsx:43`, `components/marketing/marketing-layout.tsx:21`, `components/marketing/marketing-layout.tsx:26`, `components/marketing/marketing-layout.tsx:73`, `components/marketing/marketing-layout.tsx:74`, `components/marketing/marketing-home.tsx:71`, `components/marketing/marketing-home.tsx:72`, `components/marketing/marketing-home.tsx:253`, `components/marketing/marketing-home.tsx:254` | `b5fc4056` |
| No live published question/tag cross-request cache tags exist | Whole-tree `rg` found no live application hits for `cacheTag`, `cacheLife`, `revalidateTag`, or `unstable_cache`; the only app invalidation import is `app/(app)/app/bookmarks/bookmarks-actions.ts:3` | `b5fc4056` |
| Bookmark invalidation is unrelated to published content | `app/(app)/app/bookmarks/bookmarks-actions.ts:17`, `app/(app)/app/bookmarks/bookmarks-actions.ts:37` | `b5fc4056` |
| DEBT-344 request-scoped question wrapper exists | `lib/cached-reads.ts:21`, `lib/cached-reads.ts:24`, `lib/cached-reads.ts:27`, `lib/cached-reads.ts:30`, `lib/cached-reads.ts:36` | `b5fc4056` |
| DEBT-344 normalizes batch question cache keys | `lib/cached-reads.ts:9`, `lib/cached-reads.ts:13`, `lib/cached-reads.ts:42`, `lib/cached-reads.ts:45` | `b5fc4056` |
| DEBT-344 request-scoped tag wrapper exists | `lib/cached-reads.ts:65`, `lib/cached-reads.ts:68`, `lib/cached-reads.ts:70` | `b5fc4056` |
| Production container wires request-cached question/tag repositories | `lib/controller-helpers.ts:9`, `lib/controller-helpers.ts:13`, `lib/controller-helpers.ts:21`, `lib/controller-helpers.ts:24`, `lib/controller-helpers.ts:28` | `b5fc4056` |
| DB override seam bypasses cached production repositories | `lib/controller-helpers.ts:30`, `lib/controller-helpers.ts:31`, `lib/controller-helpers.ts:33`, `lib/controller-helpers.ts:34`, `lib/controller-helpers.ts:35`, `lib/controller-helpers.ts:37` | `b5fc4056` |
| Explicit deps and custom loaders bypass auth request cache | `lib/auth-request-cache.ts:65`, `lib/auth-request-cache.ts:69`, `lib/auth-request-cache.ts:73`, `lib/auth-request-cache.ts:76`, `lib/auth-request-cache.ts:82` | `b5fc4056` |
| Request cache rechecks question reads on a new server render | `lib/cached-reads.test.ts:127`, `lib/cached-reads.test.ts:169`, `lib/cached-reads.test.ts:170`, `lib/cached-reads.test.ts:178`, `lib/cached-reads.test.ts:179` | `b5fc4056` |
| Current question repository still reads published questions fresh | `src/adapters/repositories/drizzle-question-repository.ts:93`, `src/adapters/repositories/drizzle-question-repository.ts:109`, `src/adapters/repositories/drizzle-question-repository.ts:125` | `b5fc4056` |
| Current tag repository lists tags attached to published questions | `src/adapters/repositories/drizzle-tag-repository.ts:9`, `src/adapters/repositories/drizzle-tag-repository.ts:17`, `src/adapters/repositories/drizzle-tag-repository.ts:18`, `src/adapters/repositories/drizzle-tag-repository.ts:20` | `b5fc4056` |
| Question-by-slug controller read exists | `src/adapters/controllers/question-view-controller.ts:76`, `src/adapters/controllers/question-view-controller.ts:82` | `b5fc4056` |
| Question page renders a client shell before client-triggered load | `app/(app)/app/questions/[slug]/page.tsx:65`, `app/(app)/app/questions/[slug]/page.tsx:66`, `app/(app)/app/questions/[slug]/page.tsx:75`; client load at `app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts:132`, `app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts:135`, `app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts:156` | `b5fc4056` |
| Practice page renders a client shell | `app/(app)/app/practice/page.tsx:18`, `app/(app)/app/practice/page.tsx:19` | `b5fc4056` |
| Practice quick/session question loads are client-triggered actions | `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts:90`, `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts:125`, `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:147`, `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:156` | `b5fc4056` |
| `getNextQuestion` controller delegates to the use case after entitlement | `src/adapters/controllers/question-controller.ts:192`, `src/adapters/controllers/question-controller.ts:196`, `src/adapters/controllers/question-controller.ts:198`, `src/adapters/controllers/question-controller.ts:211` | `b5fc4056` |
| `GetNextQuestionUseCase` reads published questions by id | `src/application/use-cases/get-next-question.ts:241`, `src/application/use-cases/get-next-question.ts:317` | `b5fc4056` |
| `SubmitAnswerUseCase` reads the published question before grading | `src/application/use-cases/submit-answer.ts:89`, `src/application/use-cases/submit-answer.ts:90`, `src/application/use-cases/submit-answer.ts:100` | `b5fc4056` |
| Dashboard starts stats and session-history work in one server render | `app/(app)/app/dashboard/page.tsx:260`, `app/(app)/app/dashboard/page.tsx:262`, `app/(app)/app/dashboard/page.tsx:263`, `app/(app)/app/dashboard/page.tsx:265` | `b5fc4056` |
| Session history batch-resolves first question ids | `src/application/use-cases/get-session-history.ts:55`, `src/application/use-cases/get-session-history.ts:64`, `src/application/use-cases/get-session-history.ts:65` | `b5fc4056` |
| Stats remain attempt-driven and batch-enrich recent questions | `src/application/use-cases/get-user-stats.ts:81`, `src/application/use-cases/get-user-stats.ts:88`, `src/application/use-cases/get-user-stats.ts:104`, `src/application/use-cases/get-user-stats.ts:105` | `b5fc4056` |
| History questions tab loads attempted questions and tags together | `app/(app)/app/history/page.tsx:82`, `app/(app)/app/history/page.tsx:91`, `app/(app)/app/history/page.tsx:92`, `app/(app)/app/history/page.tsx:101` | `b5fc4056` |
| Attempted-question history batch-enriches published questions | `src/application/use-cases/get-attempted-questions.ts:76`, `src/application/use-cases/get-attempted-questions.ts:95`, `src/application/use-cases/get-attempted-questions.ts:97` | `b5fc4056` |
| Session review and completed-session feedback batch-enrich questions | `src/application/use-cases/get-practice-session-review.ts:88`, `src/application/use-cases/get-practice-session-review.ts:89`; `src/application/use-cases/get-completed-session-questions-with-feedback.ts:107`, `src/application/use-cases/get-completed-session-questions-with-feedback.ts:108` | `b5fc4056` |
| Practice tag filters load through a client effect | `app/(app)/app/practice/hooks/use-practice-session-tags.ts:20`, `app/(app)/app/practice/hooks/use-practice-session-tags.ts:21`, `app/(app)/app/practice/hooks/use-practice-session-tags.ts:22`; effect invokes `getTags` at `app/(app)/app/practice/practice-page-tags.ts:19`, `app/(app)/app/practice/practice-page-tags.ts:22` | `b5fc4056` |
| `getTags` reads `tagRepository.listAll()` after entitlement | `src/adapters/controllers/tag-controller.ts:41`, `src/adapters/controllers/tag-controller.ts:45`, `src/adapters/controllers/tag-controller.ts:47` | `b5fc4056` |
| Subscription status remains a fresh repository read | `src/application/use-cases/check-entitlement.ts:32`, `src/adapters/repositories/drizzle-subscription-repository.ts:53`, `src/adapters/repositories/drizzle-subscription-repository.ts:54` | `b5fc4056` |
| Attempt reads remain fresh repository queries | `src/adapters/repositories/drizzle-attempt-repository.ts:229`, `src/adapters/repositories/drizzle-attempt-repository.ts:241`, `src/adapters/repositories/drizzle-attempt-repository.ts:264`, `src/adapters/repositories/drizzle-attempt-repository.ts:268`, `src/adapters/repositories/drizzle-attempt-repository.ts:290`, `src/adapters/repositories/drizzle-attempt-repository.ts:294` | `b5fc4056` |
| Webhook-driven billing/clerk paths are route handlers, not published-content caches | `app/api/stripe/webhook/route.ts:1`, `app/api/stripe/webhook/route.ts:10`; `app/api/webhooks/clerk/route.ts:1`, `app/api/webhooks/clerk/route.ts:34` | `b5fc4056` |
| Seed is a standalone script with its own Postgres connection | `scripts/seed.ts:14`, `scripts/seed.ts:15`, `scripts/seed.ts:23`, `scripts/seed.ts:24`, `scripts/seed.ts:27`, `scripts/seed.ts:28` | `b5fc4056` |
| Draft import writes MDX status outside Next runtime | `scripts/import-draft-questions.ts:10`, `scripts/import-draft-questions.ts:66`, `scripts/import-draft-questions.ts:91`, `scripts/import-draft-questions.ts:99`, `scripts/import-draft-questions.ts:101` | `b5fc4056` |
| Seed inserts and updates questions/status/choices/tag joins | `scripts/seed/question-syncer.ts:43`, `scripts/seed/question-syncer.ts:46`, `scripts/seed/question-syncer.ts:53`, `scripts/seed/question-syncer.ts:157`, `scripts/seed/question-syncer.ts:159`, `scripts/seed/question-syncer.ts:165`, `scripts/seed/question-syncer.ts:198`, `scripts/seed/question-syncer.ts:203` | `b5fc4056` |
| Seed inserts tags but rejects existing tag name/kind drift | `scripts/seed/tag-manager.ts:86`, `scripts/seed/tag-manager.ts:89`, `scripts/seed/tag-manager.ts:97`, `scripts/seed/tag-manager.ts:98` | `b5fc4056` |
| Placeholder unpublish/archive path is a script status update | `scripts/seed/placeholder-archiver.ts:5`, `scripts/seed/placeholder-archiver.ts:9`, `scripts/seed/placeholder-archiver.ts:11`, `scripts/seed/placeholder-archiver.ts:14` | `b5fc4056` |
| Observability spec has no current performance tracing/profiling for this decision | `docs/specs/spec-016-observability.md:70`, `docs/specs/spec-016-observability.md:79`, `docs/specs/spec-016-observability.md:180`, `docs/specs/spec-016-observability.md:182`, `docs/specs/spec-016-observability.md:195` | `b5fc4056` |
| Live Sentry config disables tracing/profiling signal | `instrumentation.ts:19`, `instrumentation.ts:21`, `sentry.client.config.ts:9`, `sentry.client.config.ts:11`, `sentry.client.config.ts:12`, `sentry.client.config.ts:13` | `b5fc4056` |
| Logger policy discourages noisy high-frequency logging | `docs/specs/spec-016-observability.md:280`, `docs/specs/spec-016-observability.md:284`; logger redaction exists at `lib/logger.ts:23`, `lib/logger.ts:25` | `b5fc4056` |
| ADR-010 forbids invalidation from standalone scripts | `docs/adr/adr-010-caching-strategy.md:48`, `docs/adr/adr-010-caching-strategy.md:52` | `b5fc4056` |
| DEBT-344 is the parent resolved Tier-1 work | `docs/_archive/debt/debt-344-request-scoped-caching.md:38`, `docs/_archive/debt/debt-344-request-scoped-caching.md:40`, `docs/_archive/debt/debt-344-request-scoped-caching.md:45`, `docs/_archive/debt/debt-344-request-scoped-caching.md:64` | `b5fc4056` |
