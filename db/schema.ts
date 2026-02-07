// db/schema.ts

import { desc, relations } from 'drizzle-orm';
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
  'domain', // exam blueprint / big domain bucket
  'topic', // clinical topic
  'substance', // alcohol/opioids/etc
  'treatment', // meds/psychosocial tx
  'diagnosis', // DSM/ICD category
]);

export const practiceModeEnum = pgEnum('practice_mode', [
  'tutor', // shows explanation immediately after answer
  'exam', // hides correctness/explanation until session ends
]);

export const stripeSubscriptionStatusEnum = pgEnum(
  'stripe_subscription_status',
  [
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused',
  ],
);

/**
 * TYPES (shared)
 */
export type QuestionDifficulty =
  (typeof questionDifficultyEnum.enumValues)[number];
export type QuestionStatus = (typeof questionStatusEnum.enumValues)[number];
export type TagKind = (typeof tagKindEnum.enumValues)[number];
export type PracticeMode = (typeof practiceModeEnum.enumValues)[number];
export type StripeSubscriptionStatus =
  (typeof stripeSubscriptionStatusEnum.enumValues)[number];

export type PracticeSessionParams = {
  count: number; // number of questions in this session
  tagSlugs: string[]; // filter; empty = no tag filter
  difficulties: QuestionDifficulty[]; // filter; empty = no difficulty filter
  questionIds: string[]; // ordered UUID list selected at session start
  questionStates?: Array<{
    questionId: string;
    markedForReview: boolean;
    latestSelectedChoiceId: string | null;
    latestIsCorrect: boolean | null;
    latestAnsweredAt: string | null;
  }>;
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdUq: uniqueIndex('stripe_customers_user_id_uq').on(t.userId),
    stripeCustomerIdUq: uniqueIndex(
      'stripe_customers_stripe_customer_id_uq',
    ).on(t.stripeCustomerId),
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
    stripeSubscriptionId: varchar('stripe_subscription_id', {
      length: 255,
    }).notNull(),
    status: stripeSubscriptionStatusEnum('status').notNull(),
    priceId: varchar('price_id', { length: 255 }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
    }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    typeIdx: index('stripe_events_type_idx').on(t.type),
    processedAtIdx: index('stripe_events_processed_at_idx').on(t.processedAt),
  }),
);

// rate_limits (composite PK: key + window_start)
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: varchar('key', { length: 255 }).notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.key, t.windowStart] }),
    windowStartIdx: index('rate_limits_window_start_idx').on(t.windowStart),
  }),
);

// idempotency_keys (composite PK: user_id + action + key)
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 255 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    resultJson: jsonb('result_json').$type<unknown>(),
    errorCode: varchar('error_code', { length: 255 }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.action, t.key] }),
    expiresAtIdx: index('idempotency_keys_expires_at_idx').on(t.expiresAt),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    explanationMd: text('explanation_md'),
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
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => ({
    userStartedAtIdx: index('practice_sessions_user_started_at_idx').on(
      t.userId,
      desc(t.startedAt),
    ),
    userEndedAtIdx: index('practice_sessions_user_ended_at_idx').on(
      t.userId,
      desc(t.endedAt),
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
    practiceSessionId: uuid('practice_session_id').references(
      () => practiceSessions.id,
      {
        onDelete: 'set null',
      },
    ),
    selectedChoiceId: uuid('selected_choice_id')
      .notNull()
      .references(() => choices.id, { onDelete: 'restrict' }),
    isCorrect: boolean('is_correct').notNull(),
    timeSpentSeconds: integer('time_spent_seconds').notNull().default(0),
    answeredAt: timestamp('answered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userAnsweredAtIdx: index('attempts_user_answered_at_idx').on(
      t.userId,
      desc(t.answeredAt),
    ),
    userQuestionAnsweredAtIdx: index(
      'attempts_user_question_answered_at_idx',
    ).on(t.userId, t.questionId, desc(t.answeredAt)),
    userIsCorrectAnsweredAtIdx: index(
      'attempts_user_is_correct_answered_at_idx',
    ).on(t.userId, t.isCorrect, desc(t.answeredAt)),
    sessionAnsweredAtIdx: index('attempts_session_answered_at_idx').on(
      t.practiceSessionId,
      desc(t.answeredAt),
    ),
    // Supports AttemptRepository.findBySessionId(sessionId, userId) ordered by answeredAt desc.
    sessionUserAnsweredAtIdx: index('attempts_session_user_answered_at_idx').on(
      t.practiceSessionId,
      t.userId,
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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

export const practiceSessionsRelations = relations(
  practiceSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [practiceSessions.userId],
      references: [users.id],
    }),
    attempts: many(attempts),
  }),
);

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
