# SPEC-041: Question Feedback (Per-Question Ratings & Problem Reports)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Proposed
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

**Tier 1 — Rating (one click).** A lightweight `👍 / 👎` ("Was this helpful?") row inside the
review panel. Optimistic, instant, no modal. Captures broad sentiment on every question at scale.

**Tier 2 — Report a problem (modal).** A "Report a problem" button in the action bar (next to
Bookmark) opens a focused dialog: a required category (Incorrect answer · Ambiguous wording ·
Typo / formatting · Outdated reference · Other) plus an optional free-text comment. This is the
rich, actionable signal for content fixes.

Both tiers write to a single **append-only event-log table** (`question_feedback`), chosen because
the primary goal is a long-lived analytical substrate ("forever maintain and improve"): history is
signal, storage is trivial relative to attempts, and pure-insert is the simplest persistence shape.

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
| User-facing copy | "Was this helpful?", "Report a problem" |

## Relationship to Other Specs

- **Models the Bookmark slice (archived SPEC-014 "Review + Bookmarks")** — same architecture: port
  + fake + Drizzle repo + use case + `createAction` server action + DI wiring + optimistic hook.
- **SPEC-023 / SPEC-034 (Review Mode)** — feedback controls render only where the review panel is
  visible (tutor immediate review + session review). They never appear mid-exam (no explanation yet).
- **DEBT-337 (Future Feedback & Practice Session Enhancements)** — adjacent but separate; that item
  covers explanation-panel content/UX tweaks, not user-submitted feedback. No collision.
- **DEBT-397 (datetime boundary normalization)** — touches `practice-schemas.ts` only. This feature
  introduces a *new* controller (`question-feedback-controller.ts`); to avoid re-introducing the
  DEBT-397 problem, its boundary uses **ISO strings** for any datetime in/out from day one.

## Requirements

### Functional

1. In **review mode** (after an answer is committed and the explanation is visible), a learner can:
   1. Rate the question `helpful` / `not_helpful` with a single click (Tier 1).
   2. Re-click the active rating to **retract** it (back to no rating).
   3. Open a **Report a problem** modal and submit a **category** (required) + **comment** (optional).
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
2. **Rate limited:** per-user limit via the existing `RateLimiter` gateway and a new
   `QUESTION_FEEDBACK_RATE_LIMIT` constant.
3. **Clean Architecture:** domain stays pure (no vendor IDs, no DB imports); port in `application`,
   Drizzle impl in `adapters`; fakes over mocks in tests.
4. **Design system:** new `Dialog` primitive follows `docs/frontend/standards.md` (canonical focus
   ring, semantic tokens) and is registered in `docs/frontend/pattern-registry.md` before use. The
   "Report a problem" trigger uses `<Button variant="outline" className="rounded-full">` to match the
   Bookmark button.
5. **Validation:** zod at the boundary, `.strict()`, reusing `zUuid`; comment capped at 2000 chars
   (enforced in zod **and** a DB `CHECK` constraint, matching the `attempts` table idiom).
6. **Privacy:** `user_id` FK is `ON DELETE CASCADE` — deleting a user removes their feedback (GDPR).

## Design

Dependency direction (inward only): `db` ← `adapters` ← `application` ← `domain`.

### 1. Domain — value objects + entity (`src/domain/`)

Pure types, no imports. Mirror `src/domain/value-objects/` `const AllX = [...] as const` idiom.

```typescript
// src/domain/value-objects/question-feedback-rating.ts
export const AllQuestionFeedbackRatings = ['helpful', 'not_helpful'] as const;
export type QuestionFeedbackRating = (typeof AllQuestionFeedbackRatings)[number];

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

// src/domain/value-objects/question-feedback-kind.ts
export const AllQuestionFeedbackKinds = ['rating', 'report'] as const;
export type QuestionFeedbackKind = (typeof AllQuestionFeedbackKinds)[number];
```

```typescript
// src/domain/entities/question-feedback.ts
export type QuestionFeedback = {
  readonly id: string;
  readonly userId: string;
  readonly questionId: string;
  readonly attemptId: string | null;
  readonly practiceSessionId: string | null;
  readonly kind: QuestionFeedbackKind;
  readonly rating: QuestionFeedbackRating | null;   // set when kind='rating'; null = retraction
  readonly category: QuestionFeedbackCategory | null; // set when kind='report'
  readonly comment: string | null;
  readonly createdAt: Date;
};
```

**Invariant (enforced in use case + DB CHECK):** a `rating` event has `category = null`; a `report`
event has `category != null` and `rating = null`.

### 2. Application — port + use cases (`src/application/`)

```typescript
// src/application/ports/question-feedback-repository.ts
export type RecordQuestionFeedbackParams = {
  userId: string;
  questionId: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  kind: QuestionFeedbackKind;
  rating: QuestionFeedbackRating | null;
  category: QuestionFeedbackCategory | null;
  comment: string | null;
};

export interface QuestionFeedbackRepository {
  record(params: RecordQuestionFeedbackParams): Promise<QuestionFeedback>;
  /** Latest 'rating'-kind event for (user, question); null if none. Drives 👍/👎 hydration. */
  findLatestRatingByUser(
    userId: string,
    questionId: string,
  ): Promise<QuestionFeedback | null>;
}
```

Re-export via the `src/application/ports/repositories.ts` barrel (matches bookmark port).

**Three small use cases** (constructor injection, `execute()`, throw `ApplicationError`):

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
    await this.feedback.record({
      userId: input.userId,
      questionId: input.questionId,
      attemptId: input.attemptId,
      practiceSessionId: input.practiceSessionId,
      kind: 'rating',
      rating: input.rating,
      category: null,
      comment: null,
    });
    return { rating: input.rating };
  }
}
```

```typescript
// src/application/use-cases/get-question-rating.ts  (hydration)
export class GetQuestionRatingUseCase {
  constructor(private readonly feedback: QuestionFeedbackRepository) {}
  async execute(input: { userId: string; questionId: string }) {
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
    const saved = await this.feedback.record({
      ...input,
      kind: 'report',
      rating: null,
    });
    return { feedbackId: saved.id };
  }
}
```

**Fake** (`src/application/test-helpers/fakes/fake-question-feedback-repository.ts`): in-memory array
of events; `record()` pushes; `findLatestRatingByUser()` filters `kind==='rating'` and returns the
newest by `createdAt`. Add to the fakes barrel `index.ts`.

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
    questionCreatedAtIdx: index('question_feedback_question_created_at_idx').on(
      t.questionId,
      desc(t.createdAt),
    ),
    userQuestionCreatedAtIdx: index(
      'question_feedback_user_question_created_at_idx',
    ).on(t.userId, t.questionId, desc(t.createdAt)),
    kindCreatedAtIdx: index('question_feedback_kind_created_at_idx').on(
      t.kind,
      desc(t.createdAt),
    ),
    // Shape invariant: ratings carry no category; reports carry a category and no rating.
    kindShapeCheck: check(
      'question_feedback_kind_shape_chk',
      sql`(${t.kind} = 'rating' AND ${t.category} IS NULL)
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

Generate the migration (never `drizzle-kit push`):

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:generate
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:migrate
```

> **Question lifecycle note:** questions are **archived** (`question_status='archived'`), not hard-
> deleted, so the `ON DELETE CASCADE` on `question_id` rarely fires in practice and feedback persists.
> Keep "archive, don't delete" as content-ops policy so the analytical record stays intact.

#### 3b. Drizzle repo (`src/adapters/repositories/drizzle-question-feedback-repository.ts`)

Constructor-inject `DrizzleDb`. `record()` is a plain `insert(...).returning()` (no upsert —
append-only). `findLatestRatingByUser()` is `findFirst` filtered to `kind='rating'`, ordered
`desc(createdAt)`. Map rows → domain via a small `*-mappers.ts` if non-trivial. Throw
`ApplicationError('INTERNAL_ERROR', ...)` on a missing `returning()` row (bookmark pattern).

#### 3c. Rate limit (`src/adapters/shared/rate-limits.ts`)

```typescript
export const QUESTION_FEEDBACK_RATE_LIMIT = {
  limit: 30,
  windowMs: ONE_MINUTE_MS,
} as const;
```

#### 3d. zod schemas + controller (`src/adapters/controllers/question-feedback-controller.ts`)

`'use server'`. Three actions built with `createAction({ schema, getDeps, execute })`, each calling
`requireEntitledUserId`, then `rateLimiter.limit({ key: \`question-feedback:<action>:${userId}\`, ...QUESTION_FEEDBACK_RATE_LIMIT })`,
then the use case; writes wrapped in `executeIdempotent`. Reuse `zUuid`; add enum schemas:

```typescript
const zRating = z.enum(['helpful', 'not_helpful']);
const zCategory = z.enum([
  'incorrect_answer',
  'ambiguous_wording',
  'typo_formatting',
  'outdated_reference',
  'other',
]);

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
    comment: z.string().trim().min(1).max(2000).optional(),
    idempotencyKey: zUuid.optional(),
  })
  .strict();

const GetQuestionRatingInputSchema = z.object({ questionId: zUuid }).strict();
```

Actions: `rateQuestion`, `getQuestionRating`, `submitQuestionReport`.

#### 3e. DI wiring (`lib/container/*`)

- `repositories.ts`: `createQuestionFeedbackRepository: (db = primitives.db) => new DrizzleQuestionFeedbackRepository(db)`
- `use-cases.ts`: `createRateQuestionUseCase`, `createGetQuestionRatingUseCase`, `createSubmitQuestionReportUseCase`
- `controllers.ts`: `createQuestionFeedbackControllerDeps` (authGateway, logger, rateLimiter,
  idempotencyKeyRepository, checkEntitlementUseCase, the three use cases, `now`)

### 4. App / UI (`app/`, `components/`)

#### 4a. New design-system primitive — `components/ui/dialog.tsx`

Radix `@radix-ui/react-dialog` (already transitively present via `alert-dialog`/`select`). Model
the file on `components/ui/alert-dialog.tsx`: `Dialog`, `DialogTrigger`, `DialogContent`,
`DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`. Use semantic
tokens and the canonical focus ring. **Add a Pattern Registry entry** in
`docs/frontend/pattern-registry.md` (overlay/dialog pattern) with rationale before merging UI.

#### 4b. Tier 1 — rating row `components/question/question-feedback-rating.tsx`

Renders inside the review panel only (after `Feedback`). "Was this helpful?" + two `<Button>` icon
toggles (`ThumbsUp` / `ThumbsDown` from `lucide-react`), `aria-pressed`, disabled while saving.

#### 4c. Tier 2 — `components/question/question-report-dialog.tsx`

`Dialog` containing a radio group (the 5 categories via `<Button>`-based or native radio + `label`
pattern already used by `choice-button.tsx`), an optional `<textarea>` (capped, with live counter),
Cancel + "Submit feedback". On success show a toast via `useNotification()`.

#### 4d. Client hook — `app/(app)/app/shared/use-question-feedback.ts`

Mirror `use-question-page-bookmarks.ts`: hydrate current rating on entering review mode (call
`getQuestionRating`), expose `{ rating, feedbackStatus, onRate, isReportOpen, openReport, submitReport }`
with optimistic updates, mounted-checks, `withTimeout`, idempotency-key rotation, and error logging.
Factor the imperative core into `app/(app)/app/shared/question-feedback-actions.ts` (testable, like
`bookmark-toggle.ts`).

#### 4e. Wire into the action bar

In `app/(app)/app/practice/components/practice-view.tsx`, add a **"Report a problem"** `<Button>` to
the existing `secondaryGroup` (the `hasBooleanCorrectness(submitResult)` block, right next to
Bookmark), and render `<QuestionFeedbackRating>` after the `Feedback` panel in
`components/question/question-surface-body.tsx`. Thread new props
(`rating`, `feedbackStatus`, `onRate`, `onOpenReport`, …) from the client components
(`quick-practice-client.tsx`, `practice-page-client.tsx`) exactly as bookmark props are threaded,
using the `fireAndForget` pattern. Pass best-effort `attemptId`/`practiceSessionId` context from
`submitResult` / session state (null when unavailable, e.g. Quick Practice has no session).

### 5. Extraction (the "forever maintain & improve" requirement)

No admin UI in v1 (there is no role system yet — out of scope). Two extraction paths:

1. **Documented SQL** (add to this spec's appendix + `docs/dev/`): e.g. report counts by category,
   helpful-rate per question (latest-rating-per-user), top-reported questions, recent comments.
2. **Ops export script** `scripts/export-question-feedback.ts` — run locally with `DATABASE_URL`,
   dumps `question_feedback` (joined to question slug) to CSV/JSON. No public surface, no new auth.

Example "current helpful-rate per question" (latest rating per user wins):

```sql
WITH latest AS (
  SELECT DISTINCT ON (user_id, question_id)
         user_id, question_id, rating
  FROM question_feedback
  WHERE kind = 'rating'
  ORDER BY user_id, question_id, created_at DESC
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

1. **Domain** — value-object membership/validators (`*.test.ts`).
2. **Fake repo** — `record()` appends; `findLatestRatingByUser()` returns newest rating, ignores
   reports, returns null when none.
3. **Use cases** (fakes): `RateQuestion` (NOT_FOUND when question absent; records `rating` event;
   retraction records `rating=null`), `GetQuestionRating` (latest wins; null when none),
   `SubmitQuestionReport` (NOT_FOUND; records `report` event; returns id).
4. **Drizzle repo** — unit (mocked db chain) + **integration** (`tests/integration/*.integration.test.ts`):
   real append, latest-rating query, and the `kind_shape` / `comment_len` CHECK constraints reject
   bad rows.
5. **Controller** (fakes via DI overrides): validation error, unauthenticated, unsubscribed,
   rate-limited, success, idempotency replay (no double-write).
6. **UI** — `renderToStaticMarkup` component tests (`*.test.tsx`) for the rating row + dialog markup;
   **browser specs** (`*.browser.spec.tsx`, `pnpm test:browser`) for the hook (hydrate, optimistic
   rate, retract) and dialog submit flow.
7. **E2E (optional)** — open report dialog in review mode, submit, assert toast + DB row.

## Implementation Order

Vertical slice, layer by layer (each step ends green):

1. Domain value objects + entity + tests.
2. Port + Fake + fake test; add to barrels.
3. Use cases + tests.
4. Schema + enums + relations → generate & apply migration → Drizzle repo → repo unit + integration tests.
5. Rate-limit constant + zod schemas + controller + controller tests.
6. DI wiring in `lib/container/*`.
7. `Dialog` primitive + Pattern Registry entry + primitive test.
8. UI: rating row + report dialog + hook + imperative core; wire into `practice-view` + clients;
   component tests + browser specs.
9. Extraction: SQL appendix + `scripts/export-question-feedback.ts`.
10. Full quality gate, PR, CodeRabbit.

### Suggested PR breakdown (keep each reviewable)

- **PR 1 — Backend slice:** domain → port/fake → use cases → schema/migration → repo → controller →
  DI → all backend tests. Fully functional via tests; no UI yet.
- **PR 2 — `Dialog` primitive:** `components/ui/dialog.tsx` + Pattern Registry entry + tests.
- **PR 3 — UI wiring:** rating row + report dialog + hook + `practice-view`/client wiring + component
  & browser tests.
- **PR 4 — Extraction tooling:** export script + SQL docs.

## Edge Cases

- **Quick Practice** has no session → `practiceSessionId = null`.
- **Attempt id unavailable** client-side → `attemptId = null` (context is best-effort, not required).
- **Exam mode mid-block:** no explanation shown → no feedback controls; they appear in **session
  review** (post-submit), consistent with "post-answer only."
- **Rating retraction:** clicking the active thumb records a `rating` event with `rating = null`;
  hydration shows no selection.
- **Double-click / retry:** idempotency key dedupes; append-only means even a slip is harmless.
- **Empty/whitespace comment:** zod `.trim().min(1)` → treated as absent (optional), not an error.
- **Comment > 2000 chars:** rejected at zod boundary and by DB CHECK (defense in depth).
- **Question later archived/deleted:** archived rows keep their FK (feedback persists); a true hard
  delete cascades (rare by policy).
- **User deleted (GDPR):** feedback cascades away with the user.

## Out of Scope (v1)

- Admin dashboard / in-app browsing of feedback (no role system yet — future spec).
- Aggregated quality scores surfaced to learners.
- **Pre-answer** "this question is broken" reporting (the "always available" timing option). Deferred;
  the append-only model already supports adding it later with no schema change.
- Editing or deleting submitted feedback.
- Notifications/email on new feedback.
- DEBT-337 explanation-panel enhancements (separate track).

## Related

- Archived **SPEC-014** (Review + Bookmarks) — the architectural template this mirrors.
- **SPEC-017** (Rate Limiting), **SPEC-016** (Observability) — reused infrastructure.
- **DEBT-337** (Future Feedback & Practice Session Enhancements) — adjacent, separate.
- **DEBT-397** (datetime boundary normalization) — new controller adopts ISO-string boundary to avoid
  re-introducing the issue.
- `docs/frontend/standards.md`, `docs/frontend/pattern-registry.md` — design-system gates for the new
  `Dialog` primitive and the action-bar button.
