# Practice Engine: Retry and Reattempt Logic

> **Parent:** [Practice Engine Index](./index.md)  
> **Scope:** Current retry/reattempt behavior, cross-mode consistency rules, and target-state design  
> **Last Verified:** 2026-03-01

---

## 1. Terms

- **Attempt:** A persisted answer submission row in `attempts`.
- **Review mode:** Question page loaded with `mode=review`, which attempts to hydrate a prior attempt via `getPreviousAttempt`.
- **Session review:** Any review route that includes `sessionId` (`from=practice|history&mode=review&sessionId=...`), treated as read-only.
- **Standalone review:** Review routes without `sessionId` (`from=history|dashboard|bookmarks&mode=review...`), where reattempt is allowed.
- **Reattempt / retry:** User action after seeing feedback ("Try Again" or "Practice Again") that resets local form state and allows a new submission.

---

## 2. Current Behavior (Code Truth, 2026-03-01)

## 2.1 Context Matrix

| Context | Route / Entry | Previous attempt auto-load | Submit in-context | Reattempt button | Persistence behavior |
|---|---|---|---|---|---|
| Tutor session (active) | `/app/practice/[sessionId]` | Session state restore (`session.previousSubmission`) | Yes (once per question) | No | Writes `attempt` with `practiceSessionId`; updates `practice_sessions.params_json.questionStates` |
| Exam session (active) | `/app/practice/[sessionId]` | Session state restore (feedback hidden until review/summary) | Yes (once per question) | No | Same as tutor; explanations suppressed until review stage |
| Exam review stage | `/app/practice/[sessionId]` (review panel) | N/A | No question-level submit | No | No question attempts written here |
| Session review (history/practice) | `/app/questions/[slug]?mode=review&sessionId=...` | Yes (`attempt` or `session_unanswered`) | No | No | Read-only; no new attempts |
| History questions (standalone review) | `/app/questions/[slug]?from=history&mode=review` | Yes (latest attempt) | Only fallback when hydration misses | Yes | New standalone `attempt` (`practiceSessionId = null`) |
| Dashboard review (standalone review) | `/app/questions/[slug]?from=dashboard&mode=review&attemptId=...` | Yes (specific attempt by `attemptId`) | Only fallback when hydration misses | Yes | New standalone `attempt` |
| Bookmarks review (standalone review) | `/app/questions/[slug]?from=bookmarks&mode=review` | Yes (latest attempt, fallback for never-answered) | Only fallback when hydration misses | Yes | New standalone `attempt` |
| Quick Practice | `/app/practice/quick` | No | Yes | No (Next flow only) | New standalone `attempt` |

## 2.2 Rules Enforced in Code

1. Session review is read-only.
`canReattemptInContext({ mode, sessionId })` returns `false` for `mode=review` with `sessionId`, and both Submit and Try Again are hidden in UI.

2. Reattempt is client-side state reset, not persistence.
`reattemptQuestion()` clears `selectedChoiceId` and `submitResult`, rotates idempotency key, and restarts timing.

3. Session attempts are immutable after session end.
`SubmitAnswerUseCase` rejects ended sessions (`CONFLICT`), and session submissions require `sessionId`.

4. One attempt per question per session.
`attempts_session_question_uq` prevents duplicates for `(practice_session_id, question_id)` when `practice_session_id IS NOT NULL`.

5. Standalone reattempts always create new attempts.
Question page submissions omit `sessionId`, so they persist as ad-hoc attempts and do not mutate ended-session state.

---

## 3. Audit Findings (P0-P4)

| Priority | Finding | Slice | Why this matters |
|---|---|---|---|
| P0 | None found in retry flow | — | No data-loss/security-critical retry defect identified in this audit. |
| P1 | None found in retry flow | — | No immediate business-critical regression identified. |
| P2 | Retry lineage is not modeled (`attempts` has no `retryOfAttemptId` / retry origin) | Domain, application, DB | We cannot distinguish original session attempts from post-review retries in analytics/reporting. |
| P2 | Session review has no explicit "Practice this question" bridge; users must leave context and manually re-enter retry flow | Question-page UX | Read-only is correct, but the transition to deliberate retry is not first-class. |
| P2 | Non-session review hydration failures silently degrade to attempt mode | Question-page controller/UX | Users may unknowingly submit a duplicate attempt when review hydration fails transiently. |
| P3 | Docs drift: retry behavior in `question-rendering-architecture.md` and coverage notes are partially stale vs implementation | Practice-engine docs | Team decision-making is slower/riskier when retry contracts are documented inconsistently. |
| P4 | Terminology drift across docs (`retry`, `reattempt`, `Try Again`, `Practice Again`) | Product language | Increases implementation ambiguity for future changes. |

---

## 4. Target Contract (Recommended SSOT)

1. **Session history remains immutable.**  
Ended session scores/question states are historical snapshots and are never mutated by post-session retry.

2. **Retry always creates a new attempt row.**  
Do not overwrite prior attempts. Learning progress should preserve full attempt chronology.

3. **Every retry should carry provenance metadata.**  
A retry attempt should optionally record origin context and prior attempt linkage for traceability.

4. **Session review stays read-only, with explicit handoff to standalone practice.**  
No inline Submit/Try Again in session review; add a clear CTA that starts standalone retry intentionally.

5. **Review hydration failures are visible in UI (non-session contexts).**  
If review payload cannot be loaded, show explicit fallback message before enabling Submit.

6. **Reporting must distinguish latest overall vs latest in-session semantics.**  
Session performance should remain stable; global progress can continue using latest attempt unless product defines an alternate policy.

---

## 5. Required Changes by Layer

| Layer | Required change | Candidate files |
|---|---|---|
| Domain | Extend `Attempt` with optional retry provenance (`retryOfAttemptId`, `retryOrigin`, etc.) | `src/domain/entities/attempt.ts` |
| Application | Accept optional retry metadata in submit flow; validate linkage/user ownership/question match | `src/application/use-cases/submit-answer.ts`, ports under `src/application/ports/` |
| Adapters (controller) | Extend `submitAnswer` input schema for optional retry metadata | `src/adapters/controllers/question-controller.ts` |
| Infrastructure (DB) | Add nullable retry lineage columns + index strategy | `db/schema.ts`, migration files |
| Question-page frontend | Persist retry provenance state after hydration; pass into submit payload on reattempt submit | `app/(app)/app/questions/[slug]/question-page-logic.ts`, `use-question-page-controller.ts` |
| Session-review UX | Add explicit "Practice this question" bridge CTA from read-only session review | `app/(app)/app/questions/[slug]/question-page-client.tsx` |
| Observability | Emit retry events/counters by origin and outcome | controller/use-case logging path + metrics sink |
| Documentation | Sync retry behavior across practice-engine docs | `docs/practice-engine/*`, `docs/specs/*` as needed |

---

## 6. Mode-by-Mode Intended End State

| Mode / Page | Retry policy |
|---|---|
| Tutor active session | No in-place retry after submit; continue session flow. |
| Exam active session | No in-place retry; exam integrity preserved. |
| Session review (history/practice) | Read-only only; offer explicit bridge to standalone retry. |
| History questions standalone review | Review-first + retry allowed; retry persisted with provenance. |
| Dashboard standalone review | Review-first + retry allowed; retry persisted with provenance. |
| Bookmarks standalone review | Review-first + retry allowed; retry persisted with provenance. |
| Quick Practice | Fresh-attempt loop; not a review retry surface. |

---

## 7. Acceptance Criteria for Retry Unification

1. Session-review routes never create attempts directly.
2. Standalone retries create new attempts and preserve retry provenance when present.
3. Retry submissions from review contexts are attributable by origin in logs/analytics.
4. Hydration-failure fallback in review mode is visible and intentional, not silent.
5. Practice-engine docs describe one consistent retry contract across all modes.

---

## 8. Related

- [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md)
- [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md)
- [Question Rendering Architecture](./question-rendering-architecture.md)
- [DEBT-265](../debt/debt-265-retry-lineage-and-review-practice-unification.md)
