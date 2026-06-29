# DEBT-425: Legacy Compatibility Tolerances Audit and Hardening Plan

**Status:** Open
**Priority:** P3
**Created:** 2026-06-29
**Owner:** Engineering
**Related:** [BUG-188](../_archive/bugs/bug-188-legacy-session-cas-json-shape-mismatch-breaks-updates.md), [BUG-238](../_archive/bugs/bug-238-active-exam-draft-cumulative-ms-unbounded.md), [DEBT-180](../_archive/debt/debt-180-duplicated-manage-billing-files.md), [DEBT-321](../_archive/debt/debt-321-bs055-exam-interaction-model-overhaul.md), [DEBT-421](../_archive/debt/debt-421-light-mode-force-dark-vs-default-dark.md), [DEBT-385](../_archive/debt/debt-385-stripe-invoice-event-subscription-ref-schema-drift.md), [Debt Index](./index.md)

---

## Context

This audit re-verified legacy and backward-compatibility paths that are easy to misread as dead code. The rule is "prove, then delete": keep compatibility where it protects real data or external API variance, and only remove tolerance after a backfill plus an enforced invariant make the legacy shape unrepresentable.

The main cleanup opportunity is `practice_sessions.params_json`: current code still accepts older session JSON shapes where `questionStates` is missing entirely, where per-question draft fields are missing, or where `draftCumulativeMs` predates the BUG-238 bound. Those tolerances live at the adapter/persistence boundary and do not leak into the domain entity, which remains required and normalized.

---

## Findings / Evidence

### 1. Practice-session params JSON tolerances

Current code verified on 2026-06-29:

- `db/schema.ts:114-129` keeps `PracticeSessionParams.questionStates` optional, and keeps draft fields optional inside each serialized state.
- `src/adapters/repositories/practice-session-params.ts:19-35` defaults missing draft fields to `null`, `null`, and `0`.
- `src/adapters/repositories/practice-session-params.ts:55-58` accepts missing `questionStates`.
- `src/adapters/repositories/practice-session-params.ts:108-135` normalizes one full state per `questionIds` entry when stored state is missing or incomplete.
- `src/domain/services/session-stats.ts:40-53` creates default question states with all three draft fields present.
- `src/adapters/repositories/practice-session-params.ts:91-105` serializes every domain question state with all three draft fields.
- `src/domain/entities/practice-session.ts:6-15` has no optional legacy shape: the domain state requires `draftSelectedChoiceId`, `draftSavedAt`, and `draftCumulativeMs`.
- `src/application/use-cases/start-practice-session.ts:68-78` writes current sessions with `questionStates` from `createDefaultQuestionState`.

The BUG-188 CAS fix is correct and must stay:

- `src/adapters/repositories/drizzle-practice-session-repository.ts:68-92` returns a normalized domain session plus the raw persisted `paramsJson`.
- `src/adapters/repositories/practice-session-question-state-updater.ts:66-78` compares the CAS `WHERE` against `existingSnapshot.rawParamsJson`, not a normalized re-serialization.
- `tests/integration/bug-regression-historical.integration.test.ts:18-68` proves a row with no `questionStates` can still be updated and is upgraded to the current shape.

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

- **KEEP-AREA:** raw-snapshot CAS. This is not legacy cruft; it is the correct optimistic-concurrency comparison against persisted state.
- **CLEAN-UP-DEFERRED:** optional `questionStates`, optional draft fields, and finalization tolerance for oversized persisted draft timing. Missing draft fields are now purely legacy: the data window ends on 2026-03-17, the draft-field feature shipped on 2026-03-18, and current code paths create and serialize all three fields. Clean them only after a backfill and enforced invariant.

### 2. Oversized draft timing cap

Current code verified:

- `src/application/use-cases/save-exam-draft-answer.ts:20-21` defines `SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS` from the submit-answer seconds bound.
- `src/adapters/controllers/practice-schemas.ts:76-82` rejects oversized controller input.
- `src/application/use-cases/save-exam-draft-answer.ts:81-88` clamps non-controller callers.
- `src/application/use-cases/finalize-exam-answers.ts:184-188` caps persisted legacy `draftCumulativeMs` before writing `timeSpentSeconds`.
- `src/application/use-cases/finalize-exam-answers.test.ts:491-540` and `tests/integration/bug-regression-exam-draft-bounds.integration.test.ts:224-287` pin the legacy oversized-finalize behavior.

Data proof found zero oversized persisted values in Development and Production. This still stays deferred rather than deleted now because the persisted JSON schema does not yet enforce the bound.

Decision: **CLEAN-UP-DEFERRED.** After the JSON invariant is enforced with a backfill plus validation/check constraint, the finalization cap can be reconsidered. Until then it is a cheap, user-protecting persistence-boundary guard.

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

Current source of truth: `docs/specs/master_spec.md` and `db/schema.ts` still define `practice_sessions.params_json` as the persistence shape for session question order and mutable per-question state. This debt does not silently change that model. If cleanup is pursued, choose one explicit track.

ROI framing: Production currently has zero practice sessions. The legacy rows found by the audit are non-production historical/dev data, and the current tolerances are cheap adapter-boundary guards. Do not spend a standalone sprint on JSON-blob hardening just to delete parser defaults. Either keep the guards, do a small pre-launch invariant pass if already touching this persistence area, or invest in the normalized table track below to remove the bug class.

#### Track A: preferred model normalization

This is the architecturally clean end-state if the team chooses to spend real engineering time on the session-state model.

1. Add characterization tests that prove current legacy rows still parse and raw-snapshot CAS still succeeds before the refactor.
2. Add a `practice_session_question_states` table with scalar, constrained columns:
   - `practice_session_id` FK;
   - `question_id` FK;
   - `position` or equivalent ordered-session index;
   - `marked_for_review`, `latest_selected_choice_id`, `latest_is_correct`, `latest_answered_at`;
   - `draft_selected_choice_id`, `draft_saved_at`, `draft_cumulative_ms`;
   - a `version` or equivalent concurrency token for row-level optimistic updates.
3. Enforce invariants with normal relational constraints:
   - `NOT NULL` on required state columns;
   - `CHECK (draft_cumulative_ms BETWEEN 0 AND 86400000)`;
   - unique constraints on `(practice_session_id, question_id)` and `(practice_session_id, position)`.
4. Backfill one state row per existing `params_json.questionIds` entry, using the current parser defaults for missing legacy state and clamping oversized `draftCumulativeMs`.
5. Move repository reads to join/load state rows and map them back into the unchanged domain `PracticeSession`.
6. Replace blob CAS with row-level updates guarded by the state row concurrency token.
7. Stop persisting mutable `questionStates` in `params_json`; keep only immutable selection/filter metadata there or migrate that metadata into relational columns if the same refactor justifies it.
8. After the relational path is deployed and verified, remove legacy JSON parser defaults and the BUG-188 raw-blob CAS machinery.

Acceptance criteria for Track A:

- Session state invariants are enforced by scalar columns and relational constraints.
- Repository ports and domain entities remain persistence-ignorant.
- Ordered session review still preserves original question order.
- Concurrent draft/mark/answer updates cannot clobber each other.
- The legacy JSON tolerance tests are replaced by migration/backfill tests and current relational invariant tests.
- Full quality gate passes before push.

#### Track B: minimal blob hardening

This is an interim, lower-ROI path only if normalizing the table is intentionally out of scope.

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
| BUG-188 raw-snapshot CAS | KEEP-AREA | Correct concurrency comparison; protects legacy and future persisted JSON bytes. |
| Missing `questionStates` tolerance | CLEAN-UP-DEFERRED | Dev has one ended legacy row; needs backfill plus required schema before removal. |
| Missing draft-field tolerance | CLEAN-UP-DEFERRED | Purely legacy. Dev has 66 affected sessions and one active non-production session; cleanup should be either relational normalization or a deliberately scoped blob-hardening pass. |
| Oversized `draftCumulativeMs` finalization cap | CLEAN-UP-DEFERRED | Data is currently zero, but persisted JSON does not enforce the bound yet; scalar constraints come naturally with normalization. |
| Stripe root `subscription` fallback | KEEP-AREA | Essential external API compatibility; nested Clover shape merely has priority. |
| NODE_ENV dev/prod guards | KEEP-AREA | Environment policy, not legacy cruft. |
| Dormant light-mode infrastructure | KEEP-AREA | DEBT-421 reversible kill switch; explicitly preserved. |
| Scanner/test legacy seams | KEEP-AREA | Regression and extension sentinels. |
| Manage-billing wrapper duplication | CLEAN-UP-DEFERRED | Real but low-impact outer-layer duplication; shared core already removes the risky part. |
