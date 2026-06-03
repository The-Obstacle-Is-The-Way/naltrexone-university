# SPEC-039: Exam Mode Timer

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented (PR #319; shipped to `dev` in merge `e8d99106`; archived 2026-06-03)
**Layer:** Feature
**Date:** 2026-05-22

---

## Overview

Add a **whole-block countdown timer to exam mode only**. When a student starts an exam session, the total time is fixed at session start as `questionCount × a single named per-question constant`. A minimal, non-distracting timer renders on the exam surface; when it reaches zero the exam **auto-submits** (finalizes) exactly as if the student pressed Review & Submit. Tutor mode is unaffected and never shows a timer.

The timer is **server-authoritative**: the cutoff is derived from the session's server `started_at` timestamp, never from the client clock. The client renders a countdown for display only and triggers a client-side auto-submit at zero, but the server independently rejects exam writes after the deadline so a tampered or skewed client clock cannot buy extra time.

### Decisions locked with the product owner (2026-05-22)

| Decision | Value |
|---|---|
| Timing model | Whole-block countdown (not per-question), exam mode only |
| Allotment | `questionIds.length × EXAM_SECONDS_PER_QUESTION`, a single named constant |
| Per-question constant | **72 seconds** — see [Time Allotment](#time-allotment-justification) |
| Configurability | **Not** user-selectable; fixed constant, no magic numbers |
| Pause / resume | **Not supported** (explicit non-goal; revisitable later) |
| Time authority | Server-derived deadline from `started_at`; client renders only |
| Reload persistence | Deadline recomputed server-side on every load — no client persistence |
| Omitted on expiry | Materialized by the shipped [SPEC-040](./spec-040-omitted-exam-answer-scoring.md) finalize path as an omitted attempt row with `isCorrect=false` |
| Tutor mode | Never shows a timer |

### Shipped prerequisite

**[SPEC-040](./spec-040-omitted-exam-answer-scoring.md) / [DEBT-390](../debt/debt-390-omitted-exam-questions-recorded-as-unattempted-not-incorrect.md) shipped in merge `3d8a292e`.** SPEC-039 was sequenced after that work, and the blocker is now satisfied. Auto-submit on expiry must call the existing `FinalizeExamAnswersUseCase`, not a timer-specific scoring path. That use case now iterates all session question states (`src/application/use-cases/finalize-exam-answers.ts:95`), materializes omitted outcomes with `omittedOutcome()` (`src/application/use-cases/finalize-exam-answers.ts:105`), stores `isCorrect: false` (`src/application/use-cases/finalize-exam-answers.ts:111`), promotes review-facing session state (`src/application/use-cases/finalize-exam-answers.ts:115-122`), grades selected drafts through `gradeAnswer` only (`src/application/use-cases/finalize-exam-answers.ts:131-139`), and ends the session in the same transaction (`src/application/use-cases/finalize-exam-answers.ts:152`).

The timer therefore owns countdown, deadline enforcement, and triggering finalization. Omitted-answer representation, scoring, backfill, and review rendering are already owned by SPEC-040.

---

## Time Allotment Justification

Per-question time on real medical board exams clusters tightly around 60–90 seconds:

- **ABPM Addiction Medicine** (this product's target board): 200 questions across four 1-hour blocks = 240 minutes of testing → **~72 seconds/question**. ([ABPM exam content](https://www.theabpm.org/become-certified/exam-content/))
- **USMLE Step 1 / Step 2 CK** (the universal NBME convention): 60-minute blocks of up to 40 questions = **~90 seconds/question**. ([USMLE Step 1](https://www.usmle.org/step-exams/step-1))

We anchor to the **actual target board (ABPM Addiction Medicine): 72 seconds per question**, applied as a whole-block allotment (`questionCount × 72s`). Whole-block (not per-question) matches how these exams are administered — students self-allocate within a block, banking time on easy items to spend on hard ones.

This is encoded as a **single named constant** (no magic numbers), placed alongside the existing time constants in `src/domain/services/time-constants.ts:1-3` (currently `MS_PER_SECOND = 1000`, `DAY_MS`, `SECONDS_PER_DAY`):

```ts
// src/domain/services/time-constants.ts  (NEW constant)
export const EXAM_SECONDS_PER_QUESTION = 72;
```

---

## Requirements

### Functional

- **F1.** Starting an exam fixes a total allotment of `questionIds.length × EXAM_SECONDS_PER_QUESTION` seconds, anchored to the session's server `started_at`.
- **F2.** The exam surface shows a countdown of remaining time (`MM:SS`), exam mode only.
- **F3.** The countdown survives reload, navigation between questions, and tab backgrounding — because it is recomputed from the server `started_at` + allotment, not from elapsed client ticks.
- **F4.** When time reaches zero, the exam auto-submits via the existing finalize path, landing the student on the exam results/review stage. Any selected answer already persisted as a server draft before the deadline is graded; any unpersisted local-only selection at/after expiry becomes an omitted outcome.
- **F5.** After the deadline, the server rejects exam draft saves (writes); only finalization is permitted.
- **F6.** Questions without a persisted draft/latest answer at expiry are recorded as omitted and scored incorrect by the shipped SPEC-040 finalize path (`AnswerOutcome.kind === 'omitted'`, `attempts.is_omitted=true`, `isCorrect=false`).
- **F7.** Tutor mode shows no timer and is behaviorally unchanged.

### Non-Functional

- **NF1.** Server is the sole authority on whether time has expired; client display is advisory.
- **NF2.** Timer display is drift-immune: each tick recomputes `remaining = deadline − now` from the absolute deadline; it never accumulates per-tick error.
- **NF3.** Accessible: screen-reader milestone announcements (not per-second chatter), `role="timer"`, and `prefers-reduced-motion` respected.
- **NF4.** Minimal/non-distracting: fits the existing exam header without layout disruption; no new heavy dependencies.
- **NF5.** No schema migration is required for the timer itself: the deadline is derived from persisted `practice_sessions.started_at` plus the question count. The omitted-attempt schema changes have already shipped separately in migration `0017_flaky_ser_duncan.sql`.

---

## Design

### Architecture summary

```text
Domain (pure)
  time-constants.ts            EXAM_SECONDS_PER_QUESTION = 72              [NEW const]
  services/exam-timer.ts       computeExamAllotmentSeconds(session)       [NEW]
                               computeExamDeadline(session)               [NEW]
                               remainingExamSeconds(session, now)         [NEW]
                               isExamExpired(session, now)                [NEW]

Application (use cases / ports — depend only on domain)
  get-next-question.ts         NextQuestion.session gains deadlineAt      [CHANGED]
  save-exam-draft-answer.ts    reject when isExamExpired(session, now)    [CHANGED]
  finalize-exam-answers.ts     unchanged for timer; SPEC-040 scoring path [DEP]

Adapters (controllers return the new field; clocks are injected where expiry checks need them)

app/ (client)
  hooks/use-exam-timer.ts      countdown + threshold announce + onExpire  [NEW]
  use-practice-session-page-controller.ts  mounts useExamTimer, wires     [CHANGED]
                                            onExpire → best-effort draft save + finalize
  components/practice-view.tsx  renders <ExamTimer/> in exam header        [CHANGED]
  components/exam-timer.tsx     presentational MM:SS + a11y region         [NEW]
```

### Domain: deadline as a pure function

The deadline is a pure projection over the existing `PracticeSession` entity (`src/domain/entities/practice-session.ts:17-27`, which already carries `mode`, `questionIds`, `startedAt`, and `endedAt`). `practice_sessions.started_at` is persisted by the database (`db/schema.ts:397-402`) and returned on the domain entity; no new entity field or deadline column is needed.

```ts
// src/domain/services/exam-timer.ts  (NEW)
import { EXAM_SECONDS_PER_QUESTION, MS_PER_SECOND } from './time-constants';
import type { PracticeSession } from '../entities';

export function computeExamAllotmentSeconds(session: PracticeSession): number | null {
  if (session.mode !== 'exam') return null;
  return session.questionIds.length * EXAM_SECONDS_PER_QUESTION;
}

export function computeExamDeadline(session: PracticeSession): Date | null {
  const allotment = computeExamAllotmentSeconds(session);
  if (allotment === null) return null;
  return new Date(session.startedAt.getTime() + allotment * MS_PER_SECOND);
}

export function remainingExamSeconds(session: PracticeSession, now: Date): number {
  const deadline = computeExamDeadline(session);
  if (deadline === null) return Number.POSITIVE_INFINITY; // tutor: no limit
  return Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / MS_PER_SECOND));
}

export function isExamExpired(session: PracticeSession, now: Date): boolean {
  const deadline = computeExamDeadline(session);
  return deadline !== null && now.getTime() >= deadline.getTime();
}
```

Tutor sessions return `null` / `Infinity` and are never gated.

### Application: surface the deadline to the client

The client must receive a **server-anchored** deadline so it never has to guess the start time. The active session payload on `NextQuestion` (`src/application/use-cases/get-next-question.ts:46-57`) currently carries `mode/index/total/draft*` but **no timing anchor**; the returned session object is assembled at `src/application/use-cases/get-next-question.ts:245-262` and likewise has no deadline today. Add one ISO field, computed via `computeExamDeadline`:

```ts
// get-next-question.ts — NextQuestion.session  [CHANGED: add field]
deadlineAt?: string | null; // ISO; null for tutor mode
```

Do **not** add `deadlineAt` to `PracticeSessionSummary` as part of the timer. `PracticeSessionSummary` is an ended-session summary (`src/application/use-cases/practice-session-summary.ts:9-20`), and `GetPracticeSessionSummaryUseCase` rejects active sessions with `CONFLICT` (`src/application/use-cases/get-practice-session-summary.ts:29-30`). The active-page bootstrap already falls through that conflict into the question-loading path (`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:96-113`), so the deadline must travel with the active `NextQuestion.session` payload.

### Application: server-side expiry enforcement (authority)

The server must remain authoritative. Client countdowns can trigger auto-submit, but they cannot extend the deadline or turn a local-only selection into a submitted answer after the cutoff.

The server already injects clocks in nearby use cases (`GetNextQuestionUseCase` constructor `now: () => Date`, `src/application/use-cases/get-next-question.ts:92-98`; `StartPracticeSessionUseCase` constructor `now: () => Date`, `src/application/use-cases/start-practice-session.ts:32-37`), making expiry checks deterministic and testable. Add the same `now` dependency to `SaveExamDraftAnswerUseCase`, whose constructor currently has only repositories (`src/application/use-cases/save-exam-draft-answer.ts:23-27`).

- **`SaveExamDraftAnswerUseCase`**: after the existing `session.endedAt` guard (`src/application/use-cases/save-exam-draft-answer.ts:47-52`), add an expiry guard so writes stop at the deadline:

  ```ts
  if (isExamExpired(session, this.now())) {
    throw new ApplicationError('CONFLICT', 'Exam time has expired');
  }
  ```

  (Inject a `now` clock into this use case as the others do.)
- **`SubmitAnswerUseCase`** already hard-blocks per-question submit in open exam mode (`src/application/use-cases/submit-answer.ts:182-186`) — no change needed.
- **Finalization remains allowed** after the deadline — it is the terminal action.
- **Expired active reads:** an expired, still-open exam must not continue serving an active exam. On the next active-session access, route to the same finalization path used by manual Review & Submit / timer expiry. Do not duplicate scoring or omission logic in a read consumer.
- **Incomplete-session uniqueness:** the partial unique index `practice_sessions_user_incomplete_uq` (`db/schema.ts:413-415`) still allows only one open session per user. Timer work should not add a parallel reaper or bypass this constraint; expired open exams are closed by the same finalize path when the user resumes/opens the session.

### Application: finalization and visibility seams

Auto-submit is a domain event: **Exam Timer Expired**. Its effect is to call `FinalizeExamAnswersUseCase` for that exam session.

The shipped finalize path is already the correct terminal write:

- It rejects non-exam sessions (`src/application/use-cases/finalize-exam-answers.ts:50-54`) and already-ended sessions before and inside the transaction (`src/application/use-cases/finalize-exam-answers.ts:57-61`, `src/application/use-cases/finalize-exam-answers.ts:80-84`).
- It iterates every question state (`src/application/use-cases/finalize-exam-answers.ts:95`), inserts omitted attempts for states with no draft/latest answer (`src/application/use-cases/finalize-exam-answers.ts:102-113`), writes `latestSelectedChoiceId: null` and `latestIsCorrect: false` through the session-state port (`src/application/ports/practice-session-repository.ts:36-43`; Drizzle implementation at `src/adapters/repositories/drizzle-practice-session-repository.ts:271-295`), and ends the session (`src/application/use-cases/finalize-exam-answers.ts:152`).
- It writes selected attempts via `answeredOutcome(selectedChoiceId)` and `gradeAnswer` (`src/application/use-cases/finalize-exam-answers.ts:131-139`); omitted rows never flow through `gradeAnswer`.
- The controller action is idempotency-key aware (`src/adapters/controllers/practice-controller.ts:255-279`), and duplicate session/question attempts remain blocked by `attempts_session_question_uq` (`db/schema.ts:476-480`).

Once the transaction commits, active-exam attempt visibility flips through the existing shared seam. `getActiveExamVisibilityCondition()` hides active exam attempts but permits standalone, non-exam, and ended-exam attempts (`src/adapters/repositories/shared/active-exam-visibility.ts:16-21`). The timer must not add per-consumer reads or `UNION` logic; omitted rows become visible because the session has ended.

### Client: the countdown hook

```ts
// app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts  (NEW)
useExamTimer({
  deadlineAt: string | null,     // from sessionInfo.deadlineAt
  isExamActive: boolean,         // mode === 'exam' && not in review/results
  onExpire: () => void,          // fired once when remaining hits 0
}): { remainingSeconds: number | null; isExpired: boolean }
```

- Ticks on a 1s interval, but each tick computes `remaining = deadline − Date.now()` from the absolute ISO deadline (NF2 — drift-immune).
- Recomputes immediately on `visibilitychange`/focus so a backgrounded tab catches up on return (browsers throttle background `setInterval`).
- Fires `onExpire` exactly once (latched), even if the tab was backgrounded across the deadline.
- Returns `null` when `deadlineAt` is null (tutor) — caller renders nothing.

### Client: wiring auto-submit

Mount `useExamTimer` in `usePracticeSessionPageController` (`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:36-224`), reading `questionFlow.sessionInfo.deadlineAt` and `sessionMode`. `onExpire`:

1. Latch so it runs once.
2. Optionally attempt one final `questionFlow.saveCurrentExamDraft()` (`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:213-275`) only as an opportunistic best effort. If the server deadline has already passed, the new expiry guard rejects the write and the client must still continue to finalization.
3. Finalize via the existing exam finalizer (`finalizeExamAnswers`, `src/adapters/controllers/practice-controller.ts:255-279`) and land in the same review/results flow used by manual Review & Submit.

Do not blindly call the current `reviewStage.onEndSession()` wrapper after adding the expiry guard. That wrapper pre-saves the current draft and returns early when `saveCurrentExamDraft()` returns `false` (`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts:196-215`), while the draft-save helper returns `false` for failed action results (`app/(app)/app/practice/shared/question-flow-actions.ts:202-207`). Timer expiry must treat an expired draft-save rejection as terminal-okay and still finalize. The reusable seam is the existing finalization action/use case, not the pre-save early-return behavior.

This reuses the same terminal action as Review & Submit — expiry is just an automatic trigger of finalization. Guard against double-fire if the student is mid-manual-submit. The server-persisted draft/session state is canonical; a client-only selected radio value is not a scored answer unless it was saved before the server deadline.

### Client: placement & presentational component

Render an `<ExamTimer/>` in the existing exam header. `PracticeView` already has the seam: the header row at `app/(app)/app/practice/components/practice-view.tsx:352-391` holds the title, the `aria-live="polite"` progress `<p>` at `app/(app)/app/practice/components/practice-view.tsx:364-370`, and the exam-only `question-header-actions` cluster at `app/(app)/app/practice/components/practice-view.tsx:372-391`. Add a dedicated prop (e.g. `examTimer?: React.ReactNode`) rendered next to the progress description, or place it in `topContent` (`app/(app)/app/practice/components/practice-view.tsx:354`) above the question navigator. Exam-only; tutor passes `undefined`.

Visual: a compact `MM:SS` with a low-key label ("Time left"). In the final stretch (e.g. ≤60s) shift to a warning token color. No layout shift, no heavy chrome.

### Edge cases

| Case | Handling |
|---|---|
| **Tab backgrounded across deadline** | `visibilitychange` recompute on return; `onExpire` latch fires immediately if already past. |
| **Clock drift / client skew** | Display may be slightly off, but the **server** rejects writes past the deadline (`SaveExamDraftAnswerUseCase` guard) and expired active access routes to finalization — client clock cannot extend real time. |
| **Reload mid-exam** | Deadline recomputed from `started_at` server-side and re-sent in the payload; countdown resumes correctly. |
| **User submits the last answer at the deadline** | Server receive/commit time decides. A draft save that passes the server expiry guard before the deadline is graded as an answered outcome; a save at/after `deadlineAt` is rejected and the question is omitted if no earlier draft/latest answer exists. |
| **User submits after expiry before auto-submit lands** | The draft save is rejected; finalization remains allowed and records persisted drafted answers plus omitted rows for blanks. |
| **Expiry during manual submit** | `onExpire` latched + double-fire guard; finalize is idempotent via the existing idempotency key (`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts:75`, `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts:119-121`) and controller action (`src/adapters/controllers/practice-controller.ts:272-279`). |
| **Single-question exam** | Allotment = 72s; same logic, no special case. |
| **Tutor mode** | `deadlineAt` null → hook returns null → no render, no enforcement. |

### Accessibility

- Timer wrapper uses `role="timer"` with an `aria-label` (e.g. "Exam time remaining").
- The per-second ticking text is `aria-hidden` to avoid screen-reader spam; a separate visually-hidden `aria-live="polite"` region announces **milestones only** (e.g. "5 minutes remaining", "1 minute remaining", "30 seconds remaining").
- On expiry, an `aria-live="assertive"` announcement: "Time is up. Submitting your exam."
- `prefers-reduced-motion`: the warning-state change is a static color only — no pulsing/animation.

---

## Tests First

Strict TDD, **fakes over mocks** (`src/application/test-helpers/fakes/`). Layering:

### Domain — `src/domain/services/exam-timer.test.ts` (unit, plain Vitest)

- `computeExamAllotmentSeconds`: exam with N questions → `N × 72`; tutor → `null`.
- `computeExamDeadline`: exam → `startedAt + allotment`; tutor → `null`.
- `remainingExamSeconds`: counts down; clamps at 0; tutor → `Infinity`.
- `isExamExpired`: false before deadline, true at/after; tutor → always false.
- Constant guard: `EXAM_SECONDS_PER_QUESTION === 72` (locks the decision against accidental edits).

### Application — use-case unit tests with fakes

- `GetNextQuestionUseCase`: exam payload includes `deadlineAt = startedAt + N×72s` (ISO); tutor payload `deadlineAt: null`. Use `FakePracticeSessionRepository` + injected `now`.
- `SaveExamDraftAnswerUseCase`: rejects with `CONFLICT 'Exam time has expired'` when the injected `now` is past the deadline; succeeds before it. (Construct a fake session whose `startedAt` makes it expired relative to the injected clock.)
- Expired active access: an expired open exam does not serve another active question; it routes to the same finalize path and the session ends.
- SPEC-040 interaction: finalizing an exam with no persisted draft/latest answer records an omitted incorrect attempt. This is already covered by `src/application/use-cases/finalize-exam-answers.test.ts:76-246`; timer tests should assert reuse of the path, not duplicate omitted-scoring logic.

### Adapter / controller

- `getNextQuestion` returns `deadlineAt` on active exam session payloads and `null` for tutor session payloads.
- `saveExamDraftAnswer` action surfaces the expired `CONFLICT` as an error `ActionResult`.

### Browser — `*.browser.spec.tsx` (`vitest-browser-react`, `pnpm test:browser`)

- `use-exam-timer.browser.spec.tsx`: countdown decrements; `onExpire` fires once at zero; latched fire when "returning" past the deadline (simulate by advancing the deadline into the past); tutor (`deadlineAt: null`) returns null and never fires.
- `ExamTimer` component: renders `MM:SS`; milestone `aria-live` announcements at thresholds; warning token applied in final stretch; reduced-motion path asserts no animation class.
- Controller-level: on expiry, the finalize handler is invoked once even if a final draft-save attempt is rejected as expired; manual Review & Submit at/after expiry also proceeds to finalization instead of getting stuck on the draft-save error. Use existing controller probes/fakes (`practice-session-page-controller.browser.*`). **Per DEBT-323, do not rely on `click @ref` for primary/toggle buttons**; drive via the hook/controller probe surface as the existing controller browser specs do.

### Integration — `tests/integration/*.integration.test.ts` (real Postgres)

- Start exam → advance injected clock past deadline → `saveExamDraftAnswer` rejected → finalize records omitted rows as incorrect and ends session through the SPEC-040 path.
- Reload simulation: re-fetch `getNextQuestion` for the same session → identical `deadlineAt` derived from persisted `started_at`.

### E2E — optional smoke (`tests/e2e/*.spec.ts`)

- No mandatory E2E is required for SPEC-039 because the authority, races, and scoring are covered at lower layers. If an E2E smoke is added, introduce an explicit test-only timing seam; do not wait for the real 72-second allotment and do not monkey-patch constants from the test.

---

## Implementation Notes

- **Sequence:** (1) domain `exam-timer.ts` + constant (pure, fully unit-tested); (2) thread `deadlineAt` through active question use cases/controllers; (3) server expiry guard on draft save and expired-active-access finalization through `FinalizeExamAnswersUseCase`; (4) client `useExamTimer` + `ExamTimer` UI + controller wiring; (5) integration + E2E.
- **No magic numbers:** every duration flows from `EXAM_SECONDS_PER_QUESTION` and `MS_PER_SECOND`. Milestone thresholds (5m/1m/30s) should also be named constants in the timer module.
- **Routes:** use `ROUTES` constants for any navigation (`lib/routes.ts`), per frontend rules.
- **File size:** keep new client files <300 LOC; extract the hook from the component per `frontend.md`.
- **Verify before push:** full gate (`pnpm typecheck && lint && test --run && test:browser && test:integration && build`, plus E2E if the authenticated billing env is available), per AGENTS.md / CLAUDE.md.

## Out of Scope

- Backfill and the omitted-attempt model itself — shipped by SPEC-040 (`db/migrations/0017_flaky_ser_duncan.sql`, `db/migrations/0018_backfill-omitted-exam-attempts.sql`).
- `gradeAnswer` changes — omitted rows are scored directly as incorrect by finalize; selected answers remain the only input to `gradeAnswer`.
- Tutor early-end semantics and Quick Practice abandonment — no timer and no omitted attempts there.
- Per-question timers, pause/resume, scheduled server reapers, and user-configurable time limits.

## Related

- **[SPEC-040](./spec-040-omitted-exam-answer-scoring.md)** / **[DEBT-390](../debt/debt-390-omitted-exam-questions-recorded-as-unattempted-not-incorrect.md)** — shipped prerequisite: omitted exam questions are materialized as incorrect attempts before timer auto-submit runs.
- [SPEC-013 (Practice Sessions)](./spec-013-practice-sessions.md), [SPEC-020 (Practice Engine Completion)](./spec-020-practice-engine-completion.md) — the practice/exam engine this builds on.
- [Practice Engine](../../practice-engine/index.md) — canonical reference for the core feature.
- ABPM Addiction Medicine exam content: <https://www.theabpm.org/become-certified/exam-content/>
- USMLE Step exam timing: <https://www.usmle.org/step-exams/step-1>
