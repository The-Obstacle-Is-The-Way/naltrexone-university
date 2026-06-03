# SPEC-041: Question Feedback (Per-Question Ratings & Problem Reports)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented (PRs #380, #388, #389, #390; shipped to `dev` and `main` in merge `90d002e1`)
**Layer:** Feature (touches Domain, Application, Adapters, App)
**Date:** 2026-06-01

---

## Overview

Learners need a frictionless way to tell us when a question is good, bad, or broken — and we
need that signal to land in our database as a durable, query-able record we can mine forever to
improve the question bank.

This spec defines a **two-tier, per-question feedback system**, surfaced in **review mode
(post-answer)** in the practice flow, modeled directly on the existing **Bookmark** vertical
slice (`toggleBookmark` / `getBookmarks`), which is the closest existing analog: a per-question,
per-user action that persists to the DB with optimistic UI, rate limiting, and idempotency.

**Tier 1 — Rating (one click).** A lightweight `👍 / 👎` ("Was this a good question?") row inside the
review panel. Optimistic, instant, no modal. Captures broad sentiment on every question at scale.

**Tier 2 — Give feedback (modal).** A "Give feedback" button in the action bar (next to
Bookmark) opens a focused dialog: a required category (Incorrect answer · Ambiguous wording ·
Typo / formatting · Outdated reference · Other) plus an optional free-text comment. This is the
rich, actionable signal for content fixes. The user-facing label is **"Give feedback"**; the internal
`kind` stays `report` (a structured report) — and the component/use-case keep their `Report` names —
to distinguish this tier from a `rating`. UI label ≠ internal domain term, by design.

Both tiers write to a single **append-only event-log table** (`question_feedback`), chosen because
the primary goal is a long-lived analytical substrate ("forever maintain and improve"): history is
signal, storage is trivial relative to attempts, and pure-insert is the simplest persistence shape.
The **domain/application shape is not a nullable bag**: it is a discriminated event union, with the
relational table using nullable columns plus a `CHECK` only as the storage representation.

### ⚠️ Naming collision (read first)

`components/question/feedback.tsx` **already exists** — it is the **answer-explanation panel**
(Correct Answer / Why Other Answers Are Wrong / Reference). It is **not** user feedback. To avoid
confusion this spec uses distinct names everywhere:

| Concept | Name |
|--------|------|
| The existing explanation panel | `Feedback` (unchanged — do not repurpose) |
| New domain/data type | `QuestionFeedback` |
| New rating UI (👍/👎 row) | `QuestionFeedbackRating` |
| New report modal | `QuestionReportDialog` |
| User-facing copy | "Was this a good question?", "Give feedback" |

## Relationship to Other Specs

- **Models the Bookmark slice (archived SPEC-014 "Review + Bookmarks")** — same architecture: port
  + fake + Drizzle repo + use case + `createAction` server action + DI wiring + optimistic hook.
- **SPEC-023 / SPEC-034 (Review Mode)** — feedback controls render only where the review panel is
  visible (tutor immediate review + session review). They never appear mid-exam (no explanation yet).
- **DEBT-337 (Future feedback & practice enhancements)** — adjacent but separate; that item
  covers explanation-panel content/UX tweaks, not user-submitted feedback. No collision.
- **DEBT-397 (datetime boundary normalization)** — touches `practice-schemas.ts` only. This feature
  introduces a *new* controller (`question-feedback-controller.ts`); to avoid re-introducing the
  DEBT-397 problem, its boundary uses **ISO strings** for any datetime in/out from day one.

## Requirements

### Functional

1. In **review mode** (after an answer is committed and the explanation is visible), a learner can:
   1. Rate the question `helpful` / `not_helpful` with a single click (Tier 1).
   2. Re-click the active rating to **retract** it (back to no rating).
   3. Open a **Give feedback** modal and submit a **category** (required) + **comment** (optional).
2. On entering review mode, the UI **hydrates** the learner's current rating for that question
   (filled 👍 or 👎 if they rated it before), matching the bookmark hydration pattern.
3. Each feedback action persists to `question_feedback` with the user, question, and best-effort
   context (attempt id, practice-session id) so we can correlate feedback with whether the learner
   got the question right and in which mode.
4. Submitting feedback is **idempotent** (client-supplied idempotency key), reusing the existing
   `executeIdempotent` wrapper so retries/double-clicks never double-write.
5. Feedback is **immutable** once written (append-only). A rating "change" is a new event; latest
   event per `(user, question)` wins for display.
6. We can **extract** all feedback for offline analysis via (a) documented SQL queries and (b) an
   ops export script (`scripts/export-question-feedback.ts`) run locally with `DATABASE_URL`.

### Non-Functional

1. **Auth + entitlement:** all actions go through `requireEntitledUserId` (authenticated + subscribed),
   identical to bookmark/practice controllers.
2. **Rate limited:** per-user limits via the existing `RateLimiter` gateway and two named constants:
   `QUESTION_RATING_RATE_LIMIT` for one-click ratings and `QUESTION_REPORT_RATE_LIMIT` for free-text
   reports.
3. **Clean Architecture:** domain stays pure (no vendor IDs, no DB imports); port in `application`,
   Drizzle impl in `adapters`; fakes over mocks in tests.
4. **Design system:** new `Dialog` and `Textarea` primitives follow
   `docs/frontend/standards.md` (canonical focus ring, semantic tokens, Button mandate, no raw
   palette colors, no undocumented opacity tokens). `Dialog` either reuses or updates the existing
   modal pattern (`docs/frontend/pattern-registry.md` S-4) before use. The "Give feedback" trigger
   uses `<Button variant="outline" className="rounded-full">` to match the Bookmark button; raw
   `<button>` is forbidden in `components/question/**` and would fail the DEBT-398 source scan.
5. **Validation:** zod at the boundary, `.strict()`, reusing `zUuid`; comment capped at 2000 chars
   (enforced in zod **and** a DB `CHECK` constraint). The CHECK reuses the `check('<table>_<desc>_chk',
   sql\`…\`)` wrapper idiom from `attempts` (`attempts_*_chk`); note the `char_length(...) <= 2000`
   length test itself is new — `attempts`' CHECKs are boolean column comparisons only, so the
   precedent is the wrapper, not the length function.
6. **Privacy:** `user_id` FK is `ON DELETE CASCADE` — deleting a user removes their feedback (GDPR).
   Free-text comments are user input that may contain PII/PHI; never log comment bodies, and make
   the export script local-only with explicit redaction/default-output rules.

## Design

Dependency direction (inward only): `db` ← `adapters` ← `application` ← `domain`.

### First-principles design decisions

- **DDD / Simple Design — one domain event stream, not two unrelated aggregates.** Ratings and
  reports share the same actor, question, attempt/session context, append time, privacy posture, and
  extraction path. Two physical tables would duplicate those columns and force every analytics query
  to union them back together. The better split is a discriminated union in domain/application and
  one relational event table with a shape `CHECK`: type safety at the inner boundary, cohesive
  extraction at the outer boundary. Repo evidence: the domain already uses discriminated unions for
  closed shapes (`AnswerOutcome`, `src/domain/value-objects/answer-outcome.ts:1`) and factories for
  invariants (`createAttempt`, `src/domain/entities/attempt.ts:54`), while plain records like
  `Bookmark` stay factory-free because they have no cross-field invariant
  (`src/domain/entities/bookmark.ts:4`).
- **Data engineering — append-only, no current-state table in v1.** The display read path is a
  single latest-rating lookup, and the analytics read path needs history. A materialized
  `question_feedback_current_rating` table would add synchronization and delete/GDPR complexity
  before scale proves it necessary. Use the partial latest-rating index below first; add a
  projection table only after observed query plans justify it.
- **SOLID / YAGNI — no Strategy hierarchy yet.** There are exactly two commands with different UX,
  validation, and rate-limit keys (`rateQuestion`, `submitQuestionReport`). The use cases remain
  separate commands; the shared abstraction is only the repository append port and typed domain
  constructors. Add a Strategy only when a third feedback kind introduces real branching inside one
  command.
- **Frontend — feedback belongs to reflection surfaces.** Post-answer timing follows the repo's
  question-zone model: actions live in Zone 2 after the learner has read the explanation
  (`docs/frontend/design-principles.md:42`), and the analogous Bookmark policy explicitly keeps
  curation on reflection surfaces rather than assessment/performance surfaces
  (`docs/frontend/bookmark-surface-policy.md:16`, `docs/frontend/bookmark-surface-policy.md:67`).
- **Query determinism — latest means `createdAt DESC, id DESC`.** Existing latest-attempt reads use
  `orderBy(desc(attempts.answeredAt), desc(attempts.id))`
  (`src/adapters/repositories/drizzle-attempt-repository.ts:282`) and have an integration test for the
  UUID tie-breaker (`tests/integration/session-attempt-repository.integration.test.ts:293`). Feedback
  latest-rating hydration must copy that deterministic ordering and index shape.

### 1. Domain — value objects + entity (`src/domain/`)

**Zero external imports** (the value objects import nothing; the entity `import type`s the rating /
category VO unions from `../value-objects`, exactly like `attempt.ts`/`question.ts` — that intra-
domain import is allowed and is not an impurity). Mirror the `src/domain/value-objects/`
`const AllX = [...] as const`
**plus `isValid<Type>` type-predicate guard** idiom: every existing VO (`practice-mode.ts`,
`question-status.ts`, `tag-kind.ts`, …) ships an `isValid…` guard, and the "Tests First"
membership/validator tests call them — so each new VO must define one.

```typescript
// src/domain/value-objects/question-feedback-rating.ts
export const AllQuestionFeedbackRatings = ['helpful', 'not_helpful'] as const;
export type QuestionFeedbackRating = (typeof AllQuestionFeedbackRatings)[number];
export function isValidQuestionFeedbackRating(
  value: string,
): value is QuestionFeedbackRating {
  return AllQuestionFeedbackRatings.includes(value as QuestionFeedbackRating);
}

// src/domain/value-objects/question-feedback-category.ts
export const AllQuestionFeedbackCategories = [
  'incorrect_answer',
  'ambiguous_wording',
  'typo_formatting',
  'outdated_reference',
  'other',
] as const;
export type QuestionFeedbackCategory =
  (typeof AllQuestionFeedbackCategories)[number];
export function isValidQuestionFeedbackCategory(
  value: string,
): value is QuestionFeedbackCategory {
  return AllQuestionFeedbackCategories.includes(
    value as QuestionFeedbackCategory,
  );
}

// src/domain/value-objects/question-feedback-kind.ts
export const AllQuestionFeedbackKinds = ['rating', 'report'] as const;
export type QuestionFeedbackKind = (typeof AllQuestionFeedbackKinds)[number];
export function isValidQuestionFeedbackKind(
  value: string,
): value is QuestionFeedbackKind {
  return AllQuestionFeedbackKinds.includes(value as QuestionFeedbackKind);
}
```

```typescript
// src/domain/entities/question-feedback.ts
export type QuestionFeedbackContext = {
  readonly userId: string;
  readonly questionId: string;
  readonly attemptId: string | null;
  readonly practiceSessionId: string | null;
};

export type PersistedQuestionFeedback = {
  readonly id: string;
  readonly createdAt: Date;
};

export type QuestionRatingFeedback = QuestionFeedbackContext &
  PersistedQuestionFeedback & {
    readonly kind: 'rating';
    readonly rating: QuestionFeedbackRating | null; // null = retraction
    readonly category: null;
    readonly comment: null;
  };

export type QuestionReportFeedback = QuestionFeedbackContext &
  PersistedQuestionFeedback & {
    readonly kind: 'report';
    readonly rating: null;
    readonly category: QuestionFeedbackCategory;
    readonly comment: string | null;
  };

export type QuestionFeedback = QuestionRatingFeedback | QuestionReportFeedback;
export type NewQuestionFeedback =
  | Omit<QuestionRatingFeedback, keyof PersistedQuestionFeedback>
  | Omit<QuestionReportFeedback, keyof PersistedQuestionFeedback>;

export function newQuestionRatingFeedback(
  input: QuestionFeedbackContext & {
    readonly rating: QuestionFeedbackRating | null;
  },
): NewQuestionFeedback {
  return {
    ...input,
    kind: 'rating',
    category: null,
    comment: null,
  };
}

export function newQuestionReportFeedback(
  input: QuestionFeedbackContext & {
    readonly category: QuestionFeedbackCategory;
    readonly comment: string | null;
  },
): NewQuestionFeedback {
  return {
    ...input,
    kind: 'report',
    rating: null,
  };
}
```

**Invariant (encoded in type + constructors + DB CHECK):** a `rating` event has
`category = null` and `comment = null`; a `report` event has `category != null` and `rating = null`.
Do not pass a raw object literal with `kind`, `rating`, `category`, and `comment` from a use case.
Use `newQuestionRatingFeedback(...)` / `newQuestionReportFeedback(...)` so impossible shapes are not
representable in application code; the DB `CHECK` remains defense-in-depth for adapter bugs/manual SQL.

Export the new entity functions/types from `src/domain/entities/index.ts`; export the three new value
objects from `src/domain/value-objects/index.ts`.

**Test-helper factories:** add `createQuestionRatingFeedback(overrides)` and
`createQuestionReportFeedback(overrides)` to `src/domain/test-helpers/factories.ts` and its `index.ts`
barrel. Use UUID-emitting defaults via the existing `createUuid()` helper, `createdAt: new Date()`,
nullable FK ids defaulting to `null`, and shape-correct defaults (`comment: null` only for reports,
with ratings always setting `comment: null`). **Lock persisted and discriminant fields against
override:** type the rating param as
`Partial<Omit<QuestionRatingFeedback, keyof PersistedQuestionFeedback | 'kind' | 'category' | 'comment'>>`
(and the report analog
`Partial<Omit<QuestionReportFeedback, keyof PersistedQuestionFeedback | 'kind' | 'rating'>>`) and
hard-set `id`/`createdAt`/`kind`/`category`/`rating`/`comment` *after* the `...overrides` spread, so
callers can't produce an invalid-but-typed entity or override persisted defaults. Avoid one permissive
`createQuestionFeedback({ kind, ... })` factory, because it would recreate the nullable-bag problem in
tests.

### 2. Application — port + use cases (`src/application/`)

```typescript
// src/application/ports/question-feedback-repository.ts
import type {
  NewQuestionFeedback,
  QuestionFeedback,
  QuestionRatingFeedback,
} from '@/src/domain/entities';

export interface QuestionFeedbackRepository {
  record(event: NewQuestionFeedback): Promise<QuestionFeedback>;
  /** Latest 'rating'-kind event for (user, question); null if none. Drives 👍/👎 hydration. */
  findLatestRatingByUser(
    userId: string,
    questionId: string,
  ): Promise<QuestionRatingFeedback | null>;
}
```

Re-export via the `src/application/ports/repositories.ts` barrel (matches bookmark port).

**Three small use cases** (constructor injection, `execute()`, throw `ApplicationError`). Import
`newQuestionRatingFeedback` / `newQuestionReportFeedback` from the domain entity barrel rather than
constructing discriminated-union object literals in use-case bodies:

```typescript
// src/application/use-cases/rate-question.ts  (Tier 1)
export type RateQuestionInput = {
  userId: string;
  questionId: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  rating: QuestionFeedbackRating | null; // null = retract
};
export type RateQuestionOutput = { rating: QuestionFeedbackRating | null };

export class RateQuestionUseCase {
  constructor(
    private readonly feedback: QuestionFeedbackRepository,
    private readonly questions: QuestionRepository,
  ) {}
  async execute(input: RateQuestionInput): Promise<RateQuestionOutput> {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) throw new ApplicationError('NOT_FOUND', 'Question not found');
    await this.feedback.record(
      newQuestionRatingFeedback({
        userId: input.userId,
        questionId: input.questionId,
        attemptId: input.attemptId,
        practiceSessionId: input.practiceSessionId,
        rating: input.rating,
      }),
    );
    return { rating: input.rating };
  }
}
```

```typescript
// src/application/use-cases/get-question-rating.ts  (hydration)
export class GetQuestionRatingUseCase {
  constructor(
    private readonly feedback: QuestionFeedbackRepository,
    private readonly questions: QuestionRepository,
  ) {}
  async execute(input: { userId: string; questionId: string }) {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) throw new ApplicationError('NOT_FOUND', 'Question not found');
    const latest = await this.feedback.findLatestRatingByUser(
      input.userId,
      input.questionId,
    );
    return { rating: latest?.rating ?? null };
  }
}
```

```typescript
// src/application/use-cases/submit-question-report.ts  (Tier 2)
export type SubmitQuestionReportInput = {
  userId: string;
  questionId: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  category: QuestionFeedbackCategory;
  comment: string | null;
};
export type SubmitQuestionReportOutput = { feedbackId: string };

export class SubmitQuestionReportUseCase {
  constructor(
    private readonly feedback: QuestionFeedbackRepository,
    private readonly questions: QuestionRepository,
  ) {}
  async execute(
    input: SubmitQuestionReportInput,
  ): Promise<SubmitQuestionReportOutput> {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) throw new ApplicationError('NOT_FOUND', 'Question not found');
    const saved = await this.feedback.record(newQuestionReportFeedback(input));
    return { feedbackId: saved.id };
  }
}
```

**Fake** (`src/application/test-helpers/fakes/fake-question-feedback-repository.ts`):
`export class FakeQuestionFeedbackRepository implements QuestionFeedbackRepository`, backed by an
in-memory array of events. Mirror the bookmark/attempt fake constructor —
`constructor(seed: readonly QuestionFeedback[] = [], private readonly now: () => Date = () => new Date(),
private readonly randomUuid: () => string = () => crypto.randomUUID())`
— so `record()` can stamp `id`/`createdAt` while tests can inject deterministic clocks and ids.
`record()` pushes the shape-correct `NewQuestionFeedback` plus generated persisted fields.
`findLatestRatingByUser()` filters `kind === 'rating'`, returns the newest by `createdAt DESC, id DESC`,
else `null`. Register it
in `fakes/index.ts` as a **named** export in alphabetical position (it sorts before
`FakeQuestionRepository`). The fakes barrel uses `export { FakeX } from './fake-x'`, not `export *`.

Two enforced contract surfaces must also be updated: add `export * from './question-feedback-repository';`
to the ports barrel `src/application/ports/repositories.ts`, and add the matching re-export assertion
to `src/application/ports/repository-port-modules.test.ts` (it asserts every port is re-exported from
the barrel — adding the port without it leaves the contract test incomplete).

### 3. Adapters — schema, migration, Drizzle repo, controller (`src/adapters/`, `db/`)

#### 3a. Schema (`db/schema.ts`)

Add enums near the other `pgEnum` declarations:

```typescript
export const questionFeedbackKindEnum = pgEnum('question_feedback_kind', [
  'rating',
  'report',
]);
export const questionFeedbackRatingEnum = pgEnum('question_feedback_rating', [
  'helpful',
  'not_helpful',
]);
export const questionFeedbackCategoryEnum = pgEnum(
  'question_feedback_category',
  [
    'incorrect_answer',
    'ambiguous_wording',
    'typo_formatting',
    'outdated_reference',
    'other',
  ],
);
```

Add the table (append-only; single UUID PK like `attempts`):

```typescript
export const questionFeedback = pgTable(
  'question_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    attemptId: uuid('attempt_id').references(() => attempts.id, {
      onDelete: 'set null',
    }),
    practiceSessionId: uuid('practice_session_id').references(
      () => practiceSessions.id,
      { onDelete: 'set null' },
    ),
    kind: questionFeedbackKindEnum('kind').notNull(),
    rating: questionFeedbackRatingEnum('rating'),
    category: questionFeedbackCategoryEnum('category'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userCreatedAtIdx: index('question_feedback_user_created_at_idx').on(
      t.userId,
      desc(t.createdAt),
      desc(t.id),
    ),
    questionCreatedAtIdx: index('question_feedback_question_created_at_idx').on(
      t.questionId,
      desc(t.createdAt),
      desc(t.id),
    ),
    attemptCreatedAtIdx: index('question_feedback_attempt_created_at_idx').on(
      t.attemptId,
      desc(t.createdAt),
      desc(t.id),
    ),
    practiceSessionCreatedAtIdx: index(
      'question_feedback_practice_session_created_at_idx',
    ).on(t.practiceSessionId, desc(t.createdAt), desc(t.id)),
    ratingUserQuestionCreatedAtIdx: index(
      'question_feedback_rating_user_question_created_at_idx',
    )
      .on(t.userId, t.questionId, desc(t.createdAt), desc(t.id))
      .where(sql`${t.kind} = 'rating'`),
    kindCreatedAtIdx: index('question_feedback_kind_created_at_idx').on(
      t.kind,
      desc(t.createdAt),
      desc(t.id),
    ),
    // Shape invariant: ratings carry no report payload; reports carry a category and no rating.
    kindShapeCheck: check(
      'question_feedback_kind_shape_chk',
      sql`(${t.kind} = 'rating' AND ${t.category} IS NULL AND ${t.comment} IS NULL)
          OR (${t.kind} = 'report' AND ${t.category} IS NOT NULL AND ${t.rating} IS NULL)`,
    ),
    commentLengthCheck: check(
      'question_feedback_comment_len_chk',
      sql`${t.comment} IS NULL OR char_length(${t.comment}) <= 2000`,
    ),
  }),
);
```

Add relations (and `feedback: many(questionFeedback)` to `usersRelations` and `questionsRelations`):

```typescript
export const questionFeedbackRelations = relations(
  questionFeedback,
  ({ one }) => ({
    user: one(users, {
      fields: [questionFeedback.userId],
      references: [users.id],
    }),
    question: one(questions, {
      fields: [questionFeedback.questionId],
      references: [questions.id],
    }),
    attempt: one(attempts, {
      fields: [questionFeedback.attemptId],
      references: [attempts.id],
    }),
    practiceSession: one(practiceSessions, {
      fields: [questionFeedback.practiceSessionId],
      references: [practiceSessions.id],
    }),
  }),
);
```

Generate the migration (never `drizzle-kit push`). `drizzle.config.ts` requires `DATABASE_URL`, so
prefix `db:generate` and `db:migrate` with the explicit local test database URL:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:generate
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:migrate
```

> **Question lifecycle note:** questions are **archived** (`question_status='archived'`), not hard-
> deleted, so the `ON DELETE CASCADE` on `question_id` rarely fires in practice and feedback persists.
> Keep "archive, don't delete" as content-ops policy so the analytical record stays intact.
>
> **Schema file-size note:** `db/schema.ts` is already an intentional DEBT-234/DEBT-224 exception
> and is exempted by `scripts/check-file-size.sh`. Do not split this table out solely to satisfy the
> 350-line warning; keep the relational schema as the single source of truth.
>
> **Index rationale:** the partial latest-rating index is deliberately `WHERE kind = 'rating'` because
> the hot UI read path filters to one user's current rating for one question. `kindCreatedAtIdx`
> supports recent-report/recent-feedback export slices; `questionCreatedAtIdx` supports per-question
> audit/export slices. The `user`/`attempt`/`practiceSession` indexes support parent-side FK
> cascade/set-null maintenance and future audit slices by context. Do not add a current-rating
> projection table in v1 unless real query plans show the partial index is insufficient.

#### 3b. Drizzle repo (`src/adapters/repositories/drizzle-question-feedback-repository.ts`)

Constructor-inject `DrizzleDb`. `record()` is a plain `insert(...).returning()` (no upsert —
append-only); wrap the insert call in try/catch and throw `ApplicationError('INTERNAL_ERROR',
'Failed to insert question feedback', undefined, { cause })` on a driver failure, plus
`ApplicationError('INTERNAL_ERROR', ...)` on a missing `returning()` row (bookmark pattern).
`findLatestRatingByUser()` is `findFirst` filtered to `kind='rating'`, ordered `desc(createdAt),
desc(id)` (copy the attempt latest-read tie-breaker); wrap unexpected read failures as
`ApplicationError('INTERNAL_ERROR', 'Failed to load latest question rating', undefined, { cause })`,
and after mapping re-assert `kind === 'rating'` (fail closed otherwise). Map rows → the discriminated
domain union via a small `*-mappers.ts`; the mapper must fail closed with
`ApplicationError('INTERNAL_ERROR', 'Invalid question feedback row')` if a row violates the union
shape despite the DB `CHECK`.

#### 3c. Rate limits (`src/adapters/shared/rate-limits.ts`)

```typescript
export const QUESTION_RATING_RATE_LIMIT = {
  limit: 60,
  windowMs: ONE_MINUTE_MS,
} as const;

export const QUESTION_REPORT_RATE_LIMIT = {
  limit: 10,
  windowMs: ONE_MINUTE_MS,
} as const;
```

The split is intentional: rating is as lightweight as bookmark toggling (`BOOKMARK_MUTATION_RATE_LIMIT`
is 60/min), while reports carry optional free text and should be harder to spam.

#### 3d. zod schemas + controller (`src/adapters/controllers/question-feedback-controller.ts`)

`'use server'`. Three actions built with `createAction({ schema, getDeps, execute })` — the exact
bookmark-controller shape. Non-obvious facts the implementation must honor (verified against
`bookmark-controller.ts`, `create-action.ts`, `execute-idempotent.ts`, `controller-helpers.ts`):

- **`execute` takes three args: `(input, deps, meta)`.** `meta` (`ActionExecutionMeta = { depsSource }`)
  is load-bearing — forward it: `await requireEntitledUserId(deps, meta)`. Dropping `meta` compiles but
  silently breaks entitlement deps-resolution in injected-deps controller tests.
- **`getDeps` is produced by `createDepsResolver`, not hand-written:**
  `const getDeps = createDepsResolver<QuestionFeedbackControllerDeps, QuestionFeedbackControllerContainer>((c) => c.createQuestionFeedbackControllerDeps(), loadAppContainer);`
  (import `createDepsResolver` + `loadAppContainer` from `@/lib/controller-helpers`; declare a local
  `QuestionFeedbackControllerContainer = { createQuestionFeedbackControllerDeps: () => QuestionFeedbackControllerDeps }`).
- **`QuestionFeedbackControllerDeps` is defined and exported in this controller file** (mirroring
  `BookmarkControllerDeps`), then imported by `lib/container/types.ts`.
- Inside `execute`: `requireEntitledUserId(deps, meta)` → `deps.rateLimiter.limit({ key: \`question-feedback:<action>:${userId}\`, ...QUESTION_RATING_RATE_LIMIT })` for `rateQuestion` and `...QUESTION_REPORT_RATE_LIMIT` for `submitQuestionReport` → `throw new ApplicationError('RATE_LIMITED', …)` when `!result.success`.
- **Writes wrap the use case in `executeIdempotent({ d: deps, userId, idempotencyKey, action, outputSchema, execute })`.** Both `action` (a string label, e.g. `'question-feedback:rateQuestion'`) and `outputSchema` (a zod schema for the use-case output, e.g. `RateQuestionOutputSchema`) are **required**; `execute` is a zero-arg thunk; the idempotency repo/logger/clock are read from `d`. It returns the raw use-case output (not an `ActionResult`) — `createAction` wraps it in `ok(...)`. A missing key short-circuits to a plain call. The read action (`getQuestionRating`) is **not** wrapped (matching `getBookmarks`).

Reuse `zUuid`, the domain-owned `AllQuestionFeedbackRatings` /
`AllQuestionFeedbackCategories` literal arrays, and
`MAX_QUESTION_FEEDBACK_COMMENT_LENGTH` from `src/adapters/shared/validation-limits.ts`; add enum schemas
(and the output schemas the writes pass to `executeIdempotent`):

```typescript
const zRating = z.enum(AllQuestionFeedbackRatings);
const zCategory = z.enum(AllQuestionFeedbackCategories);
const zOptionalComment = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).max(MAX_QUESTION_FEEDBACK_COMMENT_LENGTH).optional(),
);

const RateQuestionInputSchema = z
  .object({
    questionId: zUuid,
    attemptId: zUuid.nullish(),
    practiceSessionId: zUuid.nullish(),
    rating: zRating.nullable(), // null = retract
    idempotencyKey: zUuid.optional(),
  })
  .strict();

const SubmitQuestionReportInputSchema = z
  .object({
    questionId: zUuid,
    attemptId: zUuid.nullish(),
    practiceSessionId: zUuid.nullish(),
    category: zCategory,
    comment: zOptionalComment,
    idempotencyKey: zUuid.optional(),
  })
  .strict();

const GetQuestionRatingInputSchema = z.object({ questionId: zUuid }).strict();
```

Actions: `rateQuestion`, `getQuestionRating`, `submitQuestionReport`.

Normalize `attemptId`, `practiceSessionId`, and `comment` with `?? null` before calling use cases;
the use-case inputs are explicit `string | null`, while `.nullish()` and the optional comment schema
also allow `undefined`. Let `createAction`/`handleError` map `ApplicationError` and `ZodError` to
`ActionResult`; do not add custom controller try/catch blocks.

#### 3e. DI wiring (`lib/container/*`)

There is **no `index.ts` barrel**; each sub-file exports a `createXFactories(...)` map and
`lib/container.ts` spreads them under a `satisfies <X>Factories` constraint, so the `types.ts` map and
the factory object must stay in lockstep.

- `repositories.ts`: `createQuestionFeedbackRepository: (dbOverride = primitives.db) => new DrizzleQuestionFeedbackRepository(dbOverride)` — the param is named **`dbOverride`** (all 13 existing
  factories use this), not `db`. Also add `DrizzleQuestionFeedbackRepository` to the
  `@/src/adapters/repositories` barrel and to the import block at the top of `repositories.ts`.
- `use-cases.ts`: `createRateQuestionUseCase: () => new RateQuestionUseCase(repositories.createQuestionFeedbackRepository(), repositories.createQuestionRepository())`,
  `createSubmitQuestionReportUseCase` (same two deps), and
  `createGetQuestionRatingUseCase: () => new GetQuestionRatingUseCase(repositories.createQuestionFeedbackRepository(), repositories.createQuestionRepository())`.
  Import the three classes from `@/src/application/use-cases`.
- `controllers.ts`: `createQuestionFeedbackControllerDeps: () => ({ authGateway: gateways.createAuthGateway(), logger: primitives.logger, rateLimiter: gateways.createRateLimiter(), idempotencyKeyRepository: repositories.createIdempotencyKeyRepository(), checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(), rateQuestionUseCase: useCases.createRateQuestionUseCase(), getQuestionRatingUseCase: useCases.createGetQuestionRatingUseCase(), submitQuestionReportUseCase: useCases.createSubmitQuestionReportUseCase(), now: primitives.now })`.
- `types.ts`: extend `RepositoryFactories`, `UseCaseFactories`, and `ControllerFactories` **and their
  import blocks** with the new factory types, so `ContainerOverrides`-based DI overrides keep compiling
  in controller tests.

### 4. App / UI (`app/`, `components/`)

#### 4a. New design-system primitives — `components/ui/dialog.tsx` and `components/ui/textarea.tsx`

Use `Dialog as DialogPrimitive` from the existing `radix-ui` dependency, matching
`components/ui/alert-dialog.tsx`. Do **not** add `@radix-ui/react-dialog` unless the repo intentionally
changes its Radix package convention. Model the file on `components/ui/alert-dialog.tsx`: `Dialog`,
`DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`,
`DialogFooter`, `DialogClose`. Use semantic tokens and the canonical focus ring (`buttonVariants` /
`<Button>` for visible action buttons; `.ring-focus` or the literal canonical ring only for non-Button
focus targets). Reuse the existing Pattern Registry S-4 modal-dialog overlay/content class strings
verbatim, or update/add a registry entry first if the non-alert dialog needs different overlay,
content, close-button, or mobile scroll classes. If a scroll-safe mobile variant is needed, document
that S-4 variant before code (including max-height, `overflow-y-auto`, overscroll behavior, and any
new opacity allowlist entry); do not ship one-off dialog overlay/content classes.

Also add `components/ui/textarea.tsx` because the repo has an `Input` primitive but no shared
textarea primitive. Model it on `components/ui/input.tsx`: semantic `border-input` /
`dark:border-foreground/40`, `bg-transparent` / `dark:bg-input/30`, `text-base md:text-sm`,
`placeholder:text-muted-foreground`, `selection:bg-primary selection:text-primary-foreground`,
`disabled:cursor-not-allowed disabled:opacity-50`, the same `focus-visible:border-ring
focus-visible:ring-ring/50 focus-visible:ring-[3px]`, and the same
`aria-invalid:border-destructive aria-invalid:ring-destructive/20
dark:aria-invalid:ring-destructive/40`. `QuestionReportDialog` imports this `Textarea`; it must not
hand-roll a raw styled `<textarea>` in `components/question/**`.

#### 4b. Tier 1 — rating row `components/question/question-feedback-rating.tsx`

Renders inside the review panel only (after `Feedback`). Prompt copy is **"Was this a good question?"**
— it rates the **question**, not the explanation (the analytics + report categories are all about
question quality). Two `<Button>` icon toggles (`ThumbsUp` / `ThumbsDown` from `lucide-react`),
`aria-pressed`, descriptive `aria-label`s ("Good question" / "Not a good question"), and a group label
"Rate this question". Disabled while saving. Do not toast on successful rating clicks; they are
intentionally low-friction. Do expose a compact `aria-live="polite"` status for "Saving rating" /
"Rating saved" / "Couldn't save rating" so screen-reader users get the same state change without
visual noise.

Visual contract: the row is an unframed `flex flex-wrap items-center gap-3` control row, not a new
card-like div. The prompt is `text-sm font-medium text-foreground`; the live status is `text-sm
text-muted-foreground` except failure, which is `text-sm text-destructive`. The inactive thumbs use
`<Button variant="outline" size="icon" className="rounded-full">`; the active helpful thumb uses the
existing `success` Button variant and the active not-helpful thumb uses the existing `destructive`
Button variant, both still `size="icon"` and `className="rounded-full"`. Do not create custom thumb
background/border opacity classes unless a Pattern Registry entry exists first.

#### 4c. Tier 2 — `components/question/question-report-dialog.tsx`

`Dialog` titled **"Give feedback"** with a one-line description: "Spotted an issue or have a
suggestion? This goes to our medical editors and won't affect your score." Contains a **required**
category radio group under the legend **"What's this about?"**. The 5 category controls reuse the
`choice-button.tsx` native radio + `<label>` structure (`input type="radio" className="sr-only"` inside
a clickable label), not a parallel raw-`<button>` group. Use the Pattern Registry I-3 ChoiceButton
visual tokens by default: base `rounded-xl border border-foreground/50 bg-background/50 p-4 text-left
shadow-sm transition-colors focus-within:border-ring ring-focus-within dark:border-foreground/40
dark:bg-background/50`, hover `cursor-pointer hover:border-foreground/55
hover:bg-foreground/[0.06] dark:hover:border-foreground/50 dark:hover:bg-foreground/[0.05]`, selected
`border-ring bg-foreground/[0.08] dark:border-foreground/70 dark:bg-foreground/[0.12]`, disabled
`cursor-not-allowed opacity-50`. If visual review proves the modal needs a denser radio-row variant,
add that variant to `docs/frontend/pattern-registry.md` with contrast evidence before implementing it.

The optional comment field is `<Textarea name="comment" autoComplete="off"
maxLength={MAX_QUESTION_FEEDBACK_COMMENT_LENGTH}>` under "Add details (optional)" with a live character
counter. The label and legend are `text-sm font-medium text-foreground`; the description and normal
counter/helper text are `text-sm text-muted-foreground`; the near-limit counter (100 chars remaining or
fewer) is `text-sm font-medium text-warning-foreground`; validation copy is `text-sm text-destructive`
with `role="alert"` and the field/control wired through `aria-describedby`. Invalid submit (no category)
shows "Choose a category
to send your feedback." and focuses the first invalid radio control; invalid textarea state uses the
`Textarea` primitive's `aria-invalid` destructive ring. The footer uses Button primitives for
**Cancel** + **"Submit feedback"**.

On success call `useNotification().notify({ message: 'Thanks — our editors will take a look.', tone:
'success' })` and close the dialog. On failure keep the dialog open, leave the **Submit feedback**
Button available as the retry affordance, and call `useNotification().notify({ message: "Couldn't send
your feedback. Check your connection.", tone: 'error' })`. Do not add a second toast/action system; the
provider exposes `notify`, not a bare `toast()`, and its toast region already uses `aria-live="polite"`
in `components/ui/notification-provider.tsx:131`. Dialog a11y is part of the acceptance criteria:
focus trap, labelled title/description, Escape close, focus return to trigger, keyboard-submit path,
first validation error focus on invalid submit, and labelled category controls.

#### 4d. UI source-scan and token acceptance criteria

The UI PR must pass the existing DEBT-398 source scans without exemptions: no raw `<button>` outside
`components/ui/` and the documented app-shell exception, no raw hex/palette classes, and no opacity
outside the Pattern Registry / `DOCUMENTED_OPACITY_TOKENS` allowlist. If any new visual state needs a
new opacity, add the Pattern Registry entry and update the allowlist before using the class in TSX.
Every new hardcoded UI text node must carry explicit typography per `docs/frontend/typography-policy.md`
instead of relying on inherited defaults.

#### 4e. Client hooks + imperative core

Mirror the bookmark split instead of forcing one hook path:

- `app/(app)/app/shared/question-feedback-actions.ts`: imperative core, testable like
  `bookmark-toggle.ts`.
- `app/(app)/app/questions/[slug]/use-question-page-feedback.ts`: standalone question/review-page
  hydration and actions, colocated with `use-question-page-bookmarks.ts`.
- `app/(app)/app/practice/hooks/use-practice-question-feedback.ts`: practice, quick-practice, and
  post-exam-review hydration/actions, colocated with `use-practice-question-bookmarks.ts`.

Each hook hydrates current rating on entering review mode (call `getQuestionRating`) and exposes
`{ rating, feedbackStatus, onRate, isReportOpen, openReport, submitReport }` with optimistic updates,
rollback on failed rating writes, mounted-checks, `withTimeout`, idempotency-key rotation, and error
logging. Error logs must include question/action metadata but **never** the free-text report comment.

#### 4f. Wire into the action bar

In `app/(app)/app/practice/components/practice-view.tsx`, add a **"Give feedback"** `<Button>` to
the existing `secondaryGroup` (the `hasBooleanCorrectness(submitResult)` block, right next to
Bookmark), and render `<QuestionFeedbackRating>` after the `Feedback` panel in
`components/question/question-surface-body.tsx`.

Do not stop there. Active question/review surfaces are split across multiple consumers:

- Quick Practice: `app/(app)/app/practice/quick/quick-practice-client.tsx` passes props into
  `PracticeView` and uses `fireAndForget(...)` for bookmark mutations.
- Session practice: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
  owns active-session hooks; `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
  passes controller props into `PracticeView`. `practice-page-client.tsx` is only the practice start
  surface and is not the active-question prop-threading site.
- Post-exam review: `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` imports
  and renders `Feedback` directly and has its own bottom action bar with Bookmark; add rating/report
  controls there too.
- Standalone question review: `app/(app)/app/questions/[slug]/question-page-client.tsx` renders
  `QuestionSurfaceBody` and owns a review-mode Bookmark button; thread feedback props there too.

Pass best-effort `attemptId`/`practiceSessionId` context from the actual sources: `attemptId` is in
`submitResult`, but `practiceSessionId` is **not** in `submitResult`; derive it from the session route
/ session state where available, and pass `null` for Quick Practice and other surfaces without a
session.

### 5. Extraction (the "forever maintain & improve" requirement)

No admin UI in v1 (there is no role system yet — out of scope). Two extraction paths:

1. **Documented SQL** (add to this spec's appendix + `docs/dev/`): e.g. report counts by category,
   helpful-rate per question (latest-rating-per-user), top-reported questions, recent comments.
   The operational appendix lives in `docs/dev/question-feedback-analytics.md`; it includes the
   verified current-helpful-rate query, top-reported-question query, category counts, and a
   privacy-warning recent-comments query.
2. **Ops export script** `scripts/export-question-feedback.ts` — follow the `scripts/seed.ts`
   convention exactly: add a `package.json` entry (e.g. `"export:feedback": "tsx scripts/export-question-feedback.ts"`,
   `tsx` not `ts-node`), load env via `dotenv.config({ path: '.env.local', quiet: true })` then
   `.env`, read `process.env.DATABASE_URL`, and build the client with `postgres(databaseUrl, { max: 1 })`
   + `drizzle(sql, { schema })`. Dumps `question_feedback` (joined to question slug) to CSV/JSON. No
   public surface, no new auth. Default output should include question identifiers/slug, event
   metadata, category/rating, and redacted user identifiers; include raw `user_id` or free-text
   comments only behind explicit flags with a console warning that comments may contain PII/PHI.

Example "current helpful-rate per question" (latest rating per user wins):

```sql
WITH latest AS (
  SELECT DISTINCT ON (user_id, question_id)
         user_id, question_id, rating
  FROM question_feedback
  WHERE kind = 'rating'
  ORDER BY user_id, question_id, created_at DESC, id DESC
)
SELECT q.slug,
       COUNT(*) FILTER (WHERE rating = 'helpful')     AS helpful,
       COUNT(*) FILTER (WHERE rating = 'not_helpful') AS not_helpful
FROM latest l JOIN questions q ON q.id = l.question_id
WHERE l.rating IS NOT NULL
GROUP BY q.slug
ORDER BY not_helpful DESC;
```

## Tests First

Write in dependency order; each layer red before its implementation.

1. **Domain** — value-object membership/validators (`*.test.ts`) plus constructor tests:
   `newQuestionRatingFeedback` always sets `kind='rating'`, `category=null`, `comment=null`;
   `newQuestionReportFeedback` always sets `kind='report'`, `rating=null`; type-level tests or
   `expectTypeOf` cover that report-only fields are not accepted by the rating constructor.
2. **Fake repo** — `record()` appends a persisted event with injectable clock + id generator;
   `findLatestRatingByUser()` returns newest rating, uses `id DESC` as the deterministic tie-breaker
   for equal `createdAt`, ignores reports, returns null when none.
3. **Use cases** (fakes): `RateQuestion` (NOT_FOUND when question absent; records `rating` event;
   retraction records `rating=null`), `GetQuestionRating` (NOT_FOUND when question absent; latest wins;
   null when none),
   `SubmitQuestionReport` (NOT_FOUND; records `report` event; returns id).
4. **Drizzle repo** — unit (mocked db chain) + **integration** (`tests/integration/*.integration.test.ts`):
   real append, row→union mapping, latest-rating query including equal-`createdAt` tie-breaker, read
   failure wrapping, and the `kind_shape` / `comment_len` CHECK constraints reject bad rows (rating
   with comment, report with rating, report without category, overlong comment). Integration tests
   self-fixture their users/questions — no seed dependency. Add `'question_feedback'` to the
   `tests/integration/db.integration.test.ts` table census and assert the feedback FK-support indexes
   exist for coverage; note the census asserts `toContain` per table (additive), so omitting it is a
   coverage gap, not a guaranteed red.
5. **Controller** (fakes via DI overrides): validation error, unauthenticated, unsubscribed,
   rate-limited, success, `ActionResult` error mapping via `createAction`, idempotency replay (no
   double-write), separate rate-limit keys for rating vs report actions, and the distinct rating/report
   limit constants are passed to `RateLimiter.limit`.
6. **UI** — primitive tests for `Dialog` and `Textarea`, then `renderToStaticMarkup` component tests
   (`*.test.tsx`) for the rating row + dialog markup; **browser specs** (`*.browser.spec.tsx`,
   `pnpm test:browser`) for the hook (hydrate, optimistic rate, rollback on failure, retract) and
   dialog submit flow. Keep React 19 rules:
   `// @vitest-environment jsdom` first line in `*.test.tsx`, dynamic imports in `beforeAll`, no
   `@testing-library/react`, and no per-test timeout overrides. Add a11y assertions for
   `aria-pressed`, icon `aria-label`s, `aria-live` status, labelled textarea/counter, focus return,
   Escape close, first-invalid-control focus, keyboard submit, and validation messaging.
7. **E2E (optional)** — open report dialog in review mode, submit, assert toast + DB row.
8. **Fixture/isolation checks** — UUID-shaped fixture ids across zod/Drizzle boundaries; controller
   tests use fakes via DI overrides; script tests snapshot/restore `process.env` if they mutate
   `DATABASE_URL` or export flags.

## Implementation Order

Vertical slice, layer by layer (each step ends green):

1. Domain value objects + entity + tests.
2. Port + Fake + fake test; add to barrels.
3. Use cases + tests.
4. Schema + enums + relations → generate & apply migration → Drizzle repo → repo unit + integration tests.
5. Rate-limit constant + zod schemas + controller + controller tests.
6. DI wiring in `lib/container/*`, including `types.ts`.
7. `Dialog` + `Textarea` primitives + Pattern Registry S-4 reuse/update + primitive tests.
8. UI: rating row + report dialog + hooks + imperative core; wire into `practice-view`, active
   session controller/view, quick-practice client, standalone question client, and post-exam review;
   component tests + browser specs.
9. Extraction: SQL appendix + `scripts/export-question-feedback.ts`.
10. Full quality gate, PR, CodeRabbit.

### Suggested PR breakdown (keep each reviewable)

- **PR 1 — Backend slice:** domain → port/fake → use cases → schema/migration → repo → controller →
  DI → all backend tests. Fully functional via tests; no UI yet.
- **PR 2 — UI primitives:** `components/ui/dialog.tsx`, `components/ui/textarea.tsx`, Pattern Registry
  S-4 reuse/update + primitive tests.
- **PR 3 — UI wiring:** rating row + report dialog + hooks + all active review-surface wiring +
  component & browser tests.
- **PR 4 — Extraction tooling:** export script + SQL docs.

## Edge Cases

- **Quick Practice** has no session → `practiceSessionId = null`.
- **Attempt id unavailable** client-side → `attemptId = null` (context is best-effort, not required).
- **Exam mode mid-block:** no explanation shown → no feedback controls; they appear in **session
  review** (post-submit), consistent with "post-answer only."
- **Rating retraction:** clicking the active thumb records a `rating` event with `rating = null`;
  hydration shows no selection.
- **Equal timestamps:** latest-rating hydration orders by `createdAt DESC, id DESC`, matching the
  attempt repository's deterministic tie-breaker pattern.
- **Double-click / retry:** idempotency key dedupes. Append-only does not make duplicate writes
  harmless; duplicates distort analytics even when latest-rating display still works.
- **Rating retraction as null:** `rating = null` is a deliberate append-only event, not "missing
  input"; it needs idempotency just like helpful/not-helpful clicks.
- **Empty/whitespace comment:** preprocess to `undefined`, then treat as absent; do not rely on
  `.trim().min(1).optional()`, because a present whitespace string trims to an empty string and fails
  `.min(1)`.
- **Comment > 2000 chars:** rejected at zod boundary and by DB CHECK (defense in depth).
- **Comment logging:** do not pass free-text comments to `reportClientError`, controller logs, or
  idempotency metadata; comments are persisted only in `question_feedback` and explicit raw exports.
- **Question later archived/deleted:** archived rows keep their FK (feedback persists); a true hard
  delete cascades (rare by policy).
- **User deleted (GDPR):** feedback cascades away with the user.

## Out of Scope (v1)

- Admin dashboard / in-app browsing of feedback (no role system yet — future spec).
- Aggregated quality scores surfaced to learners.
- **Pre-answer** "this question is broken" reporting (the "always available" timing option).
  Trade-off: it helps when a stem is visibly broken before answering, but it also adds an assessment-
  mode distraction and bypasses the richer explanation context that usually makes feedback actionable.
  Defer for v1; the append-only model already supports adding it later with no schema change.
- Editing or deleting submitted feedback.
- Notifications/email on new feedback.
- DEBT-337 explanation-panel enhancements (separate track).

## Related

- Archived **SPEC-014** (Review + Bookmarks) — the architectural template this mirrors.
- **SPEC-017** (Rate Limiting), **SPEC-016** (Observability) — reused infrastructure.
- **DEBT-337** (Future feedback & practice enhancements) — adjacent, separate.
- **DEBT-397** (datetime boundary normalization) — new controller adopts ISO-string boundary to avoid
  re-introducing the issue.
- `docs/frontend/standards.md`, `docs/frontend/pattern-registry.md` — design-system gates for the new
  `Dialog` primitive and the action-bar button.
