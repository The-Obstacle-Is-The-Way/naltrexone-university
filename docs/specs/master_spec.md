# Addiction Boards Question Bank SaaS — Technical Specification (SPEC.md)

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

```
+-------------------+            +-----------------------------------------------+
|    Browser (UI)   |            |             Vercel (Next.js 16+)              |
|  Next.js Client   |            |  App Router + Server Components + Actions      |
+---------+---------+            |  Route Handlers (/app/api/*)                   |
          |                      +-------------------+---------------------------+
          |  HTTPS requests                          |
          |  (pages, actions, APIs)                  |
          v                                          v
+-------------------+                       +--------------------+
| Clerk (Auth)      |<-- session cookies -->| Next.js Server      |
| @clerk/nextjs     |                       | - auth() / currentUser()
+-------------------+                       | - subscription checks
                                            | - server actions
                                            | - webhook handlers
                                            +----------+---------+
                                                       |
                                                       | Drizzle ORM
                                                       v
                                            +--------------------+
                                            | Neon Postgres       |
                                            | (Vercel Marketplace)|
                                            +--------------------+
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

## 3. Complete Database Schema

### 3.1 Drizzle ORM Schema File — `db/schema.ts`

> Notes enforced by this spec:
>
> * All timestamps are stored as `timestamptz` (timezone-aware) in UTC.
> * UUID primary keys use `gen_random_uuid()` via Drizzle `defaultRandom()`; therefore the DB must have `pgcrypto` enabled. ([Drizzle ORM][2])

```ts
// db/schema.ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { desc } from 'drizzle-orm';

/**
 * ENUMS
 */
export const questionDifficultyEnum = pgEnum('question_difficulty', [
  'easy',
  'medium',
  'hard',
]);

export const questionStatusEnum = pgEnum('question_status', [
  'draft',
  'published',
  'archived',
]);

export const tagKindEnum = pgEnum('tag_kind', [
  'domain',     // exam blueprint / big domain bucket
  'topic',      // clinical topic
  'substance',  // alcohol/opioids/etc
  'treatment',  // meds/psychosocial tx
  'diagnosis',  // DSM/ICD category
]);

export const practiceModeEnum = pgEnum('practice_mode', [
  'tutor', // shows explanation immediately after answer
  'exam',  // hides correctness/explanation until session ends
]);

export const stripeSubscriptionStatusEnum = pgEnum('stripe_subscription_status', [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);

/**
 * TYPES (shared)
 */
export type QuestionDifficulty = (typeof questionDifficultyEnum.enumValues)[number];
export type QuestionStatus = (typeof questionStatusEnum.enumValues)[number];
export type TagKind = (typeof tagKindEnum.enumValues)[number];
export type PracticeMode = (typeof practiceModeEnum.enumValues)[number];
export type StripeSubscriptionStatus =
  (typeof stripeSubscriptionStatusEnum.enumValues)[number];

export type PracticeSessionParams = {
  count: number;                 // number of questions in this session
  tagSlugs: string[];            // filter; empty = no tag filter
  difficulties: QuestionDifficulty[]; // filter; empty = no difficulty filter
  questionIds: string[];         // ordered UUID list selected at session start
};

/**
 * TABLES
 */

// users
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clerkUserId: varchar('clerk_user_id', { length: 64 }).notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clerkUserIdUq: uniqueIndex('users_clerk_user_id_uq').on(t.clerkUserId),
    emailUq: uniqueIndex('users_email_uq').on(t.email),
  }),
);

// stripe_customers
export const stripeCustomers = pgTable(
  'stripe_customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdUq: uniqueIndex('stripe_customers_user_id_uq').on(t.userId),
    stripeCustomerIdUq: uniqueIndex('stripe_customers_stripe_customer_id_uq').on(
      t.stripeCustomerId,
    ),
  }),
);

// stripe_subscriptions
export const stripeSubscriptions = pgTable(
  'stripe_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).notNull(),
    status: stripeSubscriptionStatusEnum('status').notNull(),
    priceId: varchar('price_id', { length: 255 }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdUq: uniqueIndex('stripe_subscriptions_user_id_uq').on(t.userId),
    stripeSubscriptionIdUq: uniqueIndex(
      'stripe_subscriptions_stripe_subscription_id_uq',
    ).on(t.stripeSubscriptionId),
    userStatusIdx: index('stripe_subscriptions_user_status_idx').on(
      t.userId,
      t.status,
    ),
  }),
);

// stripe_events (id = Stripe event id)
export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    type: varchar('type', { length: 255 }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    typeIdx: index('stripe_events_type_idx').on(t.type),
    processedAtIdx: index('stripe_events_processed_at_idx').on(t.processedAt),
  }),
);

// questions
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    stemMd: text('stem_md').notNull(),
    explanationMd: text('explanation_md').notNull(),
    difficulty: questionDifficultyEnum('difficulty').notNull(),
    status: questionStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUq: uniqueIndex('questions_slug_uq').on(t.slug),
    statusDifficultyIdx: index('questions_status_difficulty_idx').on(
      t.status,
      t.difficulty,
    ),
    statusCreatedAtIdx: index('questions_status_created_at_idx').on(
      t.status,
      desc(t.createdAt),
    ),
  }),
);

// choices
export const choices = pgTable(
  'choices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 4 }).notNull(), // A, B, C, D, E
    textMd: text('text_md').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    sortOrder: integer('sort_order').notNull(), // 1..N
  },
  (t) => ({
    questionIdIdx: index('choices_question_id_idx').on(t.questionId),
    questionLabelUq: uniqueIndex('choices_question_id_label_uq').on(
      t.questionId,
      t.label,
    ),
    questionSortOrderUq: uniqueIndex('choices_question_id_sort_order_uq').on(
      t.questionId,
      t.sortOrder,
    ),
  }),
);

// tags
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    kind: tagKindEnum('kind').notNull(),
  },
  (t) => ({
    slugUq: uniqueIndex('tags_slug_uq').on(t.slug),
    kindSlugIdx: index('tags_kind_slug_idx').on(t.kind, t.slug),
  }),
);

// question_tags (composite PK)
export const questionTags = pgTable(
  'question_tags',
  {
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.questionId, t.tagId] }),
    tagIdIdx: index('question_tags_tag_id_idx').on(t.tagId),
    questionIdIdx: index('question_tags_question_id_idx').on(t.questionId),
  }),
);

// practice_sessions
export const practiceSessions = pgTable(
  'practice_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: practiceModeEnum('mode').notNull(),
    paramsJson: jsonb('params_json').$type<PracticeSessionParams>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => ({
    userStartedAtIdx: index('practice_sessions_user_started_at_idx').on(
      t.userId,
      desc(t.startedAt),
    ),
  }),
);

// attempts
export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    practiceSessionId: uuid('practice_session_id').references(() => practiceSessions.id, {
      onDelete: 'set null',
    }),
    selectedChoiceId: uuid('selected_choice_id').references(() => choices.id, {
      onDelete: 'set null',
    }),
    isCorrect: boolean('is_correct').notNull(),
    timeSpentSeconds: integer('time_spent_seconds').notNull().default(0),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userAnsweredAtIdx: index('attempts_user_answered_at_idx').on(
      t.userId,
      desc(t.answeredAt),
    ),
    userQuestionAnsweredAtIdx: index('attempts_user_question_answered_at_idx').on(
      t.userId,
      t.questionId,
      desc(t.answeredAt),
    ),
    userIsCorrectAnsweredAtIdx: index('attempts_user_is_correct_answered_at_idx').on(
      t.userId,
      t.isCorrect,
      desc(t.answeredAt),
    ),
    sessionAnsweredAtIdx: index('attempts_session_answered_at_idx').on(
      t.practiceSessionId,
      desc(t.answeredAt),
    ),
    questionIdIdx: index('attempts_question_id_idx').on(t.questionId),
  }),
);

// bookmarks (composite PK)
export const bookmarks = pgTable(
  'bookmarks',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.questionId] }),
    userCreatedAtIdx: index('bookmarks_user_created_at_idx').on(
      t.userId,
      desc(t.createdAt),
    ),
    questionIdIdx: index('bookmarks_question_id_idx').on(t.questionId),
  }),
);

/**
 * RELATIONS
 */

export const usersRelations = relations(users, ({ one, many }) => ({
  stripeCustomer: one(stripeCustomers, {
    fields: [users.id],
    references: [stripeCustomers.userId],
  }),
  stripeSubscription: one(stripeSubscriptions, {
    fields: [users.id],
    references: [stripeSubscriptions.userId],
  }),
  sessions: many(practiceSessions),
  attempts: many(attempts),
  bookmarks: many(bookmarks),
}));

export const questionsRelations = relations(questions, ({ many }) => ({
  choices: many(choices),
  questionTags: many(questionTags),
  attempts: many(attempts),
  bookmarks: many(bookmarks),
}));

export const choicesRelations = relations(choices, ({ one }) => ({
  question: one(questions, {
    fields: [choices.questionId],
    references: [questions.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  questionTags: many(questionTags),
}));

export const questionTagsRelations = relations(questionTags, ({ one }) => ({
  question: one(questions, {
    fields: [questionTags.questionId],
    references: [questions.id],
  }),
  tag: one(tags, {
    fields: [questionTags.tagId],
    references: [tags.id],
  }),
}));

export const practiceSessionsRelations = relations(practiceSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [practiceSessions.userId],
    references: [users.id],
  }),
  attempts: many(attempts),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  user: one(users, {
    fields: [attempts.userId],
    references: [users.id],
  }),
  question: one(questions, {
    fields: [attempts.questionId],
    references: [questions.id],
  }),
  session: one(practiceSessions, {
    fields: [attempts.practiceSessionId],
    references: [practiceSessions.id],
  }),
  selectedChoice: one(choices, {
    fields: [attempts.selectedChoiceId],
    references: [choices.id],
  }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  question: one(questions, {
    fields: [bookmarks.questionId],
    references: [questions.id],
  }),
}));

/**
 * EXPORTED TS TYPES
 */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type StripeCustomer = typeof stripeCustomers.$inferSelect;
export type NewStripeCustomer = typeof stripeCustomers.$inferInsert;

export type StripeSubscription = typeof stripeSubscriptions.$inferSelect;
export type NewStripeSubscription = typeof stripeSubscriptions.$inferInsert;

export type StripeEvent = typeof stripeEvents.$inferSelect;
export type NewStripeEvent = typeof stripeEvents.$inferInsert;

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

export type Choice = typeof choices.$inferSelect;
export type NewChoice = typeof choices.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type QuestionTag = typeof questionTags.$inferSelect;
export type NewQuestionTag = typeof questionTags.$inferInsert;

export type PracticeSession = typeof practiceSessions.$inferSelect;
export type NewPracticeSession = typeof practiceSessions.$inferInsert;

export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
```

---

## 4. API and Server Actions

### 4.1 Auth Level Definitions

* **public**: no login required
* **authenticated**: Clerk session required
* **subscribed**: authenticated **AND** subscription entitlement required (see below)

### 4.2 Subscription Entitlement (Server-Side, Exact Logic)

A user is **entitled** if and only if there exists a row in `stripe_subscriptions` for the user with:

* `status` ∈ `{ "active", "trialing" }`
* AND `current_period_end > now()` (server UTC)
* AND the subscription row corresponds to the **latest** known subscription for that user (enforced by `stripe_subscriptions.user_id` unique constraint: 1 row per user)

All other statuses (`past_due`, `canceled`, `unpaid`, `paused`, `incomplete`, `incomplete_expired`) are **not entitled**.

### 4.3 Standard Server Action Result Type (Used by Every Server Action)

All server actions MUST return a discriminated union to avoid leaking stack traces to clients:

```ts
// src/adapters/controllers/action-result.ts
export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNSUBSCRIBED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STRIPE_ERROR'
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

* `500` if DB query fails
* Response body:

```ts
export type HealthErrorResponse = { ok: false; error: string };
```

**Behavior:**

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
* `500` if DB processing fails

**Required Stripe verification:**

* Must use `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` (signature verification is mandatory).

**Idempotency:**

* `stripe_events.id` is the Stripe event id (primary key).
* Webhook handler must:

  1. Upsert a `stripe_events` row with `{ id, type, processed_at: null, error: null }` (insert if missing)
  2. If row exists AND `processed_at` is not null AND `error` is null: return 200 immediately (already processed)
  3. Process event
  4. On success: set `processed_at = now()`, `error = null`
  5. On failure: set `error = <string>`, leave `processed_at` null

**Events handled (exact):**

* `checkout.session.completed`
* `customer.subscription.created`
* `customer.subscription.updated`
* `customer.subscription.deleted`

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

export const zPagination = z.object({
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
});
```

---

#### 4.5.1 Server Action: `createCheckoutSession(priceId)`

* **Name:** `createCheckoutSession`
* **Type:** Server Action
* **Auth:** authenticated
* **File:** `src/adapters/controllers/billing-controller.ts`

**Input (Zod):**

```ts
export const CreateCheckoutSessionInputSchema = z.object({
  priceId: z.string().min(1),
});
```

**Output:**

```ts
export type CreateCheckoutSessionOutput = {
  url: string; // Stripe Checkout Session URL
};
```

**Errors:**

* `UNAUTHENTICATED` if no Clerk session
* `VALIDATION_ERROR` if input invalid
* `STRIPE_ERROR` on Stripe API failure
* `INTERNAL_ERROR` on DB failure

**Behavior (exact):**

1. Ensure local `users` row exists for Clerk user (upsert by `clerk_user_id`).
2. Ensure `stripe_customers` exists:

   * If none: create Stripe Customer with metadata `{ user_id, clerk_user_id }`.
   * Insert `stripe_customers` row.
3. Create Stripe Checkout Session (subscription):

   * `mode: 'subscription'`
   * `customer: <stripe_customer_id>`
   * `line_items: [{ price: priceId, quantity: 1 }]`
   * `allow_promotion_codes: false`
   * `billing_address_collection: 'auto'`
   * `success_url: ${NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
   * `cancel_url: ${NEXT_PUBLIC_APP_URL}/pricing?checkout=cancel`
   * `client_reference_id: <users.id>` (internal uuid)
   * `subscription_data.metadata.user_id = <users.id>`
4. Return `{ url: session.url }` (must be non-null; if null => STRIPE_ERROR)

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
  z.object({ sessionId: zUuid, filters: z.undefined().optional() }).strict(),
  z.object({ sessionId: z.undefined().optional(), filters: QuestionFiltersSchema }).strict(),
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

**Case A: sessionId provided**

1. Load practice session by `id` AND `user_id`.
2. Parse `params_json` as `PracticeSessionParams`.
3. Determine which question IDs already attempted in this session:

   * Query `attempts` where `practice_session_id = sessionId` AND `user_id = userId`.
4. Find the first question in `params_json.questionIds` not yet attempted.
5. If none found: return `null`.
6. Fetch question + choices by that questionId:

   * Question must be `status='published'` (if not published => return `NOT_FOUND`)
7. Return `NextQuestion` with `session` populated.
   **Important:** `choices.isCorrect` MUST NOT be returned.

**Case B: filters provided (no session)**

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
}).strict();
```

**Output:**

```ts
export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null; // null if session mode is 'exam' and session not ended
};
```

**Errors:**

* `UNAUTHENTICATED`
* `UNSUBSCRIBED`
* `VALIDATION_ERROR`
* `NOT_FOUND` if question or choice not found / mismatch
* `INTERNAL_ERROR`

**Behavior (exact):**

1. Validate question exists and `status='published'`.
2. Validate the choice exists and belongs to the question.
3. Determine correct choice for question (query `choices` where `question_id` and `is_correct=true`).
4. Insert `attempts` row:

   * `user_id`
   * `question_id`
   * `practice_session_id = sessionId ?? null`
   * `selected_choice_id = choiceId`
   * `is_correct = (choiceId === correctChoiceId)`
   * `time_spent_seconds = 0` (fixed for MVP)
5. Determine whether explanation is returned:

   * If `sessionId` is provided AND session.mode === 'exam' AND session.ended_at IS NULL: `explanationMd = null`
   * Else: `explanationMd = questions.explanation_md`
6. Return result including `correctChoiceId` always.

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
* `INTERNAL_ERROR`

**Behavior (exact):**

1. Compute candidate question IDs from DB using filters:

   * only `questions.status='published'`
   * if `tagSlugs` non-empty: question must have at least one matching tag slug
   * if `difficulties` non-empty: difficulty in list
2. Shuffle deterministically in JavaScript using a seeded RNG:

   * seed = `hash(userId + Date.now().toString())` (sha256 -> take first 8 bytes as uint32)
   * shuffle algorithm = Fisher-Yates with seeded RNG
3. Take first `count` IDs (or fewer if fewer candidates exist).

   * If zero: return `NOT_FOUND`
4. Insert `practice_sessions` row with:

   * `user_id`, `mode`
   * `params_json = { count, tagSlugs, difficulties, questionIds }`
   * `started_at = now()`
5. Return `sessionId`.

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

   * attempts in that session for that user
   * correct count
   * duration = floor((ended_at - started_at)/1000)
5. Return summary.

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
  recentActivity: Array<{
    answeredAt: string;        // ISO
    questionId: string;
    slug: string;
    isCorrect: boolean;
  }>;
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
* recentActivity = 20 most recent attempts joined to questions (slug) ordered by answered_at desc

---

#### 4.5.8 Server Action: `getMissedQuestions(limit, offset)`

* **Name:** `getMissedQuestions`
* **Type:** Server Action
* **Auth:** subscribed
* **File:** `src/adapters/controllers/review-controller.ts`

**Input (Zod):**

```ts
export const GetMissedQuestionsInputSchema = zPagination;
```

**Output:**

```ts
export type MissedQuestionRow = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  lastAnsweredAt: string; // ISO
};

export type GetMissedQuestionsOutput = {
  rows: MissedQuestionRow[];
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

* For each question the user has attempted, find the most recent attempt timestamp.
* Join back to attempts and filter where that most recent attempt is `is_correct=false`.
* Join to questions (published only).
* Order by most recent incorrect attempt desc.
* Apply limit/offset.

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
* `INTERNAL_ERROR`

**Behavior (exact):**

1. Validate question exists and published.
2. If bookmark exists (user_id, question_id): delete it, return `bookmarked=false`.
3. Else insert bookmark with created_at now, return `bookmarked=true`.

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
export type BookmarkRow = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
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

* Select bookmarks for user ordered by created_at desc
* Join to published questions
* Return list

---

## 5. Content Pipeline

### 5.1 MDX Question File Format (Exact)

* File extension: `.mdx`
* Location: `/content/questions/**/*.mdx`
* Frontmatter: YAML
* Body must contain exactly two H2 headings in this order:

  1. `## Stem`
  2. `## Explanation`

Everything under `## Stem` until `## Explanation` is the stem markdown. Everything after `## Explanation` is explanation markdown.

### 5.2 Frontmatter Schema (Exact)

Fields:

* `slug`: string, kebab-case, unique
* `difficulty`: `"easy" | "medium" | "hard"`
* `status`: `"draft" | "published" | "archived"`
* `tags`: array of objects `{ slug, name, kind }`
* `choices`: array of objects `{ label, text, correct }`

Rules:

* `choices` must contain **2–6** entries
* exactly **1** choice must have `correct: true`
* labels must be unique and match `^[A-E]$`

### 5.3 Example MDX File (Exact)

```mdx
---
slug: "buprenorphine-induction-precipitated-withdrawal"
difficulty: "medium"
status: "published"
tags:
  - slug: "opioids"
    name: "Opioids"
    kind: "substance"
  - slug: "buprenorphine"
    name: "Buprenorphine"
    kind: "treatment"
  - slug: "withdrawal"
    name: "Withdrawal"
    kind: "topic"
choices:
  - label: "A"
    text: "Start buprenorphine immediately at a high dose to outcompete full agonists."
    correct: false
  - label: "B"
    text: "Wait until moderate withdrawal symptoms are present before starting buprenorphine."
    correct: true
  - label: "C"
    text: "Use naltrexone first, then transition to buprenorphine within 1 hour."
    correct: false
  - label: "D"
    text: "Add a benzodiazepine and continue full agonist opioids until symptoms resolve."
    correct: false
---

## Stem

A 34-year-old patient with opioid use disorder using fentanyl daily requests buprenorphine. They last used fentanyl 6 hours ago and have mild rhinorrhea but no objective withdrawal. What is the best next step to reduce the risk of precipitated withdrawal?

## Explanation

Buprenorphine is a partial agonist with high receptor affinity. Starting too early can displace full agonists and precipitate withdrawal. Initiation is safest when the patient is in **moderate** withdrawal (e.g., higher COWS score), or via a micro-induction protocol (not covered in this question).
```

### 5.4 Zod Schemas (Exact)

```ts
// lib/content/schemas.ts
import { z } from 'zod';

export const ChoiceFrontmatterSchema = z.object({
  label: z.string().regex(/^[A-E]$/, 'label must be A-E'),
  text: z.string().min(1),
  correct: z.boolean(),
}).strict();

export const TagFrontmatterSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  kind: z.enum(['domain', 'topic', 'substance', 'treatment', 'diagnosis']),
}).strict();

export const QuestionFrontmatterSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  status: z.enum(['draft', 'published', 'archived']),
  tags: z.array(TagFrontmatterSchema).max(50),
  choices: z.array(ChoiceFrontmatterSchema).min(2).max(6),
}).strict().superRefine((val, ctx) => {
  const correctCount = val.choices.filter((c) => c.correct).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'choices must contain exactly 1 correct=true',
      path: ['choices'],
    });
  }
  const labelSet = new Set(val.choices.map((c) => c.label));
  if (labelSet.size !== val.choices.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'choice labels must be unique',
      path: ['choices'],
    });
  }
});

export const FullQuestionSchema = z.object({
  frontmatter: QuestionFrontmatterSchema,
  stemMd: z.string().min(1),
  explanationMd: z.string().min(1),
}).strict();
```

### 5.5 Seed Script (Required)

* Entry point: `/scripts/seed.ts`
* Command: `pnpm db:seed`
* Libraries:

  * `fast-glob` (glob files)
  * `gray-matter` (parse frontmatter)
  * Node `crypto` (sha256)
  * Drizzle for DB writes

#### Content hash for change detection (Exact)

* Compute `fileHash = sha256(canonicalJsonString(fullQuestion))`
* Compute `dbHash = sha256(canonicalJsonString(dbRepresentation))`

  * dbRepresentation includes:

    * question.slug, stem_md, explanation_md, difficulty, status
    * choices: label, text_md, is_correct, sort_order
    * tags: slug, name, kind (sorted by slug)
* If hashes match: skip update (no writes)

#### Seed Script Pseudocode (Exact)

```ts
// scripts/seed.ts (pseudocode)
load env (DATABASE_URL)

connect drizzle db

files = glob("/content/questions/**/*.mdx")

for each file in files:
  raw = readFile(file)
  { data, content } = grayMatter(raw)

  frontmatter = QuestionFrontmatterSchema.parse(data)

  // split content into Stem + Explanation
  // REQUIRE exact headings in this order
  stemMd = extractBetween(content, "## Stem", "## Explanation")
  explanationMd = extractAfter(content, "## Explanation")

  full = FullQuestionSchema.parse({ frontmatter, stemMd, explanationMd })

  fileHash = sha256(canonicalJson(full))

  // find existing question by slug
  existingQuestion = select questions where slug = frontmatter.slug

  if exists:
    existingChoices = select choices where question_id = existingQuestion.id order by sort_order asc
    existingTags = select tags join question_tags where question_id = existingQuestion.id order by tags.slug asc

    dbRep = buildCanonicalDbRep(existingQuestion, existingChoices, existingTags)
    dbHash = sha256(canonicalJson(dbRep))

    if dbHash == fileHash:
      continue

    transaction:
      update questions set stem_md, explanation_md, difficulty, status, updated_at=now where id=...
      delete from choices where question_id=...
      insert choices (question_id, label, text_md, is_correct, sort_order)
      delete from question_tags where question_id=...
      for each tag in frontmatter.tags:
        upsert tags by slug; if slug exists but name/kind mismatch => throw (hard error)
      insert question_tags (question_id, tag_id)
  else:
    transaction:
      insert into questions (...)
      insert choices
      upsert tags and insert question_tags

print summary: inserted/updated/skipped counts
exit 0
```

Canonical JSON rules (Exact):

* keys sorted alphabetically
* arrays sorted:

  * tags by `slug`
  * choices by `label`
* newline normalization: `\r\n` → `\n`
* trim trailing whitespace on each line

---

## 6. Directory Structure

> **Authoritative Source:** This structure follows **ADR-012: Directory Structure** which implements Robert C. Martin's Clean Architecture. See [docs/adr/adr-012-directory-structure.md](../adr/adr-012-directory-structure.md) for complete rationale.

### Clean Architecture Layer Mapping

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FRAMEWORKS & DRIVERS (Outermost)                      │
│  app/, components/, lib/, db/ — Next.js, React, Drizzle, External SDKs  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    INTERFACE ADAPTERS                              │  │
│  │  src/adapters/ — Repositories, Gateways, Controllers              │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    USE CASES                                 │  │  │
│  │  │  src/application/ — Use Case classes, Port interfaces       │  │  │
│  │  │                                                              │  │  │
│  │  │  ┌─────────────────────────────────────────────────────┐    │  │  │
│  │  │  │                    ENTITIES (Core)                   │    │  │  │
│  │  │  │  src/domain/ — Entities, Value Objects, Services    │    │  │  │
│  │  │  │  ZERO external dependencies                          │    │  │  │
│  │  │  └─────────────────────────────────────────────────────┘    │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

**The Dependency Rule:** Dependencies point inward ONLY. Inner layers know nothing about outer layers.

### Complete Directory Tree

```text
/
├── src/                              # CLEAN ARCHITECTURE LAYERS
│   │
│   ├── domain/                       # LAYER 1: ENTITIES (Innermost)
│   │   │                             # ZERO external dependencies
│   │   │
│   │   ├── entities/
│   │   │   ├── index.ts              # Barrel export
│   │   │   ├── question.ts           # Question entity type
│   │   │   ├── choice.ts             # Choice entity type
│   │   │   ├── attempt.ts            # Attempt entity type
│   │   │   ├── user.ts               # User entity type
│   │   │   ├── subscription.ts       # Subscription entity type
│   │   │   ├── practice-session.ts   # PracticeSession entity type
│   │   │   ├── bookmark.ts           # Bookmark entity type
│   │   │   └── tag.ts                # Tag entity type
│   │   │
│   │   ├── value-objects/
│   │   │   ├── index.ts
│   │   │   ├── question-difficulty.ts  # 'easy' | 'medium' | 'hard'
│   │   │   ├── question-status.ts      # 'draft' | 'published' | 'archived'
│   │   │   ├── subscription-status.ts  # Stripe statuses + EntitledStatuses
│   │   │   ├── practice-mode.ts        # 'tutor' | 'exam'
│   │   │   ├── choice-label.ts         # 'A' | 'B' | 'C' | 'D' | 'E'
│   │   │   └── tag-kind.ts             # 'domain' | 'topic' | 'substance' | etc.
│   │   │
│   │   ├── services/                 # Pure business logic functions
│   │   │   ├── index.ts
│   │   │   ├── grading.ts            # gradeAnswer(question, choiceId)
│   │   │   ├── grading.test.ts       # Colocated unit test (NO MOCKS)
│   │   │   ├── entitlement.ts        # isEntitled(subscription, now)
│   │   │   ├── entitlement.test.ts
│   │   │   ├── statistics.ts         # computeAccuracy(), computeStreak()
│   │   │   ├── statistics.test.ts
│   │   │   ├── session.ts            # computeSessionProgress(), shouldShowExplanation()
│   │   │   ├── session.test.ts
│   │   │   ├── shuffle.ts            # shuffleWithSeed() for deterministic randomization
│   │   │   └── shuffle.test.ts
│   │   │
│   │   ├── errors/
│   │   │   └── domain-errors.ts      # DomainError class + codes
│   │   │
│   │   ├── test-helpers/
│   │   │   └── factories.ts          # createQuestion(), createUser(), etc.
│   │   │
│   │   └── index.ts                  # Domain barrel export
│   │
│   ├── application/                  # LAYER 2: USE CASES
│   │   │                             # Depends only on domain
│   │   │
│   │   ├── use-cases/
│   │   │   ├── index.ts
│   │   │   ├── submit-answer.ts      # SubmitAnswerUseCase class
│   │   │   ├── submit-answer.test.ts # Uses fakes, not mocks
│   │   │   ├── get-next-question.ts
│   │   │   ├── get-next-question.test.ts
│   │   │   ├── start-practice-session.ts
│   │   │   ├── start-practice-session.test.ts
│   │   │   ├── end-practice-session.ts
│   │   │   ├── end-practice-session.test.ts
│   │   │   ├── get-user-stats.ts
│   │   │   ├── get-missed-questions.ts
│   │   │   ├── toggle-bookmark.ts
│   │   │   ├── get-bookmarks.ts
│   │   │   ├── create-checkout-session.ts
│   │   │   ├── create-portal-session.ts
│   │   │   └── check-entitlement.ts
│   │   │
│   │   ├── ports/                    # Interface definitions (Dependency Inversion)
│   │   │   ├── repositories.ts       # QuestionRepository, AttemptRepository, etc.
│   │   │   └── gateways.ts           # AuthGateway, PaymentGateway interfaces
│   │   │
│   │   ├── errors/
│   │   │   └── application-errors.ts # ApplicationError class + codes
│   │   │
│   │   ├── test-helpers/
│   │   │   └── fakes.ts              # FakeQuestionRepository, FakeAttemptRepository
│   │   │
│   │   └── index.ts
│   │
│   └── adapters/                     # LAYER 3: INTERFACE ADAPTERS
│       │                             # Depends on application + domain
│       │
│       ├── repositories/             # Drizzle ORM implementations
│       │   ├── index.ts
│       │   ├── drizzle-question-repository.ts
│       │   ├── drizzle-attempt-repository.ts
│       │   ├── drizzle-user-repository.ts
│       │   ├── drizzle-subscription-repository.ts
│       │   ├── drizzle-session-repository.ts
│       │   └── drizzle-bookmark-repository.ts
│       │
│       ├── gateways/                 # External service wrappers
│       │   ├── index.ts
│       │   ├── clerk-auth-gateway.ts    # Implements AuthGateway
│       │   └── stripe-payment-gateway.ts # Implements PaymentGateway
│       │
│       ├── controllers/              # Server Actions (entry points from Next.js)
│       │   ├── index.ts
│       │   ├── action-result.ts      # ActionResult<T>, ok(), err(), handleError()
│       │   ├── question-controller.ts   # 'use server'; submitAnswer, getNextQuestion
│       │   ├── practice-controller.ts   # 'use server'; startPracticeSession, endPracticeSession
│       │   ├── stats-controller.ts      # 'use server'; getUserStats
│       │   ├── billing-controller.ts    # 'use server'; createCheckoutSession, createPortalSession
│       │   ├── review-controller.ts     # 'use server'; getMissedQuestions
│       │   └── bookmark-controller.ts   # 'use server'; toggleBookmark, getBookmarks
│       │
│       ├── presenters/               # Output formatting (optional)
│       │   └── question-presenter.ts
│       │
│       └── index.ts
│
├── app/                              # LAYER 4: FRAMEWORKS (Next.js App Router)
│   │
│   ├── (marketing)/                  # Marketing route group
│   │   ├── layout.tsx                # Public layout with <ClerkProvider>
│   │   ├── page.tsx                  # Homepage with CTA
│   │   ├── pricing/page.tsx          # Pricing cards
│   │   ├── checkout/success/page.tsx # Post-checkout success
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   │
│   ├── (app)/                        # App route group
│   │   └── app/
│   │       ├── layout.tsx            # Subscription gate (server-side)
│   │       ├── dashboard/page.tsx
│   │       ├── practice/page.tsx
│   │       ├── practice/[sessionId]/page.tsx
│   │       ├── review/page.tsx
│   │       ├── bookmarks/page.tsx
│   │       └── billing/page.tsx
│   │
│   ├── api/                          # Route handlers
│   │   ├── health/route.ts
│   │   └── stripe/webhook/route.ts
│   │
│   ├── layout.tsx                    # Root layout
│   ├── globals.css
│   └── error.tsx                     # Global error boundary
│
├── components/                       # LAYER 4: FRAMEWORKS (React Components)
│   ├── ui/                           # shadcn/ui generated components
│   ├── layout/
│   │   ├── app-header.tsx
│   │   └── marketing-header.tsx
│   ├── markdown/
│   │   └── markdown.tsx              # ReactMarkdown wrapper
│   ├── question/
│   │   ├── question-card.tsx
│   │   ├── choice-radio-group.tsx
│   │   ├── answer-feedback.tsx
│   │   └── explanation-panel.tsx
│   └── stats/
│       ├── stat-card.tsx
│       └── recent-activity-list.tsx
│
├── lib/                              # LAYER 4: FRAMEWORKS (Infrastructure)
│   ├── container.ts                  # COMPOSITION ROOT — wires all dependencies
│   ├── db.ts                         # Drizzle client singleton
│   ├── env.ts                        # Zod-validated environment variables
│   ├── stripe.ts                     # Stripe SDK init (server-only)
│   ├── logger.ts                     # Pino structured logging
│   ├── request-context.ts            # Request ID correlation
│   └── markdown-config.ts            # rehype-sanitize schema
│
├── db/                               # LAYER 4: FRAMEWORKS (Database)
│   ├── schema.ts                     # Drizzle schema (Section 3)
│   └── migrations/
│       ├── 0000_init.sql
│       └── meta/
│
├── content/                          # Static content (MDX questions)
│   └── questions/
│       ├── opioids/
│       ├── alcohol/
│       └── general/
│
├── scripts/
│   └── seed.ts                       # Content seeding script
│
├── tests/                            # Integration + E2E tests
│   ├── integration/
│   │   ├── setup.ts                  # DB reset, test fixtures
│   │   ├── db.integration.test.ts
│   │   ├── repositories.integration.test.ts
│   │   └── controllers.integration.test.ts
│   └── e2e/
│       ├── global.setup.ts           # Clerk auth state
│       ├── auth.spec.ts
│       ├── subscribe.spec.ts
│       ├── practice.spec.ts
│       ├── review.spec.ts
│       └── bookmarks.spec.ts
│
├── proxy.ts                          # Clerk middleware
├── next.config.ts
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── biome.json
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
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
* `tests/e2e/auth.spec.ts`: uses Clerk testing helpers to sign in and verify protected app route redirects correctly.

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
* `playwright.config.ts`, `vitest.config.ts`

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

* `pnpm typecheck`, `pnpm biome check .`, `pnpm test`, `pnpm test:e2e` all pass locally
* CI passes on PR
* Vercel preview deploy works
* `/api/health` returns `{ ok: true, db: true, ... }`

---

### SLICE-1: Paywall

**Slice ID:** SLICE-1

**User Story:**
As a user, I can subscribe and manage billing so that I can access the question bank.

**Acceptance Criteria:**

* Given I am logged in, when I click “Subscribe Monthly/Annual” on `/pricing`, then I’m redirected to Stripe Checkout.
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

* Given I am subscribed, when I open `/app/practice` and start, then I see a question stem and choices rendered as sanitized markdown.
* When I select an answer and submit, then I see correct/incorrect feedback and explanation (tutor mode).
* When I submit, then an `attempts` row is created.

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
7. Build practice runner UI for single-question flow (no sessions yet):

   * fetch next question via controller
   * select choice
   * submit and show explanation
8. Add bookmark toggle button on question view (calls toggleBookmark controller).

**Files to Create/Modify:**

* `scripts/seed.ts`
* `content/questions/general/*.mdx` (10 placeholder files)
* `components/markdown/Markdown.tsx`
* `components/question/*`
* `src/domain/entities/question.ts`, `choice.ts`, `attempt.ts`
* `src/domain/services/grading.ts` — gradeAnswer() pure function
* `src/application/ports/repositories.ts` — QuestionRepository, AttemptRepository interfaces
* `src/application/use-cases/submit-answer.ts`, `get-next-question.ts`, `toggle-bookmark.ts`
* `src/adapters/repositories/drizzle-question-repository.ts`, `drizzle-attempt-repository.ts`
* `src/adapters/controllers/question-controller.ts`, `bookmark-controller.ts`
* `lib/container.ts` (add new factories)
* `app/(app)/app/practice/page.tsx`

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
* When I end the session, I see score and total duration.
* In exam mode, explanations are hidden until the session ends.

**Test Cases:**

* `tests/integration/actions.questions.integration.test.ts`: getNextQuestion(session) respects questionIds order and completion.
* `tests/e2e/practice.spec.ts`: start session -> answer -> end -> summary.

**Implementation Checklist:**

1. Implement `startPracticeSession` and persist `questionIds` in `params_json`.
2. Implement session runner route `/app/practice/[sessionId]`.
3. Implement `endPracticeSession`.
4. Enforce exam-mode explanation gating.

**Files to Create/Modify:**

* `src/domain/entities/practice-session.ts`
* `src/domain/services/session.ts` — computeSessionProgress(), shouldShowExplanation()
* `src/domain/services/shuffle.ts` — shuffleWithSeed() for deterministic question selection
* `src/application/use-cases/start-practice-session.ts`, `end-practice-session.ts`
* `src/adapters/repositories/drizzle-session-repository.ts`
* `src/adapters/controllers/practice-controller.ts` — 'use server' exports
* `app/(app)/app/practice/[sessionId]/page.tsx`
* `components/question/*` (progress display + exam/tutor behaviors)
* `lib/container.ts` (add session factories)

**Migrations:** none

**Env vars:** none

**Definition of Done:**

* Sessions create and complete reliably
* Exam vs tutor behavior is correct and tested

---

### SLICE-4: Review and Bookmarks

**Slice ID:** SLICE-4

**User Story:**
As a subscribed user, I can review missed questions and bookmarked questions so that I can focus on weak areas.

**Acceptance Criteria:**

* Missed questions page shows questions whose most recent attempt is incorrect.
* Bookmark toggle persists; bookmarks page lists bookmarked questions.
* From missed/bookmarked list, I can reattempt a question (records a new attempt).

**Test Cases:**

* `tests/integration/actions.questions.integration.test.ts`: missed query logic.
* `tests/e2e/review.spec.ts` and `tests/e2e/bookmarks.spec.ts`.

**Implementation Checklist:**

1. Implement `getMissedQuestions(limit, offset)`.
2. Build `/app/review` with pagination.
3. Build `/app/bookmarks`.
4. Add reattempt flow: open question view from list and submit answer.

**Files to Create/Modify:**

* `src/application/use-cases/get-missed-questions.ts`, `get-bookmarks.ts`
* `src/adapters/repositories/drizzle-bookmark-repository.ts`
* `src/adapters/controllers/review-controller.ts`, `bookmark-controller.ts` — 'use server' exports
* `app/(app)/app/review/page.tsx`
* `app/(app)/app/bookmarks/page.tsx`
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
* `components/stats/*`
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

> Next.js 16 removed `next lint`. Use **Biome** for linting and formatting (`biome check .`). Biome is 10-100x faster than ESLint+Prettier and combines both tools into one. ([Biome][9])

**Workflow file:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 60

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: addiction_boards_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U postgres -d addiction_boards_test"
          --health-interval=5s
          --health-timeout=5s
          --health-retries=10

    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/addiction_boards_test

      # App base URL used by redirects / Playwright baseURL
      NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000

      # Clerk (dev instance keys for CI E2E)
      # Fall back to dummy values so fork PRs can still run non-E2E jobs.
      CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY || 'sk_test_dummy' }}
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_dummy' }}

      # Stripe (test mode keys for CI)
      # Fall back to dummy values so fork PRs can still run non-E2E jobs.
      STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY || 'sk_test_dummy' }}
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy' }}
      STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET || 'whsec_dummy' }}
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: ${{ secrets.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY || 'price_dummy_monthly' }}
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: ${{ secrets.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL || 'price_dummy_annual' }}

      # Clerk E2E user creds (username/password auth enabled)
      E2E_CLERK_USER_USERNAME: ${{ secrets.E2E_CLERK_USER_USERNAME }}
      E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          run_install: false

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: pnpm

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint and Format Check (Biome)
        run: pnpm exec biome ci .

      - name: Migrate DB
        run: pnpm db:migrate

      - name: Seed DB (placeholder content)
        run: pnpm db:seed

      - name: Unit tests
        run: pnpm test --run

      - name: Integration tests
        run: pnpm test:integration

      - name: Build
        run: pnpm build

      - name: Install Playwright browsers
        if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)
        run: pnpm exec playwright install --with-deps

      - name: E2E smoke
        if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)
        run: pnpm test:e2e

      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v6
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 30
          if-no-files-found: ignore

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: [test]
    runs-on: ubuntu-24.04
    steps:
      - name: Trigger Vercel Production Deployment
        run: echo "Production deploy is handled by Vercel Git integration on main."
```

**Deployment behavior in CI (exact):**

* Vercel Git integration performs preview deploys on PR and production deploy on merge to main.
* The `deploy` job is a no-op sentinel ensuring main only deploys if tests pass.

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

> All variables MUST be present in the specified environments.

| Variable                            | Description                                                                                                                 | Required in Dev | Required in Preview | Required in Prod |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------: | ------------------: | ---------------: |
| DATABASE_URL                        | Neon Postgres connection string                                                                                             |               ✅ |                   ✅ |                ✅ |
| CLERK_SECRET_KEY                    | Clerk secret key (server)                                                                                                   |               ✅ |                   ✅ |                ✅ |
| CLERK_PUBLISHABLE_KEY               | Clerk publishable key (legacy compatibility; set equal to NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)                                |               ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   | Clerk publishable key (client)                                                                                              |               ✅ |                   ✅ |                ✅ |
| STRIPE_SECRET_KEY                   | Stripe secret key (server)                                                                                                  |               ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  | Stripe publishable key (client)                                                                                             |               ✅ |                   ✅ |                ✅ |
| STRIPE_WEBHOOK_SECRET               | Stripe webhook signing secret                                                                                               |               ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_APP_URL                 | Canonical base URL (e.g., [http://localhost:3000](http://localhost:3000), [https://yourdomain.com](https://yourdomain.com)) |               ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY | Stripe Price ID for $29/mo                                                                                                  |               ✅ |                   ✅ |                ✅ |
| NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL  | Stripe Price ID for $199/yr                                                                                                 |               ✅ |                   ✅ |                ✅ |
| E2E_CLERK_USER_USERNAME             | Clerk test user username for Playwright                                                                                     |               ✅ |                   ✅ |                ✅ |
| E2E_CLERK_USER_PASSWORD             | Clerk test user password for Playwright                                                                                     |               ✅ |                   ✅ |                ✅ |

---

## 11. Stripe Setup

### 11.1 Products / Prices (Exact)

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

### 11.2 Webhook Events (Exact)

Configure webhook endpoint:

* URL: `${NEXT_PUBLIC_APP_URL}/api/stripe/webhook`
* Events:

  * `checkout.session.completed`
  * `customer.subscription.created`
  * `customer.subscription.updated`
  * `customer.subscription.deleted`

### 11.3 Customer Portal Configuration (Exact)

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
