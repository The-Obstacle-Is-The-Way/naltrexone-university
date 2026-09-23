# Addiction Boards Question Bank SaaS — Technical Specification (SPEC.md)

> **2026-09-22 reconciliation (DEBT-481).** The six confirmed contradictions are corrected below. This master owns product/design narrative; executable source owns physical schema, validation, action configuration, seed identity and CI. Linked practice-engine policies own shipped interaction details. The four split parts are navigation views, not independent copies. Remaining narrative examples are not a complete inventory or a claim that every implementation detail was re-audited. The dated warning below is preserved as history and superseded for the six reconciled contracts.

> **Updated: 2026-09-20 — current-contract warning.** The [DEBT-481 audit](../_archive/debt/debt-481-master-spec-implementation-drift.md) confirms stale schema, action/limit, content/seed, CI and timing examples across the master/split copies. Do not copy these “exact” blocks as current implementation authority. Follow the linked source/runtime contracts and current [SPEC-016](../_archive/specs/spec-016-observability.md) and [SPEC-017](../_archive/specs/spec-017-rate-limiting.md) while documentation ownership is reconciled; product decisions are not superseded by this warning.

## 1. System Overview

**Product description:**
A subscription-based web app that provides a high-quality multiple-choice question bank for Addiction Psychiatry and Addiction Medicine board exam prep. Users subscribe, complete questions in tutor/exam-style practice sessions, review missed questions, and bookmark difficult topics.

**Target users:**

* Addiction Psychiatry fellows
* Addiction Medicine fellows
* Physicians recertifying in Addiction Medicine / Addiction Psychiatry

**Core value proposition:**
Board-relevant questions with detailed explanations, fast practice workflows, and progress tracking focused on high-yield addiction content.

**Revenue model (exact tiers and prices):**

* **Pro Monthly:** **$29/month** (recurring subscription)
* **Pro Annual:** **$199/year** (recurring subscription)

---

## 2. Architecture Diagram

```text
+-------------------+            +------------------------------------------------+
|    Browser (UI)   |            |             Vercel (Next.js 16+)               |
|  Next.js Client   |            |  App Router + Server Components + Actions      |
+---------+---------+            |  Route Handlers (/app/api/*)                   |
          |                      +-------------------+----------------------------+
          |  HTTPS requests                          |
          |  (pages, actions, APIs)                  |
          v                                          v
+-------------------+                       +--------------------------+
| Clerk (Auth)      |<-- session cookies -->| Next.js Server           |
| @clerk/nextjs     |                       | - auth() / currentUser() |
+-------------------+                       | - subscription checks    |
                                            | - server actions         |
                                            | - webhook handlers       |
                                            +----------+---------------+
                                                       |
                                                       | Drizzle ORM
                                                       v
                                            +---------------------+
                                            | Neon Postgres       |
                                            | (Vercel Marketplace)|
                                            +---------------------+
                                                       ^
                                                       |
                                                       | Stripe webhooks (HTTPS)
+-------------------+                                  |
| Stripe            |----------------------------------+
| - Checkout        |
| - Customer Portal |
| - Webhooks        |
+-------------------+

Auth flow:
Browser -> Next.js -> Clerk to authenticate -> Clerk session available to server actions/routes.

Payments flow:
Browser -> Server Action createCheckoutSession -> Stripe Checkout -> redirect success ->
Stripe Webhook -> /api/stripe/webhook -> Neon DB subscription state -> app entitlement.
```

Next.js Route Handlers use the Web `Request`/`Response` APIs and live inside the `app` directory. ([Next.js][1])

---

## 3. Database Schema

### 3.1 Physical schema and migration authority

The executable [Drizzle schema](../../db/schema.ts) owns table, column,
constraint, enum and relation definitions. The [migration ledger](../../db/migrations/meta/_journal.json)
and its SQL files own the deployed evolution; the
[migration runbook](../dev/deployment-environments.md#deploy-migration-contract)
describes applying that history. Do not recreate the database from a copied
schema block or use schema push to bypass migrations.

**Reconciled 2026-09-22:** the implementation has 21 tables. The former
14-table copy omitted trial payment-method setup operations, renewal consent
records, renewal notice deliveries, Clerk events, deleted Clerk users, pending
Stripe cancellations and question feedback. This dated census is not a second
schema to maintain; consult the linked source for the current inventory.

The design keeps vendor identifiers in persistence rather than domain entities,
uses timezone-aware timestamps, and preserves user/question/choice relationships
through database constraints. Details such as normalized practice-question state
belong to the physical schema and the owning [practice-engine contracts](../practice-engine/index.md),
not an independent implementation in this document.

---

## 4. API and Server Actions

### 4.1 Auth Level Definitions

* **public**: no authentication required
* **authenticated**: authentication required (Clerk session)
* **subscribed**: subscription entitlement required (in addition to authentication; see below)

### 4.2 Subscription Entitlement (Design Summary)

A user is **entitled** if and only if there exists a row in `stripe_subscriptions` for the user with:

* subscription `status` translates to domain `SubscriptionStatus` ∈ `{ "active", "inTrial", "pastDue" }` (Stripe: `{ "active", "trialing", "past_due" }`)
* AND `current_period_end > now()` (server UTC)
* AND the subscription row corresponds to the **latest** known subscription for that user (enforced by `stripe_subscriptions.user_id` unique constraint: 1 row per user)

All other statuses are **not entitled** (Stripe: `canceled`, `unpaid`, `paused`, `incomplete`, `incomplete_expired`).

#### 4.2.1 Dunning Grace Policy

`pastDue` subscribers retain access while Stripe retries payment. Stripe manages the dunning lifecycle (Smart Retries, configurable retry schedule). When Stripe exhausts retries, it transitions the subscription to `canceled` or `unpaid`, at which point the existing entitlement logic locks the user out.

**UI requirement:** When a `pastDue` subscriber accesses the app, the layout MUST display a non-blocking banner: "Your payment failed — please update your billing information." with a link to the Stripe billing portal. The user MUST NOT be redirected away from app content.

### 4.3 Standard Server Action Result Type (Used by Every Server Action)

All server actions MUST return a discriminated union to avoid leaking stack traces to clients:

```ts
// src/adapters/controllers/action-result.ts
export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'ALREADY_SUBSCRIBED'
  | 'UNSUBSCRIBED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'STRIPE_ERROR'
  | 'INVALID_WEBHOOK_SIGNATURE'
  | 'INVALID_WEBHOOK_PAYLOAD'
  | 'INTERNAL_ERROR';

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };
```

### 4.4 Route Handlers (API Endpoints)

#### 4.4.1 `POST /api/health`

* **Path:** `/app/api/health/route.ts`
* **Method:** POST
* **Auth:** public
* **Purpose:** health check for uptime monitoring; verifies DB connectivity

**Input (Zod):**

```ts
import { z } from 'zod';
export const HealthInputSchema = z.object({}).strict();
```

**Output (TypeScript):**

```ts
export type HealthResponse = {
  ok: true;
  db: true;
  timestamp: string; // ISO
};
```

**Errors:**

* `429` if health endpoint rate limit is exceeded
* `503` if rate limiter is unavailable
* `500` if DB query fails
* Response body:

```ts
export type HealthErrorResponse = { ok: false; error: string };
```

**Behavior:**

* Applies fixed-window rate limiting by client IP (`health:${ip}`) before DB work.
* On rate limit exceeded, returns `429` with headers:
  * `Retry-After`
  * `X-RateLimit-Limit`
  * `X-RateLimit-Remaining`
* If rate limiter fails, returns `503` with `{ ok:false, error:'Rate limiter unavailable' }`.
* Runs `SELECT 1` via Drizzle
* Returns 200 with `{ ok:true, db:true, timestamp:new Date().toISOString() }`

---

#### 4.4.2 `POST /api/stripe/webhook`

* **Path:** `/app/api/stripe/webhook/route.ts`
* **Method:** POST
* **Auth:** public (signature-protected)
* **Runtime:** `nodejs` (Stripe webhook verification uses Node crypto; do not run on edge)
* **Purpose:** sync Stripe → DB subscription state

**Input:** raw request body (`string` or `Buffer`) + header `stripe-signature`

**Output:**

```ts
export type StripeWebhookResponse = { received: true };
```

**Errors:**

* `400` if signature verification fails
* `429` if webhook endpoint rate limit is exceeded
* `503` if rate limiter is unavailable
* `500` if DB processing fails

**Required Stripe verification:**

* Must use `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` (signature verification is mandatory).

**Idempotency:**

* `stripe_events.id` is the Stripe event id (primary key).
* Webhook handler must:

  1. Attempt to *claim* the event by inserting a `stripe_events` row with `{ id, type, processed_at: null, error: null }` using `ON CONFLICT DO NOTHING RETURNING id`.
  2. If not claimed, load the existing row:
     * If `processed_at` is not null AND `error` is null: return 200 immediately (already processed)
     * Otherwise, ensure only one request proceeds (e.g. `SELECT ... FOR UPDATE` on the `stripe_events` row, or a Postgres advisory lock keyed by `event.id`) before processing/retrying.
  3. Process event (all writes must be idempotent)
  4. On success: set `processed_at = now()`, `error = null`
  5. On failure: set `error = <string>`, leave `processed_at` null

**Events handled:**

* `checkout.session.completed`
* `checkout.session.expired`
* `invoice.payment_failed`
* `invoice.payment_succeeded`
* `invoice.payment_action_required`
* `customer.subscription.created`
* `customer.subscription.updated`
* `customer.subscription.deleted`
* `customer.subscription.paused`
* `customer.subscription.resumed`
* `customer.subscription.trial_will_end`
* `customer.subscription.pending_update_applied`
* `customer.subscription.pending_update_expired`

---

#### 4.4.3 `POST /api/webhooks/clerk`

* **Path:** `/app/api/webhooks/clerk/route.ts`
* **Method:** POST
* **Auth:** public (Svix signature-protected)
* **Runtime:** `nodejs`
* **Purpose:** sync Clerk user events → DB user state

**Input:** raw request body + Svix signature headers (`svix-id`, `svix-timestamp`, `svix-signature`)

**Output:**

```ts
export type ClerkWebhookResponse = { received: true };
```

**Errors:**

* `400` if signature verification fails
* `429` if webhook endpoint rate limit is exceeded
* `503` if rate limiter is unavailable
* `500` if DB processing fails

**Events handled:**

* `user.created` — No-op; users are created lazily via `upsertByClerkId` on first authenticated request (see `docs/vendor-docs/clerk.md`)
* `user.updated` — Update user email in `users` table
* `user.deleted` — Delete user and cascade (subscription, attempts, bookmarks, etc.)

---

### 4.5 Server Actions (Required)

All server actions are implemented under:
`src/adapters/controllers/*.ts`

> **Note:** Per ADR-012, server actions are Controllers in Clean Architecture terms and live in the adapters layer, not in the Next.js app directory.

All inputs MUST be validated with Zod before any DB/Stripe calls.

#### Shared Zod helpers

```ts
import { z } from 'zod';

export const zUuid = z.string().uuid();
export const zNonEmptyString = z.string().min(1);

export const zDifficulty = z.enum(['easy', 'medium', 'hard']);
export const zPracticeMode = z.enum(['tutor', 'exam']);
export const zSubscriptionPlan = z.enum(['monthly', 'annual']);

export const zPagination = z.object({
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
}).strict();
```

#### 4.5.0 Cross-Cutting Controller Policies (Required)

**Idempotency.** The current action names and error dispositions are defined in
[idempotency-error-policy.ts](../../src/adapters/controllers/shared/idempotency-error-policy.ts).
Controllers use [executeIdempotent](../../src/adapters/controllers/shared/execute-idempotent.ts)
and the owning use case's transaction boundary. A supported request key scopes
replay to its user/action; it does not make every failure cacheable or every
mutation an idempotent action. Follow those executable contracts rather than
the former partial action list.

**Rate limiting.** [SPEC-017's current-state inventory](../_archive/specs/spec-017-rate-limiting.md#current-state)
owns the audited policy-to-operation table; [rate-limits.ts](../../src/adapters/shared/rate-limits.ts)
owns the numeric configuration, and the linked controller/route callers own
enforcement and response behavior. The 2026-09-22 census is 14 policies covering
18 limited operations, distinct from 29 exported controller actions. Shared
helpers mean operation count is not invocation-site count.

The bookmark mutation uses `bookmark:setBookmark` and an explicit desired state,
not a toggle replay. Successful cached replays do not execute a fresh
rate-limited mutation. Route authentication/signature validation and entitlement
remain separate protections; a rate limit is not an authorization mechanism.

---

#### 4.5.1 Server Action: `createCheckoutSession(plan)`

* **Name:** `createCheckoutSession`
* **Type:** Server Action
* **Auth:** authenticated
* **File:** `src/adapters/controllers/billing-controller.ts`

**Input (Zod):**

```ts
export const CreateCheckoutSessionInputSchema = z.object({
  plan: zSubscriptionPlan,
  idempotencyKey: zUuid.optional(),
}).strict();
```

**Output:**

```ts
export type CreateCheckoutSessionOutput = {
  url: string; // Stripe Checkout Session URL
};
```

**Errors:**

* `UNAUTHENTICATED` if no Clerk session
* `ALREADY_SUBSCRIBED` if Stripe already has a blocking subscription for the customer
* `VALIDATION_ERROR` if input invalid
* `RATE_LIMITED` if checkout session creation limit is exceeded
* `STRIPE_ERROR` on Stripe API failure
* `INTERNAL_ERROR` on DB failure

**Behavior:**

1. Enforce per-user rate limit: max 10 checkout session attempts per 60s window.
2. Ensure local `users` row exists for Clerk user (upsert by `clerk_user_id`).
3. Ensure `stripe_customers` exists:

   * If none: create Stripe Customer with metadata `{ user_id, clerk_user_id }`.
   * Insert `stripe_customers` row.
4. Block duplicate subscriptions using Stripe as source-of-truth:

   * Query `stripe.subscriptions.list({ customer, status: 'all', limit: 10 })`.
   * If any subscription status is one of `{ active, trialing, past_due, unpaid, incomplete, paused }`, return `ALREADY_SUBSCRIBED`.
5. Determine the Stripe Price ID from the selected **domain plan**:

   * If `plan === 'monthly'`: use `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`
   * If `plan === 'annual'`: use `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`

   **Important:** The controller MUST NOT accept arbitrary client-supplied Stripe price IDs.
6. Create Stripe Checkout Session (subscription):

   * `mode: 'subscription'`
   * `customer: <stripe_customer_id>`
   * `line_items: [{ price: <derivedPriceId>, quantity: 1 }]`
   * `allow_promotion_codes: false`
   * `billing_address_collection: 'auto'`
   * `success_url: ${NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
   * `cancel_url: ${NEXT_PUBLIC_APP_URL}/pricing?checkout=cancel`
   * `client_reference_id: <users.id>` (internal uuid)
   * `subscription_data.metadata.user_id = <users.id>`
7. Return `{ url: session.url }` (must be non-null; if null => STRIPE_ERROR)
8. If `idempotencyKey` is provided, wrap the operation with application-level idempotency (`action='billing:createCheckoutSession'`) so retries replay cached results instead of re-executing the flow.

---

#### 4.5.2 Server Action: `createPortalSession()`

* **Name:** `createPortalSession`
* **Type:** Server Action
* **Auth:** authenticated
* **File:** `src/adapters/controllers/billing-controller.ts`

**Input (Zod):**

```ts
export const CreatePortalSessionInputSchema = z.object({
  idempotencyKey: zUuid.optional(),
}).strict();
```

**Output:**

```ts
export type CreatePortalSessionOutput = { url: string };
```

**Errors:**

* `UNAUTHENTICATED`
* `NOT_FOUND` if user has no `stripe_customers` row
* `VALIDATION_ERROR` if input invalid
* `RATE_LIMITED` if billing portal session creation limit is exceeded
* `STRIPE_ERROR`
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce per-user rate limit: max 20 billing portal attempts per 60s window.
2. Ensure user row exists.
3. Load `stripe_customer_id` from `stripe_customers`.
4. Create Stripe Billing Portal Session:

   * `customer: stripe_customer_id`
   * `return_url: ${NEXT_PUBLIC_APP_URL}/app/billing`
5. Return portal URL.
6. If `idempotencyKey` is provided, wrap steps 2-5 with application-level idempotency (`action='billing:createPortalSession'`) so explicit retries replay the prior result instead of re-executing the flow.
7. If `idempotencyKey` is omitted, create a fresh portal session on each request. The default manage-billing UI omits the key because portal session URLs are short-lived and should normally be created on demand.

---

#### 4.5.3 Server Action: `getNextQuestion(sessionId?, filters?)`

* **Name:** `getNextQuestion`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/question-controller.ts`

**Input (Zod):** (mutually exclusive: either session mode OR ad-hoc filters)

```ts
export const QuestionFiltersSchema = z.object({
  tagSlugs: z.array(z.string().min(1)).max(50).default([]),
  difficulties: z.array(zDifficulty).max(3).default([]),
}).strict();

export const GetNextQuestionInputSchema = z.union([
  z.object({
    sessionId: zUuid,
    questionId: zUuid.optional(),
    filters: z.undefined().optional(),
  }).strict(),
  z.object({
    sessionId: z.undefined().optional(),
    questionId: z.undefined().optional(),
    filters: QuestionFiltersSchema,
  }).strict(),
]);
```

**Output:**

```ts
export type PublicChoice = {
  id: string;
  label: string;
  textMd: string;
  sortOrder: number;
};

export type NextQuestion = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  choices: PublicChoice[];
  session: null | {
    sessionId: string;
    mode: 'tutor' | 'exam';
    index: number; // 0-based index within session
    total: number;
    isMarkedForReview?: boolean;
  };
};

export type GetNextQuestionOutput = NextQuestion | null; // null means no remaining questions
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if sessionId provided but session not found or not owned by user
* `INTERNAL_ERROR`

**Behavior:**

##### Case A: sessionId provided

1. Load practice session by `id` AND `user_id`.
2. Parse `params_json` as immutable `PracticeSessionParams` metadata and load mutable state from `practice_session_question_states` ordered by `position`.
3. Determine target question:

   * If `questionId` is provided, it must belong to `params_json.questionIds`.
   * Else pick the first question in `params_json.questionIds` whose persisted answer marker is empty: for active exam sessions use `draftSelectedChoiceId ?? latestSelectedChoiceId`, and for tutor sessions use `latestSelectedChoiceId`.
4. If none found: return `null`.
5. Fetch question + choices by target questionId:

   * Question must be `status='published'` (if not published => return `NOT_FOUND`)
6. Return `NextQuestion` with `session` populated, including `isMarkedForReview` from persisted session state.
   **Important:** `choices.isCorrect` MUST NOT be returned.

##### Case B: filters provided (no session)

1. Build candidate published questions filtered by tags/difficulties.
2. Choose the next question deterministically:

   * Prefer a question the user has never attempted (no attempts row exists for that user/question).
   * If all attempted: choose the question with the **oldest** last attempt timestamp.
3. Return question + choices; `session: null`.

---

#### 4.5.4 Server Action: `submitAnswer(questionId, choiceId, sessionId?)`

* **Name:** `submitAnswer`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/question-controller.ts`

**Input (Zod):**

```ts
export const SubmitAnswerInputSchema = z.object({
  questionId: zUuid,
  choiceId: zUuid,
  sessionId: zUuid.optional(),
  idempotencyKey: zUuid.optional(),
  timeSpentSeconds: z.number().int().min(0).max(86_400).optional(),
}).strict();
```

**Output:**

```ts
export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean | null;
  correctChoiceId: string | null;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: Array<{
    choiceId: string;
    displayLabel: 'A' | 'B' | 'C' | 'D' | 'E';
    textMd: string;
    isCorrect: boolean;
    explanationMd: string | null;
  }>;
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if question or choice not found / mismatch
* `CONFLICT` if a session-backed submit targets an already-ended session or conflicts with an existing session answer
* `RATE_LIMITED` if answer submit limit is exceeded
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce per-user rate limit: max 120 submissions per 60s window.
2. Validate question exists and `status='published'`.
3. Validate the choice exists and belongs to the question.
4. If `sessionId` is provided:
   * Load the session for the current user.
   * Reject missing sessions with `NOT_FOUND`.
   * Reject questions outside the session with `NOT_FOUND`.
   * Reject active exam sessions with `VALIDATION_ERROR` (`Per-question submit is not available in exam mode`). Active exam answers use `saveExamDraftAnswer` while in progress and `finalizeExamAnswers` on `Submit exam`.
   * Reject ended sessions with `CONFLICT`.
5. Determine correct choice for question (query `choices` where `question_id` and `is_correct=true`).
6. Insert `attempts` row:

   * `user_id`
   * `question_id`
   * `practice_session_id = sessionId ?? null`
   * `selected_choice_id = choiceId`
   * `is_correct = (choiceId === correctChoiceId)`
   * `time_spent_seconds` from validated input (defaults to 0 when omitted)
7. If `sessionId` is provided for an active tutor session, persist latest per-question session state:

   * `latestSelectedChoiceId = choiceId`
   * `latestIsCorrect = isCorrect`
   * `latestAnsweredAt = attempts.answered_at`
8. Return grading result, `referenceMd`, and explanations for displayed shuffled choices with stable display labels (`A`..`E`). Active exam sessions are not a valid `submitAnswer` caller, so the active-exam redaction path is expressed as rejection rather than hidden feedback.
9. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='question:submitAnswer'`) to prevent duplicate attempt writes on retries.

---

#### 4.5.5 Server Action: `startPracticeSession(params)`

* **Name:** `startPracticeSession`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`

**Input (Zod):**

```ts
export const StartPracticeSessionInputSchema = z.object({
  mode: zPracticeMode,
  count: z.number().int().min(1).max(200),
  idempotencyKey: zUuid.optional(),
  tagSlugs: z.array(z.string().min(1)).max(50).default([]),
  difficulties: z.array(zDifficulty).max(3).default([]),
}).strict();
```

**Output:**

```ts
export type StartPracticeSessionOutput = { sessionId: string };
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if filters yield zero published questions
* `RATE_LIMITED` if session start limit is exceeded
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce per-user rate limit: max 20 session starts per 60s window.
2. Compute candidate question IDs from DB using filters:

   * only `questions.status='published'`
   * if `tagSlugs` non-empty: question must have at least one matching tag slug
   * if `difficulties` non-empty: difficulty in list
3. Shuffle deterministically in JavaScript using a seeded RNG:

   * seed = `createSeed(userId, Date.now())` (non-crypto rolling hash -> uint32; see `src/domain/services/shuffle.ts`)
   * shuffle algorithm = Fisher-Yates with seeded RNG
4. Take first `count` IDs (or fewer if fewer candidates exist).

   * If zero: return `NOT_FOUND`
5. Insert `practice_sessions` row with:

   * `user_id`, `mode`
   * `params_json = { count: questionIds.length, tagSlugs, difficulties, questionIds }`; persisted `count` is the actual selected session size, which may be smaller than the requested count when filters return fewer candidates.
   * one `practice_session_question_states` row per selected question, in `questionIds` order:
     * `{ practiceSessionId, questionId, position:<0-based index>, markedForReview:false, latestSelectedChoiceId:null, latestIsCorrect:null, latestAnsweredAt:null, draftSelectedChoiceId:null, draftSavedAt:null, draftCumulativeMs:0 }`
   * `started_at = now()`
6. Return `sessionId`.
7. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='practice:startPracticeSession'`) so retries replay the previously created session id.

---

#### 4.5.6 Server Action: `endPracticeSession(sessionId)`

* **Name:** `endPracticeSession`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`

**Input (Zod):**

```ts
export const EndPracticeSessionInputSchema = z.object({
  sessionId: zUuid,
  idempotencyKey: zUuid.optional(),
}).strict();
```

**Output:**

```ts
export type EndPracticeSessionOutput = {
  sessionId: string;
  endedAt: string; // ISO
  totals: {
    answered: number;
    correct: number;
    accuracy: number; // 0..1
    durationSeconds: number; // endedAt - startedAt (rounded down)
  };
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if session not found or not owned by user
* `CONFLICT` if session already ended
* `INTERNAL_ERROR`

**Behavior:**

1. Load session by id and user_id.
2. If `ended_at` is not null: return `CONFLICT`.
3. Set `ended_at = now()`.
4. Compute summary:

   * `answered` = count of persisted session question states where `latestSelectedChoiceId` is not null; finalized omitted states have `latestAnsweredAt` for attempt timing but are not counted as answered because no choice was selected
   * `correct` = count of persisted session question states where `latestIsCorrect === true`
   * duration = floor((ended_at - started_at)/1000)
5. Return summary.
6. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='practice:endPracticeSession'`) so duplicate finalize requests replay the cached summary.

> **SPEC-020 Note:** The UI MUST call `getPracticeSessionReview` after `endPracticeSession` to display per-question breakdown on the summary screen. See SPEC-020 Phase 2 (DEBT-123). No type change to `EndPracticeSessionOutput` — the review data comes from the existing review action (SRP).

---

#### 4.5.7 Server Action: `getUserStats()`

* **Name:** `getUserStats`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/stats-controller.ts`

**Input (Zod):**

```ts
export const GetUserStatsInputSchema = z.object({}).strict();
```

**Output:**

```ts
export type UserStatsOutput = {
  totalAnswered: number;
  accuracyOverall: number;     // 0..1
  answeredLast7Days: number;
  accuracyLast7Days: number;   // 0..1
  currentStreakDays: number;   // consecutive UTC days with >=1 attempt, ending today
  recentActivity: Array<
    | {
        isAvailable: true;
        attemptId: string;
        answeredAt: string;        // ISO
        questionId: string;
        sessionId: string | null;
        sessionMode: 'tutor' | 'exam' | null;
        slug: string;
        stemMd: string;
        difficulty: 'easy' | 'medium' | 'hard';
        isCorrect: boolean;
      }
    | {
        isAvailable: false;
        attemptId: string;
        answeredAt: string;        // ISO
        questionId: string;
        sessionId: string | null;
        sessionMode: 'tutor' | 'exam' | null;
        isCorrect: boolean;
      }
  >;
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `INTERNAL_ERROR`

**Behavior:**

* `totalAnswered` = count attempts for user
* `accuracyOverall` = correct / total (0 if total=0)
* last 7 days window uses `answered_at >= now() - 7 days`
* streak is computed in UTC from attempts in last 60 days:

  * create set of `YYYY-MM-DD` dates in UTC where attempts exist
  * starting from today UTC, count backward consecutive dates in set
* recentActivity = 20 most recent attempts joined to questions ordered by answered_at desc
* available rows include `stemMd` and `difficulty` for user-facing display
* unavailable rows are returned as `isAvailable:false` for graceful degradation when questions are unpublished/removed
* recentActivity items include `sessionId` and `sessionMode` from LEFT JOIN to `practice_sessions` (null for ad-hoc attempts). See SPEC-020 Phase 3.

---

#### 4.5.8 Server Action: `getAttemptedQuestions(limit, offset, result?, source?)`

* **Name:** `getAttemptedQuestions`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/review-controller.ts`

> **Note:** This action was originally `getMissedQuestions` (fixed-filter, incorrect-only). It was generalized to `getAttemptedQuestions` with optional `result` and `source` filters. The History > Questions tab uses this action with filters for correct/incorrect/all and practice/exam/adhoc source filtering.

**Input (Zod):**

```ts
export const GetAttemptedQuestionsInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
  offset: z.number().int().min(0),
  result: z.enum(['correct', 'incorrect']).optional(),
  source: z.enum(['tutor', 'exam', 'adhoc']).optional(),
}).strict();
```

**Output:**

```ts
export type AttemptedQuestionRow =
  | {
      isAvailable: true;
      questionId: string;
      isCorrect: boolean;
      sessionId: string | null;
      sessionMode: 'tutor' | 'exam' | null;
      slug: string;
      stemMd: string;
      difficulty: 'easy' | 'medium' | 'hard';
      tagSlugs: string[];
      lastAnsweredAt: string; // ISO
    }
  | {
      isAvailable: false;
      questionId: string;
      isCorrect: boolean;
      sessionId: string | null;
      sessionMode: 'tutor' | 'exam' | null;
      lastAnsweredAt: string; // ISO
    };

export type GetAttemptedQuestionsOutput = {
  rows: AttemptedQuestionRow[];
  limit: number;
  offset: number;
  totalCount: number;
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `INTERNAL_ERROR`

**Behavior:**

* For each question the user has attempted, find the most recent attempt per question.
* If `result` filter is provided (`'correct'` or `'incorrect'`), only include questions where the most recent attempt matches.
* If `source` filter is provided (`'tutor'`, `'exam'`, or `'adhoc'`), only include questions where the most recent attempt has the matching session context (`adhoc` = no session).
* Resolve question metadata from published questions when available.
* Available rows return `isAvailable:true` with `slug`, `stemMd`, `difficulty`, `tagSlugs`, and `isCorrect`; unavailable rows return `isAvailable:false` for graceful degradation when questions are unpublished/removed.
* Include `sessionId` and `sessionMode` for each row from the attempt/session context (`null` for ad-hoc attempts).
* Order by most recent attempt desc.
* Apply limit/offset.
* Return `totalCount` for pagination.

---

#### 4.5.9 Server Action: `setBookmark(questionId, bookmarked)`

The [bookmark controller](../../src/adapters/controllers/bookmark-controller.ts)
owns the validated input and ActionResult boundary; the
[SetBookmark use case](../../src/application/use-cases/set-bookmark.ts) owns
desired-state behavior.

- Requires an entitled user and a valid question UUID.
- Accepts an explicit `bookmarked: boolean` plus an optional UUID
  `idempotencyKey`; returns the resulting `bookmarked` state.
- The controller uses the configured bookmark-mutation rate policy and
  `bookmark:setBookmark` idempotency identity.
- Repeating the same desired state must not invert it. Do not reintroduce the
  former toggle pseudocode, which could undo state on a repeated request.

The controller schema, shared error policy and use case are the authorities for
validation/error details; this summary is not a copied implementation.

---

#### 4.5.10 Server Action: `getBookmarks()`

* **Name:** `getBookmarks`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/bookmark-controller.ts`

**Input (Zod):**

```ts
export const GetBookmarksInputSchema = z.object({}).strict();
```

**Output:**

```ts
export type BookmarkRow =
  | {
      isAvailable: true;
      questionId: string;
      slug: string;
      stemMd: string;
      difficulty: 'easy' | 'medium' | 'hard';
      bookmarkedAt: string; // ISO
    }
  | {
      isAvailable: false;
      questionId: string;
      bookmarkedAt: string; // ISO
    };

export type GetBookmarksOutput = {
  rows: BookmarkRow[];
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `INTERNAL_ERROR`

**Behavior:**

* Select bookmarks for user ordered by `created_at DESC`.
* Resolve question metadata from published questions when available.
* Available rows return `isAvailable:true` with `slug`, `stemMd`, and `difficulty`.
* Unavailable rows return `isAvailable:false` for graceful degradation when questions are unpublished/removed.
* Return list preserving bookmark order.

---

#### 4.5.11 Server Action: `getPracticeSessionReview(sessionId)`

* **Name:** `getPracticeSessionReview`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`

**Input (Zod):**

```ts
export const GetPracticeSessionReviewInputSchema = z.object({
  sessionId: zUuid,
}).strict();
```

**Output:**

```ts
export type PracticeSessionReviewRow =
  | {
      isAvailable: true;
      questionId: string;
      slug: string;
      stemMd: string;
      difficulty: 'easy' | 'medium' | 'hard';
      order: number; // 1-based
      isAnswered: boolean;
      isCorrect: boolean | null;
      markedForReview: boolean;
    }
  | {
      isAvailable: false;
      questionId: string;
      order: number; // 1-based
      isAnswered: boolean;
      isCorrect: boolean | null;
      markedForReview: boolean;
    };

export type GetPracticeSessionReviewOutput = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  totalCount: number;
  answeredCount: number;
  markedCount: number;
  rows: PracticeSessionReviewRow[];
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if session not found or not owned by user
* `INTERNAL_ERROR`

**Behavior:**

1. Load session by id and user_id.
2. Build ordered review rows from persisted `practice_session_question_states`.
3. Join question ids to published questions for stem/difficulty when available.
4. Return aggregate counts (`totalCount`, `answeredCount`, `markedCount`) and ordered rows.

---

#### 4.5.12 Server Action: `setPracticeSessionQuestionMark(sessionId, questionId, markedForReview)`

* **Name:** `setPracticeSessionQuestionMark`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`

**Input (Zod):**

```ts
export const SetPracticeSessionQuestionMarkInputSchema = z.object({
  sessionId: zUuid,
  questionId: zUuid,
  markedForReview: z.boolean(),
  idempotencyKey: zUuid.optional(),
}).strict();
```

**Output:**

```ts
export type SetPracticeSessionQuestionMarkOutput = {
  questionId: string;
  markedForReview: boolean;
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if session not found/not owned or question not in session
* `CONFLICT` if session mode is not exam or session already ended
* `INTERNAL_ERROR`

**Behavior:**

1. Load session by id and user_id.
2. Reject if session is not in exam mode.
3. Persist `markedForReview` for the target session question state.
4. Return updated mark state for the question.
5. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='practice:setPracticeSessionQuestionMark'`).

---

#### 4.5.13 Server Action: `getSessionHistory(limit, offset)`

* **Name:** `getSessionHistory`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`
* **Added by:** SPEC-020 Phase 4

**Input (Zod):**

```ts
export const GetSessionHistoryInputSchema = zPagination;
```

**Output:**

```ts
export type SessionHistoryRow = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  questionCount: number;
  answered: number;
  correct: number;
  accuracy: number;       // 0..1
  durationSeconds: number;
  startedAt: string;      // ISO
  endedAt: string;        // ISO
};

export type GetSessionHistoryOutput = {
  rows: SessionHistoryRow[];
  total: number;
  limit: number;
  offset: number;
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `INTERNAL_ERROR`

**Behavior:**

1. Load completed practice sessions (`ended_at IS NOT NULL`) for user, ordered by `ended_at DESC`.
2. For each session, compute stats from persisted `practice_session_question_states`:
   * `questionCount` = total questions in session
   * `answered` = count where `latestSelectedChoiceId` is not null; finalized omitted states have `latestAnsweredAt` for attempt timing but are not counted as answered because no choice was selected
   * `correct` = count where `latestIsCorrect === true`
   * `accuracy` = correct / questionCount (0 if questionCount = 0)
   * `durationSeconds` = floor((ended_at - started_at) / 1000)
3. Apply limit/offset pagination.
4. Return rows with total count for pagination.

---

#### 4.5.14 Server Action: `getIncompletePracticeSession()`

* **Name:** `getIncompletePracticeSession`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`

**Input (Zod):**

```ts
export const GetIncompletePracticeSessionInputSchema = z.object({}).strict();
```

**Output:**

```ts
export type GetIncompletePracticeSessionOutput =
  | {
      sessionId: string;
      mode: 'tutor' | 'exam';
      answeredCount: number;
      totalCount: number;
      startedAt: string; // ISO
    }
  | null;
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `INTERNAL_ERROR`

**Behavior:**

1. Load the most recent in-progress session for user (`ended_at IS NULL`).
2. If none exists, return `null`.
3. Compute `answeredCount` from persisted `practice_session_question_states`:
   * for active exam sessions, count states where `draftSelectedChoiceId IS NOT NULL OR latestSelectedChoiceId IS NOT NULL`;
   * otherwise, count states where `latestSelectedChoiceId IS NOT NULL`.
4. Return minimal resume metadata for UI continuation.

---

#### 4.5.15 Server Action: `getTags()`

* **Name:** `getTags`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/tag-controller.ts`

**Input (Zod):**

```ts
export const GetTagsInputSchema = z.object({}).strict();
```

**Output:**

```ts
export type TagRow = {
  id: string;
  slug: string;
  name: string;
  kind: 'topic' | 'substance' | 'treatment' | 'diagnosis';
};

export type GetTagsOutput = {
  rows: TagRow[];
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce entitlement (subscribed user).
2. Return all tags from repository for practice filter UI.
3. Preserve canonical tag metadata (`slug`, `name`, `kind`) without UI-specific transformations.

---

#### 4.5.16 Server Action: `getQuestionBySlug(slug)`

* **Name:** `getQuestionBySlug`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/question-view-controller.ts`

**Input (Zod):**

```ts
export const GetQuestionBySlugInputSchema = z.object({
  slug: z.string().min(1).max(255),
}).strict();
```

**Output:**

```ts
export type GetQuestionBySlugOutput = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  choices: Array<{
    id: string;
    label: string;
    textMd: string;
  }>;
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if question slug does not map to a published question
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce entitlement (subscribed user).
2. Load question by slug from published questions only.
3. Return public question payload for the question detail page (`/app/questions/[slug]`), excluding correctness flags.

---

#### 4.5.17 Server Action: `getPreviousAttempt(questionId)`

* **Name:** `getPreviousAttempt`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/question-view-controller.ts`
* **Added by:** SPEC-023 (Question Review Mode)

**Input (Zod):**

```ts
export const GetPreviousAttemptInputSchema = z
  .object({
    questionId: zUuid,
    attemptId: zUuid.optional(),
    sessionId: zUuid.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.attemptId && input.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attemptId'],
        message: 'Provide either attemptId or sessionId, not both',
      });
    }
  });
```

**Output:**

```ts
export type GetPreviousAttemptOutput =
  | {
      kind: 'attempt';
      attemptId: string;
      selectedChoiceId: string;
      isCorrect: boolean;
      correctChoiceId: string;
      explanationMd: string | null;
      referenceMd: string | null;
      choiceExplanations: ChoiceExplanation[]; // same type as submitAnswer output
      answeredAt: string; // ISO 8601
    }
  | {
      kind: 'session_unanswered';
      correctChoiceId: string;
      explanationMd: string | null;
      referenceMd: string | null;
      choiceExplanations: ChoiceExplanation[]; // same type as submitAnswer output
    }
  | null; // null when no prior revealable attempt exists
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` when `attemptId` exists but belongs to a different question
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce entitlement (subscribed user).
2. Reject input when both `attemptId` and `sessionId` are provided.
3. Resolve the prior result source in this order:
   * `attemptId` provided: load that exact attempt via `AttemptSingleQuestionReader.findByIdAndUserId`.
   * Else `sessionId` provided: load the attempt for that session/question pair via `AttemptSingleQuestionReader.findBySessionIdAndQuestionId`.
   * Else: load the user's most recent visible attempt for the question via `AttemptSingleQuestionReader.findLatestByUserAndQuestion`; active-exam attempts must not hide older visible attempts in this implicit path.
4. If no attempt is found and `sessionId` is absent (or `attemptId` was used), return `null`.
5. If no attempt is found and `sessionId` is present:
   * Load the session via `PracticeSessionRepository.findByIdAndUserId`.
   * Return `null` if the session is missing, still active (`endedAt === null`), or does not include `questionId`.
   * Load the published question by `questionId`.
   * If the question is missing, log a warning and return `null`.
   * Find the correct choice; if none exists, throw `INTERNAL_ERROR`.
   * Build `choiceExplanations` using `buildShuffledChoiceViews(question, userId)` for consistent display labels.
   * Return `{ kind: 'session_unanswered', correctChoiceId, explanationMd, referenceMd, choiceExplanations }`.
6. If an attempt is found but its `questionId` does not equal the requested `questionId`, log a warning and throw `NOT_FOUND`.
7. If the resolved attempt belongs to an active exam session through an exact identifier path (`attemptId` or active `sessionId`), return `null` so the answer key is not revealed before the session ends. The implicit latest-by-question path should already have selected only visible attempts; BUG-239 tracks the remaining implementation gap.
8. Load the published question referenced by the attempt.
9. If the question is missing (orphaned attempt), log a warning and return `null`.
10. Find the correct choice; if none exists, throw `INTERNAL_ERROR`.
11. Build `choiceExplanations` using `buildShuffledChoiceViews(question, userId)` for consistent display labels.
12. Return `{ kind: 'attempt', attemptId, selectedChoiceId, isCorrect, correctChoiceId, explanationMd, referenceMd, choiceExplanations, answeredAt }`.

---

## 5. Content Pipeline

### 5.1 MDX question format

The [content schema](../../lib/content/schemas.ts) and
[MDX parser](../../lib/content/parse-mdx-question.ts) own the accepted format:
question files under `content/questions/` have YAML frontmatter and ordered
`## Stem` / `## Explanation` sections. Use the
[content import runbook](../practice-engine/content-pipeline.md) for authoring/import operations.

### 5.2 Frontmatter validation

Use `QuestionFrontmatterSchema`, not a separately copied schema.
It enforces two to five uniquely labelled choices, exactly one correct choice,
unique tag slugs and the required canonical topic/substance taxonomy.
Each wrong choice requires a nonblank `explanation`; the correct choice must
not carry one. The schema and [draft taxonomy](../../lib/content/draft-taxonomy.ts)
own the complete accepted field/value set.

### 5.3 Examples and references

The old inline MDX example omitted required wrong-choice explanations and is
removed rather than presented as valid input. The
[seed parser tests](../../scripts/seed.test.ts) contain
executable accepted/rejected examples.

The [seed parser](../../scripts/seed/question-parser.ts) splits a terminal
reference from the general explanation and requires a nonempty citation for
non-synthetic questions. Only the explicitly identified placeholder source has
the documented exemption. Do not strip references or reintroduce the old
combined wrong-answer Markdown section.

### 5.4 Validation authority

[schemas.ts](../../lib/content/schemas.ts), [parse-mdx-question.ts](../../lib/content/parse-mdx-question.ts)
and [question-parser.ts](../../scripts/seed/question-parser.ts) are the current
executable parsing contracts. Their tests verify accepted/rejected inputs.
No “exact” schema is duplicated here.

### 5.5 Seed synchronization and identity

The entry point is [scripts/seed.ts](../../scripts/seed.ts), invoked with
`pnpm db:seed` under the [database-target safety procedure](../dev/deployment-environments.md).
Target selection and acknowledgement are mandatory; a content update does not
authorize a different database.

- The canonical file/database representations in
  [question-parser.ts](../../scripts/seed/question-parser.ts) include the
  question reference and each choice's explanation, as well as question fields,
  ordered choices and tags. [Canonical JSON/hash helpers](../../lib/content/parse-mdx-question.ts)
  normalize the representation for change detection.
- [question-syncer.ts](../../scripts/seed/question-syncer.ts) locks the existing
  question, compares the canonical hash, and applies the
  graded-history policy and [content-rewrite classification](../../scripts/seed/content-rewrite-policy.ts) before
  writes. Archived questions are not silently reactivated by ordinary seeding.
- Existing choice identity is preserved by label. Removal candidates are checked
  against attempts and normalized practice state; the
  [choice-sync plan](../../scripts/seed-helpers.ts) refuses unsafe removal.
  Surviving choices are upserted instead of deleting and recreating the whole set.
- Rewrites and withdrawals must follow those protections and their owning
  records. This reconciliation does not select unresolved content-history or
  release/rollback policies.

The former unconditional choice-delete pseudocode is withdrawn. Copying it
would bypass protections that the executable seed path now enforces.

---

## 6. Directory Structure

> **Authoritative Source:** This structure follows **ADR-012: Directory Structure** which implements Robert C. Martin's Clean Architecture. See [docs/adr/adr-012-directory-structure.md](../adr/adr-012-directory-structure.md) for complete rationale.

### Clean Architecture Layer Mapping

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    FRAMEWORKS & DRIVERS (Outermost)                     │
│  app/, components/, lib/, db/ — Next.js, React, Drizzle, External SDKs  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    INTERFACE ADAPTERS                             │  │
│  │  src/adapters/ — Repositories, Gateways, Controllers              │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    USE CASES                                │  │  │
│  │  │  src/application/ — Use Case classes, Port interfaces       │  │  │
│  │  │                                                             │  │  │
│  │  │  ┌─────────────────────────────────────────────────────┐    │  │  │
│  │  │  │                    ENTITIES (Core)                  │    │  │  │
│  │  │  │  src/domain/ — Entities, Value Objects, Services    │    │  │  │
│  │  │  │  ZERO external dependencies                         │    │  │  │
│  │  │  └─────────────────────────────────────────────────────┘    │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

**The Dependency Rule:** Dependencies point inward ONLY. Inner layers know nothing about outer layers.

### Directory Tree (Boundary-Level)

This master spec documents the directory structure at the directory-boundary level to avoid drift as files are refactored. For file-level indexes, prefer:

* `docs/specs/index.md`
* `docs/adr/index.md`
* `docs/practice-engine/index.md`

```text
/
├── app/                              # Frameworks layer (Next.js App Router)
│   ├── (marketing)/                  # Marketing pages
│   ├── (app)/app/                    # Entitled app shell + core routes
│   │   ├── dashboard/
│   │   ├── practice/
│   │   │   ├── [sessionId]/          # Session runner (tutor/exam)
│   │   │   └── quick/                # Quick Practice (ad-hoc question flow)
│   │   ├── history/                  # History (Sessions + Questions tabs — SPEC-021)
│   │   ├── questions/
│   │   │   └── [slug]/               # Question detail page (attempt + review mode — SPEC-023)
│   │   ├── bookmarks/
│   │   ├── billing/
│   │   └── shared/                   # Shared components (SessionBreakdownList, etc.)
│   └── api/                          # Route handlers (webhooks, health, cron)
│
├── src/                              # Clean Architecture layers
│   ├── domain/                       # Entities, value objects, services (pure)
│   ├── application/                  # Use cases + ports (interfaces)
│   │   ├── ports/                    # Port-per-module + barrels (ports/index.ts, ports/repositories.ts)
│   │   ├── use-cases/
│   │   ├── errors/
│   │   └── test-helpers/
│   │       └── fakes/                # Canonical fakes for unit/controller tests
│   └── adapters/                     # Controllers, repositories, gateways
│       ├── controllers/              # Server actions + controller helpers
│       ├── repositories/             # Drizzle implementations + mappers
│       ├── gateways/                 # Clerk/Stripe + rate limiter implementations
│       └── shared/                   # Adapter-only helpers (idempotency, rate limits, DB types)
│
├── components/                       # Frameworks layer (React components)
├── lib/                              # Frameworks layer (Infrastructure)
├── db/                               # Frameworks layer (Database)
├── content/                          # Static content (MDX questions)
├── scripts/
└── tests/                            # Integration + E2E tests
```

### Import Rules (Enforced by Architecture)

```typescript
// ✅ ALLOWED: Inner layers importing from inner layers
// src/application/use-cases/submit-answer.ts
import { gradeAnswer } from '@/src/domain/services/grading';

// ✅ ALLOWED: Adapters importing from application/domain
// src/adapters/controllers/question-controller.ts
import { SubmitAnswerUseCase } from '@/src/application/use-cases/submit-answer';

// ✅ ALLOWED: Frameworks importing from adapters
// app/(app)/app/practice/page.tsx
import { submitAnswer } from '@/src/adapters/controllers/question-controller';

// ❌ FORBIDDEN: Domain importing from outer layers
// src/domain/services/grading.ts
import { db } from '@/lib/db';  // ERROR! Domain cannot import frameworks
```

### Key Architectural Points

1. **Server Actions are Controllers** — They live in `src/adapters/controllers/`, NOT in `app/_actions/`
2. **Composition Root** — All dependency wiring in `lib/container.ts`
3. **Domain has ZERO imports** — No framework code, no database, no external services
4. **Unit tests colocated** — `*.test.ts` next to source in domain/application
5. **Integration/E2E centralized** — In `/tests/` directory

---

## 7. Vertical Slice Specifications

### SLICE-0: Foundation

**Slice ID:** SLICE-0

**User Story:**
As a user, I can load the site, sign up/sign in, and access the deployed app so that the platform is ready for paid features and content.

**Acceptance Criteria (Given/When/Then):**

* Given I visit `/`, when the page loads, then I see a marketing homepage with links to Pricing and Sign In.
* Given I visit `/sign-up`, when I create an account, then I am authenticated via Clerk and redirected to `/pricing`.
* Given the app is deployed to Vercel, when I open the production URL, then the health endpoint returns 200.

**Test Cases (file names + descriptions):**

* `tests/integration/db.integration.test.ts`: applies migrations against test Postgres and verifies tables exist.
* `tests/e2e/core-app-pages.spec.ts`: signs in via Clerk, ensures subscription, and verifies core app page navigation (Dashboard/Billing/Bookmarks/History), including legacy redirect behavior.

**Implementation Checklist (ordered):**

1. Create Next.js 16+ app with App Router and TypeScript strict mode.
   Next.js 16 requires Node.js 20.9+ and TypeScript 5.1+. ([Next.js][3])
2. **Use pnpm as the package manager.** pnpm provides better dependency isolation (prevents phantom dependencies), uses 70% less disk space than npm, and is 3x faster. Remove any `package-lock.json` and use only `pnpm-lock.yaml`.
3. Install Tailwind CSS v4 and configure PostCSS using `@tailwindcss/postcss`; add `@import "tailwindcss";` to `app/globals.css`. ([Tailwind CSS][4])
4. Install shadcn/ui and generate required base components (Button, Card, Badge, Dialog, Tabs, DropdownMenu, Separator).
5. **Install Biome for linting and formatting.** Biome is 10-100x faster than ESLint+Prettier and provides both linting and formatting in a single tool with one config file (`biome.json`). Next.js 16 removed `next lint`, so Biome is the modern replacement. ([Biome][9])
6. Install Drizzle ORM + drizzle-kit and configure migrations output to `/db/migrations`.
7. Add Neon Postgres connection via `DATABASE_URL`.
8. Add Clerk integration:

   * Add `<ClerkProvider>` in `app/layout.tsx`
   * Add Clerk routes for sign-in/up
   * Add Clerk middleware/proxy file (Next.js 16 uses `proxy.ts` naming per Clerk docs). ([Clerk][5])
9. Add `/api/health` route handler.
10. Add GitHub Actions CI (typecheck, lint, tests).
11. Connect repo to Vercel (preview deployments on PR; production on main).

**Files to Create/Modify:**

* `proxy.ts` (Clerk middleware/proxy)
* `app/layout.tsx`, `app/globals.css`
* `app/(marketing)/*` basic pages
* `app/api/health/route.ts`
* `db/schema.ts`
* `drizzle.config.ts`
* `lib/env.ts`, `lib/db.ts`, `lib/container.ts`
* `src/domain/` — Entity types, value objects, domain services
* `src/application/ports/` — Repository and gateway interfaces
* `src/adapters/gateways/clerk-auth-gateway.ts` — AuthGateway implementation
* `biome.json` (Biome linting + formatting config)
* `.github/workflows/ci.yml`
* `playwright.config.ts`, `vitest.config.mts`

**Database Migrations needed:**

* `0000_init.sql`:

  * `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
  * create enums
  * create all tables + indexes from Section 3

**Environment Variables needed:**

* `DATABASE_URL`
* `CLERK_SECRET_KEY`
* `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
* `NEXT_PUBLIC_APP_URL`

**Definition of Done:**

* `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, `pnpm test:e2e` all pass locally
* CI passes on PR
* Vercel preview deploy works
* `/api/health` returns `{ ok: true, db: true, ... }`

---

### SLICE-1: Paywall

**Slice ID:** SLICE-1

**User Story:**
As a user, I can subscribe and manage billing so that I can access the question bank.

**Acceptance Criteria:**

* Given I am logged in, when I click "Subscribe monthly/annual" on `/pricing`, then I'm redirected to Stripe Checkout.
* Given I complete payment, when I return to `/checkout/success`, then my subscription is active in the DB and I can access `/app/dashboard`.
* Given I am subscribed, when I open `/app/billing`, then I can open Stripe Customer Portal.
* Given my subscription is canceled/deleted, when webhooks arrive, then my entitlement is removed and `/app/*` redirects to `/pricing`.

**Test Cases:**

* `tests/integration/actions.stripe.integration.test.ts`: verify Stripe checkout session creation (Stripe mocked).
* `tests/e2e/subscribe.spec.ts`: end-to-end checkout in Stripe test mode using test card 4242. ([Stripe Docs][6])

**Implementation Checklist:**

1. Create Stripe products/prices (Section 11).
2. Add Stripe SDK initialization in `lib/stripe.ts`.
3. Implement server actions: `createCheckoutSession`, `createPortalSession`.
4. Implement webhook handler `/api/stripe/webhook` with signature verification and idempotency.
5. Implement `/checkout/success` page:

   * reads `session_id`
   * fetches Checkout Session from Stripe
   * syncs subscription/customer into DB (same logic as webhook; idempotent)
   * redirects to `/app/dashboard`
6. Implement subscription enforcement in `app/(app)/app/layout.tsx` server component:

   * if not entitled: redirect to `/pricing`
7. Build `/app/billing` page showing status + portal link.

**Files to Create/Modify:**

* `app/api/stripe/webhook/route.ts`
* `src/adapters/controllers/billing-controller.ts` — createCheckoutSession, createPortalSession
* `src/adapters/gateways/stripe-payment-gateway.ts` — PaymentGateway implementation
* `src/adapters/repositories/drizzle-subscription-repository.ts`
* `src/application/use-cases/create-checkout-session.ts`
* `src/application/use-cases/create-portal-session.ts`
* `src/application/use-cases/check-entitlement.ts`
* `src/domain/services/entitlement.ts` — isEntitled() pure function
* `app/(marketing)/checkout/success/page.tsx`
* `app/(app)/app/layout.tsx` (subscription gate)
* `app/(app)/app/billing/page.tsx`
* `lib/stripe.ts`, `lib/container.ts` (updated)

**Database Migrations needed:** None (already created in SLICE-0).

**Environment Variables needed:**

* `STRIPE_SECRET_KEY`
* `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
* `STRIPE_WEBHOOK_SECRET`
* `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`
* `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`

**Definition of Done:**

* Webhook events update `stripe_customers` + `stripe_subscriptions`
* Unsubscribed users cannot access `/app/*`
* Subscribed users can access `/app/*`
* Customer Portal opens and returns to `/app/billing`

---

### SLICE-2: Core Question Loop

**Slice ID:** SLICE-2

**User Story:**
As a subscribed user, I can answer questions and see explanations so that I can learn and track performance.

**Acceptance Criteria:**

* Given I am subscribed, when I start practice and open a question, then I see a question stem and choices rendered as sanitized markdown.
* When I select an answer and submit, then I see correct/incorrect feedback and explanation (tutor mode).
* When I submit, then an `attempts` row is created.

> **Route note:** `/app/practice` is the practice landing page. Question answering happens in the session runner (`/app/practice/[sessionId]`). Ad-hoc practice lives at `/app/practice/quick` (SPEC-019 Phase 2).

**Test Cases:**

* `src/domain/services/grading.test.ts` (colocated): gradeAnswer() pure function tests
* `src/application/use-cases/submit-answer.test.ts` (colocated): use case with fake repositories
* `tests/integration/controllers.integration.test.ts`: submitAnswer inserts attempts and grades correctly.
* `tests/e2e/practice.spec.ts`: UI flow for answering one question.

**Implementation Checklist:**

1. Create `components/markdown/Markdown.tsx` with react-markdown + remark-gfm + rehype-sanitize.
2. Add seed script with 10 placeholder questions.
3. Build domain services: `src/domain/services/grading.ts` — gradeAnswer() pure function
4. Build use cases: `src/application/use-cases/submit-answer.ts`, `get-next-question.ts`
5. Build repositories: `src/adapters/repositories/drizzle-question-repository.ts`, `drizzle-attempt-repository.ts`
6. Build controllers: `src/adapters/controllers/question-controller.ts` — 'use server' exports
7. Build the question loop UI (stem + choices + submit + feedback) as reusable components (consumed by Practice Sessions and Quick Practice):

   * fetch next question via controller
   * select choice
   * submit and show explanation
8. Add bookmark state control on question view (calls the `setBookmark` controller with the desired state).

**Files to Create/Modify:**

* `scripts/seed.ts`
* `content/questions/general/*.mdx` (10 placeholder files)
* `components/markdown/Markdown.tsx`
* `components/question/*`
* `src/domain/entities/question.ts`, `choice.ts`, `attempt.ts`
* `src/domain/services/grading.ts` — gradeAnswer() pure function
* `src/application/ports/*.ts` (re-exported via `src/application/ports/repositories.ts`) — QuestionRepository, AttemptRepository interfaces
* `src/application/use-cases/submit-answer.ts`, `get-next-question.ts`, `set-bookmark.ts`
* `src/adapters/repositories/drizzle-question-repository.ts`, `drizzle-attempt-repository.ts`
* `src/adapters/controllers/question-controller.ts`, `bookmark-controller.ts`
* `lib/container.ts` (add new factories)
* `app/(app)/app/practice/page.tsx` (landing page; Quick Practice lives at `app/(app)/app/practice/quick/page.tsx` in SPEC-019 Phase 2)

**Migrations:** none

**Env vars:** none beyond prior slices

**Definition of Done:**

* Seed runs idempotently
* Markdown renders safely (no raw HTML injection)
* Attempts are recorded per submission

---

### SLICE-3: Practice Sessions

**Slice ID:** SLICE-3

**User Story:**
As a subscribed user, I can run a timed practice session with filters and get a summary so that I can simulate studying blocks.

**Acceptance Criteria:**

* Given I choose count/mode/tags, when I click Start, then a practice session is created.
* When I proceed through questions, the app shows progress (e.g., 3/20).
* In exam mode, I can mark/unmark questions for review.
* In exam mode, "End session" opens a review stage showing answered/unanswered/marked counts with jump-to-question.
* When I submit from review stage, I see score and total duration.
* In exam mode, explanations are hidden until the session ends.
* During active answering in exam mode, per-question UI status is neutral (`answered`/`unanswered`/`current`/`marked`) and MUST NOT reveal correctness before review/summary.
* Users can navigate to any question during active answering (back/jump), not only forward. (SPEC-020 Phase 2)
* Session summary shows per-question breakdown alongside aggregate totals. (SPEC-020 Phase 2)

**Test Cases:**

* `src/application/use-cases/get-next-question.test.ts`: session question order + completion semantics (including `fromIndex` and persisted session state).
* `tests/e2e/practice.spec.ts`: start session -> answer -> end -> summary.

**Implementation Checklist:**

1. Implement `startPracticeSession` and persist immutable selection metadata in `params_json` plus mutable state in `practice_session_question_states`.
2. Implement session runner route `/app/practice/[sessionId]`.
3. Implement review-stage actions: `getPracticeSessionReview`, `setPracticeSessionQuestionMark`.
4. Implement `endPracticeSession` finalization using latest per-question session state.
5. Enforce exam-mode explanation gating.

**Files to Create/Modify:**

* `src/domain/entities/practice-session.ts`
* `src/domain/services/session.ts` — computeSessionProgress(), shouldShowExplanation()
* `src/domain/services/shuffle.ts` — shuffleWithSeed() for deterministic question selection
* `src/application/use-cases/start-practice-session.ts`, `end-practice-session.ts`
* `src/adapters/repositories/drizzle-practice-session-repository.ts`
* `src/adapters/controllers/practice-controller.ts`, `tag-controller.ts` — 'use server' exports
* `app/(app)/app/practice/[sessionId]/page.tsx`
* `components/question/*` (progress display + exam/tutor behaviors)
* `lib/container.ts` (add session factories)

**Migrations:** none

**Env vars:** none

**Definition of Done:**

* Sessions create and complete reliably
* Exam review stage + mark-for-review flow is correct and persisted
* Exam vs tutor behavior is correct and tested

---

### SLICE-4: Review and Bookmarks

**Slice ID:** SLICE-4

**User Story:**
As a subscribed user, I can review missed questions and bookmarked questions so that I can focus on weak areas.

**Acceptance Criteria:**

* History Questions tab shows attempted questions with filters for correct/incorrect and session source.
* Bookmark toggle persists; bookmarks page lists bookmarked questions.
* From History or bookmarks list, I can open a question to reattempt or review a previous attempt.

**Test Cases:**

* `src/application/use-cases/get-attempted-questions.test.ts`: attempted questions query logic (result + source filters, ordering).
* `tests/integration/controllers.integration.test.ts`: attempted questions controller integration, including missing-question behavior.
* `tests/e2e/history.spec.ts` and `tests/e2e/bookmarks.spec.ts`.

**Implementation Checklist:**

1. Implement `getAttemptedQuestions(limit, offset, result?, source?)`.
2. Build `/app/history` with Sessions and Questions tabs (SPEC-021).
3. Build `/app/bookmarks`.
4. Add question detail view: open question from list and submit answer or review previous attempt.

**Files to Create/Modify:**

* `src/application/use-cases/get-attempted-questions.ts`, `get-bookmarks.ts`
* `src/adapters/repositories/drizzle-bookmark-repository.ts`
* `src/adapters/controllers/review-controller.ts`, `bookmark-controller.ts`, `question-view-controller.ts` — 'use server' exports
* `app/(app)/app/history/page.tsx` — History page with Sessions/Questions tabs
* `app/(app)/app/bookmarks/page.tsx`
* `app/(app)/app/questions/[slug]/page.tsx` — question detail page (attempt + review mode)
* `components/question/*`
* `lib/container.ts` (add review/bookmark factories)

**Migrations:** none

**Env vars:** none

**Definition of Done:**

* Missed and bookmarks lists are correct and stable
* Reattempt creates new attempts

---

### SLICE-5: Dashboard

**Slice ID:** SLICE-5

**User Story:**
As a subscribed user, I can see my stats and recent activity so that I can track progress.

**Acceptance Criteria:**

* Dashboard shows total answered, overall accuracy, last 7 days accuracy, current streak.
* Shows recent activity list.
* Recent activity groups attempts by session when session context exists. (SPEC-020 Phase 3)

**Test Cases:**

* `src/domain/services/statistics.test.ts` (colocated): computeAccuracy(), computeStreak() pure function tests
* `src/application/use-cases/get-user-stats.test.ts` (colocated): use case with fake repositories
* `tests/e2e/practice.spec.ts`: answering questions updates dashboard stats.

**Implementation Checklist:**

1. Build domain services: `src/domain/services/statistics.ts` — computeAccuracy(), computeStreak(), filterAttemptsInWindow()
2. Build use case: `src/application/use-cases/get-user-stats.ts`
3. Build controller: `src/adapters/controllers/stats-controller.ts` — 'use server' getUserStats export
4. Build `/app/dashboard` page with stat cards and recent list.

**Files to Create/Modify:**

* `src/domain/services/statistics.ts` — pure functions for accuracy/streak
* `src/application/use-cases/get-user-stats.ts`
* `src/adapters/controllers/stats-controller.ts` — 'use server' exports
* `app/(app)/app/dashboard/page.tsx`
* `lib/container.ts` (add stats factories)

**Migrations:** none

**Env vars:** none

**Definition of Done:**

* Stats match DB ground truth
* Dashboard loads fast and renders server-side

---

## 8. Testing Strategy

> **Authoritative Source:** This follows **ADR-003: Testing Strategy**. See [docs/adr/adr-003-testing-strategy.md](../adr/adr-003-testing-strategy.md) for full details.

### 8.1 Unit Tests (Vitest) — Domain + Use Cases

**Scope:** `src/domain/` and `src/application/`

**Philosophy:**

* Test **behavior**, not implementation
* **NO MOCKS** for domain tests — domain has zero dependencies
* Use **Fakes** (not mocks) for use case tests — fake implementations of repository interfaces
* 100% coverage target for domain services

**Naming + placement (mandatory):**

* `*.test.ts` colocated next to source (same folder as implementation)
* Example: `src/domain/services/grading.ts` → `src/domain/services/grading.test.ts`

**Example Domain Test (NO MOCKS):**

```typescript
// src/domain/services/grading.test.ts
import { gradeAnswer } from './grading';
import { createQuestion } from '../test-helpers/factories';

it('returns isCorrect=true when correct choice selected', () => {
  const question = createQuestion({
    choices: [
      { id: 'a', isCorrect: false },
      { id: 'b', isCorrect: true },
    ],
  });
  const result = gradeAnswer(question, 'b');
  expect(result.isCorrect).toBe(true);
});
```

**Example Use Case Test (with Fakes):**

```typescript
// src/application/use-cases/submit-answer.test.ts
import { SubmitAnswerUseCase } from './submit-answer';
import { FakeQuestionRepository, FakeAttemptRepository } from '../test-helpers/fakes';

it('records attempt when answer submitted', async () => {
  const questionRepo = new FakeQuestionRepository([question]);
  const attemptRepo = new FakeAttemptRepository();
  const useCase = new SubmitAnswerUseCase(questionRepo, attemptRepo);

  await useCase.execute({ userId: 'u1', questionId: 'q1', choiceId: 'c1' });

  expect(attemptRepo.savedAttempts).toHaveLength(1);
});
```

### 8.2 Integration Tests (Vitest + real Postgres)

**Scope:** `src/adapters/` — test real implementations against real DB

**Philosophy:**

* Test that adapters correctly implement interfaces
* Use **real database** (Postgres via Docker/CI service)
* Test repositories, gateways with actual external services (Stripe test mode)

**Naming:**

* `*.integration.test.ts` in `/tests/integration`

**Test DB:**

* GitHub Actions uses a Postgres service container and a `DATABASE_URL` pointing to it.

### 8.3 E2E Tests (Playwright)

**Critical paths:**

* signup/signin flow
* subscribe flow (Stripe test mode)
* practice session flow
* review flow
* bookmark flow

**Auth strategy (mandatory):**

* Use `@clerk/testing/playwright` global setup to generate stored auth state, then reuse it across tests. ([Clerk][7])

**Stripe test mode:**

* Use Stripe test card `4242 4242 4242 4242` with a future date (e.g., 12/34). ([Stripe Docs][6])

### 8.4 CI Pipeline (GitHub Actions)

The executable [.github/workflows/ci.yml](../../.github/workflows/ci.yml) is the
workflow authority. [package.json](../../package.json) owns command/toolchain
versions, and [ci-workflow.test.ts](../../tests/ci-workflow.test.ts) pins the
workflow boundary. This section intentionally does not reproduce YAML.

Follow the [CI Secret Standard](../dev/deployment-environments.md#ci-secret-standard):
provider credentials belong only to consuming E2E steps; Build receives compiled
public values and shape-valid server-only placeholders. Actions are SHA-pinned.
Dependabot keeps the credential-free non-E2E lane policy; its omitted E2E evidence
must be explicit, not reported as executed.

The workflow runs unit, integration, browser, build and eligible required E2E
lanes, and emits their actual outcomes. The separate hosted-provider DOM lane is
observational, not required PR coverage. See the
[dependency update protocol](../dev/dependency-update-protocol.md) and
[testing infrastructure guide](../dev/testing-infrastructure.md) for execution rules.

**Production ordering:** promotion-PR E2E precedes the merge; Vercel builds main
while main CI runs; production domains are assigned only after main's required
`test` passes. The [Deployment Check procedure](../dev/deployment-procedure.md#production-deployment-check)
owns the configuration and timestamp proof. The Vercel build applies migrations
before domain assignment, so migrations must remain compatible with the serving
release. An echo-only deployment job is not a gate.

---

## 9. Security Checklist (Mandatory)

* All **URL paths** under `/app/*`:

  * require Clerk authentication (server-enforced)
  * require active subscription (server-enforced in `/app/(app)/app/layout.tsx`)
* Clerk route protection is implemented via `proxy.ts` using `clerkMiddleware()` and route matching. ([Clerk][8])
* Stripe webhook:

  * signature verification using `constructEvent` is mandatory
  * handler runs in Node runtime
  * idempotent processing using `stripe_events`
* All user input:

  * validated with Zod before any DB/Stripe call
* Markdown rendering:

  * uses `react-markdown` + `remark-gfm`
  * sanitized via `rehype-sanitize` with explicit schema allowing tables/code/links only
* No raw SQL in application code:

  * only Drizzle query builder is allowed
  * migration SQL files are allowed for schema setup
* HTTPS enforced:

  * Vercel default HTTPS is required
* Environment variables:

  * never exposed to client unless prefixed with `NEXT_PUBLIC_`
  * validated at runtime via Zod in `lib/env.ts`

---

## 10. Environment Variables

> Variables marked ✅ MUST be present in that environment.
>
> Notes:
>
> - **CI** fork PRs (no secrets) may use dummy values for third-party keys. In that mode, set `NEXT_PUBLIC_SKIP_CLERK=true` so `next build` can prerender without real Clerk keys.
>   - `NEXT_PUBLIC_SKIP_CLERK=true` is blocked on Vercel production deploys (`VERCEL_ENV=production`) by `lib/env.ts`.
> - **E2E test credentials** are required only when running Playwright E2E (CI or local). Never set them in production.

| Variable                            | Description                                                                                                                 | Required in Dev | Required in CI | Required in Preview | Required in Prod |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------: | -------------: | ------------------: | ---------------: |
| DATABASE_URL                        | Neon Postgres connection string                                                                                             |               ✅ |            ✅ |                   ✅ |                ✅ |
| CLERK_SECRET_KEY                    | Clerk secret key (server)                                                                                                   |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   | Clerk publishable key (client)                                                                                              |               ✅ |            ✅ |                   ✅ |                ✅ |
| CLERK_WEBHOOK_SIGNING_SECRET        | Clerk webhook signing secret (Svix). Required to verify incoming Clerk webhooks.                                            |               — |            — |                   — |                ✅ |
| STRIPE_SECRET_KEY                   | Stripe secret key (server)                                                                                                  |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  | Stripe publishable key (client)                                                                                             |               ✅ |            ✅ |                   ✅ |                ✅ |
| STRIPE_WEBHOOK_SECRET               | Stripe webhook signing secret                                                                                               |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_APP_URL                 | Canonical base URL (e.g., [http://localhost:3000](http://localhost:3000), [https://yourdomain.com](https://yourdomain.com)) |               ✅ |            ✅ |                   ✅ |                ✅ |
| CRON_SECRET                         | Shared bearer secret for `/api/cron/reconcile-stripe-subscriptions`. Runtime validation currently enforces this on Vercel production deploys (`VERCEL_ENV=production`). |               — |            — |                   — |                ✅ |
| NEXT_PUBLIC_SKIP_CLERK              | Set to `true` to skip `ClerkProvider` during prerender/build (CI fork PRs without real keys). Forbidden on prod deploys (`VERCEL_ENV=production`). |               — |            — |                   — |                — |
| NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY | Stripe Price ID for $29/mo                                                                                                  |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL  | Stripe Price ID for $199/yr                                                                                                 |               ✅ |            ✅ |                   ✅ |                ✅ |
| E2E_CLERK_USER_USERNAME             | Clerk test user username for Playwright                                                                                     |               — |            ✅ |                   — |                — |
| E2E_CLERK_USER_PASSWORD             | Clerk test user password for Playwright                                                                                     |               — |            ✅ |                   — |                — |

---

## 11. Stripe Setup

### 11.1 Products / Prices

Create in Stripe Dashboard (Test mode first, then Live mode):

1. Product: **Addiction Boards Pro Monthly**

   * Price: **$29.00**
   * Currency: USD
   * Billing: Recurring, every month
   * Copy the created Price ID into `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`

2. Product: **Addiction Boards Pro Annual**

   * Price: **$199.00**
   * Currency: USD
   * Billing: Recurring, every year
   * Copy the created Price ID into `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`

### 11.2 Webhook Events

Configure webhook endpoint:

* URL: `${NEXT_PUBLIC_APP_URL}/api/stripe/webhook`
* Events (must match section 4.4.2):

  * `checkout.session.completed`
  * `checkout.session.expired`
  * `invoice.payment_failed`
  * `invoice.payment_succeeded`
  * `invoice.payment_action_required`
  * `customer.subscription.created`
  * `customer.subscription.updated`
  * `customer.subscription.deleted`
  * `customer.subscription.paused`
  * `customer.subscription.resumed`
  * `customer.subscription.trial_will_end`
  * `customer.subscription.pending_update_applied`
  * `customer.subscription.pending_update_expired`

### 11.3 Customer Portal Configuration

Enable Stripe Customer Portal and configure:

* Allow customer to:

  * update payment method
  * view invoice history
  * cancel subscription
  * switch between Monthly and Annual plans (both directions)
* Set return URL: `${NEXT_PUBLIC_APP_URL}/app/billing`

---

## 12. Deployment Checklist (Ordered)

1. Create GitHub repo.
2. Initialize Next.js 16+ project with TypeScript strict and App Router.
3. Add Tailwind v4 + shadcn/ui base components. ([Tailwind CSS][4])
4. Create Neon Postgres via Vercel Marketplace and set `DATABASE_URL`.
5. Add Drizzle schema and run `pnpm db:migrate` to create tables (includes pgcrypto). ([Drizzle ORM][2])
6. Create Clerk application (dev + prod instances as needed):

   * Set env vars in Vercel (preview + prod)
   * Add `proxy.ts` with `clerkMiddleware()` route matching. ([Clerk][5])
7. Create Stripe products/prices in test mode; set env vars.
8. Implement Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`.
9. Implement pricing + checkout + success sync.
10. Implement subscription gate for `/app/*`.
11. Add seed script + placeholder questions; run `pnpm db:seed` in preview/prod once.
12. Add GitHub Actions workflow and ensure green on PR.
13. Connect repo to Vercel:

    * enable preview deploys
    * set production domain
14. Switch Stripe + Clerk to live mode keys for production.
15. Go-live verification:

    * `/api/health` returns 200
    * Sign up new user works
    * Subscription purchase works
    * Webhook delivers and subscription grants access
    * Customer portal works and returns to billing page
    * Practice flow works and attempts are recorded

---

## 13. Out of Scope for MVP (Explicit)

* **Admin UI for question authoring** — content is authored in MDX and seeded via script; admin UI adds large surface area and auth roles.
* **Spaced repetition algorithm** — requires scheduling, per-tag modeling, and more complex data structures; MVP focuses on straightforward practice/review.
* **Advanced pacing analytics** — per-question timing is already persisted, not universally zero. [SubmitAnswer](../../src/application/use-cases/submit-answer.ts) bounds supplied seconds (zero is the missing/invalid fallback); [FinalizeExamAnswers](../../src/application/use-cases/finalize-exam-answers.ts) converts bounded cumulative draft milliseconds to seconds. See [practice timing](../practice-engine/interaction-contracts.md#per-question-time-accumulation) and the [exam timing bound](../practice-engine/exam-answer-secrecy-policy.md). A richer pacing-analysis product remains out of scope.
* **AI-generated questions** — quality/safety and editorial control are MVP priorities; AI generation introduces validation risk.
* **Native mobile app** — web app is sufficient for initial market; mobile adds parallel build/test/deploy complexity.
* **Offline mode** — requires caching and conflict resolution; not needed for initial board prep workflow.
* **Team/institutional accounts** — adds org billing, seat management, and permissions; MVP is individual subscriptions only.
* **Leaderboards/social features** — not aligned with exam prep privacy and adds moderation complexity.
* **Advanced analytics** — MVP tracks core stats only; advanced cohort/psychometrics can come later.
* **Multiple exam types beyond Addiction Psych/Med** — focus ensures content quality and coherent tagging/blueprint mapping.

---

[1]: https://nextjs.org/docs/app/getting-started/route-handlers?utm_source=chatgpt.com "Getting Started: Route Handlers"
[2]: https://orm.drizzle.team/docs/migrate/components?utm_source=chatgpt.com "undefined - Drizzle ORM"
[3]: https://nextjs.org/blog/next-16 "Next.js 16 | Next.js"
[4]: https://tailwindcss.com/docs/guides/nextjs "Install Tailwind CSS with Next.js - Tailwind CSS"
[5]: https://clerk.com/docs/nextjs/getting-started/quickstart "Next.js Quickstart (App Router) - Next.js | Clerk Docs"
[6]: https://docs.stripe.com/testing?utm_source=chatgpt.com "Test card numbers"
[7]: https://clerk.com/docs/guides/development/testing/playwright/test-authenticated-flows "Test authenticated flows - Playwright | Clerk Docs"
[8]: https://clerk.com/docs/reference/nextjs/clerk-middleware "clerkMiddleware() | Next.js - Next.js - Next.js | Clerk Docs"
[9]: https://biomejs.dev/ "Biome - One toolchain for your web project"
