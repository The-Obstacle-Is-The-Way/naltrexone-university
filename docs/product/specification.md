# Addiction Boards Question Bank SaaS — Technical Specification

> **Status, 2026-10-12 (DEBT-518).** This specification moved here from `docs/specs/master_spec.md` and was corrected in place against the code, section by section; nothing was removed. It states the product's decisions and the contracts the code keeps: it owns the product overview and the API narratives, and the topic documents under `docs/product/practice/` own the detailed practice interactions, so a behaviour change updates the topic contract, its tests and this summary together. Where it and the code disagree on a schema, a type or a limit, the code is right: correct this document in the same change. The vertical slices in §7 and the checklist in §12 record the original build order.
>
> **History.** On 2026-09-20 the DEBT-481 audit found stale schema, action, limit, content, CI and timing examples here and in four split copies; on 2026-09-22 it corrected six contradictions and turned the copies into navigation pages, which DEBT-518 then deleted.

## 1. System Overview

**Product description:**
A subscription-based web app that provides a high-quality multiple-choice question bank for Addiction Psychiatry and Addiction Medicine board exam prep. Users subscribe, complete questions in tutor/exam-style practice sessions, review missed questions, and bookmark difficult questions.

**Target users:**

* Addiction Psychiatry fellows
* Addiction Medicine fellows
* Physicians recertifying in Addiction Medicine / Addiction Psychiatry

**Core value proposition:**
Board-relevant questions with detailed explanations, fast practice workflows, and progress tracking focused on high-yield addiction content.

**Revenue model (exact tiers and prices):**

* **Pro Monthly:** **$29/month** (recurring subscription)
* **Pro Annual:** **$199/year** (recurring subscription)
* **Free trial:** a first checkout on either plan starts with 7 days free and needs no payment method; without one, the trial ends with no charge (`lib/pricing-data.ts`). Anyone who has had a subscription gets no trial (business rule R10).

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
| @clerk/nextjs     |                       | - auth() session         |
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
Browser -> pricing Server Action subscribeMonthlyAction / subscribeAnnualAction ->
controller createCheckoutSession -> Stripe Checkout -> redirect to /checkout/success (eager sync) ->
Stripe Webhook -> /api/stripe/webhook -> Neon DB subscription state -> app entitlement.
```

Next.js Route Handlers use the Web `Request`/`Response` APIs and live inside the `app` directory. ([Next.js][1])

---

## 3. Database Schema

### 3.1 Physical schema and migration authority

The executable [Drizzle schema](../../db/schema.ts) owns table, column,
constraint, enum and relation definitions. The [migration ledger](../../db/migrations/meta/_journal.json)
and its SQL files own the deployed evolution; the
[migration runbook](../architecture/environments.md#deploy-migration-contract)
describes applying that history. Do not recreate the database from a copied
schema block or use schema push to bypass migrations.

**Reconciled 2026-09-22:** the implementation then had 21 tables. The former
14-table copy omitted trial payment-method setup operations, renewal consent
records, renewal notice deliveries, Clerk events, deleted Clerk users, pending
Stripe cancellations and question feedback. **Rechecked 2026-10-11:** 29 tables;
the eight added since are question revisions, question withdrawals, question
holds, the four content-release tables (releases, release items, release
pointer, release activations) and operational alert drills. This dated census
is not a second schema to maintain; consult the linked source for the current
inventory.

The design keeps vendor identifiers in persistence rather than domain entities,
uses timezone-aware timestamps, and preserves user/question/choice relationships
through database constraints. Details such as normalized practice-question state
belong to the physical schema and the owning [practice contracts](./practice/README.md),
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
* AND `current_period_end > now` (the application server's clock, compared by the domain `isEntitled`, not by SQL `now()`)
* AND the subscription row corresponds to the **latest** known subscription for that user (enforced by the unique index `stripe_subscriptions_user_id_uq` on `stripe_subscriptions.user_id`: 1 row per user)

All other statuses are **not entitled** (Stripe: `canceled`, `unpaid`, `paused`, `incomplete`, `incomplete_expired`).

#### 4.2.1 Dunning Grace Policy

`pastDue` subscribers retain access while Stripe retries payment. Stripe manages the dunning lifecycle (Smart Retries, configurable retry schedule). When Stripe exhausts retries, it transitions the subscription to `canceled` or `unpaid`, at which point the existing entitlement logic locks the user out.

**UI requirement:** When a `pastDue` subscriber accesses the app, the layout MUST display a non-blocking banner: "Your payment failed — please update your billing information." with a link to the in-app billing page (`/app/billing`), whose manage-billing form opens the Stripe billing portal. The user MUST NOT be redirected away from app content.

### 4.3 Standard Server Action Result Type (Used by Every Server Action)

All controller server actions MUST return a discriminated union to avoid leaking stack traces to clients (the form actions under `app/` that finish with a redirect, such as `subscribeMonthlyAction`, return `void`):

```ts
// src/application/errors/application-errors.ts
export const ApplicationErrorCodes = [
  'UNAUTHENTICATED',
  'ALREADY_SUBSCRIBED',
  'UNSUBSCRIBED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'STRIPE_ERROR',
  'INVALID_WEBHOOK_SIGNATURE',
  'INVALID_WEBHOOK_PAYLOAD',
  'INTERNAL_ERROR',
] as const;
export type ApplicationErrorCode = (typeof ApplicationErrorCodes)[number];
export type ApplicationErrorDetails = Readonly<{
  reason?: ApplicationConflictReason; // e.g. 'practice_session_already_ended'
}>;

// src/adapters/controllers/action-result.ts
export type ActionErrorCode = ApplicationErrorCode;

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        fieldErrors?: Record<string, string[]>;
        details?: ApplicationErrorDetails;
      };
    };
```

### 4.4 Route Handlers (API Endpoints)

#### 4.4.1 `GET` or `POST /api/health`

* **Path:** `/app/api/health/route.ts` (logic in `/app/api/health/handler.ts`)
* **Method:** GET or POST (both run the same handler)
* **Auth:** public
* **Purpose:** health check for uptime monitoring; verifies DB connectivity

**Input:** none (no Zod schema; the request body and query string are ignored).

```ts
// app/api/health/handler.ts reads only the client IP, via
// getClientIp(req.headers), for rate limiting. No HealthInputSchema exists.
```

**Output (TypeScript):**

```ts
// Response JSON; the source declares no named type.
export type HealthResponse = {
  ok: true;
  db: true;
};
```

**Errors:**

* `429` if health endpoint rate limit is exceeded
* `503` if rate limiter is unavailable
* `500` if DB query fails
* Response body:

```ts
export type HealthErrorResponse = { ok: false; error: string };
// error: 'Too many requests' | 'Rate limiter unavailable' | 'Database connection failed'
```

**Behavior:**

* Applies fixed-window rate limiting by client IP (`health:${ip}`) before DB work.
* On rate limit exceeded, returns `429` with headers:
  * `Retry-After`
  * `X-RateLimit-Limit`
  * `X-RateLimit-Remaining`
* If rate limiter fails, returns `503` with `{ ok:false, error:'Rate limiter unavailable' }`.
* Runs `SELECT 1` via Drizzle
* Returns 200 with `{ ok:true, db:true }`

---

#### 4.4.2 `POST /api/stripe/webhook`

* **Path:** `/app/api/stripe/webhook/route.ts`
* **Method:** POST
* **Auth:** public (signature-protected)
* **Runtime:** `nodejs`, the default (the route exports no `runtime`; Stripe webhook verification uses Node crypto; do not run on edge)
* **Purpose:** sync Stripe → DB subscription state

**Input:** raw request body (`string`, read with `req.text()`) + header `stripe-signature`

**Output:**

```ts
export type StripeWebhookResponse = { received: true };
```

**Errors:**

* `400` if the `stripe-signature` header is missing, signature verification fails (`INVALID_WEBHOOK_SIGNATURE`) or the payload is invalid (`INVALID_WEBHOOK_PAYLOAD`)
* `429` if webhook endpoint rate limit is exceeded
* `503` if rate limiter is unavailable
* `500` if processing fails (database or Stripe API)

**Required Stripe verification:**

* Must use `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` (signature verification is mandatory). While a Stripe major-release migration overlaps two webhook endpoints, a delivery may verify against `STRIPE_WEBHOOK_SECRET_NEXT` instead.

**Idempotency:**

* `stripe_events.id` is the Stripe event id (primary key).
* Webhook handler must:

  1. Attempt to *claim* the event by inserting a `stripe_events` row with `{ id, type, processed_at: null, error: null }` using `ON CONFLICT DO NOTHING RETURNING id`.
  2. If not claimed, load the existing row:
     * If `processed_at` is not null AND `error` is null: return 200 immediately (already processed)
     * Otherwise, ensure only one request proceeds: inside the processing transaction the handler locks the `stripe_events` row with `SELECT ... FOR UPDATE` (claimed or not) and re-checks it before processing/retrying.
  3. Process event (all writes must be idempotent)
  4. On success, in the same transaction: set `processed_at` to the current time (application clock), `error = null`
  5. On failure: in a separate transaction after the rollback, set `error = <string>`, leave `processed_at` null

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
* **Runtime:** `nodejs`, the default (the route exports no `runtime`)
* **Purpose:** sync Clerk user events → DB user state

**Input:** raw request body + Svix signature headers (`svix-id`, `svix-timestamp`, `svix-signature`)

**Output:**

```ts
export type ClerkWebhookResponse = { received: true };
```

**Errors:**

* `400` if signature verification fails or the payload is invalid (`INVALID_WEBHOOK_PAYLOAD`)
* `429` if webhook endpoint rate limit is exceeded
* `503` if rate limiter is unavailable
* `500` if processing fails (database or Stripe customer deletion)

**Events handled:**

* `user.created` — No-op; users are created lazily via `upsertByClerkId` on first authenticated request (see `docs/architecture/integrations/clerk.md`)
* `user.updated` — Upsert the user's primary email into `users` by Clerk ID (skipped when the Clerk user has a `deleted_clerk_users` tombstone)
* `user.deleted` — Delete user and cascade (subscription, Stripe customer mapping, sessions, attempts, bookmarks, etc.; renewal consent records keep their row with `user_id` set null), record a `deleted_clerk_users` tombstone, then delete the Stripe customer (if any) after commit

#### 4.4.4 Other route handlers

These routes have no section of their own; their handlers are the contract.

* `GET`/`POST /api/cron/reconcile-stripe-subscriptions` and `GET`/`POST /api/cron/send-renewal-notices`: the two Vercel crons in `vercel.json`. Each requires `CRON_SECRET` as a bearer token and returns 401 while it is unset (§10).
* `POST /api/webhooks/resend`: Resend's delivery and bounce reports for the emails the app sends, verified by signature (`app/api/webhooks/resend/`).

---

### 4.5 Server Actions (Required)

All server actions are implemented as controllers under:
`src/adapters/controllers/*-controller.ts`

Controllers are `server-only` modules that server code and tests call with injected dependencies; a controller is never itself a server action. The actions a browser calls are thin one-parameter `'use server'` wrappers (BUG-324): `src/adapters/controllers/*-actions.ts` for the practice, question, question-view, question-feedback, bookmark and tag actions, and form actions beside their pages for billing (`app/pricing/subscribe-actions.ts`, `app/pricing/manage-billing-actions.ts`, `app/(app)/app/billing/manage-billing-actions.ts`, `app/(app)/app/trial-payment-method-actions.ts`).

> **Note:** Per ADR-012 (amended for BUG-324), server actions are Controllers in Clean Architecture terms and their logic lives in the adapters layer, not in the Next.js app directory.

All inputs MUST be validated with Zod before any DB/Stripe calls.

#### Shared Zod helpers

```ts
// src/adapters/shared/zod-schemas.ts
import { z } from 'zod';
import {
  AllDifficulties,
  AllQuestionProgressStatuses,
} from '@/src/domain/value-objects';

export const zUuid = z.guid(); // UUID-shaped (8-4-4-4-12 hex); unlike z.uuid(), no RFC version check

export const zDifficulty = z.enum(AllDifficulties); // 'easy' | 'medium' | 'hard'

export const zQuestionProgressStatus = z.enum(AllQuestionProgressStatuses); // 'unanswered' | 'incorrect' | 'bookmarked'

// A consent disclosure's version: its adoption date, with a revision suffix
// when a second text is adopted the same day (DEBT-414 F03).
export const zDisclosureVersion = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/);

// Defined beside the controllers that use them:
// src/adapters/controllers/practice-schemas.ts
export const zPracticeMode = z.enum(['tutor', 'exam']);
// src/adapters/controllers/billing-controller.ts (module-local)
const zSubscriptionPlan = z.enum(['monthly', 'annual']);

// There is no shared pagination or non-empty-string helper. Paginated actions
// declare their bounds inline from src/adapters/shared/validation-limits.ts:
//   limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),   // 100
//   offset: z.number().int().min(0).max(MAX_PAGINATION_OFFSET), // 10_000
```

#### 4.5.0 Cross-Cutting Controller Policies (Required)

**Idempotency.** The current action names and error dispositions are defined in
[idempotency-error-policy.ts](../../src/adapters/controllers/shared/idempotency-error-policy.ts);
the practice-session lifecycle actions (`practice:endPracticeSession`,
`practice:discardPracticeSession`, `practice:finalizeExamAnswers`) are named in
`practice-controller.ts` and take their dispositions from
[practice-session-idempotency-policy.ts](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts).
Controllers use [executeIdempotent](../../src/adapters/controllers/shared/execute-idempotent.ts)
and the owning use case's transaction boundary. A supported request key scopes
replay to its user/action; it does not make every failure cacheable or every
mutation an idempotent action. A keyed request whose key is still claimed by a
concurrent request waits, then fails with `CONFLICT` (reason
`ApplicationConflictReasons.ConcurrentRequestInProgress`). Follow those executable contracts rather than
the former partial action list.

**Rate limiting.** SPEC-017's current-state inventory
holds the audited policy-to-operation table as recounted on 2026-09-20 (14 policies
covering 18 limited operations); it predates the Clerk Backend API call limits, the
checkout-success limit and the Resend webhook limit. [rate-limits.ts](../../src/adapters/shared/rate-limits.ts)
owns the numeric configuration, and the linked controller/route callers own
enforcement and response behavior. On 2026-10-11 it holds 19 rate-limit policies
and two alert thresholds, covering 21 limited operations (SPEC-017's 18, plus the
Clerk Backend API call gate, checkout-success visits and Resend webhooks), distinct
from 29 exported controller actions. Shared helpers mean operation count is not
invocation-site count.

The bookmark mutation uses `bookmark:setBookmark` and an explicit desired state,
not a toggle replay. Successful cached replays do not execute a fresh
rate-limited mutation. Route authentication/signature validation and entitlement
remain separate protections; a rate limit is not an authorization mechanism.

---

#### 4.5.1 Server Action: `createCheckoutSession(plan)`

* **Name:** `createCheckoutSession`
* **Type:** Controller action (`server-only`). The browser reaches it only through the pricing page's form actions (`app/pricing/subscribe-actions.ts`, through `subscribe-to-plan.ts`)
* **Auth:** authenticated
* **File:** `src/adapters/controllers/billing-controller.ts`

**Input (Zod):**

```ts
const CreateCheckoutSessionInputSchema = z.object({
  plan: zSubscriptionPlan,
  idempotencyKey: zUuid.optional(),
  // The offer the learner was shown: whether it included the free trial, and
  // the version of the renewal disclosure displayed with it.
  expectedOffer: z.object({
    hasTrial: z.boolean(),
    disclosureVersion: zDisclosureVersion,
  }).strict(),
  // DEBT-414 F03: the separate, affirmative renewal opt-in.
  renewalOptIn: z.literal(true),
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
* `ALREADY_SUBSCRIBED` if the user's recorded subscription, or Stripe, already has a blocking subscription for the customer
* `VALIDATION_ERROR` if input invalid (including a missing renewal opt-in), or if the displayed offer (`expectedOffer`) no longer matches the current one
* `CONFLICT` if the signed-in account changed during the request
* `RATE_LIMITED` if checkout session creation limit is exceeded
* `STRIPE_ERROR` on Stripe API failure
* `INTERNAL_ERROR` on DB failure

**Behavior:**

1. Ensure local `users` row exists for Clerk user (the auth gateway provisions it by `clerk_user_id` when missing).
2. Enforce per-user rate limit: max 10 checkout session attempts per 60s window. Then re-read the user's current email from Clerk (DEBT-503); if the signed-in account changed during the request, return `CONFLICT`.
3. Check the user's recorded subscription and the displayed offer:

   * If the user's `stripe_subscriptions` row is in a blocking status (`active`, `inTrial`, `pastDue`, `unpaid`, `paymentProcessing`, `paused`) and `current_period_end > now()`, return `ALREADY_SUBSCRIBED`.
   * The offer includes the 7-day free trial only when the user has no subscription row. If `expectedOffer.hasTrial` or `expectedOffer.disclosureVersion` differs from the current offer and its renewal terms, return `VALIDATION_ERROR`.
4. Ensure `stripe_customers` exists:

   * If none: reuse the Stripe Customer whose `metadata.user_id` is the user (more than one => `STRIPE_ERROR`), else create a Stripe Customer with the current email and metadata `{ user_id, clerk_user_id }`.
   * Insert `stripe_customers` row; if a concurrent request inserted one first, keep that customer.
5. Block duplicate subscriptions using Stripe as source-of-truth:

   * Query `stripe.subscriptions.list({ customer, status: 'all', limit: 10 })`.
   * If any subscription status is one of `{ active, trialing, past_due, unpaid, incomplete, paused }`, return `ALREADY_SUBSCRIBED`, first recording locally the subscription Stripe holds (BUG-321; if that fails, raise an operational alert).
   * If the customer has an open Checkout Session with the same price, variant and renewal-consent metadata, return its URL; expire an open session that does not match before creating a new one.
6. Determine the Stripe Price ID from the selected **domain plan**:

   * If `plan === 'monthly'`: use `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`
   * If `plan === 'annual'`: use `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`

   **Important:** The controller MUST NOT accept arbitrary client-supplied Stripe price IDs.
7. Create Stripe Checkout Session (subscription):

   * `mode: 'subscription'`
   * `customer: <stripe_customer_id>`
   * `line_items: [{ price: <derivedPriceId>, quantity: 1 }]`
   * `allow_promotion_codes: false`
   * `billing_address_collection: 'auto'`
   * `consent_collection: { terms_of_service: 'required' }`
   * `success_url: ${NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
   * `cancel_url: ${NEXT_PUBLIC_APP_URL}/pricing?checkout=cancel`
   * `client_reference_id: <users.id>` (internal uuid)
   * `metadata`: the renewal-consent evidence, `checkout_variant` and the `renewal_*` fields (user, plan, amount, currency, frequency, disclosure version and SHA-256 of its text, terms version and hash, cancellation method; DEBT-414 F15)
   * `subscription_data.metadata.user_id = <users.id>`
   * trial offer only: `payment_method_collection: 'if_required'`, `subscription_data.trial_period_days: 7`, `subscription_data.trial_settings.end_behavior.missing_payment_method: 'cancel'`
8. Return `{ url: session.url }` (must be non-null; if null => STRIPE_ERROR)
9. If `idempotencyKey` is provided, wrap steps 2-8 with application-level idempotency (`action='billing:createCheckoutSession'`), keyed by the request key together with the plan, the offer variant and the disclosure version, so retries replay cached results instead of re-executing the flow. No error outcome is cached: a retry after a failure runs again.

---

#### 4.5.2 Server Action: `createPortalSession()`

* **Name:** `createPortalSession`
* **Type:** Controller action (`server-only`). The browser reaches it only through the billing pages' form actions (`manage-billing-actions.ts` in `app/pricing/` and `app/(app)/app/billing/`, through `manage-billing-request.ts`)
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

1. Ensure user row exists.
2. Enforce per-user rate limit: max 20 billing portal attempts per 60s window.
3. Load `stripe_customer_id` from `stripe_customers`.
4. Create Stripe Billing Portal Session:

   * `customer: stripe_customer_id`
   * `return_url: ${NEXT_PUBLIC_APP_URL}/app/billing`
   * `configuration`: the app's portal configuration for the user's profile, `trial` when the user has no subscription row or is in trial and `paid` otherwise, never the Dashboard default (DEBT-414 F05)
5. Return portal URL.
6. If `idempotencyKey` is provided, wrap steps 2-5 with application-level idempotency (`action='billing:createPortalSession'`) so explicit retries replay the prior result instead of re-executing the flow. No error outcome is cached, because a billing key lasts as long as its page and a cached refusal would outlive the state it came from.
7. If `idempotencyKey` is omitted, create a fresh portal session on each request. Both manage-billing forms (`/app/billing` and the pricing page) send a key fixed when the form renders (`components/idempotency-key-field.tsx`, BUG-232), so resubmitting the same rendered form replays its portal URL and a new render gets a new key.

---

#### 4.5.3 Server Action: `getNextQuestion(sessionId?, filters?)`

* **Name:** `getNextQuestion`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/question-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/question-controller.ts`

**Input (Zod):** (mutually exclusive: either session mode OR ad-hoc filters)

```ts
const QuestionFiltersSchema = z.object({
  tagSlugs: z.array(z.string().min(1)).max(50).default([]),
  difficulties: z.array(zDifficulty).max(3).default([]),
  statuses: z.array(zQuestionProgressStatus).max(3).default([]),
}).strict();

const GetNextQuestionInputSchema = z.union([
  z.object({
    sessionId: zUuid,
    questionId: zUuid.optional(),
    fromIndex: z.number().int().min(0).optional(),
    filters: z.undefined().optional(),
  }).strict(),
  z.object({
    sessionId: z.undefined().optional(),
    questionId: z.undefined().optional(),
    fromIndex: z.undefined().optional(),
    filters: QuestionFiltersSchema,
  }).strict(),
]);
```

**Output:**

```ts
export type PublicChoice = {
  id: string;
  label: string; // display label after the per-user shuffle
  textMd: string;
  sortOrder: number;
};

export type PreviousSubmission = {
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: ChoiceExplanation[]; // as in SubmitAnswerOutput
};

export type NextQuestion = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  choices: PublicChoice[];
  superseded: boolean; // a newer revision replaced the one shown
  answerKeyChanged: boolean; // the current revision keys another answer (ADR-022 Decision 4)
  session: null | {
    sessionId: string;
    mode: 'tutor' | 'exam';
    index: number; // 0-based index within session
    total: number;
    deadlineAt: string | null; // ISO exam deadline; null in tutor mode
    remainingMs: number | null; // server-measured time left; the countdown runs from it (BUG-347)
    isMarkedForReview?: boolean;
    latestSelectedChoiceId?: string | null;
    latestIsCorrect?: boolean | null; // null while an exam is active
    draftSelectedChoiceId?: string | null; // exam only
    draftCumulativeMs?: number; // exam only
    previousSubmission?: PreviousSubmission; // answered tutor items only
  };
};

// A session item whose question became unavailable after the session began:
// its state and its place in the session, with none of its content.
export type UnavailableSessionQuestion = {
  unavailable: true;
  availability: 'withdrawn' | 'under_review' | 'retired';
  countsIfEndedNow: boolean; // ADR-022 Decision 5, as amended
  questionId: string;
  session: {
    sessionId: string;
    mode: 'tutor' | 'exam';
    index: number;
    total: number;
    deadlineAt: string | null;
    remainingMs: number | null;
    isMarkedForReview: boolean;
  };
};

export type GetNextQuestionOutput =
  | NextQuestion
  | UnavailableSessionQuestion
  | null; // null means no remaining questions, or an expired exam was just finalized
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if sessionId provided but session not found or not owned by user, or `questionId` is not in the session
* `CONFLICT` if the session has already ended
* `INTERNAL_ERROR`

**Behavior:**

##### Case A: sessionId provided

1. Load practice session by `id` AND `user_id`. If it has ended, return `CONFLICT` (`practice_session_already_ended`); if it is an exam whose time has run out, finalize it (as `finalizeExamAnswers` does) and return `null`.
2. Parse `params_json` as immutable `PracticeSessionParams` metadata and load mutable state from `practice_session_question_states` ordered by `position`.
3. Determine target question:

   * If `questionId` is provided, it must belong to `params_json.questionIds` (else `NOT_FOUND`).
   * Else pick the first question in `params_json.questionIds` after position `fromIndex` (from the start when omitted, wrapping round) whose persisted answer marker is empty: for active exam sessions use `draftSelectedChoiceId ?? latestSelectedChoiceId`, and for tutor sessions use `latestSelectedChoiceId`.
4. If none found: return `null`.
5. Fetch question + choices by target questionId:

   * Use the revision the session item was bound to when the session started (ADR-021); `superseded` says a newer revision exists.
   * If the question is no longer available (`withdrawn`, `under_review` or `retired`), return an `UnavailableSessionQuestion` rather than its content (ADR-022 Decision 5).
6. Return `NextQuestion` with `session` populated, including `isMarkedForReview` and the answer state from persisted session state, `deadlineAt` for exams, the draft selection and time for exams, and `previousSubmission` for a tutor item already answered.
   **Important:** `choices` MUST NOT carry `isCorrect`; correctness appears only in `previousSubmission`, for an answered tutor item.

##### Case B: filters provided (no session)

1. Build candidate published questions filtered by tags, difficulties (the current revision's) and progress statuses (any of `unanswered`, `incorrect`, `bookmarked`, for this user).
2. Choose the next question deterministically:

   * Order the candidates by a seeded shuffle, seed = `createSeed(userId, <start of the current UTC day>)`, so the order holds for the day.
   * Prefer the first question in that order the user has never attempted (no attempts row exists for that user/question).
   * If all attempted: choose the question with the **oldest** last attempt timestamp.
3. Return question + choices; `session: null`.

---

#### 4.5.4 Server Action: `submitAnswer(questionId, choiceId, sessionId?)`

* **Name:** `submitAnswer`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/question-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/question-controller.ts`

**Input (Zod):**

```ts
const SubmitAnswerInputSchema = z.object({
  questionId: zUuid,
  choiceId: zUuid,
  sessionId: zUuid.optional(),
  retryOfAttemptId: zUuid.optional(),
  retryOrigin: z
    .enum(['history', 'dashboard', 'bookmarks', 'session_review', 'other'])
    .optional(),
  retrySessionId: zUuid.optional(),
  idempotencyKey: zUuid.optional(),
  timeSpentSeconds: z.number().int().min(0).max(86_400).optional(),
}).strict().superRefine((input, ctx) => {
  // A retry (retryOrigin set) must not carry sessionId.
  // retrySessionId is allowed, and required, only when retryOrigin is 'session_review'.
  // retryOfAttemptId requires retryOrigin, and every retryOrigin except
  // 'session_review' requires retryOfAttemptId.
});
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
* `NOT_FOUND` if question or choice not found / mismatch, or a session, retry session or retry parent attempt is missing or does not hold the question
* `CONFLICT` if a session-backed submit targets an already-ended session or conflicts with an existing session answer, or a `session_review` retry names a session that has not ended
* `RATE_LIMITED` if answer submit limit is exceeded
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce per-user rate limit: max 120 submissions per 60s window.
2. Load the question, for a session item as the revision it was bound to (ADR-021) and otherwise as its current revision, and validate it exists and `status='published'`.
3. Validate the choice exists and belongs to that revision of the question, and validate any retry provenance:

   * An inconsistent `retryOfAttemptId` / `retryOrigin` / `retrySessionId` combination, or a retry with `sessionId`, is a `VALIDATION_ERROR`.
   * A `retrySessionId` must name the user's own session that holds the question (else `NOT_FOUND`) and has ended (else `CONFLICT`).
   * A `retryOfAttemptId` must name the user's own attempt at the same question (else `NOT_FOUND`).
4. If `sessionId` is provided:
   * Load the session for the current user.
   * Reject missing sessions with `NOT_FOUND`.
   * Reject questions outside the session with `NOT_FOUND`.
   * Reject active exam sessions with `VALIDATION_ERROR` (`Per-question submit is not available in exam mode`). Active exam answers use `saveExamDraftAnswer` while in progress and `finalizeExamAnswers` on `Submit exam`.
   * Reject ended sessions with `CONFLICT`.
5. Determine correct choice for question (the loaded revision's choice with `is_correct=true`) and grade the answer.
6. Insert `attempts` row:

   * `user_id`
   * `question_id`
   * `question_revision_id` (the revision graded)
   * `practice_session_id = sessionId ?? null`
   * `selected_choice_id = choiceId`
   * `is_correct = (choiceId === correctChoiceId)`
   * `time_spent_seconds` from validated input (defaults to 0 when omitted)
   * `retry_of_attempt_id`, `retry_origin`, `retry_session_id` from validated input (null when omitted)
   * A second answer to the same question in one session fails the `attempts_session_question_uq` index and returns `CONFLICT`.
7. If `sessionId` is provided for an active tutor session, persist latest per-question session state in the same transaction as the attempt:

   * `latestSelectedChoiceId = choiceId`
   * `latestIsCorrect = isCorrect`
   * `latestAnsweredAt = attempts.answered_at`
8. Return grading result, `referenceMd`, and explanations for displayed shuffled choices with stable display labels (`A`..`E`). Active exam sessions are not a valid `submitAnswer` caller, so the active-exam redaction path is expressed as rejection rather than hidden feedback.
9. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='question:submitAnswer'`) to prevent duplicate attempt writes on retries. Unlike the other actions, an indeterminate failure (one not known to have rolled back) is cached too, as a fence against a duplicate attempt.

---

#### 4.5.5 Server Action: `startPracticeSession(params)`

* **Name:** `startPracticeSession`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/practice-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`

**Input (Zod):**

```ts
// src/adapters/controllers/practice-schemas.ts; the filter fields are the
// PracticeFiltersSchema that countAvailableQuestions also uses.
export const StartPracticeSessionInputSchema = z.object({
  mode: zPracticeMode,
  count: z.number().int().min(1).max(200),
  idempotencyKey: zUuid.optional(),
  tagSlugs: z.array(z.string().min(1).max(255)).max(50).default([]),
  difficulties: z.array(zDifficulty).max(3).default([]),
  statuses: z.array(zQuestionProgressStatus).max(3).default([]),
}).strict();
```

**Output:**

```ts
export type StartPracticeSessionOutput = {
  sessionId: string;
  requestedCount: number; // the count asked for
  actualCount: number; // the questions selected, at most requestedCount
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if filters yield zero published questions
* `CONFLICT` if the user already has an incomplete practice session
* `RATE_LIMITED` if session start limit is exceeded
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce per-user rate limit: max 20 session starts per 60s window. Then, if the user already has an incomplete session, return `CONFLICT` (`incomplete_practice_session_exists`); the one-incomplete-session-per-user unique index refuses a concurrent start the same way.
2. Compute candidate question IDs from DB using filters:

   * only `questions.status='published'`
   * if `tagSlugs` non-empty: question must have at least one matching tag slug
   * if `difficulties` non-empty: the current revision's difficulty in list
   * if `statuses` non-empty: the question matches any of them for this user (`unanswered`: never attempted; `incorrect`: latest answer wrong, or graded on an answer key corrected since; `bookmarked`)
3. Shuffle deterministically in JavaScript using a seeded RNG:

   * seed = `createSeed(userId, now.getTime())` with the use case's clock (non-crypto rolling hash -> uint32; see `src/domain/services/shuffle.ts`)
   * shuffle algorithm = Fisher-Yates with seeded RNG
4. Take first `count` IDs (or fewer if fewer candidates exist).

   * If zero: return `NOT_FOUND`
5. Insert `practice_sessions` row, in one transaction with its state rows, with:

   * `user_id`, `mode`
   * `params_json = { count: questionIds.length, tagSlugs, difficulties, questionIds }`; persisted `count` is the actual selected session size, which may be smaller than the requested count when filters return fewer candidates. The `statuses` filter is not persisted.
   * one `practice_session_question_states` row per selected question, in `questionIds` order, bound to the question's current revision (ADR-021):
     * `{ practiceSessionId, questionId, questionRevisionId:<current revision>, position:<0-based index>, markedForReview:false, latestSelectedChoiceId:null, latestIsCorrect:null, latestAnsweredAt:null, draftSelectedChoiceId:null, draftSavedAt:null, draftCumulativeMs:0 }`
   * `started_at = now()`
6. Return `{ sessionId, requestedCount, actualCount }`.
7. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='practice:startPracticeSession'`) so retries replay the previously created session id.

---

#### 4.5.6 Server Action: `endPracticeSession(sessionId)`

* **Name:** `endPracticeSession`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/practice-actions.ts`
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
  mode: 'tutor' | 'exam';
  questionCount: number;
  endedAt: string; // ISO
  totals: {
    answered: number; // every answered item (activity)
    scored: number; // items that count (ADR-022, as amended)
    correct: number; // scored items answered correctly
    accuracy: number; // 0..1, correct / scored
    durationSeconds: number; // endedAt - startedAt (rounded down)
  };
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR` if input invalid, or the session is an active exam
* `NOT_FOUND` if session not found or not owned by user
* `CONFLICT` if session already ended
* `RATE_LIMITED` if the session mutation limit is exceeded
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce per-user rate limit: max 60 per 60s window (`practice:endPracticeSession`). Load session by id and user_id.
2. If `ended_at` is not null: return `CONFLICT`. If the session is an exam: return `VALIDATION_ERROR`; an exam ends through `finalizeExamAnswers` or `discardPracticeSession`, not this action.
3. Set `ended_at = now()` and, in the same statement, record each item's `fair_chance_at_end` (ADR-022 Amendment, DEBT-494): its question is published now, or, in tutor mode, the learner already answered it.
4. Compute summary:

   * `answered` = count of persisted session question states where `latestSelectedChoiceId` is not null; finalized omitted states have `latestAnsweredAt` for attempt timing but are not counted as answered because no choice was selected
   * `scored` = count of the session's items that count, answered or not (ADR-022 Decision 3, as amended by DEBT-494): the item's recorded `fair_chance_at_end` is not false, and its question's content is not now in doubt (withdrawn or under review, or, for an answered item, its graded revision's answer key since corrected, ADR-022 Decision 4); an item whose question cannot be found is in doubt
   * `correct` = count of scored items with a selected choice where `latestIsCorrect === true`
   * `accuracy` = correct / scored (0 if scored = 0); the summary and the post-exam header ("X of scored correct") show "—" when nothing is scored and say how many questions aren't scored
   * duration = floor((ended_at - started_at)/1000)
5. Return summary. `finalizeExamAnswers` and `getPracticeSessionSummary` return the same shape; the summary read scores the items as the bank stands at the read.
6. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='practice:endPracticeSession'`) so duplicate finalize requests replay the cached summary. Every cached summary carries `totals.scored` (DEBT-493). Failures are not cached: a retry with the same key runs again.

> **SPEC-020 Note:** The UI MUST call `getPracticeSessionReview` after `endPracticeSession` to display per-question breakdown on the summary screen. See SPEC-020 Phase 2 (DEBT-123). No type change to `EndPracticeSessionOutput` — the review data comes from the existing review action (SRP).

---

#### 4.5.7 Server Action: `getUserStats()`

* **Name:** `getUserStats`
* **Type:** Controller action (`server-only`), called only by the dashboard page; no browser wrapper exists
* **Auth:** subscribed
* **File:** `src/adapters/controllers/stats-controller.ts`

**Input (Zod):**

```ts
const GetUserStatsInputSchema = z.object({}).strict();
```

**Output:**

```ts
export type UserStatsOutput = {
  totalAnswered: number;              // every attempt (activity)
  accuracyOverall: number;            // 0..1, correct / scored
  scoredOverall: number;              // attempts that count (ADR-022 as amended)
  unscoredQuestionsOverall: number;   // questions whose attempts accuracy leaves out
  answeredLast7Days: number;          // every attempt in the window (activity)
  accuracyLast7Days: number;          // 0..1, correct / scored in the window
  scoredLast7Days: number;
  unscoredQuestionsLast7Days: number;
  currentStreakDays: number;   // consecutive UTC days with >=1 attempt, ending today
  recentActivity: Array<
    | {
        isAvailable: true;
        availability: QuestionAvailability;  // ADR-022 Decision 1
        attemptId: string;
        answeredAt: string;        // ISO
        questionId: string;
        sessionId: string | null;
        sessionMode: 'tutor' | 'exam' | null;
        slug: string;
        stemMd: string;
        difficulty: 'easy' | 'medium' | 'hard';
        isCorrect: boolean;
        answerKeyChanged: boolean; // graded on a key corrected since (ADR-022 Decision 4): "Not scored"
      }
    | {
        isAvailable: false;
        availability: UnavailableQuestionAvailability | null;  // label only (ADR-022 Decision 2); null when missing
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
* `VALIDATION_ERROR` (input other than `{}`)
* `INTERNAL_ERROR`

**Behavior:**

* `totalAnswered` = count attempts for user; total answered, answered in seven days and the streak count every attempt: they are activity, not scores
* `scoredOverall` = count of attempts that count (ADR-022 Decision 3, as amended by DEBT-494): the learner had a fair chance at it (an attempt in a session reads its item's `fair_chance_at_end`; null, and an attempt outside a session, is a fair chance) and its question's content is not now in doubt (withdrawn or under review, or, for an answered attempt, its graded revision's answer key since corrected, ADR-022 Decision 4). A retired question keeps counting. `unscoredQuestionsOverall` = count of distinct questions with an attempt left out
* `accuracyOverall` = correct / scored (0 if scored = 0); the dashboard shows "—" when nothing is scored and says how many questions aren't scored
* last 7 days window uses `answered_at >= now - 7 days`, with `now` read from the application clock; the seven-day fields apply the same rules to the attempts in the window
* streak is computed in UTC from attempts in last 60 days:

  * create set of `YYYY-MM-DD` dates in UTC where attempts exist
  * starting from today UTC, count backward consecutive dates in set
* recentActivity = 20 most recent attempts ordered by answered_at desc (ties by attempt id), each joined to the revision it was graded against (ADR-021)
* available rows include `stemMd` and `difficulty` for user-facing display, the question's `availability`, and `answerKeyChanged` for an answered attempt graded on a key corrected since (the row reads "Not scored")
* an answered attempt on a question no longer available stays `isAvailable:true` with its `availability`; unavailable rows (`isAvailable:false`, label only) are returned for graceful degradation when the attempt answered nothing (omitted) on a question no longer available, or the question is missing (`availability: null`) (ADR-022 Decisions 1 and 2)
* recentActivity items include `sessionId` and `sessionMode` from LEFT JOIN to `practice_sessions` (null for ad-hoc attempts). See SPEC-020 Phase 3.

---

#### 4.5.8 Server Action: `getAttemptedQuestions(limit, offset, result?, source?)`

* **Name:** `getAttemptedQuestions`
* **Type:** Controller action (`server-only`), called only by the History page; no browser wrapper exists
* **Auth:** subscribed
* **File:** `src/adapters/controllers/review-controller.ts`

> **Note:** This action was originally `getMissedQuestions` (fixed-filter, incorrect-only). It was generalized to `getAttemptedQuestions` with optional `result` and `source` filters. The History > Questions tab uses this action with filters for correct/incorrect/all, tutor/exam/adhoc source, difficulty and tag, and a sort.

**Input (Zod):**

```ts
const GetAttemptedQuestionsInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
  offset: z.number().int().min(0).max(MAX_PAGINATION_OFFSET),
  result: z.enum(['correct', 'incorrect']).optional(),
  source: z.enum(['tutor', 'exam', 'adhoc']).optional(),
  difficulty: zDifficulty.optional(),
  tagSlug: z.string().min(1).optional(),
  sort: z.enum(['recent', 'incorrect-first', 'correct-first', 'difficulty']).optional(),
}).strict();
```

**Output:**

```ts
export type AttemptedQuestionRow =
  | {
      isAvailable: true;
      availability: QuestionAvailability; // ADR-022 Decision 1
      questionId: string;
      isCorrect: boolean;
      answerKeyChanged: boolean; // latest answer graded on a key corrected since (ADR-022 Decision 4); false when omitted
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
      availability: UnavailableQuestionAvailability | null; // label only (ADR-022 Decision 2); null when missing
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
* If `result` filter is provided (`'correct'` or `'incorrect'`), only include questions where the most recent attempt matches. A latest result no score counts (its question's content in doubt, or graded on a key corrected since) is under neither (ADR-022 Amendment 2026-10-05, DEBT-498).
* If `source` filter is provided (`'tutor'`, `'exam'`, or `'adhoc'`), only include questions where the most recent attempt has the matching session context (`adhoc` = no session).
* If `difficulty` or `tagSlug` is provided, match the difficulty of the revision the most recent attempt answered and the question's tags, whatever the question's state now, so a question no longer available keeps its place under a filter (DEBT-493 increment 5). `sort: 'difficulty'` orders by that difficulty, hardest first, ties by recency.
* A row the learner answered shows the revision answered, with the question's `availability` (ADR-022 Decision 1) and `answerKeyChanged` (Decision 4; the row reads "Not scored"). A row the learner never answered on a question no longer available returns `isAvailable:false` with the state for its label and no content (Decision 2).
* Include `sessionId` and `sessionMode` for each row from the attempt/session context (`null` for ad-hoc attempts).
* Order by `sort`: most recent attempt first by default (`recent`); `incorrect-first` and `correct-first` put that latest result first, then most recent, and place a result no score counts after every graded one; `difficulty` as above.
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
* **Type:** Controller action (`server-only`), called only by the Bookmarks page; no browser wrapper exists
* **Auth:** subscribed
* **File:** `src/adapters/controllers/bookmark-controller.ts`

**Input (Zod):**

```ts
const GetBookmarksInputSchema = z.object({}).strict();
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
      availability: UnavailableQuestionAvailability | null; // label only (ADR-022 Decision 2); null when missing
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
* `VALIDATION_ERROR` (input other than `{}`)
* `INTERNAL_ERROR`

**Behavior:**

* Select bookmarks for user ordered by `created_at DESC`.
* Resolve question metadata from published questions when available, from the question's current revision (a bookmark binds no revision, ADR-021).
* Available rows return `isAvailable:true` with `slug`, `stemMd`, and `difficulty`.
* Unavailable rows return `isAvailable:false` with the question's `availability` (withdrawn, under review or retired) for its label, read by id since a bookmark binds no revision, or `null` when the question no longer exists. They show no content (ADR-022 Decisions 1 and 2).
* Return list preserving bookmark order.

---

#### 4.5.11 Server Action: `getPracticeSessionReview(sessionId)`

* **Name:** `getPracticeSessionReview`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/practice-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`

**Input (Zod):**

```ts
// src/adapters/controllers/practice-schemas.ts
export const GetPracticeSessionReviewInputSchema = z.object({
  sessionId: zUuid,
}).strict();
```

**Output:**

```ts
export type PracticeSessionReviewRow =
  | {
      isAvailable: true;
      availability: QuestionAvailability; // ADR-022 Decision 1
      questionId: string;
      slug: string;
      stemMd: string;
      difficulty: 'easy' | 'medium' | 'hard';
      order: number; // 1-based
      isAnswered: boolean;
      isCorrect: boolean | null;
      isOmitted: boolean;
      markedForReview: boolean;
      answerKeyChanged: boolean; // answer (or exam draft) graded on a key corrected since (ADR-022 Decision 4): "Not scored"
    }
  | {
      isAvailable: false;
      availability: UnavailableQuestionAvailability | null; // label only; null when missing
      questionId: string;
      order: number; // 1-based
      isAnswered: boolean;
      isCorrect: boolean | null;
      isOmitted: boolean;
      markedForReview: boolean;
      answerKeyChanged: boolean; // as above; false when the question is missing
    };

export type GetPracticeSessionReviewOutput = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  totalCount: number;
  answeredCount: number;
  scoredUnansweredCount: number; // unanswered items that would count if the session ended now (ADR-022 Decision 5)
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
2. Build ordered review rows from persisted `practice_session_question_states`. `isAnswered` counts a saved exam draft while the exam is active; `isCorrect` is `null` while correctness is hidden (an exam not yet ended); `isOmitted` marks an ended exam item submitted with no choice.
3. Join each item to the question revision it is bound to (ADR-021), whatever the question's status now, for stem/difficulty. A question no longer available shows its content only where the learner answered it and the session has ended; otherwise the row is `isAvailable:false` with its `availability` label, or `null` when the question is missing (ADR-021 §3, ADR-022 Decisions 1 and 2).
4. Return aggregate counts (`totalCount`, `answeredCount`, `scoredUnansweredCount`, `markedCount`) and ordered rows.

---

#### 4.5.12 Server Action: `setPracticeSessionQuestionMark(sessionId, questionId, markedForReview)`

* **Name:** `setPracticeSessionQuestionMark`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/practice-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`

**Input (Zod):**

```ts
// src/adapters/controllers/practice-schemas.ts
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
* `CONFLICT` if session mode is not exam or session already ended (also for a concurrent state change, or a request with the same `idempotencyKey` still in progress)
* `RATE_LIMITED` if the practice-session mutation rate limit is exceeded
* `INTERNAL_ERROR`

**Behavior:**

1. Load session by id and user_id.
2. Reject if session is not in exam mode or has already ended.
3. Persist `markedForReview` for the target session question state.
4. Return updated mark state for the question.
5. If `idempotencyKey` is provided, wrap execution with application-level idempotency (`action='practice:setPracticeSessionQuestionMark'`). Each fresh (not replayed) execution first passes the practice-session mutation rate limit (`PRACTICE_SESSION_MUTATION_RATE_LIMIT`).

---

#### 4.5.13 Server Action: `getSessionHistory(limit, offset, mode?)`

* **Name:** `getSessionHistory`
* **Type:** Controller action (`server-only`), called only by the dashboard and History pages; no browser wrapper exists
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts` (schema in `practice-schemas.ts`)
* **Added by:** SPEC-020 Phase 4

**Input (Zod):**

```ts
export const GetSessionHistoryInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT), // 100
    offset: z.number().int().min(0).max(MAX_PAGINATION_OFFSET), // 10_000
    mode: zPracticeMode.optional(),
  })
  .strict();
```

**Output:**

```ts
export type SessionHistoryRow = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  questionCount: number;
  firstQuestionSlug: string | null; // first item's question, while published
  answered: number;
  scored: number;         // items that count (ADR-022 as amended)
  correct: number;        // scored items answered correctly
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

1. Load completed practice sessions (`ended_at IS NOT NULL`) for user, only those of `mode` when it is given, ordered by `ended_at DESC`, then `started_at DESC`.
2. For each session, compute stats from persisted `practice_session_question_states`:
   * `questionCount` = total questions in session
   * `firstQuestionSlug` = slug of the question at position 0 while it is published, else `null`; the History row links to the session's review, opening at that question
   * `answered` = count where `latestSelectedChoiceId` is not null; finalized omitted states have `latestAnsweredAt` for attempt timing but are not counted as answered because no choice was selected
   * `scored` = count of items that count (ADR-022 Decision 3, as amended by DEBT-494): the learner had a fair chance at the item, recorded as `fair_chance_at_end` when the session ended (null is a fair chance), and its question's content is not now in doubt (withdrawn or under review, or, for an answered item, its graded revision's answer key since corrected, ADR-022 Decision 4); a retired question keeps counting. An item left out leaves both counts below, answered or not
   * `correct` = count of scored items where `latestIsCorrect === true`
   * `accuracy` = correct / scored (0 if scored = 0); the UI shows "—" when nothing is scored, and says how many questions aren't scored
   * `durationSeconds` = max(0, floor((ended_at - started_at) / 1000))
3. Apply limit/offset pagination.
4. Return rows with total count for pagination.

---

#### 4.5.14 Server Action: `getIncompletePracticeSession()`

* **Name:** `getIncompletePracticeSession`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/practice-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/practice-controller.ts`; the browser calls it through the `'use server'` wrapper in `practice-actions.ts` (BUG-324)

**Input (Zod):**

```ts
// practice-schemas.ts: the shared empty input
export const EmptyInputSchema = z.object({}).strict();
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
* `VALIDATION_ERROR`
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
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/tag-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/tag-controller.ts`; the browser calls it through the `'use server'` wrapper in `tag-actions.ts` (BUG-324)

**Input (Zod):**

```ts
const GetTagsInputSchema = z.object({}).strict();
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
* `VALIDATION_ERROR`
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce entitlement (subscribed user).
2. Return the tags attached to at least one published question, ordered by `kind`, then `slug`, for the practice and History filter UI.
3. Preserve canonical tag metadata (`slug`, `name`, `kind`) without UI-specific transformations.

---

#### 4.5.16 Server Action: `getQuestionBySlug(slug, review?)`

* **Name:** `getQuestionBySlug`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/question-view-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/question-view-controller.ts`; the browser calls it through the `'use server'` wrapper in `question-view-actions.ts` (BUG-324)

**Input (Zod):**

```ts
const GetQuestionBySlugInputSchema = z
  .object({
    slug: z.string().min(1).max(MAX_SLUG_LENGTH), // 255
    // A review of the learner's own answer: its attempt or session, or neither
    // for their latest attempt (ADR-021 §3).
    review: z
      .object({
        attemptId: zUuid.optional(),
        sessionId: zUuid.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.review?.attemptId && input.review.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['review', 'attemptId'],
        message: 'Provide either attemptId or sessionId, not both',
      });
    }
  });
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
  availability: QuestionAvailability; // what the learner is told now (ADR-022 Decision 1)
  superseded: boolean;                // still published, but the revision shown is no longer current
  answerKeyChanged: boolean;          // answered revision's key corrected since (ADR-022 Decision 4)
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if the slug maps to no question the learner may view: a published question, or under `review` the revision of the learner's own item (one no longer published only if they answered it)
* `INTERNAL_ERROR`

**Behavior:**

1. Enforce entitlement (subscribed user).
2. Without `review`, load question by slug from published questions only. With `review`, resolve the learner's own item (the attempt, the item of the session, or their latest visible attempt) and load the revision it is bound to, whatever the question's status (ADR-021 §3); an attempt in an exam still in progress, or an unanswered item of a session still active, is no item, and with no item the published question is loaded instead. A question no longer published is returned only to a learner who answered it (ADR-022 Decision 2).
3. Return public question payload for the question detail page (`/app/questions/[slug]`), excluding correctness flags, with choices in the learner's shuffled order and display labels (`buildShuffledChoiceViews`), plus `availability`, `superseded` and `answerKeyChanged` (set only in a review).

---

#### 4.5.17 Server Action: `getPreviousAttempt(questionId, attemptId?, sessionId?)`

* **Name:** `getPreviousAttempt`
* **Type:** Controller action (`server-only`); the browser calls it through `src/adapters/controllers/question-view-actions.ts`
* **Auth:** subscribed
* **File:** `src/adapters/controllers/question-view-controller.ts`; the browser calls it through the `'use server'` wrapper in `question-view-actions.ts` (BUG-324)
* **Added by:** SPEC-023 (Question Review Mode)

**Input (Zod):**

```ts
const GetPreviousAttemptInputSchema = z
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
      sessionMode: 'tutor' | 'exam' | null; // null for an attempt outside a session
      attemptId: string;
      selectedChoiceId: string | null; // null when the attempt was omitted
      isOmitted: boolean; // an exam item finalized without a choice
      isCorrect: boolean;
      correctChoiceId: string;
      explanationMd: string | null;
      referenceMd: string | null;
      choiceExplanations: ChoiceExplanation[]; // same type as submitAnswer output
      answeredAt: string; // ISO 8601
    }
  | {
      kind: 'session_unanswered';
      sessionMode: 'tutor' | 'exam' | null;
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
   * Else: load the user's most recent visible attempt for the question via `AttemptSingleQuestionReader.findLatestByUserAndQuestion`, which applies active-exam visibility before choosing a row, so active-exam attempts do not hide older visible attempts in this implicit path.
4. If no attempt is found and `sessionId` is absent (or `attemptId` was used), return `null`.
5. If no attempt is found and `sessionId` is present:
   * Load the session via `PracticeSessionRepository.findByIdAndUserId`.
   * Return `null` if the session is missing, still active (`endedAt === null`), or does not include `questionId`.
   * Load the revision the item was bound to via `QuestionRepository.findByIdForSession(item)` (ADR-021).
   * If the question is missing, log a warning and return `null`. If it is no longer available (withdrawn, under review or retired), return `null`: the learner never attempted it, so it reveals nothing.
   * Find the correct choice; if none exists, throw `INTERNAL_ERROR`.
   * Build `choiceExplanations` using `buildShuffledChoiceViews(question, userId)` for consistent display labels.
   * Return `{ kind: 'session_unanswered', sessionMode, correctChoiceId, explanationMd, referenceMd, choiceExplanations }`, where `sessionMode` is the session's mode.
6. If an attempt is found but its `questionId` does not equal the requested `questionId`, log a warning and throw `NOT_FOUND`.
7. If the resolved attempt belongs to a practice session, load that session via `PracticeSessionRepository.findByIdAndUserId`. If it is an exam still in progress, reached through an exact identifier path (`attemptId` or active `sessionId`), return `null` so the answer key is not revealed before the session ends; otherwise its mode is `sessionMode` (`null` for an attempt outside a session). The implicit latest-by-question path selects only visible attempts (BUG-239, resolved).
8. Load the revision the attempt graded via `QuestionRepository.findByIdForSession(attempt)` (ADR-021), whatever the question's status.
9. If the question is missing (orphaned attempt), log a warning and return `null`. If it is no longer available and the attempt was omitted, return `null`: a question no longer published shows only to a learner who answered it (ADR-022 Decision 2).
10. Find the correct choice; if none exists, throw `INTERNAL_ERROR`.
11. Build `choiceExplanations` using `buildShuffledChoiceViews(question, userId)` for consistent display labels.
12. Return `{ kind: 'attempt', sessionMode, attemptId, selectedChoiceId, isOmitted, isCorrect, correctChoiceId, explanationMd, referenceMd, choiceExplanations, answeredAt }`; an omitted attempt has `selectedChoiceId: null` and `isOmitted: true`.

---

#### 4.5.18 Other controller actions

These exported controller actions have no section of their own. Each is `server-only`, and the browser calls it through the wrapper named; its input schema, use case and tests are the contract.

| Action | What it does | Browser wrapper |
|---|---|---|
| `createTrialPaymentMethodSetupSession` | Opens a Stripe Checkout setup session so a trial subscriber can add a card, after consenting to the displayed terms | `app/(app)/app/trial-payment-method-actions.ts` |
| `getBookmarkQuestionIds` | The user's bookmarked question IDs, for practice and Quick Practice bookmark state | `bookmark-actions.ts` |
| `getBookmarkStatus` | Whether one question is bookmarked, for the question review page | `bookmark-actions.ts` |
| `countAvailableQuestions` | How many questions the starter's filters match, for "N questions available" | `practice-actions.ts` |
| `discardPracticeSession` | Abandons an unfinished session from the starter | `practice-actions.ts` |
| `saveExamDraftAnswer` | Saves an active exam's draft answer and its time at a navigation boundary, without grading | `practice-actions.ts` |
| `finalizeExamAnswers` | "Submit exam": grades the drafts, records the attempts and ends the session in one transaction. The timer's flush passes `onlyIfExpired`, so before the server's deadline it returns `CONFLICT` (`exam_not_expired`) and changes nothing | `practice-actions.ts` |
| `getPracticeSessionTiming` | An active exam's deadline and server-measured time left, read without writing, for the countdown (BUG-347) | `practice-actions.ts` |
| `getPracticeSessionSummary` | An ended session's summary | `practice-actions.ts` |
| `getCompletedSessionQuestionsWithFeedback` | An ended session's questions with their feedback, for post-exam review | `practice-actions.ts` |
| `rateQuestion` | Records the helpful or not-helpful rating on a question | `question-feedback-actions.ts` |
| `getQuestionRating` | The user's rating of a question | `question-feedback-actions.ts` |
| `submitQuestionReport` | Reports a problem with a question | `question-feedback-actions.ts` |

[Interaction contracts](./practice/interaction-contracts.md) describes the exam draft and finalization flow, and [the practice engine](../architecture/practice-engine.md) lists every controller.

---

## 5. Content Pipeline

### 5.1 MDX question format

The [content schema](../../lib/content/schemas.ts) and
[MDX parser](../../lib/content/parse-mdx-question.ts) own the accepted format:
question files under `content/questions/` have YAML frontmatter and ordered
`## Stem` / `## Explanation` sections. Use the
[content import runbook](../architecture/content-pipeline.md) for authoring/import operations.

### 5.2 Frontmatter validation

Use `QuestionFrontmatterSchema`, not a separately copied schema.
It enforces two to five uniquely labelled choices, exactly one correct choice,
unique tag slugs, at least one topic and one substance tag, and canonical
topic, substance and treatment slugs.
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
`pnpm db:seed` (through [scripts/database/db-seed.ts](../../scripts/database/db-seed.ts), which
enforces the target guard) under the [database-target safety procedure](../architecture/environments.md).
Target selection and acknowledgement are mandatory; a content update does not
authorize a different database.

- [question-parser.ts](../../scripts/seed/question-parser.ts) parses each file
  into its canonical representation: the question's fields, its ordered choices
  (each with its explanation), its reference and its tags.
- [question-syncer.ts](../../scripts/seed/question-syncer.ts) refuses to run
  until the database has applied migration `0042` (ADR-021 phase 2b). It locks
  each existing question and compares the file with the question's current
  revision, canonicalized the same way.
  - **Changed content** (stem, explanation, reference, difficulty or choices)
    is appended by the [revision writer](../../scripts/seed/question-revision-writer.ts)
    as a new revision with its own choice rows. The question's current revision
    moves to it in the same transaction.
  - **Status and tags** belong to the question and change in place.
  - Ordinary seeding refuses to reactivate an archived question; only the
    synthetic placeholders are exempt.
- A revision and its choices are never updated; the database rejects it. Earlier
  attempts and sessions keep the revision they were shown and graded against,
  so there is no graded-history refusal and no wait for sessions in progress.
  Reviews and sessions say when a question has been updated since (Pattern
  Registry F-12). Archiving an authored question records a withdrawal, which is
  permanent: the seed refuses to restore a withdrawn question. The seed also
  refuses a database with an active content release, whose content changes
  only through releases. This reconciliation does not select release or
  rollback policies; those are ADR-021 phase 4's commands in
  `scripts/content-release/`.

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

* `docs/README.md` (the documentation map)
* `docs/adr/README.md`
* `docs/architecture/practice-engine.md`

```text
/
├── app/                              # Frameworks layer (Next.js App Router; homepage at app/page.tsx)
│   ├── (marketing)/                  # Checkout success, privacy, terms
│   ├── pricing/                      # Pricing + subscribe form actions
│   ├── sign-in/, sign-up/            # Clerk auth pages
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
│   │   ├── shared/                   # Helpers shared by use cases
│   │   ├── errors/
│   │   └── test-helpers/
│   │       └── fakes/                # Canonical fakes for unit/controller tests
│   └── adapters/                     # Controllers, repositories, gateways, jobs
│       ├── controllers/              # server-only controllers + 'use server' wrappers (*-actions.ts)
│       ├── repositories/             # Drizzle implementations + mappers
│       ├── gateways/                 # Clerk/Stripe/Resend, rate limiter + other gateway implementations
│       ├── jobs/                     # Cron jobs (Stripe reconciliation, renewal notices, scheduled checks)
│       ├── config/                   # Adapter configuration (Stripe price mapping)
│       └── shared/                   # Adapter-only helpers (idempotency, rate limits, DB types)
│
├── components/                       # Frameworks layer (React components)
├── lib/                              # Frameworks layer (Infrastructure)
├── db/                               # Frameworks layer (Database)
├── content/                          # Static content (MDX questions)
├── scripts/
└── tests/                            # Integration + E2E tests, repository-policy tests, shared test support
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
// app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts
import { submitAnswer } from '@/src/adapters/controllers/question-actions';

// ❌ FORBIDDEN: Domain importing from outer layers
// src/domain/services/grading.ts
import { db } from '@/lib/db';  // ERROR! Domain cannot import frameworks
```

### Key Architectural Points

1. **Server Actions are Controllers** — Controllers live in `src/adapters/controllers/` as `server-only` `*-controller.ts` modules, NOT in `app/_actions/`. The actions a browser calls are one-parameter `'use server'` wrappers: `*-actions.ts` beside the controllers, or beside the route for a form action (e.g. `app/pricing/subscribe-actions.ts`) (BUG-324)
2. **Composition Root** — All dependency wiring in `lib/container.ts`, `lib/container/**` and `lib/controller-helpers.ts`
3. **Domain has ZERO imports** — No framework code, no database, no external services
4. **Unit tests colocated** — `*.test.ts(x)` next to their source
5. **Integration/E2E centralized** — In `/tests/` directory

---

## 7. Vertical Slice Specifications

These slices are the original build plan, kept as history. They were corrected where they would mislead about today's system; §4, the code and the rest of `docs/product/` describe current behaviour.

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
* `tests/e2e/core-app-pages.spec.ts`: signs in via Clerk, ensures subscription, and verifies core app page navigation (Dashboard/Billing/Bookmarks/History), and that Billing reaches the Stripe billing portal.

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

   * Add `<ClerkProvider>` (today in `components/providers.tsx`, rendered by `app/layout.tsx`)
   * Add Clerk routes for sign-in/up
   * Add Clerk middleware/proxy file (Next.js 16 uses `proxy.ts` naming per Clerk docs). ([Clerk][5])
9. Add `/api/health` route handler.
10. Add GitHub Actions CI (typecheck, lint, tests).
11. Connect repo to Vercel (preview deployments on PR; production on main).

**Files to Create/Modify:**

* `proxy.ts` (Clerk middleware/proxy)
* `app/layout.tsx`, `app/globals.css`
* `app/page.tsx` and `app/(marketing)/*` basic pages
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

* `0000_jazzy_vermin.sql` (Drizzle-generated name):

  * `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
  * create enums
  * create the initial tables + indexes (later migrations evolve them into Section 3's schema)

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

* `tests/integration/actions.stripe.integration.test.ts`: verify Stripe checkout and portal session creation against Postgres (Stripe replaced by `FakePaymentGateway`).
* `tests/e2e/subscribe.spec.ts`: a subscribed user sees the subscribed state on `/pricing` and reaches the dashboard. End-to-end checkout in Stripe test mode using test card 4242 is `tests/e2e/stripe-hosted-paid-checkout.spec.ts`, in the observational `stripe-hosted` lane. ([Stripe Docs][6])

**Implementation Checklist:**

1. Create Stripe products/prices (Section 11).
2. Add Stripe SDK initialization in `lib/stripe.ts`.
3. Implement server actions: `createCheckoutSession`, `createPortalSession` (today `server-only` controllers in `billing-controller.ts`, reached through the form actions in `app/pricing/subscribe-actions.ts` and `app/(app)/app/billing/manage-billing-actions.ts`).
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
* `src/application/use-cases/submit-answer-*.test.ts` (colocated; tutor, exam, retry, standalone): use case with fake repositories
* `tests/integration/controllers.integration.test.ts`: submitAnswer inserts attempts and grades correctly.
* `tests/e2e/practice.spec.ts`: UI flow for answering one question.

**Implementation Checklist:**

1. Create `components/markdown/markdown.tsx` with react-markdown + remark-gfm + rehype-sanitize.
2. Add seed script with 10 placeholder questions.
3. Build domain services: `src/domain/services/grading.ts` — gradeAnswer() pure function
4. Build use cases: `src/application/use-cases/submit-answer.ts`, `get-next-question.ts`
5. Build repositories: `src/adapters/repositories/drizzle-question-repository.ts`, `drizzle-attempt-repository.ts`
6. Build controllers: `src/adapters/controllers/question-controller.ts` — `server-only`, with `'use server'` wrappers in `question-actions.ts`
7. Build the question loop UI (stem + choices + submit + feedback) as reusable components (consumed by Practice Sessions and Quick Practice):

   * fetch next question via controller
   * select choice
   * submit and show explanation
8. Add bookmark state control on question view (calls the `setBookmark` action in `bookmark-actions.ts`, which wraps the controller, with the desired state).

**Files to Create/Modify:**

* `scripts/seed.ts`
* `content/questions/placeholder/*.mdx` (10 placeholder files)
* `components/markdown/markdown.tsx`
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

* `src/application/use-cases/get-next-question-navigation.test.ts`: session question order + completion semantics (including `fromIndex` and persisted session state).
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
* `src/adapters/controllers/practice-controller.ts`, `tag-controller.ts` — `server-only`, with `'use server'` wrappers in `practice-actions.ts`, `tag-actions.ts`
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
* `tests/integration/controllers-history.integration.test.ts`: attempted questions controller integration, including a question unpublished since (kept, labeled retired).
* `tests/e2e/history.spec.ts` and `tests/e2e/bookmarks.spec.ts`.

**Implementation Checklist:**

1. Implement `getAttemptedQuestions({ limit, offset, result?, source?, difficulty?, tagSlug?, sort? })`.
2. Build `/app/history` with Sessions and Questions tabs (SPEC-021).
3. Build `/app/bookmarks`.
4. Add question detail view: open question from list and submit answer or review previous attempt.

**Files to Create/Modify:**

* `src/application/use-cases/get-attempted-questions.ts`, `get-bookmarks.ts`
* `src/adapters/repositories/drizzle-bookmark-repository.ts`
* `src/adapters/controllers/review-controller.ts`, `bookmark-controller.ts`, `question-view-controller.ts` — `server-only`; the browser calls `bookmark-actions.ts` and `question-view-actions.ts`, and the History page calls `review-controller.ts` on the server
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
* Recent activity items carry session context (SPEC-020 Phase 3). Since SPEC-021 Phase 3, recent sessions are listed in their own card rather than grouped within recent activity.

**Test Cases:**

* `src/domain/services/statistics.test.ts` (colocated): computeAccuracy(), computeStreak() pure function tests
* `src/application/use-cases/get-user-stats.test.ts` (colocated): use case with fake repositories
* `tests/integration/controllers-history.integration.test.ts`: stats controller aggregates totals, windows, streak and recent activity from a real database; `tests/e2e/core-app-pages.spec.ts` checks the dashboard's stat cards and recent sections.

**Implementation Checklist:**

1. Build domain services: `src/domain/services/statistics.ts` — computeAccuracy(), computeStreak(), filterAttemptsInWindow()
2. Build use case: `src/application/use-cases/get-user-stats.ts`
3. Build controller: `src/adapters/controllers/stats-controller.ts` — `server-only` getUserStats export, called by the dashboard page
4. Build `/app/dashboard` page with stat cards and recent list.

**Files to Create/Modify:**

* `src/domain/services/statistics.ts` — pure functions for accuracy/streak
* `src/application/use-cases/get-user-stats.ts`
* `src/adapters/controllers/stats-controller.ts` — `server-only` exports
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
import { createChoice, createQuestion } from '../test-helpers';

it('returns isCorrect=true when correct choice selected', () => {
  const question = createQuestion({
    choices: [
      createChoice({ id: 'a', label: 'A', isCorrect: false }),
      createChoice({ id: 'b', label: 'B', isCorrect: true }),
    ],
  });
  const result = gradeAnswer(question, 'b');
  expect(result.isCorrect).toBe(true);
});
```

**Example Use Case Test (with Fakes):**

```typescript
// src/application/use-cases/submit-answer-standalone.test.ts
import { SubmitAnswerUseCase } from './submit-answer';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';

it('records attempt when answer submitted', async () => {
  const questionRepo = new FakeQuestionRepository([question]);
  const attemptRepo = new FakeAttemptRepository();
  const useCase = new SubmitAnswerUseCase(
    questionRepo,
    attemptRepo,
    new FakePracticeSessionRepository(),
    new FakeLogger(),
  );

  await useCase.execute({ userId: 'u1', questionId: 'q1', choiceId: 'c1' });

  expect(attemptRepo.getAll()).toHaveLength(1);
});
```

### 8.2 Integration Tests (Vitest + real Postgres)

**Scope:** `src/adapters/` — test real implementations against real DB

**Philosophy:**

* Test that adapters correctly implement interfaces
* Use **real database** (Postgres via Docker/CI service)
* Test repositories against the real database; Stripe test-mode behaviour is proved in the required provider-contract E2E lane and the opt-in `pnpm test:stripe-provider` contracts (run weekly by a scheduled workflow), not in the default integration run (see ADR-003)

**Naming:**

* `*.integration.test.ts` in `/tests/integration`

**Test DB:**

* GitHub Actions starts a Postgres container in its `Start test database` step and points `DATABASE_URL` at it.

### 8.3 E2E Tests (Playwright)

**Critical paths:**

* signin flow (sign-up only as far as the pricing link to Clerk's sign-up page: every run signs in one shared test user)
* subscribe flow (Stripe test mode)
* practice session flow
* review flow
* bookmark flow

**Auth strategy (mandatory):**

* Use `@clerk/testing/playwright` global setup to generate stored auth state, then reuse it across tests. ([Clerk][7])

**Stripe test mode:**

* Required E2E proves the repository's own redirect and provider contract (`tests/e2e/checkout-redirect.spec.ts`, `checkout-success-provider.spec.ts`). It may check the `checkout.stripe.com` origin, but it never fills Stripe-owned pages.
* Only the observational `stripe-hosted-*.spec.ts` journeys fill a Stripe test card such as `4242 4242 4242 4242` with a future expiry. ([Stripe Docs][6])

### 8.4 CI Pipeline (GitHub Actions)

The executable [.github/workflows/ci.yml](../../.github/workflows/ci.yml) is the
workflow authority. [package.json](../../package.json) owns command/toolchain
versions, and [ci-workflow.test.ts](../../tests/ci-workflow.test.ts) pins the
workflow boundary. This section intentionally does not reproduce YAML; the local
pre-push gate is in [AGENTS.md](../../AGENTS.md).

Follow the [CI Secret Standard](../architecture/environments.md#ci-secret-standard):
provider credentials belong only to consuming E2E steps; Build receives compiled
public values and shape-valid server-only placeholders. Actions are SHA-pinned.
Dependabot keeps the credential-free non-E2E lane policy; its omitted E2E evidence
must be explicit, not reported as executed.

The workflow runs unit, integration, browser, build and eligible required E2E
lanes, and emits their actual outcomes. The separate hosted-provider DOM lane is
observational, not required PR coverage. See the
[dependency update protocol](../guides/dependencies/updating-dependencies.md) and
[testing infrastructure guide](../guides/testing/e2e-tests.md) for execution rules.

**Production ordering:** promotion-PR E2E precedes the merge; Vercel builds main
while main CI runs; production domains are assigned only after main's required
`test` passes. The [Deployment Check procedure](../guides/release/promote-to-production.md#production-deployment-check)
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
  * sanitized via `rehype-sanitize` with its default (GitHub-style) schema; raw HTML in the source is skipped (`skipHtml`)
* No string-built SQL in application code:

  * use the Drizzle query builder, or Drizzle's parameterized `sql` template where the builder cannot express a query (as in several `src/adapters/` repositories, for example the advisory lock in `subscription-write-lock.ts`, and the health check's `SELECT 1`); never `sql.raw` or string interpolation ([ADR-009](../adr/adr-009-security-hardening.md))
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
> - [`.env.example`](../../.env.example) lists every variable, including optional ones this table leaves out (`CLERK_JWT_KEY`, `STRIPE_WEBHOOK_E2E_OWNER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `LOG_LEVEL`).

| Variable                            | Description                                                                                                                 | Required in Dev | Required in CI | Required in Preview | Required in Prod |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------: | -------------: | ------------------: | ---------------: |
| DATABASE_URL                        | Neon Postgres connection string                                                                                             |               ✅ |            ✅ |                   ✅ |                ✅ |
| CLERK_SECRET_KEY                    | Clerk secret key (server)                                                                                                   |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   | Clerk publishable key (client)                                                                                              |               ✅ |            ✅ |                   ✅ |                ✅ |
| CLERK_WEBHOOK_SIGNING_SECRET        | Clerk webhook signing secret (Svix). Required to verify incoming Clerk webhooks.                                            |               — |            — |                   — |                ✅ |
| STRIPE_SECRET_KEY                   | Stripe secret key (server)                                                                                                  |               ✅ |            ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  | Stripe publishable key (public). `lib/env.ts` requires it, but no app code reads it: Checkout and the portal are Stripe-hosted redirects. |               ✅ |            ✅ |                   ✅ |                ✅ |
| STRIPE_WEBHOOK_SECRET               | Stripe webhook signing secret                                                                                               |               ✅ |            ✅ |                   ✅ |                ✅ |
| STRIPE_WEBHOOK_SECRET_NEXT          | The next webhook endpoint's signing secret, set only while a major-release migration overlaps two endpoints                 |               — |            — |                   — |                — |
| CONSENT_STATE_SECRET                | HMAC key (at least 32 characters) that signs the trial add-card consent state. `lib/env.ts` requires it on Vercel production and preview builds (`VERCEL_ENV`); locally it stays unset (add-card fails closed) and the E2E server gets a test-only value. |               — |            — |                   ✅ |                ✅ |
| NEXT_PUBLIC_APP_URL                 | Canonical base URL (e.g., [http://localhost:3000](http://localhost:3000), [https://yourdomain.com](https://yourdomain.com)) |               ✅ |            ✅ |                   ✅ |                ✅ |
| CRON_SECRET                         | Shared bearer secret for `/api/cron/reconcile-stripe-subscriptions` and `/api/cron/send-renewal-notices`. Not checked at startup (`lib/env.ts` leaves it optional): each cron route refuses every request (401) while it is unset or not header-safe. |               — |            — |                   — |                ✅ |
| GITHUB_READ_TOKEN                   | Read-only GitHub token for the renewal job's check that the repository's scheduled workflows still run (DEBT-505). Not checked at startup; without it GitHub is read anonymously, and a rate-limit refusal raises an operational alert. |               — |            — |                   — |                ✅ |
| NEXT_SERVER_ACTIONS_ENCRYPTION_KEY  | Base64 AES key (16, 24 or 32 bytes) that keeps server-action IDs stable across deploys (BUG-319). `lib/env.ts` requires it on Vercel production and preview builds (`VERCEL_ENV`). |               — |            — |                   ✅ |                ✅ |
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

The portal's features are set in code, not in the Dashboard's default configuration (DEBT-414 F05): every portal session names a configuration that [stripe-portal-configurations.ts](../../src/adapters/gateways/stripe/stripe-portal-configurations.ts) finds or creates through the API, one per profile (`trial`, `paid`) and configuration version.

* Allow customer to:

  * update payment method (`paid` profile only; a trial adds its first card through the app's add-card flow, which records consent)
  * view invoice history
  * cancel subscription (at period end, no proration)
  * update name, email, address and phone
* Do not allow switching between Monthly and Annual plans: it would change an existing subscriber's price, which DEBT-414 keeps frozen
* Return URL, set on each session: `${NEXT_PUBLIC_APP_URL}/app/billing`

---

## 12. Deployment Checklist (Ordered)

This list records the original build order. Today's release procedure is the [deployment procedure](../guides/release/promote-to-production.md).

1. Create GitHub repo.
2. Initialize Next.js 16+ project with TypeScript strict and App Router.
3. Add Tailwind v4 + shadcn/ui base components. ([Tailwind CSS][4])
4. Create Neon Postgres via Vercel Marketplace and set `DATABASE_URL`.
5. Add Drizzle schema and migrations (the first enables pgcrypto). The Vercel Build Command in `vercel.json` applies them to each environment's `DATABASE_URL` on deploy; `pnpm db:migrate` with an explicit `DATABASE_URL` (and `DB_TARGET_ACK` for a remote target) is the manual fallback. ([Drizzle ORM][2])
6. Create Clerk application (dev + prod instances as needed):

   * Set env vars in Vercel (preview + prod)
   * Add `proxy.ts` with `clerkMiddleware()` route matching. ([Clerk][5])
7. Create Stripe products/prices in test mode; set env vars.
8. Implement Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`.
9. Implement pricing + checkout + success sync.
10. Implement subscription gate for `/app/*`.
11. Add seed script + placeholder questions (seeded only with `SEED_INCLUDE_PLACEHOLDERS=true`, as CI does); run `pnpm db:seed` against preview/prod by hand, with an explicit `DATABASE_URL` and `DB_TARGET_ACK`, after each content change (deploys do not seed).
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
* **Advanced pacing analytics** — per-question timing is already persisted, not universally zero. [SubmitAnswer](../../src/application/use-cases/submit-answer.ts) bounds supplied seconds (zero is the missing/invalid fallback); [FinalizeExamAnswers](../../src/application/use-cases/finalize-exam-answers.ts) converts bounded cumulative draft milliseconds to seconds. See [practice timing](./practice/interaction-contracts.md#per-question-time-accumulation) and the [exam timing bound](./practice/exam-answer-secrecy.md). A richer pacing-analysis product remains out of scope.
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
