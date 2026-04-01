# Practice Engine: File Index

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Production directory map for practice-engine-related source files
> **Last Verified:** 2026-03-17

---

This index focuses on production files that define the practice engine. Most directories also contain colocated tests and browser specs; those are omitted here unless they clarify the module layout.

## Domain (`src/domain/`)

```text
entities/
  attempt.ts, bookmark.ts, choice.ts, practice-session.ts, question.ts,
  subscription.ts, tag.ts, user.ts, index.ts
value-objects/
  practice-mode.ts, question-difficulty.ts, question-progress-status.ts,
  question-status.ts, choice-label.ts, tag-kind.ts,
  subscription-plan.ts, subscription-status.ts, index.ts
services/
  entitlement.ts, grading.ts, question-selection.ts, session.ts,
  session-stats.ts, shuffle.ts, statistics.ts, index.ts
errors/
  domain-errors.ts, index.ts
test-helpers/
  factories.ts, index.ts
```

## Application (`src/application/`)

```text
ports/
  attempt-repository.ts, bookmark-repository.ts, practice-session-repository.ts,
  question-repository.ts, tag-repository.ts,
  clerk-event-repository.ts, deleted-clerk-user-repository.ts,
  idempotency-key-repository.ts, pending-stripe-cancellation-repository.ts,
  stripe-customer-repository.ts, stripe-event-repository.ts,
  subscription-repository.ts, user-repository.ts,
  billing.ts, bookmarks.ts, gateways.ts, logger.ts,
  repositories.ts, use-cases.ts, index.ts
use-cases/
  get-next-question.ts, submit-answer.ts,
  start-practice-session.ts, count-available-questions.ts,
  end-practice-session.ts, get-incomplete-practice-session.ts,
  get-practice-session-review.ts, set-practice-session-question-mark.ts,
  get-session-history.ts,
  toggle-bookmark.ts, get-bookmarks.ts,
  get-attempted-questions.ts, get-previous-attempt.ts, get-user-stats.ts,
  check-entitlement.ts, create-checkout-session.ts, create-portal-session.ts,
  index.ts
shared/
  enrich-with-question.ts, fetch-questions-by-id.ts, shuffled-choice-views.ts
test-helpers/
  create-next-question.ts, render-hook.tsx
  fakes/
    fake-attempt-repository.ts, fake-bookmark-repository.ts,
    fake-clerk-event-repository.ts, fake-deleted-clerk-user-repository.ts,
    fake-idempotency-key-repository.ts, fake-pending-stripe-cancellation-repository.ts,
    fake-practice-session-repository.ts, fake-question-repository.ts,
    fake-stripe-customer-repository.ts, fake-stripe-event-repository.ts,
    fake-subscription-repository.ts, fake-tag-repository.ts,
    fake-user-repository.ts, fake-logger.ts,
    fake-gateways.ts, fake-use-cases.ts, index.ts
errors/
  application-errors.ts
```

## Adapters (`src/adapters/`)

```text
controllers/
  question-controller.ts, question-view-controller.ts,
  practice-controller.ts, practice-schemas.ts,
  bookmark-controller.ts, review-controller.ts, stats-controller.ts,
  tag-controller.ts,
  create-action.ts, action-result.ts, require-entitled-user-id.ts,
  billing-controller.ts, clerk-webhook-controller.ts, stripe-webhook-controller.ts,
  index.ts
repositories/
  drizzle-question-repository.ts, drizzle-attempt-repository.ts,
  drizzle-practice-session-repository.ts, drizzle-bookmark-repository.ts,
  drizzle-tag-repository.ts,
  drizzle-user-repository.ts, drizzle-subscription-repository.ts,
  drizzle-idempotency-key-repository.ts,
  drizzle-clerk-event-repository.ts, drizzle-deleted-clerk-user-repository.ts,
  drizzle-stripe-customer-repository.ts, drizzle-stripe-event-repository.ts,
  drizzle-pending-stripe-cancellation-repository.ts,
  attempt-row-mappers.ts, practice-session-params.ts,
  practice-session-question-state-updater.ts,
  postgres-errors.ts, index.ts
  shared/
    latest-attempt-rank-sql.ts
```

## Frontend (`app/`)

```text
(app)/app/practice/
  page.tsx, loading.tsx, error.tsx
  practice-page-client.tsx, practice-page-logic.ts, practice-logic.ts,
  practice-page-types.ts,
  practice-page-session-start.ts, practice-page-tags.ts,
  practice-page-bookmarks.ts, practice-page-incomplete-session.ts,
  practice-page-available-count.ts,
  client-navigation.ts, fire-and-forget.ts
  hooks/
    use-practice-session-controls.ts
    use-practice-session-start.ts
    use-practice-available-questions-count.ts
    use-practice-session-tags.ts
    use-practice-incomplete-session.ts
    use-practice-question-flow.ts
    use-practice-question-answer-flow.ts
    use-practice-question-bookmarks.ts
    use-quick-practice-status-counts.ts
    bookmark-message-timeout.ts
  components/
    practice-view.tsx, practice-session-starter.tsx, incomplete-session-card.tsx, index.ts
  shared/
    question-flow-actions.ts, use-question-flow-core.ts
  quick/
    page.tsx, loading.tsx, error.tsx, quick-practice-client.tsx
  [sessionId]/
    page.tsx, loading.tsx, error.tsx
    practice-session-page-client.tsx, practice-session-page-logic.ts,
    practice-session-page-utils.ts, practice-session-toast.tsx
    hooks/
      use-practice-session-page-controller.ts
      use-practice-session-question-flow.ts
      use-practice-session-review-stage.ts
      use-practice-session-review-stage-state.ts
      use-practice-session-navigator.ts
      use-practice-session-summary-review.ts
      use-practice-session-mark-for-review.ts
    components/
      practice-session-page-view.tsx, session-summary-view.tsx, exam-review-view.tsx
(app)/app/history/
  page.tsx, loading.tsx, error.tsx,
  history-page-client.tsx, history-search-params.ts
  hooks/
    use-history-sessions.ts
  components/
    history-tab-bar.tsx, history-sessions-tab.tsx, history-questions-tab.tsx
(app)/app/questions/[slug]/
  page.tsx, loading.tsx, error.tsx,
  question-page-client.tsx, question-page-logic.ts, use-question-page-controller.ts
  components/
    review-question-navigator.tsx
(app)/app/shared/components/
  session-breakdown-list.tsx
```

## Shared UI Components (`components/`)

```text
components/question/
  question-card.tsx, choice-button.tsx, feedback.tsx
components/markdown/
  Markdown.tsx
components/
  error-card.tsx
```

## Content (`content/`)

```text
questions/
  placeholder/   (10 committed example/template MDX questions)
  imported/      (948 generated, gitignored MDX questions currently present locally)
  README.md
drafts/
  questions/     (gitignored draft source, consumed by pnpm content:import:drafts)
```

## Scripts

```text
scripts/
  seed.ts
  seed-helpers.ts
  import-draft-questions.ts
  draft-question-import.ts
  seed-all-environments.sh
  seed/
    file-reader.ts, placeholder-archiver.ts,
    question-parser.ts, question-syncer.ts, tag-manager.ts
```

Other repo utilities (for example shell helpers or repo-health scripts) are intentionally omitted here when they are not part of the practice/content runtime path.
