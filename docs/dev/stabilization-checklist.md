# Stabilization Checklist

**Date:** 2026-02-06
**Purpose:** Verify core behavior and documentation accuracy before new feature work.

> Principle: fix correctness risks first, then expand scope.

---

## Current Baseline (Code + Docs Audit)

- Session flow is implemented per current SSOT (`SLICE-3`): start, answer, exam review stage, finalize summary.
- BUG-072 and BUG-073 were reclassified as debt (UX/product gaps, not SSOT violations).
- BUG-074 was resolved and archived: [BUG-074](../_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md).
- Active architecture/product debt remains in `docs/debt/index.md` (DEBT-113+).

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

1. [ ] `/app/review` lists missed questions
2. [ ] `/app/bookmarks` lists bookmarks and remove action works
3. [ ] `/app/dashboard` stats + recent activity render

---

## Correctness Hotspots to Re-Check Before Merging

- [ ] BUG-074 regression check: tie-case logic for missed-question latest-attempt query
- [ ] Session-state persistence integrity (`questionStates`) under concurrent updates
- [ ] Idempotency behavior for session/question actions

---

## Related

- `docs/specs/master_spec.md`
- `docs/bugs/index.md`
- `docs/debt/index.md`
- [BUG-074](../_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md)
