# BUG-012: Incomplete Feature Wiring — Missing Controllers and E2E Coverage

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Description

Multiple features specified in the master spec and individual specs are not fully wired from backend to frontend. Controllers are missing, E2E tests are incomplete, and some features exist in isolation without proper integration.

---

## Missing Controllers (Per SPEC-010)

### 1. `bookmark-controller.ts` — NOT FOUND

**Required by:** SPEC-012, SPEC-014

**Expected exports:**
- `toggleBookmark(questionId)` — toggle bookmark on/off for a question
- `getBookmarks()` — get user's bookmarked questions

**Impact:** Bookmark feature mentioned in SLICE-2 and SLICE-4 is not accessible from the UI.

---

### 2. `practice-controller.ts` — NOT FOUND

**Required by:** SPEC-013 (SLICE-3)

**Expected exports:**
- `startPracticeSession(input)` — create new practice session with filters
- `endPracticeSession(sessionId)` — complete a session
- `getPracticeSessionStatus(sessionId)` — get current session state

**Impact:** Formal practice sessions (timed, with progress tracking) cannot be created or managed.

---

### 3. `stats-controller.ts` — NOT FOUND

**Required by:** SPEC-015 (SLICE-5)

**Expected exports:**
- `getDashboardStats()` — get user's performance statistics

**Impact:** Dashboard shows placeholder text instead of real statistics.

---

### 4. `review-controller.ts` — NOT FOUND

**Required by:** SPEC-014 (SLICE-4)

**Expected exports:**
- `getReviewQuestions(filters)` — get questions for review (missed, bookmarked, etc.)

**Impact:** Review mode (reviewing missed questions) not accessible.

---

## Missing E2E Tests

### Per Master Spec Requirements:

| Test File | Status | Required By |
|-----------|--------|-------------|
| `tests/e2e/subscribe.spec.ts` | Missing | SLICE-1 |
| `tests/e2e/practice.spec.ts` | Missing | SLICE-2, SLICE-3 |

**Current E2E tests:**
- `dark-mode.spec.ts` ✅
- `smoke.spec.ts` ✅
- `subscribe-and-practice.spec.ts` ✅ (partial coverage)

---

## Missing Integration Tests

### Per Master Spec Requirements:

| Test File | Status | Required By |
|-----------|--------|-------------|
| `tests/integration/actions.stripe.integration.test.ts` | Missing | SLICE-1 |
| `tests/integration/actions.questions.integration.test.ts` | Missing | SLICE-3 |
| `tests/integration/controllers.integration.test.ts` | Missing | SLICE-2 |

**Current integration tests:**
- `db.integration.test.ts` ✅
- `repositories.integration.test.ts` ✅

---

## Missing Container Factories

`lib/container.ts` needs these factories per SPEC-010:

| Factory | Status |
|---------|--------|
| `createBillingControllerDeps()` | ✅ Exists |
| `createQuestionControllerDeps()` | ✅ Exists |
| `createBookmarkControllerDeps()` | ❌ Missing |
| `createPracticeControllerDeps()` | ❌ Missing |
| `createReviewControllerDeps()` | ❌ Missing |
| `createStatsControllerDeps()` | ❌ Missing |

---

## UI Features Not Wired

### 1. Bookmark Toggle on Practice Page

**Spec says (SLICE-2):**
> Add bookmark toggle button on question view (calls toggleBookmark controller)

**Reality:** No bookmark button on `/app/practice` page

---

### 2. Practice Session Configuration

**Spec says (SLICE-3):**
> Given I choose count/mode/tags, when I click Start, then a practice session is created.

**Reality:** Practice page immediately loads a single question, no session configuration UI

---

### 3. Review Mode

**Spec says (SLICE-4):**
> As a subscribed user, I can review incorrect attempts and bookmarked questions

**Reality:** No `/app/review` page or review mode exists

---

### 4. Dashboard Statistics

**Spec says (SLICE-5):**
> As a subscribed user, I see accuracy, streak, and domain breakdown

**Reality:** Dashboard shows "Your progress and performance will show up here" placeholder

---

## Summary

| Category | Complete | Missing |
|----------|----------|---------|
| Controllers | 4 | 4 |
| Container factories | 3 | 4 |
| E2E tests | 1 | 2 |
| Integration tests | 2 | 3 |
| UI features | ~60% | ~40% |

---

## Resolution

This bug is resolved when:
1. All 4 missing controllers are implemented with tests
2. Container has all required factories
3. E2E tests cover subscribe and practice flows
4. Integration tests cover controller actions
5. UI features (bookmarks, sessions, review, stats) are wired

See also:
- Prompt for SPEC-010/011/012 completion (given earlier)
- Prompt for debt resolution

---

## Related

- SPEC-010: Server Actions (Controllers) — lists required controllers
- SPEC-011: Paywall — E2E test requirement
- SPEC-012: Core Question Loop — bookmark toggle requirement
- SPEC-013: Practice Sessions — session controller requirement
- SPEC-014: Review + Bookmarks — review controller requirement
- SPEC-015: Dashboard — stats controller requirement
- `lib/container.ts` — composition root
