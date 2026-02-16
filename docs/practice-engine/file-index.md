# Practice Engine: File Index

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Directory listings for all practice-engine-related source files
> **Last Verified:** 2026-02-16

---

## Domain (`src/domain/`)

```
entities/
  question.ts, choice.ts, attempt.ts, practice-session.ts, bookmark.ts, tag.ts, user.ts, subscription.ts, index.ts
value-objects/
  practice-mode.ts, question-difficulty.ts, question-status.ts, question-progress-status.ts,
  choice-label.ts, tag-kind.ts, subscription-plan.ts, subscription-status.ts, index.ts
  (each with colocated .test.ts)
services/
  grading.ts, entitlement.ts, session.ts, session-stats.ts, statistics.ts, shuffle.ts, question-selection.ts, index.ts
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
  bookmark-repository.ts, tag-repository.ts, logger.ts, gateways.ts, repositories.ts,
  subscription-repository.ts, stripe-customer-repository.ts, stripe-event-repository.ts,
  idempotency-key-repository.ts, user-repository.ts, use-cases.ts, billing.ts, bookmarks.ts, index.ts
use-cases/
  get-next-question.ts, submit-answer.ts, start-practice-session.ts, end-practice-session.ts,
  get-incomplete-practice-session.ts, get-practice-session-review.ts,
  set-practice-session-question-mark.ts, get-session-history.ts,
  toggle-bookmark.ts, get-bookmarks.ts, get-attempted-questions.ts, get-previous-attempt.ts, get-user-stats.ts,
  count-available-questions.ts, check-entitlement.ts, create-checkout-session.ts, create-portal-session.ts
  (each with colocated .test.ts)
errors/
  application-errors.ts
test-helpers/
  create-next-question.ts
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
  question-view-controller.ts, tag-controller.ts, review-controller.ts, stats-controller.ts,
  create-action.ts, action-result.ts, require-entitled-user-id.ts, ...
```

## Frontend (`app/`)

```
(app)/app/practice/
  page.tsx, loading.tsx, error.tsx
  practice-page-client.tsx, practice-page-logic.ts, practice-page-types.ts,
  practice-page-session-start.ts, practice-page-tags.ts, practice-page-bookmarks.ts,
  practice-page-incomplete-session.ts, client-navigation.ts, fire-and-forget.ts
  hooks/ (session starter + filters + ad-hoc question flow + bookmarks + utilities)
  components/ (practice-view.tsx, practice-session-starter.tsx, incomplete-session-card.tsx)
  shared/ (question-flow-actions.ts, use-question-flow-core.ts)
  quick/
    page.tsx, loading.tsx, error.tsx, quick-practice-client.tsx
  [sessionId]/
    page.tsx, loading.tsx, error.tsx
    practice-session-page-client.tsx, practice-session-page-logic.ts, practice-session-page-utils.ts
    hooks/ (page controller + question flow + review stage + navigator + mark-for-review + summary review)
    components/ (practice-session-page-view.tsx, session-summary-view.tsx, exam-review-view.tsx)
(app)/app/history/
  page.tsx, loading.tsx, error.tsx, history-page-client.tsx, history-search-params.ts
  hooks/ (use-history-sessions.ts)
  components/ (history-tab-bar.tsx, history-sessions-tab.tsx, history-questions-tab.tsx)
(app)/app/dashboard/page.tsx
(app)/app/bookmarks/page.tsx
(app)/app/questions/[slug]/ (page.tsx, loading.tsx, error.tsx, question-page-client.tsx, use-question-page-controller.ts, question-page-logic.ts)
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
  draft-question-import.ts   (draft parsing + MDX conversion helpers used by importer)
  migrate-domain-tags.ts     (one-off tag migration helper)
```
