# DEBT-120: Composition Root Growing Toward God File (407 Lines)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-06

---

## Description

`lib/container.ts` is 407 lines and exposes a large factory surface (repository/gateway/use-case/controller creation methods) that wires all repositories, gateways, and use cases. While a composition root is an accepted pattern in Clean Architecture, the file is approaching the size where it becomes difficult to navigate and maintain.

Currently manageable — this is a **warning** not an emergency.

## Impact

- Any new use case, repository, or gateway requires editing this file
- Navigation is becoming cumbersome with a large factory surface in one file
- Merge conflicts increasingly likely as features are added
- At current growth rate (~5-10 new factories per feature), will exceed 600 lines within a few features

## Resolution

### Option A: Split by Bounded Context (When it hits ~500 lines)

- `lib/container/content.ts` — Question, Tag repos + related use cases
- `lib/container/practice.ts` — Attempt, PracticeSession, Bookmark repos + related use cases
- `lib/container/billing.ts` — Subscription, StripeCustomer, Payment repos/gateways + related use cases
- `lib/container/identity.ts` — User, Auth repos/gateways
- `lib/container/index.ts` — Barrel re-export

### Option B: Accept Current Size

407 lines for a composition root is within acceptable range. Monitor and split when it crosses 500-600 lines. Mark as "Accepted" with growth threshold.

## Verification

- [ ] Each container module covers a bounded context
- [ ] No circular dependencies between container modules
- [ ] All existing factory functions preserved
- [ ] Existing test suite passes

## Related

- `lib/container.ts` (407 lines)
- DEBT-119 (ports file — similar splitting rationale)
