# SPEC-039: Exam Mode Timer

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Proposed
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
| Unanswered on expiry | Scored as **incorrect** — depends on [DEBT-390](../debt/debt-390-omitted-exam-questions-recorded-as-unattempted-not-incorrect.md) |
| Tutor mode | Never shows a timer |

### Hard dependency

**[DEBT-390](../debt/debt-390-omitted-exam-questions-recorded-as-unattempted-not-incorrect.md) must be resolved first (or in lockstep).** Auto-submit on expiry calls `FinalizeExamAnswersUseCase` (`src/application/use-cases/finalize-exam-answers.ts:86-88`), which today **drops** unanswered questions instead of scoring them incorrect. Shipping the timer against that behavior would silently under-record every blank on a timed-out exam. SPEC-039 implementation must not begin its auto-submit slice until omitted-question scoring is fixed.

---

## Time Allotment Justification

Per-question time on real medical board exams clusters tightly around 60–90 seconds:

- **ABPM Addiction Medicine** (this product's target board): 200 questions across four 1-hour blocks = 240 minutes of testing → **~72 seconds/question**. ([ABPM exam content](https://www.theabpm.org/become-certified/exam-content/))
- **USMLE Step 1 / Step 2 CK** (the universal NBME convention): 60-minute blocks of up to 40 questions = **~90 seconds/question**. ([USMLE Step 1](https://www.usmle.org/step-exams/step-1))

We anchor to the **actual target board (ABPM Addiction Medicine): 72 seconds per question**, applied as a whole-block allotment (`questionCount × 72s`). Whole-block (not per-question) matches how these exams are administered — students self-allocate within a block, banking time on easy items to spend on hard ones.

This is encoded as a **single named constant** (no magic numbers), placed alongside the existing time constants in `src/domain/services/time-constants.ts` (currently `MS_PER_SECOND = 1000`, `DAY_MS`, `SECONDS_PER_DAY`):

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
- **F4.** When time reaches zero, the in-progress draft is flushed and the exam auto-submits via the existing finalize path, landing the student on the exam results/review stage.
- **F5.** After the deadline, the server rejects exam draft saves (writes); only finalization is permitted.
- **F6.** Unanswered questions at expiry are scored **incorrect** (via DEBT-390), consistent with manual finalize and real board behavior.
- **F7.** Tutor mode shows no timer and is behaviorally unchanged.

### Non-Functional

- **NF1.** Server is the sole authority on whether time has expired; client display is advisory.
- **NF2.** Timer display is drift-immune: each tick recomputes `remaining = deadline − now` from the absolute deadline; it never accumulates per-tick error.
- **NF3.** Accessible: screen-reader milestone announcements (not per-second chatter), `role="timer"`, and `prefers-reduced-motion` respected.
- **NF4.** Minimal/non-distracting: fits the existing exam header without layout disruption; no new heavy dependencies.
- **NF5.** No schema migration is required for the timer itself (the deadline is derived from existing columns). DEBT-390's fix may add a migration; that is tracked separately.

---

## Design

### Architecture summary

```
Domain (pure)
  time-constants.ts            EXAM_SECONDS_PER_QUESTION = 72              [NEW const]
  services/exam-timer.ts       computeExamAllotmentSeconds(session)       [NEW]
                               computeExamDeadline(session)               [NEW]
                               remainingExamSeconds(session, now)         [NEW]
                               isExamExpired(session, now)                [NEW]

Application (use cases / ports — depend only on domain)
  get-next-question.ts         NextQuestion.session gains deadlineAt      [CHANGED]
  practice-session-summary.ts  PracticeSessionSummary gains deadlineAt    [CHANGED]
  save-exam-draft-answer.ts    reject when isExamExpired(session, now)    [CHANGED]
  finalize-exam-answers.ts     unchanged here; DEBT-390 fixes scoring     [DEP]

Adapters (controllers serialize new field; clock already injectable)

app/ (client)
  hooks/use-exam-timer.ts      countdown + threshold announce + onExpire  [NEW]
  use-practice-session-page-controller.ts  mounts useExamTimer, wires     [CHANGED]
                                            onExpire → flush draft + finalize
  components/practice-view.tsx  renders <ExamTimer/> in exam header        [CHANGED]
  components/exam-timer.tsx     presentational MM:SS + a11y region         [NEW]
```

### Domain: deadline as a pure function

The deadline is a pure projection over the existing `PracticeSession` entity (`src/domain/entities/practice-session.ts:17-27`, which already carries `mode`, `questionIds`, and `startedAt`). No new entity fields.

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

The client must receive a **server-anchored** deadline so it never has to guess the start time. The session payload on `NextQuestion` (`src/application/use-cases/get-next-question.ts:46-57`) currently carries `mode/index/total/draft*` but **no timing anchor**. Add one ISO field, computed via `computeExamDeadline`:

```ts
// get-next-question.ts — NextQuestion.session  [CHANGED: add field]
deadlineAt?: string | null; // ISO; null for tutor mode
```

Mirror the same field on `PracticeSessionSummary` (`src/application/use-cases/practice-session-summary.ts:9-20`) so the bootstrap path (`usePracticeSessionPageController` → `getPracticeSessionSummary`, `use-practice-session-page-controller.ts:89-142`) also hands the client a deadline on resume. Both are pure derivations from `session.startedAt` + count — no new persistence.

### Application: server-side expiry enforcement (authority)

The server already injects a clock (`GetNextQuestionUseCase` constructor `now: () => Date`, `get-next-question.ts:97`), making expiry checks deterministic and testable.

- **`SaveExamDraftAnswerUseCase`** (`src/application/use-cases/save-exam-draft-answer.ts`): after the existing `session.endedAt` guard (lines 47-52), add an expiry guard so writes stop at the deadline:

  ```ts
  if (isExamExpired(session, this.now())) {
    throw new ApplicationError('CONFLICT', 'Exam time has expired');
  }
  ```

  (Inject a `now` clock into this use case as the others do.)
- **`SubmitAnswerUseCase`** already hard-blocks per-question submit in open exam mode (`src/application/use-cases/submit-answer.ts:181-186`) — no change needed.
- **Finalization remains allowed** after the deadline — it is the terminal action.
- **Abandoned expired sessions:** the partial unique index `practice_sessions_user_incomplete_uq` (`db/schema.ts:412-414`) allows only one open session per user, so an exam left open past its deadline would block starting a new one. Specify a **finalize-on-next-access** safety net: when an expired, still-open exam session is read (bootstrap or `getNextQuestion`), the server finalizes it (same path as auto-submit) so the student is never stuck. (Alternative: a scheduled reaper — out of scope; finalize-on-access is simpler and sufficient.)

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

Mount `useExamTimer` in `usePracticeSessionPageController` (`use-practice-session-page-controller.ts:36-224`), reading `questionFlow.sessionInfo.deadlineAt` and `sessionMode`. `onExpire`:

1. Flush the in-progress draft: `await questionFlow.saveCurrentExamDraft()` (`use-practice-session-question-flow.ts:213-275`).
2. Finalize via the existing exam path: `reviewStage.onEndSession()` for exam routes into the finalize/review flow (`use-practice-session-review-stage.ts:160-164,196-223`), which calls `finalizeExamAnswers` (`use-practice-session-review-stage.ts:53-55`, server action `src/adapters/controllers/practice-controller.ts:255-275`).

This reuses the exact path the Review & Submit button already uses — expiry is just an automatic trigger of the same terminal action. Guard against double-fire if the student is mid-manual-submit.

### Client: placement & presentational component

Render an `<ExamTimer/>` in the existing exam header. `PracticeView` (`app/(app)/app/practice/components/practice-view.tsx`) already has the seam: the header row at lines 352-391 holds the title, the `aria-live="polite"` progress `<p>` (lines 364-370), and the exam-only `question-header-actions` cluster (lines 372-391, already gated on `isExamMode`). Add a dedicated prop (e.g. `examTimer?: React.ReactNode`) rendered next to the progress description, or place it in `topContent` (line 354) above the question navigator. Exam-only; tutor passes `undefined`.

Visual: a compact `MM:SS` with a low-key label ("Time left"). In the final stretch (e.g. ≤60s) shift to a warning token color. No layout shift, no heavy chrome.

### Edge cases

| Case | Handling |
|---|---|
| **Tab backgrounded across deadline** | `visibilitychange` recompute on return; `onExpire` latch fires immediately if already past. |
| **Clock drift / client skew** | Display may be slightly off, but the **server** rejects writes past the deadline (`SaveExamDraftAnswerUseCase` guard) and finalize-on-access closes abandoned sessions — client clock cannot extend real time. |
| **Reload mid-exam** | Deadline recomputed from `started_at` server-side and re-sent in the payload; countdown resumes correctly. |
| **Expiry during manual submit** | `onExpire` latched + double-fire guard; finalize is idempotent via the existing idempotency key (`use-practice-session-review-stage.ts:75,119-121`). |
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
- `projectPracticeSessionSummary`: includes `deadlineAt` for exam, `null` for tutor.
- Finalize-on-access: reading an expired open exam finalizes it (assert session ends).
- DEBT-390 interaction (assert here once DEBT-390 lands): finalizing an exam with unanswered questions scores them incorrect.

### Adapter / controller
- `getNextQuestion` and `getPracticeSessionSummary` actions serialize `deadlineAt` through their output schemas.
- `saveExamDraftAnswer` action surfaces the expired `CONFLICT` as an error `ActionResult`.

### Browser — `*.browser.spec.tsx` (`vitest-browser-react`, `pnpm test:browser`)
- `use-exam-timer.browser.spec.tsx`: countdown decrements; `onExpire` fires once at zero; latched fire when "returning" past the deadline (simulate by advancing the deadline into the past); tutor (`deadlineAt: null`) returns null and never fires.
- `ExamTimer` component: renders `MM:SS`; milestone `aria-live` announcements at thresholds; warning token applied in final stretch; reduced-motion path asserts no animation class.
- Controller-level: on expiry, the finalize handler is invoked (use existing controller probes/fakes — `practice-session-page-controller.browser.*`). **Per DEBT-323, do not rely on `click @ref` for primary/toggle buttons**; drive via the hook/controller probe surface as the existing controller browser specs do.

### Integration — `tests/integration/*.integration.test.ts` (real Postgres)
- Start exam → advance injected clock past deadline → `saveExamDraftAnswer` rejected → finalize records unanswered as incorrect (post-DEBT-390) and ends session.
- Reload simulation: re-fetch `getNextQuestion` for the same session → identical `deadlineAt` derived from persisted `started_at`.

### E2E — optional smoke (`tests/e2e/*.spec.ts`)
- Exam with a tiny test allotment (via injected/overridden constant or a 1-question exam with a shortened clock hook) auto-submits and lands on results. Keep minimal; the authority and scoring are covered at lower layers.

---

## Implementation Notes

- **Sequence:** (1) land DEBT-390 scoring fix; (2) domain `exam-timer.ts` + constant (pure, fully unit-tested); (3) thread `deadlineAt` through use cases + controllers; (4) server expiry guard on draft save + finalize-on-access; (5) client `useExamTimer` + `ExamTimer` UI + controller wiring; (6) integration + E2E.
- **No magic numbers:** every duration flows from `EXAM_SECONDS_PER_QUESTION` and `MS_PER_SECOND`. Milestone thresholds (5m/1m/30s) should also be named constants in the timer module.
- **Routes:** use `ROUTES` constants for any navigation (`lib/routes.ts`), per frontend rules.
- **File size:** keep new client files <300 LOC; extract the hook from the component per `frontend.md`.
- **Verify before push:** full gate (`pnpm typecheck && lint && test --run && test:browser && test:integration && build`, plus E2E if the authenticated billing env is available), per AGENTS.md / CLAUDE.md.

## Related

- **[DEBT-390](../debt/debt-390-omitted-exam-questions-recorded-as-unattempted-not-incorrect.md)** — prerequisite: omitted exam questions must score as incorrect before auto-submit ships.
- [SPEC-013 (Practice Sessions)](../_archive/specs/spec-013-practice-sessions.md), [SPEC-020 (Practice Engine Completion)](../_archive/specs/spec-020-practice-engine-completion.md) — the practice/exam engine this builds on.
- [Practice Engine](../practice-engine/index.md) — canonical reference for the core feature.
- ABPM Addiction Medicine exam content: <https://www.theabpm.org/become-certified/exam-content/>
- USMLE Step exam timing: <https://www.usmle.org/step-exams/step-1>
