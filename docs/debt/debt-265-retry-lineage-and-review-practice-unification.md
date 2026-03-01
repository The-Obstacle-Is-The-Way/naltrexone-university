# DEBT-265: Retry Lineage and Review/Practice Unification

**Status:** Resolved (core scope complete; follow-up completed in DEBT-266/267)
**Priority:** P2
**Date:** 2026-03-01
**Owner:** Practice Engine
**Related:** [Practice Engine Retry Logic](../practice-engine/retry-logic.md) (SSOT), [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md), [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md), BUG-068, BUG-153

---

## 1. Problem Statement (Historical + Current)

Original debt had five gaps:

1. Missing retry provenance lineage in domain/DB.
2. Session review could not retry inline.
3. Hydration failure and no-prior-attempt states were conflated.
4. Mixed `attemptId + sessionId` contract was ambiguous.
5. Coverage/docs were underspecified across route slices.

As of 2026-03-01, gaps 1-5 for DEBT-265 core scope are implemented in code and synchronized in practice-engine docs. Follow-up slices were completed in DEBT-266/267.

---

## 2. Implemented Change Set (Shipped)

### 2.1 Domain + DB lineage model

- Added optional `Attempt` provenance fields:
  - `retryOfAttemptId`
  - `retryOrigin`
  - `retrySessionId`
- Added domain helpers:
  - `AllAttemptRetryOrigins`
  - `isValidAttemptRetryOrigin`
  - `isValidAttemptProvenance`
- Added `attempt_retry_origin` as `pgEnum` in DB schema.
- Added nullable provenance columns to `attempts` and index on `retry_of_attempt_id`.
- Added migration and entity tests.

### 2.2 Submit flow validation and passthrough

- Extended submit input schema/use-case input to accept optional provenance.
- Controller validates cross-field constraints via `superRefine`.
- Use case validates provenance contract and checks parent attempt:
  - parent exists
  - same user scope
  - same question linkage
- Persisted provenance through repository insert path to DB.

### 2.3 Inline retry in session review (question page)

- Enabled retry/submit in session-review question route (`mode=review&sessionId=...`).
- Retry remains in review flow (prev/next + grid intact).
- Retry submit writes standalone attempt (`practiceSessionId = null`) with provenance.
- Session score and session question states remain immutable.
- Added local `wasRetried` indicator in session navigator state.

### 2.4 Hydration safety and route normalization

- Introduced explicit hydration states:
  - `attempt`
  - `session_unanswered`
  - `no_prior_attempt`
  - `hydration_error`
- Added explicit hydration-error UI with `Retry load` and `Answer as new`.
- Normalized mixed `attemptId + sessionId` to `sessionId` precedence at question-page boundary.

---

## 3. Architectural Clarifications (Closes Prior Underspecification)

### 3.1 Which page owns inline retry?

Inline retry for ended-session review is implemented on:

- `/app/questions/[slug]?mode=review&sessionId=...`

Not on:

- `/app/practice/[sessionId]` active session flow.

`/app/practice/[sessionId]` still owns active answering and exam pre-submit review stage.

### 3.2 Post-retry state when navigating back

Within the same review visit, retry markers are preserved by local controller state (`sessionNavigation` + session-scoped ref cache). Navigating Q7 -> Q8 -> Q7 in the same visit keeps the retried marker.

### 3.3 Session grid retry indicator data source

Current source is client state, not server query. This is intentional for current scope and keeps session snapshot immutable. It is also the reason markers reset on hard refresh/new visit.

### 3.4 Full change surface (non-obvious files)

Beyond entity + schema, DEBT-265 required coordinated updates in:

- `src/application/ports/attempt-repository.ts` (`AttemptInsertInput`)
- `src/adapters/repositories/attempt-row-mappers.ts`
- `src/application/test-helpers/fakes/fake-attempt-repository.ts`
- `src/adapters/repositories/drizzle-attempt-repository.ts`

This closes the prior doc gap that missed DTO/mapper/fake/repo parity.

---

## 4. Vertical Tracer Bullets (End-to-End)

1. **History session review retry**
- Entry: history session -> question review route with `sessionId`
- Hydration: prior session attempt loaded
- Action: `Try Again`
- Submit payload: standalone + `retryOrigin=session_review`, parent attempt id, `retrySessionId`
- Result: new attempt row, immutable session snapshot, inline result shown

2. **Session unanswered reveal retry**
- Hydration: `session_unanswered`
- Action: `Try Again`
- Submit payload: standalone + `retryOrigin=session_review`, `retrySessionId`, no parent id
- Result: valid lineage for unanswered retry case

3. **Standalone hydration error path**
- Hydration fails -> explicit error card
- User chooses `Answer as new`
- Submit payload: standalone, no provenance
- Result: no silent lineage misattribution

4. **Dashboard activity retry**
- Entry with `attemptId`
- Hydration loads exact attempt
- Retry payload uses displayed attempt as parent with `retryOrigin=dashboard`

---

## 5. Horizontal Tracer Bullets (Layer Coverage)

| Layer | Contract | Status |
|---|---|---|
| Domain | Retry enum + provenance validator + entity fields | Complete |
| DB | Enum, nullable lineage columns, index, migration | Complete |
| Application ports | Provenance fields on attempt insert DTO | Complete |
| Repository adapters | Read/write provenance mapping + validation | Complete |
| Use case | Provenance validation + parent ownership/question checks | Complete |
| Controller | Zod schema + cross-field validation + passthrough | Complete |
| Question-page UI/controller | Inline retry, hydration states, fallback UI, provenance origin resolution | Complete |
| Route boundary | Mixed-id normalization (`sessionId` precedence) | Complete |
| Observability | Retry/hydration/normalization telemetry | Completed in DEBT-266 |
| Refresh-persistent retried grid indicators | Server-derived indicator model | Closed with explicit visit-scoped policy in DEBT-266 |

---

## 6. Test Matrix Status

Implemented and passing in the local DEBT-265 run:

- `src/domain/entities/attempt.test.ts`
- `src/application/use-cases/submit-answer.test.ts`
- `src/adapters/controllers/question-controller.test.ts`
- `app/(app)/app/questions/[slug]/question-page-logic.test.ts`
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
- `app/(app)/app/questions/[slug]/use-question-page-controller.browser.spec.tsx`
- `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx`
- `app/(app)/app/questions/[slug]/page.test.tsx`

Gate run completed in this branch context:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- `pnpm test:browser`
- `pnpm build`

---

## 7. Acceptance Criteria Status

- [x] Session review supports inline retry without leaving review flow.
- [x] Inline retry writes standalone attempts only.
- [x] Session scores/session question states are immutable under retry.
- [x] Provenance metadata flows end-to-end to persisted attempts.
- [x] Dashboard/history/bookmarks/session-review retry origins are mapped.
- [x] Hydration states are explicit; `hydration_error` requires explicit user action.
- [x] Mixed `attemptId + sessionId` is normalized deterministically.
- [x] Cross-origin lineage chain is reconstructable via `retryOfAttemptId`.
- [x] Full doc sync completed in `question-rendering-architecture.md` and `spec-coverage-map.md`.

Follow-up observability and retry-marker persistence policy work has been completed in [DEBT-266](./debt-266-retry-observability-and-session-review-marker-persistence.md).

---

## 8. Remaining Work (Ordered)

None.

---

## 9. Risk Notes

| Risk | Mitigation |
|---|---|
| Telemetry blind spots hide retry behavior regressions | Add explicit events before further UX changes |
| Local-only retried markers could be misread as persistent | Document current scope and add server model only if required |
| Route contract drift reintroduces mixed-id ambiguity | Keep normalization at boundary and add telemetry guardrail |
| Retry logic divergence across surfaces | Keep origin resolution and provenance rules centralized in question-page controller + submit use case |
