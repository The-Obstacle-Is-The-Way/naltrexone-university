# Master Spec — Part 2: API & Server Actions

> **This is Part 2 of the master spec, split for readability.**
> Covers: API and Server Actions (§4) — auth levels, entitlement logic, route handlers, and all 17 server actions.
>
> | Part | File | Sections | Theme |
> |------|------|----------|-------|
> | 1 | `master_spec_part1.md` | §1–3 | Overview, Architecture, Database Schema |
> | **2 (this)** | `master_spec_part2.md` | §4 | API & Server Actions |
> | 3 | `master_spec_part3.md` | §5–7 | Content Pipeline, Directory Structure, Vertical Slices |
> | 4 | `master_spec_part4.md` | §8–13 | Testing, Security, Env Vars, Deployment |
>
> **Canonical source:** [`master_spec.md`](./master_spec.md) (complete, unabridged)

---

## 4. API and Server Actions

### 4.1 Auth Level Definitions

* **public**: no authentication required
* **authenticated**: authentication required (Clerk session)
* **subscribed**: subscription entitlement required (in addition to authentication; see below)

### 4.2 Subscription Entitlement (Server-Side, Exact Logic)

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

**Events handled (exact):**

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

* `user.created` — Create user in `users` table
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

**Idempotency (mutating server actions):**

* Controllers accept optional `idempotencyKey?: UUID` and apply `withIdempotency(...)` when provided.
* Supported actions:
  * `billing:createCheckoutSession`
  * `practice:startPracticeSession`
  * `practice:endPracticeSession`
  * `practice:setPracticeSessionQuestionMark`
  * `question:submitAnswer`
  * `bookmark:toggleBookmark`
* Replayed requests with the same `(userId, action, idempotencyKey)` return cached prior results and must not re-run use-case side effects.

**Server action rate limiting (fixed-window, 60s):**

* `createCheckoutSession`: `10/min` per user key `billing:createCheckoutSession:${userId}`
* `startPracticeSession`: `20/min` per user key `practice:startPracticeSession:${userId}`
* `submitAnswer`: `120/min` per user key `question:submitAnswer:${userId}`
* `toggleBookmark`: `60/min` per user key `bookmark:toggleBookmark:${userId}`
* On limit exceeded: return `ActionResult` error code `RATE_LIMITED` with retry guidance in message text.

**Route handler rate limiting (IP-scoped, fixed-window, 60s):**

* `POST /api/health`: `600/min`
* `POST /api/webhooks/clerk`: `100/min`
* `POST /api/stripe/webhook`: `1000/min`
* On limit exceeded: return `429` with headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`.
* On rate-limiter failure: return `503` fail-closed.

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

**Behavior (exact):**

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
export const CreatePortalSessionInputSchema = z.object({}).strict();
```

**Output:**

```ts
export type CreatePortalSessionOutput = { url: string };
```

**Errors:**

* `UNAUTHENTICATED`
* `NOT_FOUND` if user has no `stripe_customers` row
* `STRIPE_ERROR`
* `INTERNAL_ERROR`

**Behavior (exact):**

1. Ensure user row exists.
2. Load `stripe_customer_id` from `stripe_customers`.
3. Create Stripe Billing Portal Session:

   * `customer: stripe_customer_id`
   * `return_url: ${NEXT_PUBLIC_APP_URL}/app/billing`
4. Return portal URL.

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

**Behavior (exact):**

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

**Behavior (exact):**

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

**Behavior (exact):**

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
   * `params_json = { count, tagSlugs, difficulties, questionIds }`
   * one `practice_session_question_states` row per selected question, in `questionIds` order:
     * `{ questionId, position:<0-based index>, markedForReview:false, latestSelectedChoiceId:null, latestIsCorrect:null, latestAnsweredAt:null, draftSelectedChoiceId:null, draftSavedAt:null, draftCumulativeMs:0 }`
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

**Behavior (exact):**

1. Load session by id and user_id.
2. If `ended_at` is not null: return `CONFLICT`.
3. Set `ended_at = now()`.
4. Compute summary:

   * `answered` = count of persisted session question states where `latestSelectedChoiceId` is not null
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

**Behavior (exact):**

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

**Behavior (exact):**

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

#### 4.5.9 Server Action: `toggleBookmark(questionId)`

* **Name:** `toggleBookmark`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/bookmark-controller.ts`

**Input (Zod):**

```ts
export const ToggleBookmarkInputSchema = z.object({
  questionId: zUuid,
  idempotencyKey: zUuid.optional(),
}).strict();
```

**Output:**

```ts
export type ToggleBookmarkOutput = {
  bookmarked: boolean;
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if question not found or not published
* `RATE_LIMITED` if bookmark mutation limit is exceeded
* `INTERNAL_ERROR`

**Behavior (exact):**

1. Enforce per-user rate limit: max 60 bookmark mutations per 60s window.
2. Validate question exists and published.
3. If bookmark exists (user_id, question_id): delete it, return `bookmarked=false`.
4. Else insert bookmark with created_at now, return `bookmarked=true`.
5. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='bookmark:toggleBookmark'`) so retries replay the prior toggle result.

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

**Behavior (exact):**

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

**Behavior (exact):**

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

**Behavior (exact):**

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

**Behavior (exact):**

1. Load completed practice sessions (`ended_at IS NOT NULL`) for user, ordered by `ended_at DESC`.
2. For each session, compute stats from persisted `practice_session_question_states`:
   * `questionCount` = total questions in session
   * `answered` = count where `latestSelectedChoiceId` is not null
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

**Behavior (exact):**

1. Load the most recent in-progress session for user (`ended_at IS NULL`).
2. If none exists, return `null`.
3. Compute `answeredCount` from persisted `practice_session_question_states` where `latestSelectedChoiceId` is non-null.
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

**Behavior (exact):**

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

**Behavior (exact):**

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
export const GetPreviousAttemptInputSchema = z.object({
  questionId: z.string().min(1),
}).strict();
```

**Output:**

```ts
export type GetPreviousAttemptOutput = {
  attemptId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
  choiceExplanations: ChoiceExplanation[]; // same type as submitAnswer output
  answeredAt: string; // ISO 8601
} | null; // null when no previous attempt exists
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `INTERNAL_ERROR`

**Behavior (exact):**

1. Enforce entitlement (subscribed user).
2. Load the user's most recent visible attempt for the given question via `AttemptSingleQuestionReader.findLatestByUserAndQuestion`; active-exam attempts must not hide older visible attempts in this implicit path.
3. If no attempt exists: return `null` (caller falls back to attempt mode).
4. Load the question by `questionId` from published questions.
5. If question is missing (orphaned attempt): log warning and return `null`.
6. Build `choiceExplanations` using `buildShuffledChoiceViews(question, userId)` for consistent display labels.
7. Return previous attempt data including `correctChoiceId`, `explanationMd`, and `choiceExplanations`.

---
