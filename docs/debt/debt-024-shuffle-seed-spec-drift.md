# DEBT-024: Shuffle Seed Generation Spec Drift (SSOT says sha256, Domain implements non-crypto hash)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

## Summary

The SSOT for `startPracticeSession` shuffling (`docs/specs/master_spec.md` §4.5.5) specifies:

- seed = `hash(userId + Date.now().toString())` using **sha256** (take first bytes as uint32)

However, the currently implemented domain helper `createSeed(userId, timestamp)` in `src/domain/services/shuffle.ts` uses a simple non-cryptographic rolling hash (int32 → uint32). The domain services spec (`docs/specs/spec-003-domain-services.md`) also documents the non-crypto approach — and still contains an outdated `Math.abs(hash)` snippet.

This is a “docs vs docs vs code” inconsistency that will cause drift and rework when SLICE-1 practice sessions are implemented.

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

