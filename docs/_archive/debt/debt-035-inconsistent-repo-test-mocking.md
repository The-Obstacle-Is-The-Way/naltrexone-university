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

The real violations were test files that mocked our own modules at the module level
(bypassing DI) and created flakiness/redundancy:

- `lib/auth.test.ts` — **deleted** (module-level mocking anti-pattern + redundant coverage)
- An earlier version of `lib/container.test.ts` — **deleted**, then later replaced with a DI-friendly `lib/container.test.ts`
  that only mocks uninjectable external modules (`server-only`, `stripe`).

These were redundant with adapter-level tests and violated the “fakes over mocks” rule for our own code.

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

- [x] Deleted `lib/auth.test.ts` (module-level mocking anti-pattern)
- [x] Deleted the original `lib/container.test.ts` (module-level mocking anti-pattern)
- [x] Reviewed remaining `vi.mock()` usage — only external/uninjectable modules (Clerk hooks, Next.js internals, Stripe SDK, `server-only`)
- [x] Repository tests use fakes via DI — pattern is correct
