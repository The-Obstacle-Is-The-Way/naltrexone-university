# DEBT-024: Shuffle Seed Generation Spec Drift

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-01

## Summary

We had “docs vs code” drift in how practice-session shuffling seeds were derived:

- The SSOT for `startPracticeSession` (`docs/specs/master_spec.md` §4.5.5) specified a sha256-based seed.
- The domain already implemented a runtime-agnostic, non-crypto `createSeed(userId, timestamp)` and the domain spec also documented that approach, but with an outdated `Math.abs(hash)` snippet.

This drift was resolved by choosing a single, pure-domain seed algorithm and updating SSOT/specs accordingly.

## Locations

- SSOT requirement: `docs/specs/master_spec.md` (StartPracticeSession shuffle seed: sha256)
- Domain spec: `docs/specs/spec-003-domain-services.md` (documents `createSeed` and currently shows `Math.abs(hash)`)
- Implementation: `src/domain/services/shuffle.ts` (`createSeed` uses non-crypto hash and returns `hash >>> 0`)

## Why This Matters

- Seed generation affects determinism and fairness of question ordering.
- We will eventually need the same algorithm in multiple runtimes (server actions, tests).
- Domain must remain runtime-agnostic (no Node-only imports); sha256 implies the seed is computed outside the domain boundary.

## Proposed Fix

Make a single explicit decision and align SSOT + specs + implementation:

### Option A: Use the domain’s non-crypto seed (simpler)

- Update `master_spec.md` to match the implemented `createSeed(userId, timestamp)` algorithm.
- Update `spec-003-domain-services.md` snippet to match current code (`hash >>> 0`, not `Math.abs(hash)`).

### Option B (Prefer if we truly want sha256): compute seed outside domain

- Update `master_spec.md` to clarify: seed is computed in adapters/controllers using Node/Web crypto.
- Remove or de-emphasize `createSeed` from the domain layer (domain keeps `shuffleWithSeed` only).
- Update `spec-003-domain-services.md` accordingly.

## Acceptance Criteria

- Only one documented seed algorithm exists for practice-session shuffling.
- Specs and implementation agree (no `Math.abs(hash)` drift).
- Tests cover the chosen behavior deterministically.

## Resolution

Resolved via Option A (domain-owned, runtime-agnostic seed):

- SSOT now specifies `seed = createSeed(userId, Date.now())` (non-crypto → uint32).
- Domain services spec snippet matches implementation (no `Math.abs(hash)`).
- Domain implementation remains pure and fully unit-tested (`src/domain/services/shuffle.test.ts`).
