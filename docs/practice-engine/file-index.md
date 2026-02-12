# Practice Engine: File Index

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Directory listings for all practice-engine-related source files
> **Last Verified:** 2026-02-09

---

## Domain (`src/domain/`)

```
entities/
  question.ts, choice.ts, attempt.ts, practice-session.ts, bookmark.ts, tag.ts, user.ts, subscription.ts, index.ts
value-objects/
  practice-mode.ts, question-difficulty.ts, question-status.ts, choice-label.ts, tag-kind.ts,
  subscription-plan.ts, subscription-status.ts, index.ts
  (each with colocated .test.ts)
services/
  grading.ts, entitlement.ts, session.ts, statistics.ts, shuffle.ts, question-selection.ts, index.ts
  (each with colocated .test.ts)
errors/
  domain-errors.ts, index.ts (with .test.ts)
test-helpers/
  factories.ts, index.ts
```

## Application (`src/application/`)

```
ports/
  question-repository.ts, attempt-repository.ts, practice-session-repository.ts,
  bookmark-repository.ts, tag-repository.ts, logger.ts, gateways.ts,
  subscription-repository.ts, stripe-customer-repository.ts, stripe-event-repository.ts,
  idempotency-key-repository.ts, user-repository.ts, use-cases.ts, billing.ts, bookmarks.ts
use-cases/
  get-next-question.ts, submit-answer.ts, start-practice-session.ts, end-practice-session.ts,
  get-incomplete-practice-session.ts, get-practice-session-review.ts,
  set-practice-session-question-mark.ts, get-session-history.ts,
  toggle-bookmark.ts, get-bookmarks.ts, get-missed-questions.ts, get-user-stats.ts,
  check-entitlement.ts, create-checkout-session.ts, create-portal-session.ts
  (each with colocated .test.ts)
errors/
  application-errors.ts
test-helpers/
  fakes/ (fake-logger.ts, fake-repositories.ts, fake-gateways.ts, fake-use-cases.ts, index.ts)
```

## Adapters (`src/adapters/`)

```
repositories/
  drizzle-question-repository.ts, drizzle-attempt-repository.ts,
  drizzle-practice-session-repository.ts, drizzle-bookmark-repository.ts,
  drizzle-tag-repository.ts, ...
  (each with colocated .test.ts)
controllers/
  question-controller.ts, practice-controller.ts, bookmark-controller.ts,
  tag-controller.ts, review-controller.ts, stats-controller.ts,
  create-action.ts, action-result.ts, require-entitled-user-id.ts, ...
```

## Frontend (`app/`)

```
(app)/app/practice/
  page.tsx, loading.tsx, error.tsx
  hooks/ (8 hook files)
  components/ (practice-view.tsx, practice-session-starter.tsx, incomplete-session-card.tsx, practice-session-history-panel.tsx)
  shared/ (question-flow-actions.ts, load-state.ts)
  quick/
    page.tsx, loading.tsx, error.tsx, quick-practice-client.tsx
  [sessionId]/
    page.tsx, loading.tsx
    hooks/ (6 hook files)
    components/ (practice-session-page-view.tsx, session-summary-view.tsx, exam-review-view.tsx, practice-session-page-client.tsx)
(app)/app/dashboard/page.tsx
(app)/app/review/page.tsx
(app)/app/bookmarks/page.tsx
(app)/app/questions/[slug]/ (question-page-client.tsx)
```

## Content (`content/`)

```
questions/
  placeholder/   (10 committed example questions)
  imported/      (948 gitignored questions from various sources)
  README.md      (format documentation)
drafts/
  questions/     (gitignored draft format, converted via pnpm content:import:drafts)
```

## Scripts

```
scripts/
  seed.ts              (pnpm db:seed — MDX → database)
  seed-helpers.ts      (choice explanation parsing, sync planning)
  import-draft-questions.ts  (pnpm content:import:drafts — draft → MDX)
```
