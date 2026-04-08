# DEBT-354: God-File and Clean-Code Audit

**Priority:** P2
**Created:** 2026-04-08
**Source:** April 2026 debt sweep
**Related:** [DEBT-224](../_archive/debt/debt-224-file-size-audit-production-and-test.md), [DEBT-234](../_archive/debt/debt-234-add-max-lines-lint-rule.md), [DEBT-350](./debt-350-exam-results-session-continuity.md), [scripts/check-file-size.sh](../../scripts/check-file-size.sh)

---

## Context

This audit was a fresh pass over the current production codebase looking for:

- god files
- Clean Code / DRY violations
- Clean Architecture boundary drift
- SOLID violations with real maintenance cost
- test-pattern drift against the repo's "fakes over mocks" rule

The good news is that the inner architecture is still disciplined:

- `src/domain/**` remains free of framework and outer-layer imports
- `src/application/**` still avoids adapter/framework coupling in production code

The debt is concentrated in the outer app layer, especially the question/practice
surface.

## Current High-Water Files

Line counts were rechecked on 2026-04-08.

| File | Current Lines | DEBT-224 Lines | Delta | Audit Disposition |
|------|--------------:|---------------:|------:|-------------------|
| `db/schema.ts` | 639 | 553 | +86 | Still acceptable SSOT deep module |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | 531 | 443 | +88 | Still acceptable but needs monitoring |
| `app/(app)/app/history/components/history-questions-tab.tsx` | 572 | 398 | +174 | Large, but still one coherent tab renderer |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | 523 | 337 | +186 | Concerning; now tied to duplicated question-surface debt |
| `app/(app)/app/practice/components/practice-view.tsx` | 496 | 319 | +177 | Concerning; now tied to duplicated question-surface debt |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | 424 | — | new | Concerning; imports practice-feature internals |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` | 402 | — | new | Watchlist; high orchestration density |
| `src/adapters/controllers/practice-controller.ts` | 395 | — | new | Boilerplate-heavy but still structured |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` | 385 | 212 in FE-002 note | +173 | Concerning; already partially tracked by DEBT-350 |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 370 | 326 | +44 | Watchlist; still cohesive but no longer small |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | 360 | — | new | Watchlist; callback/state density is growing |

## Findings

### 1. The repo does not have widespread inner-layer rot

This audit did **not** find domain/application boundary violations in production
code. The architectural drift is primarily in the outer app layer, where
feature-local modules are starting to do double duty as shared infrastructure.

### 2. The main god-file risk is concentrated in the question/practice surface

The hot cluster is now:

- `question-page-client.tsx`
- `practice-view.tsx`
- `question-page-logic.ts`
- `use-practice-session-review-stage.ts`
- `practice-session-page-logic.ts`

These files are not all equally bad, but they now form one dense change area:
question rendering, review hydration, session navigation, post-exam review, and
action-bar behavior.

### 3. Three new debt tickets were opened from this audit

- [DEBT-355](./debt-355-cross-feature-question-flow-coupling.md) for app-layer cross-feature coupling
- [DEBT-356](./debt-356-duplicate-question-surface-renderers.md) for duplicated question-surface rendering
- [DEBT-357](./debt-357-test-double-discipline-drift.md) for test-double discipline drift

### 4. The review-stage knot is real, but already has an active debt owner

`usePracticeSessionReviewStage` has regrown well past the earlier FE-002
"acceptable at 212 lines" checkpoint and now coordinates:

- tutor vs exam finalization
- summary handoff
- post-exam review loading
- navigator reload behavior
- draft-save-before-review behavior

That is a real smell, but the most important correctness/design problem is
already tracked by [DEBT-350](./debt-350-exam-results-session-continuity.md).
This audit deliberately does **not** open a duplicate ticket for the same knot.

### 5. The file-size guardrail explains, but does not prevent, this drift

`scripts/check-file-size.sh` exists and still warns on staged files above 350
lines, but it is:

- warning-only
- staged-file-only
- intentionally permissive for justified exceptions

That is why growth can recur without a hard stop. This is not a new debt ticket
by itself, but it is the mechanism behind the regression pattern.

## What Is Not Being Filed As New Debt

- `db/schema.ts` remains a valid deep module and should stay the schema SSOT
- `DrizzleAttemptRepository` is large, but still reads as one repository surface
- `history-questions-tab.tsx` is oversized but still mostly one page-local view concern
- composition-root route-test `vi.mock()` exceptions remain acceptable when the module cannot be injected cleanly

## Acceptance Criteria

- The current high-water production files are explicitly inventoried
- New debt tickets exist only for concerns that are not already actively tracked
- The review-stage/session-summary knot is referenced through DEBT-350 instead of duplicated
- The debt index links this audit and its child tickets
