# DEBT-224: File Size Audit - Production and Test Files Exceeding Guidelines

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-16
**Decomposed:** 2026-02-18
**Resolved:** 2026-02-19
**Last Verified:** 2026-02-19
**Component:** Codebase-wide

---

## Decomposition

This audit was decomposed into 8 child debt tickets plus 3 follow-up tickets for residual files discovered during final audit. All children are now resolved.

### Original Children (All Resolved)

| Child | Title | Priority | Disposition |
|-------|-------|----------|-------------|
| [DEBT-227](debt-227-split-fake-repositories-into-individual-files.md) | Split fake-repositories.ts Into Individual Files | P3 | B - Split (Resolved) |
| [DEBT-228](debt-228-dry-fake-use-cases-with-generic-base.md) | DRY fake-use-cases.ts With Generic Base Class | P4 | C - DRY (Resolved) |
| [DEBT-229](debt-229-extract-bookmarks-server-action-and-errors.md) | Extract Server Action and Error Handling From bookmarks/page.tsx | P3 | B - Split (Resolved) |
| [DEBT-230](debt-230-decompose-seed-script-into-modules.md) | Decompose seed.ts Into Focused Modules | P4 | B - Split (Resolved) |
| [DEBT-231](debt-231-reduce-browser-spec-probe-duplication.md) | Reduce Browser Spec Probe Component Duplication | P3 | Test bloat (Resolved) |
| [DEBT-232](debt-232-reduce-get-next-question-test-inflation.md) | Reduce get-next-question.test.ts Test Inflation | P3 | Test bloat (Resolved) |
| [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Add WHY Comments to Justified Large Files | P4 | A - Document (Resolved) |
| [DEBT-234](debt-234-add-max-lines-lint-rule.md) | Add max-lines Check to Prevent File Size Regression | P4 | Prevention (Resolved) |

### Follow-Up Children (All Resolved)

| Child | Title | Priority | Disposition |
|-------|-------|----------|-------------|
| [DEBT-235](debt-235-split-migrate-tag-taxonomy-script.md) | Split migrate-tag-taxonomy.ts Into Focused Modules | P3 | B - Split (Resolved) |
| [DEBT-236](debt-236-extract-reconciliation-concurrency-utility.md) | Extract Concurrency Utility and Document Reconciliation Algorithm | P4 | B - Split (Resolved) |
| [DEBT-237](debt-237-extract-reconciliation-test-factory.md) | Extract Reconciliation Test Factory to Reduce Boilerplate | P4 | Test bloat (Resolved) |

## Audit Method

- Line counts were verified with `wc -l`.
- Test counts in this file use `it(...)` declaration count via `rg '^\s*it\('` for consistency.
- Parameterized tests (`it.each`) are noted separately when they expand scenario count.

## Scope Coverage (Verified 2026-02-19)

Current repository snapshot includes:

- **7 production files over 300 lines** (was 13; 6 resolved below threshold)
- **7 test files over 1,000 lines** (was 9; 2 resolved below threshold)

Every current over-threshold TypeScript/JavaScript file is listed below.

### Files Investigated - No Action Needed (Disposition A)

These files were reviewed and judged to be deep/cohesive modules. Documented via DEBT-233.

| File | Lines | Justification |
|------|------:|---------------|
| `db/schema.ts` | 553 | SSOT for schema; splitting increases scatter and migration risk |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | 443 | Cohesive repository with related query surface |
| `app/(app)/app/history/components/history-questions-tab.tsx` | 398 | Cohesive view composition for one tab |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | 337 | Cohesive question-view client module |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 326 | Single async orchestration concern |
| `app/(app)/app/practice/components/practice-view.tsx` | 319 | Cohesive prop-driven presentation component; no internal state beyond refs |
| `scripts/tag-census.ts` | 301 | Single-purpose CLI script; well-factored into pure render functions |

### Test Files Investigated - Acceptable

These tests are large but currently justified by scenario/domain breadth. Monitor, do not force split.

| File | Lines | Declared `it(...)` Tests | Lines/Test | Verdict |
|------|------:|-------------------------:|-----------:|---------|
| `tests/integration/repositories.integration.test.ts` | 2,193 | 46 | 47.7 | Integration surface is broad and intentionally verbose |
| `app/(app)/app/practice/practice-page-logic.test.ts` | 1,277 | 48 | 26.6 | Scenario-rich unit suite; no dominant boilerplate smell |
| `src/adapters/gateways/stripe-payment-gateway.test.ts` | 1,171 | 33 | 35.5 | Acceptable; includes `it.each` expansions |
| `src/application/test-helpers/fakes.test.ts` | 1,151 | 58 | 19.8 | High coverage; grew 55 lines from DEBT-227 split (new fake tests) |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 1,133 | 38 | 29.8 | Large but still readable by concern blocks |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx` | 1,076 | 13 | 82.8 | DEBT-231 reduced from 1,458; browser overhead justifies ratio; probes extracted |
| `src/adapters/controllers/practice-controller.test.ts` | 1,041 | 39 | 26.7 | Controller surface area justifies current size |

## Complete Inventory - Production Files Over 300 Lines

| # | File | Lines | Tracking | Notes |
|---|------|------:|----------|-------|
| 1 | `db/schema.ts` | 553 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 2 | `src/adapters/repositories/drizzle-attempt-repository.ts` | 443 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 3 | `app/(app)/app/history/components/history-questions-tab.tsx` | 398 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 4 | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 337 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 5 | `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 326 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 6 | `app/(app)/app/practice/components/practice-view.tsx` | 319 | Investigated acceptable | Cohesive prop-driven presentation; no split opportunity |
| 7 | `scripts/tag-census.ts` | 301 | Investigated acceptable | Single-purpose CLI; well-factored pure functions |

### Previously Over Threshold - Now Resolved

| File | Was | Now | Resolution |
|------|----:|----:|------------|
| `src/application/test-helpers/fakes/fake-repositories.ts` | 1,127 | deleted | DEBT-227: Split into 13 individual fake files |
| `scripts/seed.ts` | 484 | 58 | DEBT-230: Decomposed into `scripts/seed/` modules |
| `scripts/migrate-tag-taxonomy.ts` | 571 | 182 | DEBT-235: Decomposed into `scripts/migrate-tag-taxonomy/` modules |
| `app/(app)/app/bookmarks/page.tsx` | 322 | 263 | DEBT-229: Extracted server action and error handling |
| `src/application/test-helpers/fakes/fake-use-cases.ts` | 320 | 78 | DEBT-228: DRY with generic base class |
| `src/adapters/jobs/reconcile-stripe-subscriptions.ts` | 315 | 294 | DEBT-236: Extracted shared concurrency utility and phase comments |

## Complete Inventory - Test Files Over 1,000 Lines

| # | File | Lines | `it()` | Lines/Test | Tracking | Notes |
|---|------|------:|-------:|-----------:|----------|-------|
| 1 | `tests/integration/repositories.integration.test.ts` | 2,193 | 46 | 47.7 | Investigated acceptable | Keep; monitor |
| 2 | `app/(app)/app/practice/practice-page-logic.test.ts` | 1,277 | 48 | 26.6 | Investigated acceptable | Keep; monitor |
| 3 | `src/adapters/gateways/stripe-payment-gateway.test.ts` | 1,171 | 33 | 35.5 | Investigated acceptable | Keep; monitor |
| 4 | `src/application/test-helpers/fakes.test.ts` | 1,151 | 58 | 19.8 | Investigated acceptable | Keep; monitor (grew from DEBT-227 split) |
| 5 | `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 1,133 | 38 | 29.8 | Investigated acceptable | Keep; monitor |
| 6 | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx` | 1,076 | 13 | 82.8 | [DEBT-231](debt-231-reduce-browser-spec-probe-duplication.md) | Reduced from 1,458; browser overhead justifies ratio (Resolved) |
| 7 | `src/adapters/controllers/practice-controller.test.ts` | 1,041 | 39 | 26.7 | Investigated acceptable | Keep; monitor |

### Previously Over Threshold - Now Resolved

| File | Was | Now | Resolution |
|------|----:|----:|------------|
| `src/application/use-cases/get-next-question.test.ts` | 1,020 | 741 | DEBT-232: Reduced boilerplate-heavy setup |
| `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` | 1,085 | 899 | DEBT-237: Extracted reconciliation test scenario factory and reduced setup boilerplate |

## Forest-First Decision Guardrails

To avoid "line-count cargo culting," apply this decision order:

1. **Robustness first:** Split only when change isolation, correctness, or test clarity improves.
2. **Do not reward hacks:** No artificial tiny files, no abstraction layers added only to satisfy line caps.
3. **Protect deep modules:** If a module is cohesive and stable, document WHY (DEBT-233) instead of splitting.
4. **Track residuals explicitly:** Do not archive this master while any over-threshold file lacks either a debt ticket or a documented "acceptable" rationale.

## Impact

- Cognitive load and merge-conflict surface increase with file size concentration
- Untracked residual files create blind spots and delayed regressions
- Without automation (DEBT-234), debt can regress after cleanup

## Resolution Strategy

1. ~~Resolve DEBT-227/229/231/232 where measurable duplication/mixed concerns already exist.~~ ✅ Done
2. ~~Resolve DEBT-233 to lock in justified exceptions.~~ ✅ Done
3. ~~Resolve DEBT-234 to prevent silent regression.~~ ✅ Done
4. ~~Create follow-up debt tickets for residual over-threshold files.~~ ✅ Done (DEBT-235, DEBT-236, DEBT-237)
5. ~~Resolve DEBT-235 or re-evaluate as acceptable before archiving this master.~~ ✅ Done

## Acceptance Criteria

- [x] All line counts and test counts in this document match current repository values (verified 2026-02-19)
- [x] Every over-threshold file is listed and mapped to either:
  - a child debt ticket, or
  - an investigated acceptable rationale
- [x] No residual over-threshold files remain untracked
- [x] DEBT-227 through DEBT-234 stay title/status/priority-consistent with this master and the index
- [x] DEBT-235 resolved or re-evaluated before archiving this master

## Related

- [DEBT-193](debt-193-backend-production-files-over-300-lines.md) - Previous production file audit
- [DEBT-204](debt-204-stripe-payment-gateway-test-god-file.md) - Stripe test god file
- [DEBT-163](debt-163-fakes-file-approaching-split-threshold.md) - Fakes file threshold
- [DEBT-139](debt-139-production-files-exceed-size-guardrail.md) - Earlier global guardrail attempt
