# DEBT-425: Legacy Compatibility Tolerances Audit and Hardening Plan

**Status:** Implemented in PR #537; post-deploy proof pending
**Priority:** P3
**Created:** 2026-06-29
**Owner:** Engineering
**Related:** [BUG-188](../_archive/bugs/bug-188-legacy-session-cas-json-shape-mismatch-breaks-updates.md), [BUG-238](../_archive/bugs/bug-238-active-exam-draft-cumulative-ms-unbounded.md), [DEBT-180](../_archive/debt/debt-180-duplicated-manage-billing-files.md), [DEBT-321](../_archive/debt/debt-321-bs055-exam-interaction-model-overhaul.md), [DEBT-421](../_archive/debt/debt-421-light-mode-force-dark-vs-default-dark.md), [DEBT-385](../_archive/debt/debt-385-stripe-invoice-event-subscription-ref-schema-drift.md), [Debt Index](./index.md)

**Independent review findings (2026-06-30):** an 8-angle review pass over the full Track A diff, followed by an independent adversarial second-opinion pass, surfaced 3 candidate correctness defects and 4 architecture/process/cleanup items in the unmerged implementation. One ([BUG-265](../_archive/bugs/bug-265-practice-session-question-states-checks-weaker-than-schema.md)) was found already self-resolved by later commits on this same branch. Two are confirmed and must be fixed before this PR merges: [BUG-266](../bugs/bug-266-practice-session-question-states-fk-breaks-content-sync.md) (new choice FKs break `pnpm db:seed` for in-progress sessions) and [BUG-267](../bugs/bug-267-nested-repeatable-read-silently-drops-isolation.md) (nested transaction silently drops its isolation level, reopening a torn-read race in exam finalization). The remaining four ([DEBT-426](./debt-426-session-wide-lock-defeats-row-concurrency.md)..[429](./debt-429-duplicated-question-state-mapper-and-test-helpers.md)) are tracked as follow-up debt, not merge blockers.

---

## Context

This audit re-verified legacy and backward-compatibility paths that are easy to misread as dead code. The rule is "prove, then delete": keep compatibility where it protects real data or external API variance, and only remove tolerance after a backfill plus an enforced invariant make the legacy shape unrepresentable.

Track A was chosen and executed in PR #537. Mutable per-question practice-session state now lives in `practice_session_question_states`; `practice_sessions.params_json` carries only immutable selection metadata (`count`, filters, ordered `questionIds`). The domain `PracticeSession` shape and application repository port stayed unchanged.

---

## Findings / Evidence

### 1. Practice-session params JSON tolerances

Implementation verified on 2026-06-29:

- `db/schema.ts` defines `PracticeSessionParams` as immutable metadata only and adds `practice_session_question_states` with required scalar columns, unique `(practice_session_id, question_id)`, unique `(practice_session_id, position)`, `CHECK (draft_cumulative_ms BETWEEN 0 AND 86400000)`, non-negative `position`, non-negative `version`, same-question selected-choice FKs, latest-answer consistency checks, draft-save consistency checks, a cascading practice-session FK, a non-cascading question FK, and restrictive choice FKs.
- `db/migrations/0021_flaky_domino.sql` creates the table and runs the marked DEBT-425 idempotent backfill. It inserts one row per `params_json.questionIds` entry, defaults missing legacy state fields, and clamps oversized legacy `draftCumulativeMs` before the CHECK can reject it.
- `db/migrations/0022_confused_mandrill.sql` hardens the normalized model by enforcing that `latest_selected_choice_id` and `draft_selected_choice_id` belong to the same `question_id` as the state row, with a pre-constraint cleanup for impossible legacy/dev rows.
- `db/migrations/0023_soft_blue_marvel.sql` adds DB-level consistency checks for latest-answer metadata and selected draft saves while deliberately preserving valid omitted answers and time-only drafts; `db/migrations/0024_needy_jimmy_woo.sql` tightens those checks so omitted finalized answers cannot be marked correct and positive draft time always has a draft save timestamp.
- `src/adapters/repositories/practice-session-params.ts` no longer parses or serializes mutable question state. It ignores stale `questionStates` keys in old blobs but does not use them.
- `src/adapters/repositories/drizzle-practice-session-repository.ts` creates session rows and state rows in one transaction, loads state rows ordered by `position`, and maps them back into the unchanged domain `PracticeSession`.
- `src/adapters/repositories/practice-session-question-state-updater.ts` now performs row-level optimistic updates guarded by `id`, `version`, and an active owning session check. The BUG-188 raw-blob CAS path is gone.
- `src/application/use-cases/start-practice-session.ts` no longer writes `questionStates` into `paramsJson`.
- `src/application/use-cases/finalize-exam-answers.ts` still clamps draft cumulative time when projecting session state to `timeSpentSeconds` and when merging the final flush with an existing draft. Track A retires the legacy JSON persistence reason for that cap in the Drizzle read path because normalized rows are backfilled/clamped and bounded by the state-table CHECK; the remaining clamp is application-level port/fake-safety normalization.

Data proof, read-only queries against `.env.local`, Vercel Development, and Vercel Production on 2026-06-29:

| Target | Total sessions | Missing `questionStates` | Active missing `questionStates` | Missing draft-field states | Sessions with missing draft fields | Active sessions with missing draft fields | Oversized `draftCumulativeMs` states |
|---|---:|---:|---:|---:|---:|---:|---:|
| `.env.local` / Vercel Development | 124 | 1 | 0 | 600 | 66 | 1 | 0 |
| Vercel Production | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Development detail:

- The single row missing `questionStates` is an ended tutor session from `2026-01-01T00:00:00.000Z`.
- Missing draft-field sessions span `2026-02-06T23:48:09.452Z` through `2026-03-17T14:21:46.420Z`.
- The one active missing-draft-field session is tutor mode, started `2026-02-11T03:41:59.394Z`.
- No non-numeric `draftCumulativeMs` values were found.

Git archaeology:

| Commit | Date | Milestone |
|---|---|---|
| `fd6749ac` | 2026-02-06 | Introduced `questionStates` creation for practice sessions. |
| `1ade1bae` | 2026-03-02 | Fixed BUG-188 by switching CAS comparison to raw persisted JSON. |
| `985dc47d` | 2026-03-18 | Introduced the exam draft fields. |
| `c74bd7c7` | 2026-04-25 | Introduced the BUG-238 draft cumulative-ms bound. |

Decision:

- **IMPLEMENTED:** optional blob `questionStates` and optional blob draft fields were retired by Track A normalization. Oversized persisted JSON values are clamped during migration and new Drizzle-persisted state is bounded by the relational CHECK; finalization keeps a defensive application clamp for port/fake-backed session state.
- **RETIRED:** BUG-188 raw-snapshot CAS. It was correct while mutable state lived in JSON, but Track A removes the blob-write bug class by moving concurrency to per-state-row `version` checks.

### 2. Oversized draft timing cap

Current code verified after Track A:

- `src/application/use-cases/save-exam-draft-answer.ts:20-21` defines `SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS` from the submit-answer seconds bound.
- `src/adapters/controllers/practice-schemas.ts:76-82` rejects oversized controller input.
- `src/application/use-cases/save-exam-draft-answer.ts:81-88` clamps non-controller callers.
- `db/schema.ts` enforces persisted `draft_cumulative_ms` with a scalar CHECK.
- `db/migrations/0021_flaky_domino.sql` clamps oversized legacy JSON values during backfill.
- `src/application/use-cases/finalize-exam-answers.ts:79-82`, `:189-191`, and `:323-326` retain an application clamp before converting persisted or fake-backed draft state into `timeSpentSeconds` and before merging a final flush with existing draft time.
- `tests/integration/practice-session-question-state-normalization.integration.test.ts` proves the backfill clamp and state-table CHECK.

Original data proof found zero oversized persisted JSON values in Development and Production. Track A now enforces the persisted bound relationally.

Decision: **IMPLEMENTED.** Track A removed the legacy JSON persistence exposure by clamping existing values during backfill and enforcing the bound relationally for new Drizzle writes. The finalization use case deliberately keeps its clamp because the repository port and fakes can still supply domain-shaped session state outside the database CHECK boundary.

### 3. Stripe subscription reference fallback

Current code verified:

- `src/adapters/gateways/stripe/stripe-webhook-schemas.ts:53-71` prefers the Clover invoice nested reference at `parent.subscription_details.subscription`, then falls back to root `subscription`.
- `src/adapters/gateways/stripe/stripe-webhook-schemas.test.ts:24-41` covers nested Clover invoices and legacy root checkout/session payloads.
- `src/adapters/gateways/stripe/stripe-webhook-processor.test.ts:302-338` proves nested references win when both nested and root values exist.
- `6157bb1b` on 2026-05-20 introduced this as the DEBT-385 Clover invoice extraction fix.

Decision: **KEEP-AREA.** This is essential external API compatibility. Do not remove the root fallback unless Stripe and all app-consumed event types are proven never to use it.

### 4. NODE_ENV and deployment-environment guards

Current code verified:

- `lib/db.ts:15-23` uses `globalThis` pooling only outside production, which is standard Next.js HMR behavior.
- `lib/report-client-error.ts:54-68` emits development-only console diagnostics while keeping telemetry best-effort.
- `lib/request-ip.ts:1-14` trusts Vercel's forwarded header in all environments and only accepts `x-forwarded-for` / `x-real-ip` fallback outside production.
- `app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts:158-169` logs a development-only normalization warning.
- `lib/env.ts:100-118` documents why production runtime detection must use `VERCEL_ENV`, not `NODE_ENV`, for deploy-environment semantics.

Decision: **KEEP-AREA.** These are environment policy guards, not legacy compatibility tolerances.

### 5. Dormant light-mode infrastructure and design-system scanner seams

Current code verified:

- `app/layout.tsx:38-49` and `app/layout.tsx:92-99` force dark mode while explicitly preserving dormant light-mode assets.
- `components/providers.tsx:50-61` uses `forcedTheme ?? resolvedTheme` so stale `theme: light` storage cannot select Clerk's light appearance on a dark page.
- `components/theme-provider.tsx:15-17` conditionally spreads `nonce` for `exactOptionalPropertyTypes`.
- `components/marketing/marketing-layout.tsx:141` and `app/(app)/app/layout.tsx:97` keep the ThemeToggle unmounted with DEBT-421 breadcrumbs.
- `components/theme-token-regression-source-scan.ts:87` exposes an empty `TEMPORARY_OPACITY_EXEMPTIONS` seam consumed by the scanner.

Decision: **KEEP-AREA.** DEBT-421 already decided this as a reversible kill switch. Do not delete dormant light-mode code or scanner extension seams during legacy cleanup.

### 6. Test-only legacy guards

Current code verified:

- `src/adapters/controllers/question-controller.test.ts:223-240` rejects legacy `marked` status values.
- `src/application/test-helpers/fakes/fake-attempt-repository.test.ts:139-147` preserves fake-repository fidelity for legacy exam-shaped seeds.
- `src/application/test-helpers/fakes/fake-practice-session-repository.test.ts:12-44` and `:146-180` normalize missing draft fields in fake-backed legacy session shapes.
- `src/adapters/controllers/clerk-webhook-controller.test.ts` keeps tombstone/replay/race regression guards around Clerk webhook lifecycle behavior.

Decision: **KEEP-AREA.** These are regression sentinels and fake-fidelity tests. Do not delete them as part of production legacy cleanup.

### 7. Manage-billing route wrapper duplication

Current code verified:

- `lib/manage-billing/manage-billing-core.ts:20-55` already holds shared portal orchestration.
- `app/(app)/app/billing/manage-billing-action.ts:15-21` and `app/pricing/manage-billing-action.ts:15-21` differ only by the route-specific failure redirect.
- `app/(app)/app/billing/manage-billing-actions.ts:1-46` and `app/pricing/manage-billing-actions.ts:1-46` differ only by which route wrapper they import.
- `lib/manage-billing/manage-billing-core.test.ts:21-193` already covers the shared behavior and route-specific redirect mapping.

Decision: **CLEAN-UP-DEFERRED.** This is accidental outer-layer duplication, but the blast radius is small and unrelated to legacy data hardening. Clean it only in a narrow follow-up if touching billing route actions anyway.

---

## Plan / DoD

### Practice-session params hardening

Current source of truth: `docs/specs/master_spec.md` and `db/schema.ts` now define `practice_sessions.params_json` as immutable session selection metadata and `practice_session_question_states` as the mutable per-question state store.

ROI framing: Production had zero practice sessions at execution time, so PR #537 used a one-shot atomic cutover rather than a multi-phase expand/contract rollout. The migration still backfills non-production legacy rows idempotently.

#### Track A: preferred model normalization — CHOSEN AND EXECUTED

Implemented by `db/migrations/0021_flaky_domino.sql` and hardened by `db/migrations/0022_confused_mandrill.sql`, `db/migrations/0023_soft_blue_marvel.sql`, and `db/migrations/0024_needy_jimmy_woo.sql`.

1. Characterization/new-contract tests were added or updated:
   - `src/application/use-cases/start-practice-session.test.ts` proves `paramsJson` no longer includes `questionStates`.
   - `src/adapters/repositories/practice-session-params.test.ts` proves stale blob `questionStates` are ignored and serialization emits immutable metadata only.
   - `tests/integration/practice-session-question-state-normalization.integration.test.ts` proves idempotent backfill, immutable `params_json`, relational create rows, row-version stale-write rejection, independent concurrent updates, and the draft-ms CHECK.
   - `tests/integration/bug-regression-historical.integration.test.ts` now proves migrated legacy JSON rows remain updatable through relational state.
   - `tests/e2e/helpers/reset-e2e-user-state.test.ts` proves deterministic E2E baseline seeders create normalized state rows, so fixture inserts cannot bypass the new invariant.
2. Added `practice_session_question_states` with scalar, constrained columns:
   - `practice_session_id` FK;
   - `question_id` FK;
   - `position` as the 0-based ordered-session index;
   - `marked_for_review`, `latest_selected_choice_id`, `latest_is_correct`, `latest_answered_at`;
   - `draft_selected_choice_id`, `draft_saved_at`, `draft_cumulative_ms`;
   - `version` as the row-level optimistic concurrency token.
3. Enforced invariants with normal relational constraints:
   - `NOT NULL` on required state columns;
   - `CHECK (draft_cumulative_ms BETWEEN 0 AND 86400000)`;
   - latest-answer consistency checks that allow omitted finalized answers (`latest_selected_choice_id IS NULL`, `latest_is_correct = false`, `latest_answered_at IS NOT NULL`) while rejecting partial answered-choice metadata and impossible omitted-correct state;
   - selected-draft consistency checks that allow time-only drafts (`draft_selected_choice_id IS NULL`, `draft_saved_at IS NOT NULL`) while rejecting selected draft choices or positive draft time without a save timestamp;
   - unique constraints on `(practice_session_id, question_id)` and `(practice_session_id, position)`.
4. Backfilled one state row per existing `params_json.questionIds` entry, using legacy parser defaults for missing state and clamping oversized `draftCumulativeMs`.
5. Moved repository reads to load state rows and map them back into the unchanged domain `PracticeSession`.
6. Replaced blob CAS with row-level updates guarded by the state row concurrency token and an active-session ownership check.
7. Stopped persisting mutable `questionStates` in `params_json`; existing stale blob keys are ignored.
8. Removed legacy JSON parser defaults and the BUG-188 raw-blob CAS machinery.

Acceptance criteria for Track A:

- [x] Session state invariants are enforced by scalar columns and relational constraints.
- [x] Repository ports and domain entities remain persistence-ignorant.
- [x] Ordered session review still preserves original question order.
- [x] Concurrent draft/mark/answer updates cannot clobber each other.
- [x] Legacy JSON tolerance tests are replaced by migration/backfill tests and current relational invariant tests.
- [x] Full quality gate passes before push.
- [ ] Development and Production post-migration data proof recorded after deployment.

Post-migration proof obligation for Track A:

The old audit queries that count `params_json ? 'questionStates'` are historical only. After Track A, `params_json.questionStates` is deliberately absent on new writes, so the live proof must verify relational coverage instead:

```sql
-- Sessions with any missing, surplus, or mispositioned normalized state row.
WITH expected AS (
  SELECT
    ps.id AS practice_session_id,
    expected_question.question_id,
    (expected_question.position - 1)::integer AS position
  FROM practice_sessions ps
  CROSS JOIN LATERAL jsonb_array_elements_text(
    coalesce(ps.params_json -> 'questionIds', '[]'::jsonb)
  ) WITH ORDINALITY AS expected_question(question_id, position)
),
state_rows AS (
  SELECT
    practice_session_id,
    question_id::text AS question_id,
    position
  FROM practice_session_question_states
),
mismatches AS (
  SELECT expected.practice_session_id
  FROM expected
  LEFT JOIN state_rows state
    ON state.practice_session_id = expected.practice_session_id
   AND state.question_id = expected.question_id
   AND state.position = expected.position
  WHERE state.practice_session_id IS NULL

  UNION ALL

  SELECT state.practice_session_id
  FROM state_rows state
  LEFT JOIN expected
    ON expected.practice_session_id = state.practice_session_id
   AND expected.question_id = state.question_id
   AND expected.position = state.position
  WHERE expected.practice_session_id IS NULL
)
SELECT count(*)
FROM mismatches;

-- Selected choices that do not belong to the state row's question; should be impossible by composite FKs.
SELECT count(*)
FROM practice_session_question_states state
LEFT JOIN choices latest_choice
  ON latest_choice.id = state.latest_selected_choice_id
 AND latest_choice.question_id = state.question_id
LEFT JOIN choices draft_choice
  ON draft_choice.id = state.draft_selected_choice_id
 AND draft_choice.question_id = state.question_id
WHERE (state.latest_selected_choice_id IS NOT NULL AND latest_choice.id IS NULL)
   OR (state.draft_selected_choice_id IS NOT NULL AND draft_choice.id IS NULL);

-- Persisted draft durations outside the allowed range; should also be impossible by CHECK.
SELECT count(*)
FROM practice_session_question_states
WHERE draft_cumulative_ms < 0 OR draft_cumulative_ms > 86400000;
```

The non-null draft-field proof is now structural: `draft_selected_choice_id` and `draft_saved_at` are nullable by design, while `draft_cumulative_ms`, `marked_for_review`, `position`, and `version` are `NOT NULL` scalar columns.

#### Track B: minimal blob hardening

Not chosen. Kept here only as historical rationale for why blob hardening was rejected in favor of Track A.

1. Add characterization tests that prove current legacy rows still parse and raw-snapshot CAS still succeeds. Keep this red/green proof before any cleanup.
2. Add an idempotent migration that backfills every `practice_sessions.params_json` row:
   - missing `questionStates` -> one default state per `questionIds` entry;
   - states missing `draftSelectedChoiceId`, `draftSavedAt`, or `draftCumulativeMs` -> default to `null`, `null`, and `0`;
   - oversized `draftCumulativeMs` -> clamp to `86400000`.
3. Add schema enforcement after the backfill:
   - top-level shape can use plain JSONB `CHECK` constraints, for example requiring `params_json ? 'questionStates'` and `jsonb_typeof(params_json -> 'questionStates') = 'array'`;
   - per-element array rules cannot be expressed as inline `CHECK` constraints because PostgreSQL rejects subqueries/set-returning functions inside a `CHECK`;
   - enforce per-element draft-field presence and `draftCumulativeMs` range with either a `BEFORE INSERT OR UPDATE` trigger or an immutable validation function called from a `CHECK`, with migration tests proving valid current JSON passes and malformed legacy JSON fails.
4. Tighten TypeScript and Zod after the migration:
   - make `PracticeSessionParams.questionStates` required in `db/schema.ts`;
   - make serialized draft fields required;
   - remove parser defaults only after the migration and constraints are in place.
5. Re-run the read-only data proof against Development and Production and require all counts to be zero before deleting any tolerance.
6. Keep raw-snapshot CAS on this track. It remains the correct comparison while mutable state is stored as a blob.

Acceptance criteria:

- Development and Production return zero for rows missing `questionStates`, states missing draft fields, and oversized `draftCumulativeMs`.
- Migration is idempotent and covered by integration tests.
- New writes cannot persist legacy JSON shape, including manual or adapter-bypassing writes covered by the chosen database enforcement mechanism.
- Legacy parser/defaulting code is removed only after the invariant is enforced.
- Full quality gate passes before push.

### Billing wrapper dedupe

If pursued later:

1. Start with tests for both route entrypoints proving their current redirects:
   - billing failure -> `/app/billing?error=portal_failed`;
   - pricing failure -> `/pricing?portal=error`;
   - unauthenticated -> `/sign-up`.
2. Extract only the duplicated `FormData`/deps plumbing behind a shared helper while keeping route-specific server-action entrypoints and redirect config explicit.
3. Keep `lib/manage-billing/manage-billing-core.ts` as the orchestration source of truth.

Acceptance criteria:

- Both route-local tests and `lib/manage-billing/manage-billing-core.test.ts` stay green.
- No behavior change to redirect URLs, idempotency-key forwarding, or logging fallback.

---

## Current Verdict Table

| Item | Verdict | Why |
|---|---|---|
| BUG-188 raw-snapshot CAS | IMPLEMENTED/RETIRED | Correct while state lived in JSON; removed by Track A because row-level `version` updates retire the blob-CAS bug class. |
| Missing `questionStates` tolerance | IMPLEMENTED/RETIRED | `params_json.questionStates` is no longer a state source; migration `0021_flaky_domino.sql` backfills relational state from legacy blobs. |
| Missing draft-field tolerance | IMPLEMENTED/RETIRED | Draft fields are required scalar columns in `practice_session_question_states`; legacy missing fields are defaulted during backfill. |
| Oversized `draftCumulativeMs` JSON persistence tolerance | IMPLEMENTED/RETIRED | Legacy JSON values are clamped during backfill; new Drizzle-persisted values are bounded by `practice_session_question_states_draft_cumulative_ms_chk`. The finalization use case still clamps port/fake-backed session state before converting draft milliseconds to seconds. |
| Stripe root `subscription` fallback | KEEP-AREA | Essential external API compatibility; nested Clover shape merely has priority. |
| NODE_ENV dev/prod guards | KEEP-AREA | Environment policy, not legacy cruft. |
| Dormant light-mode infrastructure | KEEP-AREA | DEBT-421 reversible kill switch; explicitly preserved. |
| Scanner/test legacy seams | KEEP-AREA | Regression and extension sentinels. |
| Manage-billing wrapper duplication | CLEAN-UP-DEFERRED | Real but low-impact outer-layer duplication; shared core already removes the risky part. |
