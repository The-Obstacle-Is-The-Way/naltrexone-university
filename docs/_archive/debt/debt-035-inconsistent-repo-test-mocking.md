# DEBT-035: Inconsistent Repository Tests Use Inline Mocks Instead of Fakes

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-01

---

## Summary

This debt was a **false positive**. The repository tests were using the correct pattern all along.

## What We Thought Was Wrong

```typescript
const db = {
  query: { users: { findFirst: vi.fn(() => null) } },
} as const;
const repo = new DrizzleUserRepository(db as unknown as RepoDb);
```

## Why It's Actually Correct

This **is** a fake passed through dependency injection. The `vi.fn()` is just a spy utility inside the fake object. This follows the correct pattern:

| Pattern | Description | Verdict |
|---------|-------------|---------|
| Fake + vi.fn() | Plain object with spy methods, passed via constructor | ✅ Correct |
| vi.mock() for own code | Hijacks module imports | ❌ Anti-pattern |

## What Was Actually Fixed

The real violations were:
- `lib/auth.test.ts` — Used `vi.mock('./db', './container')` — **DELETED**
- `lib/container.test.ts` — Used `vi.mock('./db', './env')` — **DELETED**

These mocked our own code at the module level, bypassing DI. They were also redundant with adapter tests.

## Resolution

**Pattern is acceptable. No changes needed to repository tests.**

The repository unit tests:
1. Use fakes correctly (objects passed via DI)
2. Test mapping logic quickly (row → domain entity)
3. Complement integration tests (which test real SQL)

## The Simple Rule

```
Can you pass it through a constructor?
  YES → Use a fake object (vi.fn() for spying is fine)
  NO  → Use vi.mock() (React hooks, Next.js magic only)
```

## Verification

- [x] Deleted `lib/auth.test.ts` (vi.mock anti-pattern)
- [x] Deleted `lib/container.test.ts` (vi.mock anti-pattern)
- [x] Reviewed remaining vi.mock() usage — only external SDKs (Clerk, Next.js)
- [x] Repository tests use fakes via DI — pattern is correct
