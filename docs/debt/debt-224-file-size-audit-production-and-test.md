# DEBT-224: File Size Audit — Production and Test Files Exceeding Guidelines

**Status:** Decomposed
**Priority:** P3
**Date:** 2026-02-16
**Decomposed:** 2026-02-18
**Component:** Codebase-wide

---

## Decomposition

This audit has been investigated and decomposed into 8 individual debt tickets. Resolve the children below, then archive this master document.

| Child | Title | Priority | Disposition |
|-------|-------|----------|-------------|
| [DEBT-227](debt-227-split-fake-repositories-into-individual-files.md) | Split fake-repositories.ts into individual files | P3 | B — Split |
| [DEBT-228](debt-228-dry-fake-use-cases-with-generic-base.md) | DRY fake-use-cases.ts with generic base class | P4 | C — DRY |
| [DEBT-229](debt-229-extract-bookmarks-server-action-and-errors.md) | Extract server action and errors from bookmarks/page.tsx | P3 | B — Split |
| [DEBT-230](debt-230-decompose-seed-script-into-modules.md) | Decompose seed.ts into focused modules | P4 | B — Split |
| [DEBT-231](debt-231-reduce-browser-spec-probe-duplication.md) | Reduce browser spec probe duplication | P3 | Test bloat |
| [DEBT-232](debt-232-reduce-get-next-question-test-inflation.md) | Reduce get-next-question.test.ts inflation | P3 | Test bloat |
| [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Add WHY comments to 5 justified large files | P4 | A — Document |
| [DEBT-234](debt-234-add-max-lines-lint-rule.md) | Add max-lines lint rule to prevent regression | P4 | Prevention |

### Files Investigated — No Action Needed

These files were investigated and determined to be well-designed deep modules (Disposition A):

| File | Lines | Justification |
|------|------:|---------------|
| `db/schema.ts` | 548 | SSOT for all tables; splitting would scatter schema |
| `drizzle-attempt-repository.ts` | 438 | 12 cohesive query methods for one entity |
| `history-questions-tab.tsx` | 393 | Cohesive presentation component |
| `practice-session-page-logic.ts` | 321 | Single-concern async orchestration |
| `question-page-client.tsx` | 331 | Cohesive question viewer |

### Test Files Investigated — Acceptable

These test files were investigated and found to be justified by scenario count or domain complexity:

| File | Lines | Tests | Verdict |
|------|------:|------:|---------|
| `repositories.integration.test.ts` | 2,193 | 46 | Integration tests are inherently verbose |
| `practice-page-logic.test.ts` | 1,277 | 61 | Good ratio at 21 lines/test |
| `stripe-payment-gateway.test.ts` | 1,171 | 39 | Stripe API complexity justifies size |
| `practice-session-page-logic.test.ts` | 1,133 | 50 | Acceptable at 22 lines/test |
| `fakes.test.ts` | 1,096 | 43 | Clean; minor opportunities only |
| `practice-controller.test.ts` | 1,041 | 33 | Justified by action count |

---

## Background: What the Literature Says

| Source | Guidance |
|--------|----------|
| **Uncle Bob (Clean Code)** | Files should average ~50 lines; most under 200; 500 is an extreme upper bound. "File size is a style you impose, not a function of project size." |
| **John Ousterhout (A Philosophy of Software Design)** | Don't over-split into "shallow modules." Depth (powerful functionality behind a simple interface) matters more than raw line count. Splitting should reduce complexity, not just reduce lines. |
| **Pragmatic Programmer** | Modules should be self-contained and focused on one concept. When a file requires scrolling to understand its boundaries, it's doing too much. |

**This project's established thresholds** (from DEBT-193 and DEBT-204):
- **Production files:** 300-line guideline
- **Test files:** No hard cap, but files over ~1,200 lines have been flagged and split before
- **Test helpers:** ~1,500 lines flagged as "approaching split threshold" (DEBT-163)

## Description

A systematic audit of file sizes across the codebase reveals **9 production files over 300 lines** and **8 test files over 1,000 lines**. Some of these are regressions from previously resolved debt (DEBT-193 specifically brought `drizzle-attempt-repository.ts` under cap at 298 lines — it's now 438).

Not every long file is necessarily a problem (see Ousterhout above), but each warrants individual investigation to determine if it's:
- **(A)** A deep module doing one thing well → **Leave it alone**
- **(B)** A file with multiple responsibilities that should be split → **Refactor**
- **(C)** Bloated with boilerplate/duplication that can be extracted → **DRY it up**

## Production Files Over 300 Lines

| # | File | Lines | Disposition | Notes |
|---|------|------:|-------------|-------|
| 1 | `src/application/test-helpers/fakes/fake-repositories.ts` | 1,127 | **Investigate** | Test helper but not a test file. Was 1,472 when DEBT-163 flagged it. Still the biggest non-test file by 2x. One fake per repository — could split to one file per fake. |
| 2 | `db/schema.ts` | 549 | **Likely OK** | Database schemas are inherently declarative and long. Single source of truth for all tables. Splitting by table would scatter related columns. |
| 3 | `src/adapters/repositories/drizzle-attempt-repository.ts` | 438 | **Regression** | Was 298 lines when DEBT-193 was resolved. Grew 47% since. Row mappers were extracted but new methods added. Investigate whether new query methods warrant a second split. |
| 4 | `scripts/seed.ts` | 412 | **Low priority** | One-off dev script, not production code. Not on any hot path. |
| 5 | `app/(app)/app/history/components/history-questions-tab.tsx` | 393 | **Investigate** | UI component. 393 lines for a single tab component suggests mixed concerns (data fetching, filtering, rendering). |
| 6 | `app/(app)/app/bookmarks/page.tsx` | 322 | **Investigate** | Page component slightly over cap. May have inline logic that belongs in a controller hook. |
| 7 | `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 321 | **Investigate** | Logic module. Slightly over cap but dedicated to one concern. May be fine per Ousterhout's "deep module" principle. |
| 8 | `src/application/test-helpers/fakes/fake-use-cases.ts` | 320 | **Investigate** | Test helper. Same pattern as fake-repositories — one fake per use case, could split. |
| 9 | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 319 | **Investigate** | Page component barely over cap. Recently modified by SPEC-030. Check if it has a controller hook extracting logic. |

## Test Files Over 1,000 Lines

| # | File | Lines | Disposition | Notes |
|---|------|------:|-------------|-------|
| 1 | `tests/integration/repositories.integration.test.ts` | 2,190 | **Investigate** | Largest file in the codebase. Tests multiple repositories in one file. Could split to one file per repository. |
| 2 | `app/.../use-practice-session-page-controller.browser.spec.tsx` | 1,457 | **Investigate** | Browser spec for complex hook. May be justified by scenario count, but check for duplicated setup boilerplate (same pattern that bloated DEBT-204). |
| 3 | `app/(app)/app/practice/practice-page-logic.test.ts` | 1,277 | **Investigate** | Unit test for practice page logic. Check for extractable test helpers. |
| 4 | `src/adapters/gateways/stripe-payment-gateway.test.ts` | 1,171 | **Monitor** | Was 2,468 lines, reduced to ~1,223 in DEBT-204. Healthy reduction. May have further extraction opportunities but already addressed once. |
| 5 | `app/.../practice-session-page-logic.test.ts` | 1,133 | **Investigate** | Unit test for session page logic. Similar to #3 — check for extractable helpers. |
| 6 | `src/application/test-helpers/fakes.test.ts` | 1,096 | **Investigate** | Tests for the fake repositories. If fakes are split (item #1 above), these tests should follow. |
| 7 | `src/adapters/controllers/practice-controller.test.ts` | 1,041 | **Investigate** | Controller test. Check for repeated setup patterns. |
| 8 | `src/application/use-cases/get-next-question.test.ts` | 1,020 | **Investigate** | Use case test. At the threshold — may be fine if scenarios are distinct. |

## Impact

- **Cognitive load:** Files over 500 lines require developers to hold more context in working memory
- **Merge conflicts:** Longer files have higher conflict surface area, especially in the practice session area (which dominates both lists)
- **Regression risk:** Production files that were previously brought under cap (DEBT-193) have grown back, suggesting the 300-line guideline isn't enforced
- **Onboarding friction:** New contributors must scroll extensively to understand boundaries

## Resolution Strategy

Each file should be investigated individually. The resolution is NOT "blindly split everything" — Ousterhout warns against creating shallow modules just to hit a line count. Instead:

1. **For each production file over 300 lines:** Determine if it has multiple responsibilities. If yes, extract. If it's a deep module doing one thing, document why it's acceptable.
2. **For each test file over 1,200 lines:** Look for duplicated setup boilerplate (the pattern that caused DEBT-204). Extract shared test helpers where repeated.
3. **For regressions (drizzle-attempt-repository.ts):** Understand what grew and whether new extraction points exist.
4. **Consider a lint rule:** `max-lines` in Biome or ESLint to prevent future regression. Exempt `db/schema.ts` and integration test files.

## Acceptance Criteria

- [ ] Each file in the tables above has been individually investigated
- [ ] Files with multiple responsibilities have been split
- [ ] Files that are justified as "deep modules" are documented with a `// WHY: ...` comment at the top explaining their size
- [ ] `drizzle-attempt-repository.ts` regression is specifically addressed
- [ ] Consider adding `max-lines` lint rule to prevent future regression

## Related

- [DEBT-193](../_archive/debt/debt-193-backend-production-files-over-300-lines.md) — Previous production file audit (resolved 2026-02-09)
- [DEBT-204](../_archive/debt/debt-204-stripe-payment-gateway-test-god-file.md) — Stripe test god file (resolved 2026-02-09)
- [DEBT-163](../_archive/debt/debt-163-fakes-file-approaching-split-threshold.md) — Fakes file split threshold (resolved 2026-02-08)
- [DEBT-139](../_archive/debt/debt-139-production-files-exceed-size-guardrail.md) — Global 300-line guardrail (invalidated as too blunt — this audit takes a nuanced, per-file approach instead)
