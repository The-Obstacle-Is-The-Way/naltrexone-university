# DEBT-233: Add WHY Comments to Justified Large Files

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-18
**Resolved:** 2026-02-18
**Last Verified:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `db/schema.ts`, `src/adapters/repositories/drizzle-attempt-repository.ts`, `app/(app)/app/history/components/history-questions-tab.tsx`, `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`, `app/(app)/app/questions/[slug]/question-page-client.tsx`

---

## Description

Five production files exceed the 300-line guideline but are justified as "deep modules" doing one thing well (Ousterhout's principle). Each should receive a `// WHY:` comment at the top explaining why its size is acceptable, to prevent future developers from reflexively splitting them.

| File | Lines | Justification |
|------|------:|---------------|
| `db/schema.ts` | 552 | SSOT for all database tables; splitting would scatter related columns |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | 442 | Deep module: cohesive repository query surface |
| `app/(app)/app/history/components/history-questions-tab.tsx` | 397 | Cohesive presentation component; helpers are integral to the view |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 325 | Single-concern async flow orchestration; 7 tightly coupled exported functions |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | 335 | Cohesive question viewer; navigation helpers are integral to rendering |

**Disposition:** A - Deep modules doing one thing well. Document, do not split.

## Impact

- Without WHY comments, future audits will re-flag these same files
- Prevents unnecessary refactoring of well-designed modules

## Why This Is Worth Fixing

- **Robustness gain:** makes architectural intent explicit and reduces churn from unnecessary refactors.
- **Complexity risk to avoid:** comments must explain a real design reason, not serve as a blanket exemption.

## Resolution

Add a `// WHY:` block comment near the top of each file (after imports, before first export). Example:

```typescript
// WHY: This file exceeds the 300-line guideline intentionally.
// It is a deep module (Ousterhout) with a single responsibility: [description].
// Splitting would create shallow modules without reducing complexity.
// Reviewed in DEBT-224 audit (2026-02-18).
```

Guardrail: each comment must name the single responsibility and the concrete downside of splitting.

## Verification

- [x] All 5 files have WHY comments
- [x] Comments reference DEBT-224 and explain the justification
- [x] No functional changes to any file
- [x] `pnpm typecheck` passes

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
- [DEBT-193](debt-193-backend-production-files-over-300-lines.md) - Earlier audit establishing the 300-line guideline
