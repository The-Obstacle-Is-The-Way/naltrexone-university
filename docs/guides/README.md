# Guides

How to do a task: procedures, and the references they rely on. The rules an agent obeys on every edit are in [`AGENTS.md`](../../AGENTS.md) and `.claude/rules/`.

## Testing

- [E2E tests](./testing/e2e-tests.md): the Playwright suite, its environment and the hosted Stripe lane.
- [Integration tests](./testing/integration-tests.md): the local test database and the integration lane.
- [React component tests](./testing/react-component-tests.md): `renderToStaticMarkup` tests and Browser Mode specs.
- [Browser automation](./testing/browser-automation.md): checking pages behind Clerk sign-in with `agent-browser`.
- [Fake contracts](./testing/fake-contracts.md): the maintained fakes, their contract tests and known divergences.
- [CRAP report](./testing/crap-report.md) and [mutation testing](./testing/mutation-testing.md): the observational quality reports.

## Release

- [Review and merge](./release/review-and-merge.md): the merge guard, carried approvals and CodeRabbit.
- [Promote to production](./release/promote-to-production.md): promotions, the release gate and the deploy.

## Database

- [Migrations](./database/migrations.md): writing and applying migrations safely.
- [Query plan capture](./database/query-plan-capture.md): a sanitized `EXPLAIN` for a hot path.
- [Bookmark census](./database/bookmark-census.md): the monthly read-only bookmark cardinality check.

## Operations and Dependencies

- [Database recovery](./operations/database-recovery.md): rolling back a migration.
- [Requeue a renewal notice](./operations/requeue-renewal-notice.md): sending a quarantined renewal notice again.
- [Updating dependencies](./dependencies/updating-dependencies.md): the dependency update protocol.

## Content and QA

- [Feedback export](./content/feedback-export.md): exporting question feedback for review.
- [Legacy question format](./content/legacy-question-format.md): the previous authoring format, kept for reference.
- [UI QA procedures](./qa/README.md): scripted manual checks that automation does not cover.
