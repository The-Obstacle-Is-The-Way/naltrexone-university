# DEBT-224: File Size Audit - Production and Test Files Exceeding Guidelines

**Status:** Decomposed
**Priority:** P3
**Date:** 2026-02-16
**Decomposed:** 2026-02-18
**Last Verified:** 2026-02-18
**Component:** Codebase-wide

---

## Decomposition

This audit has been decomposed into 8 child debt tickets. The table below is title-accurate with current child docs.

| Child | Title | Priority | Disposition |
|-------|-------|----------|-------------|
| [DEBT-227](debt-227-split-fake-repositories-into-individual-files.md) | Split fake-repositories.ts Into Individual Files | P3 | B - Split |
| [DEBT-228](debt-228-dry-fake-use-cases-with-generic-base.md) | DRY fake-use-cases.ts With Generic Base Class | P4 | C - DRY |
| [DEBT-229](debt-229-extract-bookmarks-server-action-and-errors.md) | Extract Server Action and Error Handling From bookmarks/page.tsx | P3 | B - Split |
| [DEBT-230](debt-230-decompose-seed-script-into-modules.md) | Decompose seed.ts Into Focused Modules | P4 | B - Split |
| [DEBT-231](debt-231-reduce-browser-spec-probe-duplication.md) | Reduce Browser Spec Probe Component Duplication | P3 | Test bloat |
| [DEBT-232](debt-232-reduce-get-next-question-test-inflation.md) | Reduce get-next-question.test.ts Test Inflation | P3 | Test bloat |
| [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Add WHY Comments to Justified Large Files | P4 | A - Document |
| [DEBT-234](debt-234-add-max-lines-lint-rule.md) | Add max-lines Lint Rule to Prevent File Size Regression | P4 | Prevention |

## Audit Method

- Line counts were verified with `wc -l`.
- Test counts in this file use `it(...)` declaration count via `rg '^\\s*it\\('` for consistency.
- Parameterized tests (`it.each`) are noted separately when they expand scenario count.

## Scope Coverage (Verified)

Current repository snapshot includes:

- **13 production files over 300 lines**
- **9 test files over 1,000 lines**

Every current over-threshold TypeScript/JavaScript file is listed below.

### Files Investigated - No Action Needed (Disposition A)

These files were reviewed and judged to be deep/cohesive modules. They should be documented (DEBT-233), not split.

| File | Lines | Justification |
|------|------:|---------------|
| `db/schema.ts` | 548 | SSOT for schema; splitting increases scatter and migration risk |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | 438 | Cohesive repository with related query surface |
| `app/(app)/app/history/components/history-questions-tab.tsx` | 393 | Cohesive view composition for one tab |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 321 | Single async orchestration concern |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | 331 | Cohesive question-view client module |

### Test Files Investigated - Acceptable

These tests are large but currently justified by scenario/domain breadth. Monitor, do not force split.

| File | Lines | Declared `it(...)` Tests | Verdict |
|------|------:|-------------------------:|---------|
| `tests/integration/repositories.integration.test.ts` | 2,193 | 46 | Integration surface is broad and intentionally verbose |
| `app/(app)/app/practice/practice-page-logic.test.ts` | 1,277 | 48 | Scenario-rich unit suite; no dominant boilerplate smell |
| `src/adapters/gateways/stripe-payment-gateway.test.ts` | 1,171 | 33 | Acceptable; includes `it.each` expansions (41 scenarios total) |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 1,133 | 38 | Large but still readable by concern blocks |
| `src/application/test-helpers/fakes.test.ts` | 1,096 | 54 | High coverage; mostly behavior-focused |
| `src/adapters/controllers/practice-controller.test.ts` | 1,041 | 39 | Controller surface area justifies current size |

## Complete Inventory - Production Files Over 300 Lines

| # | File | Lines | Tracking | Notes |
|---|------|------:|----------|-------|
| 1 | `src/application/test-helpers/fakes/fake-repositories.ts` | 1,127 | [DEBT-227](debt-227-split-fake-repositories-into-individual-files.md) | Split into per-fake files |
| 2 | `scripts/migrate-tag-taxonomy.ts` | 591 | Residual (new debt ticket needed) | Large migration script, currently un-decomposed |
| 3 | `db/schema.ts` | 548 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 4 | `scripts/seed.ts` | 484 | [DEBT-230](debt-230-decompose-seed-script-into-modules.md) | Script decomposition candidate |
| 5 | `src/adapters/repositories/drizzle-attempt-repository.ts` | 438 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 6 | `app/(app)/app/history/components/history-questions-tab.tsx` | 393 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 7 | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 331 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 8 | `app/(app)/app/bookmarks/page.tsx` | 322 | [DEBT-229](debt-229-extract-bookmarks-server-action-and-errors.md) | Split mixed concerns |
| 9 | `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 321 | [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) | Deep module; document WHY |
| 10 | `src/application/test-helpers/fakes/fake-use-cases.ts` | 320 | [DEBT-228](debt-228-dry-fake-use-cases-with-generic-base.md) | Remove duplication |
| 11 | `app/(app)/app/practice/components/practice-view.tsx` | 319 | Residual (new debt ticket needed) | Slightly over cap, not yet triaged |
| 12 | `src/adapters/jobs/reconcile-stripe-subscriptions.ts` | 315 | Residual (new debt ticket needed) | Hot-path job module, not yet triaged |
| 13 | `scripts/tag-census.ts` | 301 | Residual (new debt ticket needed) | Near-threshold script file |

## Complete Inventory - Test Files Over 1,000 Lines

| # | File | Lines | Tracking | Notes |
|---|------|------:|----------|-------|
| 1 | `tests/integration/repositories.integration.test.ts` | 2,193 | Investigated acceptable | Keep; monitor |
| 2 | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx` | 1,457 | [DEBT-231](debt-231-reduce-browser-spec-probe-duplication.md) | Duplicate probe/test setup |
| 3 | `app/(app)/app/practice/practice-page-logic.test.ts` | 1,277 | Investigated acceptable | Keep; monitor |
| 4 | `src/adapters/gateways/stripe-payment-gateway.test.ts` | 1,171 | Investigated acceptable | Keep; monitor |
| 5 | `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 1,133 | Investigated acceptable | Keep; monitor |
| 6 | `src/application/test-helpers/fakes.test.ts` | 1,096 | Investigated acceptable | Keep; monitor |
| 7 | `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` | 1,085 | Residual (new debt ticket needed) | Large adapter test file, not yet triaged |
| 8 | `src/adapters/controllers/practice-controller.test.ts` | 1,041 | Investigated acceptable | Keep; monitor |
| 9 | `src/application/use-cases/get-next-question.test.ts` | 1,020 | [DEBT-232](debt-232-reduce-get-next-question-test-inflation.md) | Boilerplate-heavy setup |

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

1. Resolve DEBT-227/229/231/232 where measurable duplication/mixed concerns already exist.
2. Resolve DEBT-233 to lock in justified exceptions.
3. Resolve DEBT-234 to prevent silent regression.
4. Create follow-up debt tickets for the four residual production files and one residual test file before archiving this master.

## Acceptance Criteria

- [ ] All line counts and test counts in this document match current repository values
- [ ] Every over-threshold file is listed and mapped to either:
  - a child debt ticket, or
  - an investigated acceptable rationale
- [ ] No residual over-threshold files remain untracked
- [ ] DEBT-227 through DEBT-234 stay title/status/priority-consistent with this master and the index

## Related

- [DEBT-193](../_archive/debt/debt-193-backend-production-files-over-300-lines.md) - Previous production file audit
- [DEBT-204](../_archive/debt/debt-204-stripe-payment-gateway-test-god-file.md) - Stripe test god file
- [DEBT-163](../_archive/debt/debt-163-fakes-file-approaching-split-threshold.md) - Fakes file threshold
- [DEBT-139](../_archive/debt/debt-139-production-files-exceed-size-guardrail.md) - Earlier global guardrail attempt
