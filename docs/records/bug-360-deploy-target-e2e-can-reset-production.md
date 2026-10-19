# BUG-360: Deploy-Target E2E Can Reset Production

**Status:** Blocked — owner chooses a production-target fence for deploy-target E2E; due 2026-10-25
**Priority:** P3
**Date:** 2026-10-18

## Summary

The deploy-target E2E mode accepts any database host after a boolean opt-in. It does not identify production. If an operator supplies production credentials and the preflight succeeds, the reset can republish its two required placeholder fixtures and clear the test user's state. This is separate from BUG-353's ambient seed flag and remains after that fix.

## Evidence

- `scripts/e2e-local-orchestrator.ts:137-143` allows any URL hostname with `ALLOW_NON_LOCAL_DATABASE_URL=true` in existing-database mode.
- `tests/e2e/helpers/reset-e2e-user-state.ts:186-218` counts the two exact slugs in `REQUIRED_QUESTION_SLUGS`. If either is absent it throws `E2E_RESET:PLACEHOLDER_FIXTURES_MISSING` before this reset writes. If both exist, it changes any non-published status to `published` without checking an active release or deployment identity.
- The same reset's `clearUserState` deletes the E2E user's idempotency keys, attempts, bookmarks and practice sessions (`:236-251`). The deployment and credential preflights still have to succeed before this path is reached.
- The deploy-target examples in the E2E and promotion guides read a URL from `.env.local`; that file does not prove a non-production identity.
- Source and existing reset tests were checked. No production connection or production reproduction was attempted; whether production contains the two fixture rows is unknown and belongs to BUG-353's owner census.

## Impact

An authorized operator's target mistake can mutate production test-user data and synthetic question visibility. The two fixture rows must already exist. A published row alone does not prove this reset caused it, and does not establish that a learner saw it. Reads select published questions; an active release does not fence this direct status reset.

## Options

1. Refuse every remote E2E target. Simple, but removes the currently documented deploy-target capability; the owner must decide whether to retain it.
2. Compare the target with Vercel Production's resolved database identity and fail closed if the comparison cannot be made. The environment-seed exclusion is a starting point, not proof that aliases, pooling endpoints or copied credentials are covered.
3. Persist a production marker through the managed migration path and refuse marked databases. Define sticky-marker, permissions, unstamped-database and cloned-branch behavior before relying on it. A copied production marker should fail closed until an authorized non-production reclassification.

## Resolution (proposed)

The owner chooses whether deploy-target E2E remains and the identity mechanism. Until then, both guides forbid production targets. A warning alone does not close this record.

## Verification

- [ ] Red-first proof that the chosen fence prevents all reset writes for production, including when both fixture rows exist.
- [ ] Local E2E still passes; any retained remote mode has explicit non-production identity tests.
- [ ] Owner checks production fixture presence and records the result through BUG-353's census.

## Related

- BUG-353: explicit seed flag and production fixture census.
- DEBT-532: database-target policy duplication.
