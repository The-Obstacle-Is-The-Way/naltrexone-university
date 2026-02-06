# DEBT-107: Question Engine E2E Completeness and State Management

**Status:** In Progress
**Priority:** P1
**Date:** 2026-02-05
**Updated:** 2026-02-06

---

## Description

The question engine is the core product path (practice → answer submission → review/bookmarks/dashboard updates).  
Unit/integration coverage is strong, but E2E confidence was previously incomplete because authenticated flows were skipped and key specs had missing files.

---

## Current Coverage Audit (2026-02-05)

### Implemented and wired

- `tests/e2e/practice.spec.ts`
  - Tutor session lifecycle (start session → answer → end session → summary)
  - Exam-mode explanation gating during active session
- `tests/e2e/review.spec.ts`
  - Missed question appears in Review after incorrect attempt
  - Question disappears from Review after correct reattempt
- `tests/e2e/bookmarks.spec.ts`
  - Bookmark persistence and remove flow
- `tests/e2e/core-app-pages.spec.ts`
  - Dashboard/review/bookmarks/billing navigation sanity
  - Recent activity visibility for attempted question
- `tests/e2e/session-continuation.spec.ts`
  - Practice-page "Continue session" card + resume flow validation

### Supporting infrastructure added

- `tests/e2e/global.setup.ts` with `clerkSetup()`
- `tests/e2e/helpers/clerk-auth.ts` with `clerk.signIn()`
- `tests/e2e/helpers/subscription.ts` for subscription bootstrap
- `tests/e2e/helpers/question.ts` + `tests/e2e/helpers/bookmark.ts` for reusable question-engine actions
- `tests/e2e/helpers/session.ts` for shared `startSession()` practice session bootstrapping
- All helpers use proper `waitFor`-based waits (DEBT-110 resolved)

---

## Remaining Gaps

1. **Exact dashboard metric assertions**
   - E2E currently validates stat presence/visibility, not deterministic numeric correctness across seeded attempts.

2. **Cross-browser matrix**
   - Current E2E project target is Chromium. No Firefox/WebKit coverage for question-engine flows yet.

3. **Scenario depth for long sessions**
   - Current tests intentionally keep session counts low for reliability/speed.
   - No long-run scenario that validates progression over many questions in one session.

4. **Depends on DEBT-104 external configuration**
   - CI secret values and Clerk policy checks are still required for fully portable authenticated E2E in all environments.

---

## Resolution Checklist

### Phase 0: Authenticated E2E unblocked

- [x] Clerk programmatic sign-in integrated in Playwright flows
- [x] Global setup project (`clerkSetup`) wired into Playwright config

### Phase 1: Missing spec files

- [x] `tests/e2e/review.spec.ts` added
- [x] `tests/e2e/bookmarks.spec.ts` added

### Phase 2: Core question-engine flows

- [x] Tutor flow covered end-to-end
- [x] Exam-mode explanation gating covered in active session
- [x] Review add/remove behavior covered
- [x] Bookmark persistence/remove behavior covered
- [x] Core app pages + dashboard visibility coverage added
- [x] Session continuation card + resume flow covered

### Phase 3: Remaining hardening

- [ ] Deterministic numeric dashboard assertions
- [ ] Optional cross-browser expansion (Firefox/WebKit)
- [ ] Optional longer-session scenario

---

## Verification

- [x] Authenticated E2E specs no longer rely on fragile Clerk UI text selectors
- [x] Question-engine helper primitives are centralized and reused
- [x] Missing spec-referenced E2E files now exist
- [ ] CI environment secrets and Clerk policy validation completed (see DEBT-104)

---

## Related

- **DEBT-104:** Missing E2E Test Credentials for Authenticated Flows
- **DEBT-105:** Missing Session Resume Functionality
- **DEBT-106:** Exam Mode Missing "Mark for Review" Feature
- `docs/specs/spec-012-core-question-loop.md`
- `docs/specs/spec-013-practice-sessions.md`
- `docs/specs/spec-014-review-bookmarks.md`
- `docs/specs/spec-015-dashboard.md`
