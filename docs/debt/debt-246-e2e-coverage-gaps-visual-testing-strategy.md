# DEBT-246: E2E Coverage Gaps After Pyramid Rebalancing and Visual/CSS Testing Strategy

**Status:** Open
**Priority:** P3
**Date:** 2026-02-24
**Owner:** Test Infrastructure
**Related:** DEBT-245 (resolved — removed 5 audit E2E specs, 2,590 lines)

---

## Description

DEBT-245 correctly removed 5 audit-heavy E2E specs that were testing CSS classes, hover states, and design-system compliance at the wrong layer. This was the right call for pyramid rebalancing. However, it left two categories of coverage gaps:

1. **Functional gaps** — features only tested by deleted specs, with no remaining coverage at any layer
2. **Visual/CSS audit gaps** — design-system compliance checks that need to be backfilled at the correct testing layer (component tests, not E2E)

This debt documents both categories and prescribes the correct testing layer for each.

## Impact

- **Functional gaps** mean regressions in Quick Practice, action bar consistency, and score denominator accuracy would go undetected.
- **Visual/CSS gaps** are lower risk (design drift, not functional breakage) but should be addressed systematically to prevent a second round of ad-hoc E2E audit specs.

---

## Category 1: Functional Gaps (Backfill Required)

These are behavioral features that had E2E coverage only in deleted specs. They need new tests at the correct layer.

### Gap 1.1: Quick Practice Page (`/app/practice/quick`)

**What's missing:** Zero E2E coverage of the Quick Practice page. No spec navigates to it, starts a quick session, or submits an answer.

**Deleted coverage:** `bs-019-action-bar-audit.spec.ts` tested pre/post-submit action bar states; `brainstorming-audit.spec.ts` tested status filters.

**Existing partial coverage:** `quick-practice-client.test.tsx` exists as a component test.

**Backfill:**
- Add a Quick Practice smoke test to `tests/e2e/practice.spec.ts` (navigate, see question, submit, see feedback — 10-15 lines).

### Gap 1.2: "Mark for Review" Button in Exam Mode

**What's missing:** No test verifies the "Mark for review" button exists in exam mode action bar.

**Deleted coverage:** `bs-019-action-bar-audit.spec.ts` checked button presence and element type.

**Existing partial coverage:** `practice.spec.ts` covers exam mode flow (submit, review, submit exam) but doesn't assert "Mark for review" presence.

**Backfill:**
- Add one assertion to the existing exam mode test in `practice.spec.ts`: verify "Mark for review" button is visible during exam question answering.

### Gap 1.3: Score Denominator Accuracy

**What's missing:** No test verifies that a tutor session score shows X/N (total questions) not X/M (answered questions) when a session ends with unanswered questions.

**Deleted coverage:** `bs-028-history-ux-audit.spec.ts` created a 2-question session, answered only 1, and verified the denominator was 2.

**Backfill:**
- This is a **domain/use-case** concern, not UI. Add a unit test in `src/application/use-cases/` or `src/domain/` that verifies session summary stats use `questionCount` (total requested) as the denominator, not `answeredCount`.

### Gap 1.4: Action Bar Button Ordering and Disabled States

**What's missing:** No test verifies button ordering (Previous < Submit/Try Again < Next) or disabled states at question boundaries (Previous disabled on Q1, Next disabled on last question).

**Deleted coverage:** `bs-019-action-bar-audit.spec.ts` exhaustively checked all modes.

**Existing partial coverage:** `session-review-navigation.spec.ts` checks prev/next navigation in review mode. `practice.spec.ts` uses Submit and Next buttons but doesn't assert ordering or disabled states.

**Backfill:**
- Add assertions to the component test for the action bar (e.g., `bottom-action-bar.test.tsx` or equivalent). Verify button ordering via rendered DOM order and disabled attribute at boundary positions.

### Gap 1.5: Choice Label Desync Regression Guard

**What's missing:** No test verifies that the letter-to-text mapping in the QuestionCard matches the Feedback section's "Why other answers are wrong" labels.

**Deleted coverage:** `brainstorming-audit.spec.ts` submitted a question with per-choice explanations and compared the mappings.

**Backfill:**
- Add a component test (`*.test.tsx`) that renders a question with per-choice explanations, simulates submission, and verifies letter labels match between the choice list and the feedback section. This is a `renderToStaticMarkup` test.

---

## Category 2: Visual/CSS Audit Gaps (Testing Strategy)

These are design-system compliance checks that were testing CSS classes, hover states, focus rings, and dark mode contrast at the E2E layer. They belong at the **component test** layer.

### Why Not E2E?

E2E tests (Playwright) for CSS properties are:
- **Brittle** — break on any design refactor, Tailwind version bump, or class rename
- **Slow** — require full browser + server stack for what is essentially a static rendering check
- **Maintenance burden** — 2,590 lines of deleted specs were predominantly CSS assertions
- **Wrong feedback loop** — design drift should be caught at build time, not in 3-minute CI pipelines

### Where Visual/CSS Tests Belong in React + TypeScript

| Test Type | Tool | Pattern | Example |
|-----------|------|---------|---------|
| **Semantic structure** | Vitest + `renderToStaticMarkup` | `*.test.tsx` colocated | Verify card renders as `<a>` vs `<div>`, has correct `role`, `tabindex`, `aria-pressed` |
| **Design token regression** | Vitest + `renderToStaticMarkup` | `*.test.tsx` colocated | Verify component uses `text-success` not `text-emerald-500`, has `focus-visible:ring` |
| **Class-based behavior encoding** | Vitest + `renderToStaticMarkup` | `*.test.tsx` colocated | Verify `sr-only` on screen-reader text, `cursor-pointer` on interactive elements |
| **Dark mode CSS variables** | Vitest + source file read | `theme-token-regression.test.tsx` | Parse `globals.css`, verify `--background`, `--card`, `--ring` values |
| **WCAG contrast ratios** | Vitest + color math | `*.test.ts` | Parse HSL values from CSS variables, compute contrast ratio, assert >= 3:1 |
| **Interactive hover/focus states** | Vitest Browser Mode | `*.browser.spec.tsx` | Render component, hover, assert computed style changes |
| **Cross-component consistency** | Vitest + snapshot or assertion | `*.test.tsx` | Verify all stat cards use same hover pattern, all links use same focus ring |

### Specific Visual Gaps to Backfill

| Gap | What to Test | Correct Layer | File |
|-----|-------------|---------------|------|
| Focus ring on links | `focus-visible:ring` class on interactive links | Component test | Colocated `*.test.tsx` per component |
| Misleading hover on non-interactive cards | Cards without `href`/`onClick` should NOT have `hover:bg-muted` | Component test | `dashboard/page.test.tsx`, `marketing-home.test.tsx` |
| Dark mode contrast | `--card` vs `--background` lightness delta >= threshold | Already covered | `theme-token-regression.test.tsx` |
| Card interaction pattern consistency | Pattern A (card-as-link) vs Pattern B (inner targets) vs Pattern C (card-level click) | Component test | History tab tests, bookmark tests |
| Tab bar vs SegmentedControl visual parity | Active state styling consistency | Already covered | `tab-switch-styles.test.ts` |

### Existing Component Tests That Already Cover Some Visual Concerns

These tests exist and partially absorb deleted E2E coverage:

- `components/theme-token-regression.test.tsx` — dark mode CSS variable values
- `components/ui/tab-switch-styles.test.ts` — tab bar vs SegmentedControl active state
- `components/marketing/marketing-home.test.tsx` — marketing page structure
- `app/(app)/app/dashboard/page.test.tsx` — dashboard card rendering
- `app/(app)/app/history/components/history-sessions-tab.test.tsx` — session list rendering
- `app/(app)/app/history/components/history-questions-tab.test.tsx` — question list rendering
- `app/(app)/app/bookmarks/page.test.tsx` — bookmark card rendering
- `src/application/shared/shuffled-choice-views.test.ts` — choice label ordering

---

## Resolution Plan

### Phase 1: Functional Backfill (P3 — do when touching these areas)

1. Add Quick Practice E2E smoke (Gap 1.1) — ~15 lines in `practice.spec.ts`
2. Assert "Mark for review" in exam mode (Gap 1.2) — 1 assertion in `practice.spec.ts`
3. Unit test score denominator (Gap 1.3) — new or existing domain test
4. Component test action bar ordering (Gap 1.4) — colocated `*.test.tsx`
5. Component test choice label parity (Gap 1.5) — colocated `*.test.tsx`

### Phase 2: Visual/CSS Backfill (P4 — do during design system work)

1. Add `focus-visible:ring` assertions to link-heavy component tests
2. Add "no misleading hover" assertions to non-interactive card tests
3. Verify card interaction pattern (A/B/C) consistency in component tests

---

## Verification

- [ ] Each functional gap has a test at the correct layer
- [ ] No new E2E specs created for CSS class assertions
- [ ] Existing component tests extended rather than new audit files created
- [ ] `pnpm test --run` passes with new assertions

## Related

- [DEBT-245](../_archive/debt/debt-245-e2e-pyramid-drift-and-skip-governance.md) — removed the audit specs
- [DEBT-244](../_archive/debt/debt-244-test-reliability-schema-and-state-drift.md) — deterministic baseline
- `.claude/rules/testing.md` — testing rules (fakes over mocks, TDD, test locations)
