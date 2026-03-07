# BUG-202: Redundant Condition After `.find()`

**Priority:** P4
**Created:** 2026-03-07
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md)
**Status:** Resolved
**Resolved:** 2026-03-07 (commit `25f7c770`)

---

## Original Problem

Before resolution, `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts` contained:

```typescript
const failed = responses.find((entry) => !entry.result.ok);
if (failed && !failed.result.ok) {
```

The `.find()` callback selects elements where `!entry.result.ok` is `true`. Therefore, if `failed` is truthy (i.e., an element was found), `!failed.result.ok` is **always** `true` by definition. The second condition is redundant.

---

## Resolution

```typescript
const failed = responses.find(isFailedQuickPracticeCountResponse);
if (failed) {
```

The runtime simplification remains the same: once `.find()` selects a failed response, `if (failed)` is sufficient. The final implementation adds an explicit type guard for the `.find()` callback so TypeScript still narrows `failed.result.error` after the redundant boolean check is removed.

---

## Impact

No functional impact. The code works correctly. This is a clarity issue — the redundant check suggests the developer wasn't confident about what `.find()` returned, which could confuse future readers.

---

## Verification

- [x] Removed the redundant `&& !failed.result.ok` branch condition
- [x] Preserved type safety with an explicit failure type guard for `.find()`
- [x] Tightened hook test coverage to assert the logged failure payload
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test --run`
- [x] `pnpm test:browser`
- [x] `pnpm test:integration`
- [x] `pnpm build`
