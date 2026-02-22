# SPEC-038: History UX Remediation (BS-028 Re-Validated Findings)

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red > Green > Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Proposed
**Layer:** Feature
**Date:** 2026-02-22
**Brainstorming:** [BS-028](../brainstorming/bs-028-history-session-scoring-and-navigation-gaps.md)

---

## 1. Overview

This spec defines the production fix plan for History-page UX defects that were independently re-validated on 2026-02-22 using:

- Playwright audit: `tests/e2e/bs-028-history-ux-audit.spec.ts`
- Agent-browser exploratory snapshots on Sessions, Questions, and Question review pages
- Code traces in history and question-view components/use-cases

### Re-validated scope

13 findings are confirmed and in scope:

1. Tutor denominator misleading (`correct/answered` instead of `correct/questionCount`)
2. Absurd durations shown (multi-hour outliers like `7182m 49s`)
3. Questions-tab review lacks navigator parity
4. Session cards are not directly navigable
5. No "Review session" action in breakdown
6. Dark-mode hover affordance is effectively invisible
7. Sessions tab lacks filters/count context
8. Dual "Back to History" links on review pages
9. Duplicate `Other` tag options
10. "Try Again" label shown for already-correct Questions-tab review
11. No sort control on Questions tab
12. Mid-sentence truncation in preview text
13. Native `<select>` controls diverge from design system

### Explicit out of scope

- BS-028 Problem 7 ("navigator off-screen on load") was **not reproduced** on 2026-02-22 and is excluded from this implementation scope. Keep as a watch item only.

---

## 2. Requirements

### Functional

`FR-1` Session score denominator
- History Sessions rows MUST display `correct/questionCount` for both Tutor and Exam.
- Tutor rows MUST NOT display `0/0 correct (—)`; denominator must be question count.

`FR-2` Duration sanity
- Session duration display MUST cap unbounded outliers.
- For durations above configured cap, UI MUST show capped label plus explicit outlier indicator (example: `>120m`).
- Stored source duration data remains unchanged in this spec; this is display-layer normalization.

`FR-3` Questions-tab review parity
- Opening a question from History Questions MUST provide sequential Previous/Next navigation within current filtered page context.
- Review page MUST show `Question X of Y` and navigator UI for this context (without requiring `sessionId`).

`FR-4` Session primary navigation
- Session row summary area MUST be clickable and keyboard accessible.
- Primary click target MUST open review mode at first available question in that session.

`FR-5` Breakdown session action
- Expanded session breakdown MUST include a prominent session-level action (`Review session`) in addition to per-question links.

`FR-6` Hover affordance visibility
- Interactive History controls in dark mode MUST provide visible hover/focus delta.
- Minimum contrast delta threshold MUST be encoded in E2E checks (see Test Plan).

`FR-7` Sessions tab context
- Sessions tab MUST show `Showing X–Y of Z`.
- Sessions tab MUST support a mode filter (`All`, `Tutor`, `Exam`).

`FR-8` Back-link deduplication
- Question review page MUST render a single `Back to History` action in the bottom action bar when origin is History.
- Top-right duplicate link MUST be removed for History origin.

`FR-9` Tag disambiguation
- Tag filter MUST disambiguate duplicate names (including `Other`).
- Grouping by kind (`Topic`, `Substance`, `Treatment`) is required.

`FR-10` Correct-answer action label
- In Questions-tab review (history origin without `sessionId`), when prior attempt is correct, CTA label MUST be `Practice Again` (not `Try Again`).
- For incorrect attempts, label remains `Try Again`.

`FR-11` Questions sort control
- Questions tab MUST provide sort options (minimum: `Most recent`, `Incorrect first`, `Correct first`, `Difficulty`).

`FR-12` Preview truncation quality
- Question previews MUST truncate at semantic boundaries (sentence-aware) rather than raw character cutoffs where possible.

`FR-13` Design-system-consistent filter controls
- Replace native `<select>` filters with design-system Select primitives.
- Tag filter MUST use grouped sections, solving `FR-9` structurally.

### Non-Functional

`NFR-1` URL/state resilience
- Existing `historyHref` back-navigation contract must continue to preserve tab + pagination context.

`NFR-2` Accessibility
- New controls MUST maintain keyboard and screen-reader semantics (labels, focus rings, aria attributes).

`NFR-3` Deterministic tests
- E2E assertions must avoid fragile CSS parsing assumptions (`oklab` parsing bug class).

`NFR-4` Performance
- Questions-tab navigation context payload must be bounded (current page only, max 20 items by default).

---

## 3. Design Decisions

### D1. Unified denominator policy

Adopt `questionCount` denominator for both Tutor and Exam in:
- `src/application/use-cases/get-session-history.ts`
- `app/(app)/app/history/components/history-sessions-tab.tsx`

Rationale: consistent semantics, removes `0/0` edge case, aligns displayed score with user expectation.

### D2. Duration display cap (presentation-only)

Introduce display cap constant (`MAX_HISTORY_DURATION_MINUTES = 120`) in presentation layer.

Behavior:
- `durationSeconds <= cap`: render normal duration
- `durationSeconds > cap`: render `>120m` badge/text and optional tooltip (`Recorded duration exceeds trusted range`)

Rationale: avoids mutating persisted data while protecting trust in visible metrics.

### D3. Questions-tab review navigation context

Pass current filtered-page context into question links:
- Add query params for history review context (for current page only), e.g.:
  - `historySeq=<comma-separated slugs>`
  - `historyIndex=<current index>`
  - preserve existing `historyHref`

On question page:
- If `sessionId` present: existing session navigator behavior (unchanged)
- Else if history sequence params present: build history-sequence navigator

Rationale: achieves parity without introducing server-side ephemeral storage.

### D4. Session row primary action

Session header text block becomes a link/button to first available session question in review mode.
- Continue to keep breakdown toggle for detailed per-question status.

Requires:
- Session history row UI has access to first available question slug.
- If unavailable, disable primary link with clear fallback.

### D5. Breakdown action

Add `Review session` CTA in expanded breakdown panel, targeting first available reviewable question.

### D6. Hover visibility + robust audit

UI tokens:
- Increase hover visibility via darker/lighter delta and/or border shift.

Test harness:
- Replace rgb-only parser logic with browser-side color normalization (canvas conversion) in E2E helper.

### D7. Sessions filter/count parity

Extend Sessions query params and parsing with `mode` filter.
Display `Showing X–Y of Z` analogous to Questions tab.

### D8. Single back link for History origin

In `QuestionView`, suppress top-right back link when `origin === 'history'`; keep bottom action-bar link.

### D9. Grouped Select controls

Install/use design-system Select primitives for all four filters.
Tag filter groups:
- Topic
- Substance
- Treatment

### D10. Labeling and truncation semantics

- CTA text:
  - `Practice Again` when prior attempt was correct and context is standalone history review
  - `Try Again` otherwise
- Replace fixed char truncation strategy with sentence-aware preview helper.

---

## 4. Files and Responsibilities

### Application / Domain

- `src/application/use-cases/get-session-history.ts`
  - denominator update
- `src/domain/services/session-stats.ts` (optional)
  - keep raw duration calc; no persistence change required for this spec

### History UI

- `app/(app)/app/history/page.tsx`
  - pass grouped tag metadata + sessions filter state
- `app/(app)/app/history/history-search-params.ts`
  - add sessions mode filter + questions sort params + history sequence parsing helpers
- `app/(app)/app/history/components/history-sessions-tab.tsx`
  - clickable summary, review-session CTA, count line, mode filter UI
- `app/(app)/app/history/components/history-questions-tab.tsx`
  - design-system Selects, grouped tags, sort control, history sequence link params, truncation helper usage
- `app/(app)/app/shared/components/session-breakdown-list.tsx`
  - keep per-question links; integrate with new review-session CTA container

### Question Review UI

- `app/(app)/app/questions/[slug]/page.tsx`
  - parse additional history sequence params
- `app/(app)/app/questions/[slug]/question-page-client.tsx`
  - history-sequence navigation, single back link policy, label logic (`Try Again` vs `Practice Again`)
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts`
  - derive navigation state from history sequence when no `sessionId`

### Shared UI / Helpers

- `components/ui/select.tsx` (or equivalent generated primitive)
- `src/adapters/shared/stem-preview.ts`
  - sentence-aware truncation API

### E2E Test Harness

- `tests/e2e/helpers/color-utils.ts`
  - replace rgb-only parsing with color normalization supporting `oklab(...)`
- `tests/e2e/bs-028-history-ux-audit.spec.ts`
  - keep as regression suite; update P1-6 assertion implementation only (expected behavior remains)

---

## 5. Tests First (Red > Green > Refactor)

### Unit / Component

1. `get-session-history.test.ts`
- Tutor denominator uses `questionCount`.
- No `0/0` edge case when session has question IDs.

2. `history-sessions-tab.test.tsx` / browser spec
- row summary renders unified denominator.
- count text renders (`Showing X–Y of Z`).
- mode filter round-trips query params.
- summary primary action present and keyboard-focusable.
- breakdown includes `Review session` action.

3. `history-questions-tab.test.tsx` / browser spec
- renders grouped tag options by kind.
- sort control present and wired to URL params.
- question links include history sequence context.
- previews truncate at sentence boundaries.

4. `question-page-client.test.tsx`
- for history origin, only one `Back to History` link rendered.
- standalone history review shows `Practice Again` when prior attempt correct.
- standalone history review shows `Try Again` when prior attempt incorrect.
- history sequence context produces navigator + `Question X of Y`.

5. `stem-preview.test.ts`
- sentence-aware truncation behavior for long markdown stems.

### E2E

`tests/e2e/bs-028-history-ux-audit.spec.ts`
- Existing failing assertions should pass for confirmed findings in scope.
- P1-6 uses robust color conversion and verifies minimum hover contrast delta.
- P7 remains informational only (not a required fail/pass gate in this spec).

---

## 6. Rollout Plan

### Phase 1 (P0/P1 trust and navigation)
- FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

### Phase 2 (P2 parity and consistency)
- FR-7, FR-8, FR-13, FR-9

### Phase 3 (P3 polish and study ergonomics)
- FR-10, FR-11, FR-12

Each phase merges only after:
- typecheck
- lint
- unit tests
- targeted E2E for touched behavior

---

## 7. Acceptance Criteria

- BS-028 confirmed findings in scope are no longer reproducible.
- `tests/e2e/bs-028-history-ux-audit.spec.ts` passes for in-scope checks.
- `history` origin question pages render one back link only.
- Questions-tab review has navigation parity without `sessionId`.
- No duplicate `Other` filter entries in a flattened list context.
- Native `<select>` controls are removed from History Questions filters.

---

## 8. Related

- [BS-028](../brainstorming/bs-028-history-session-scoring-and-navigation-gaps.md)
- [SPEC-027](../_archive/specs/spec-027-session-review-navigation.md)
- [SPEC-037](../_archive/specs/spec-037-tab-switch-visual-unification.md)
- [docs/dev/testing-infrastructure.md](../dev/testing-infrastructure.md)
