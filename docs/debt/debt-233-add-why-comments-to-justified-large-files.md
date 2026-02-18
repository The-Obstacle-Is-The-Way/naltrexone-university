# DEBT-233: Add WHY Comments to Justified Large Files

**Status:** Open
**Priority:** P4
**Date:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** 5 production files (Disposition A)

---

## Description

Five production files exceed the 300-line guideline but are justified as "deep modules" doing one thing well (Ousterhout's principle). Each should receive a `// WHY:` comment at the top explaining why its size is acceptable, to prevent future developers from reflexively splitting them.

| File | Lines | Justification |
|------|------:|---------------|
| `db/schema.ts` | 548 | SSOT for all database tables; splitting would scatter related columns |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | 438 | Deep module: 12 cohesive query methods for one entity |
| `app/(app)/app/history/components/history-questions-tab.tsx` | 393 | Cohesive presentation component; helpers are integral to the view |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | 321 | Single-concern async flow orchestration; 5 tightly coupled functions |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | 331 | Cohesive question viewer; navigation helpers are integral to rendering |

**Disposition:** A — Deep modules doing one thing well. Document, don't split.

## Impact

- Without WHY comments, future audits will re-flag these same files
- Prevents unnecessary refactoring of well-designed modules

## Resolution

Add a `// WHY:` block comment near the top of each file (after imports, before first export). Example:

```typescript
// WHY: This file exceeds the 300-line guideline intentionally.
// It is a deep module (Ousterhout) with a single responsibility: [description].
// Splitting would create shallow modules without reducing complexity.
// Reviewed in DEBT-224 audit (2026-02-18).
```

## Verification

- [ ] All 5 files have WHY comments
- [ ] Comments reference DEBT-224 and explain the justification
- [ ] No functional changes to any file
- [ ] `pnpm typecheck` passes

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
- [DEBT-193](../_archive/debt/debt-193-backend-production-files-over-300-lines.md) — Previous audit that established the 300-line guideline
