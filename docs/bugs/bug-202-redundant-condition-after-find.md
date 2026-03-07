# BUG-202: Redundant Condition After `.find()`

**Priority:** P4
**Created:** 2026-03-07
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md)
**Status:** Open

---

## Problem

In `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts:73-74`:

```typescript
const failed = responses.find((entry) => !entry.result.ok);
if (failed && !failed.result.ok) {
```

The `.find()` callback selects elements where `!entry.result.ok` is `true`. Therefore, if `failed` is truthy (i.e., an element was found), `!failed.result.ok` is **always** `true` by definition. The second condition is redundant.

---

## Fix

```typescript
const failed = responses.find((entry) => !entry.result.ok);
if (failed) {
```

---

## Impact

No functional impact. The code works correctly. This is a clarity issue — the redundant check suggests the developer wasn't confident about what `.find()` returned, which could confuse future readers.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | All responses succeed | `failed` is `undefined`, block skipped |
| T2 | One response fails | `failed` is truthy, error handling runs |
