# BUG-266: New choice FKs break content sync (`pnpm db:seed`) for practice-session state references

**Status:** Resolved
**Priority:** P1
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Resolved:** 2026-07-01
**Scope:** Branch-local pre-merge defect in PR #537; fixed and verified before the Track A implementation shipped.

---

## Description

`db/migrations/0021_flaky_domino.sql` / `0022_confused_mandrill.sql` add `ON DELETE RESTRICT` FKs from `practice_session_question_states.latest_selected_choice_id` and `.draft_selected_choice_id` to choices, ending as composite references to `choices(id, question_id)`. `scripts/seed/question-syncer.ts`'s existing choice-deletion safety check only queried `attempts.selectedChoiceId` to decide which stale choices were "referenced" and must not be deleted. It had no knowledge of the new table, so it did not protect against normalized-state-only choice references.

The common reachable case was an in-progress exam draft (`draft_selected_choice_id`) before any attempt row exists. `latest_selected_choice_id` has the same FK class and was also missed when a latest-state row existed without a corresponding attempt reference.

## Root Cause

The normalized question-state table/FKs were added in PR #537 without updating the cross-cutting choice-deletion safety check that already existed for `attempts`.

## Resolution

Fixed on `chore/legacy-audit` before PR #537 merged. The seed syncer now treats normalized practice-session state as part of the same deletion safety invariant that already protected `attempts`:

- `scripts/seed-helpers.ts` adds `computeReferencedChoiceIds(...)`, a pure merge of `attempts.selectedChoiceId`, `practice_session_question_states.latest_selected_choice_id`, and `practice_session_question_states.draft_selected_choice_id`.
- `scripts/seed/question-syncer.ts` still computes delete candidates by stale choice label, then queries both `attempts` and `practice_session_question_states` for those candidate IDs before calling `computeChoiceSyncPlan(...)`.
- The guard message now says the stale choice is referenced by "an attempt or practice session state", which matches the actual FK scope. The query intentionally checks all normalized state rows, not only active sessions, because completed practice-session history also keeps restrictive choice references.

## Verification

- [x] `scripts/seed-helpers.test.ts` covers merging attempt rows plus latest/draft normalized state rows.
- [x] `tests/integration/bug-regression-seed-choice-sync.integration.test.ts` creates a real session whose draft state references a stale choice, runs `syncQuestionsFromFiles(...)`, and verifies the clean guard message is thrown before Postgres can surface a raw `23503` FK violation.
- [x] Focused runs: `pnpm test --run scripts/seed-helpers.test.ts lib/container.test.ts`; `pnpm test:integration --run tests/integration/bug-regression-seed-choice-sync.integration.test.ts tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts tests/integration/exam-timer.integration.test.ts`.

## Related

- PR #537, [DEBT-425](../../debt/debt-425-legacy-compatibility-tolerances-audit.md)
- `scripts/seed/question-syncer.ts`
- `scripts/seed-helpers.ts`
- `db/migrations/0022_confused_mandrill.sql`
