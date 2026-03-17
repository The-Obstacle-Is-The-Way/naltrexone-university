# Stabilization Checklist

**Date:** 2026-03-03 (last reviewed 2026-03-16)
**Purpose:** Verify core behavior and documentation accuracy before new feature work.

> Principle: fix correctness risks first, then expand scope.

---

## Current Baseline (Code + Docs Audit)

- Session flow is implemented per current SSOT (`SLICE-3`): start, answer, exam review stage, finalize summary.
- BUG-072 and BUG-073 were reclassified as debt (UX/product gaps, not SSOT violations).
- BUG-074 was resolved and archived: [BUG-074](../_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md).
- Architecture/product debt is tracked in `docs/debt/index.md` (source of truth for active `DEBT-*` and `FE-*` items; do not assume the active set from this checklist text).

---

## Pre-Flight Checks

### 1. Environment

- [ ] `.env.local` exists and all required keys are set
- [ ] `DATABASE_URL` points to expected environment
- [ ] `pnpm dev` starts without boot errors

### 2. Data

- [ ] Migrations applied (`pnpm db:migrate`)
- [ ] Questions seeded (`pnpm db:seed`)
- [ ] At least one test/subscribed user can access app routes

### 3. Quality Gates

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test --run`
- [ ] `pnpm build`

---

## Core Flow Verification

### Flow A: Session Start + Progress

1. [ ] Open `/app/practice`
2. [ ] Start tutor session
3. [ ] Confirm redirect to `/app/practice/[sessionId]`
4. [ ] Confirm progress indicator updates (`index/total`)

### Flow B: Tutor Mode Behavior

1. [ ] Submit answer in tutor mode
2. [ ] Confirm immediate correctness + explanation feedback
3. [ ] End session
4. [ ] Confirm aggregate summary renders

### Flow C: Exam Mode Behavior

1. [ ] Start exam session
2. [ ] Submit answer
3. [ ] Confirm explanations are hidden while session is active
4. [ ] Click `Review answers`
5. [ ] Confirm answered/unanswered/marked counts + open-question jump work
6. [ ] Submit exam from review stage
7. [ ] Confirm aggregate summary renders

### Flow D: Review + Bookmarks + Dashboard

1. [ ] `/app/history` renders Sessions + Questions tabs correctly
2. [ ] `/app/bookmarks` lists bookmarks and remove action works
3. [ ] `/app/dashboard` stats + recent activity render
4. [ ] During an active exam session, dashboard/review/question-loop/history surfaces do not reveal correctness/explanations before session end (see exam-answer secrecy policy; BUG-191, BUG-192, BUG-193 resolved in PR #166 and [archived](../_archive/bugs/))

---

## Correctness Hotspots to Re-Check Before Merging

- [ ] BUG-074 regression check: tie-case logic for missed-question latest-attempt query
- [ ] Session-state persistence integrity (`questionStates`) under concurrent updates
- [ ] Idempotency behavior for session/question actions
- [ ] Exam-answer secrecy invariant holds across all ingress paths (`sessionId`, `attemptId`, latest-attempt hydration, retry provenance, `getPracticeSessionReview`, `getNextQuestion`, `submitAnswer`, attempted-questions projection, dashboard projection)

---

## Related

- `docs/specs/master_spec.md`
- `docs/bugs/index.md`
- `docs/debt/index.md`
- `docs/practice-engine/exam-answer-secrecy-policy.md`
- [BUG-074](../_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md)
