# DEBT-062: Confusing Redirect Control Flow Relied on `redirect()` Throwing

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The pricing subscribe redirect logic previously relied on `redirect()` throwing to terminate execution, without explicit `return` statements. That made the control flow easy to misread and riskier to refactor.

## Resolution

- Refactored the shared redirect logic into `app/pricing/subscribe-action.ts` and made each branch explicit with `return`.
- Moved the production subscribe server actions to `app/pricing/subscribe-actions.ts`, which calls the helper and performs the actual `redirect()`.

## Verification

- [x] Unit tests: `app/pricing/page.test.tsx` covers redirect branching via a fake `redirectFn`.
- [x] E2E: `CI=1 pnpm test:e2e` passes.

## Related

- `app/pricing/subscribe-action.ts`
- `app/pricing/subscribe-actions.ts`
