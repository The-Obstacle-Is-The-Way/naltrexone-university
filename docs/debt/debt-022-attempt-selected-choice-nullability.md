# DEBT-022: `Attempt.selectedChoiceId` Nullability Mismatch (DB allows null, Domain forbids it)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

## Summary

The database schema allows `attempts.selected_choice_id` to become `NULL` (foreign key `onDelete: 'set null'`), but the domain entity `Attempt` requires `selectedChoiceId: string`.

The adapter currently treats a null `selectedChoiceId` as data corruption and throws `ApplicationError('INTERNAL_ERROR', ...)`.

This is a legitimate design choice, but it is currently **implicit** and therefore fragile: if a choice is ever deleted (content changes, admin tooling, future migrations), historical attempts become unreadable and may break “review past answers” features.

## Locations

- Domain entity: `src/domain/entities/attempt.ts` (`selectedChoiceId: string`)
- DB schema: `db/schema.ts` (`selectedChoiceId` FK with `onDelete: 'set null'`)
- Adapter behavior: `src/adapters/repositories/drizzle-attempt-repository.ts` (`requireSelectedChoiceId`)
- SSOT schema snippet: `docs/specs/master_spec.md` (attempts table definition)

## Why This Matters

We need one explicit policy for question/choice immutability:

- If published questions/choices are immutable, we should prevent deletes at the DB layer (RESTRICT) so attempts never lose referential integrity.
- If content may change and deletes are allowed, the domain model must be able to represent historical attempts whose selected choice is no longer present.

Right now we have “nullable in storage, non-null in domain, crash if null” — a sharp edge that will show up later in production.

## Options

### Option A (Prefer if content is immutable): enforce non-null + restrict deletes

- Make `attempts.selected_choice_id` `NOT NULL`
- Set FK `onDelete: 'restrict'` (or cascade attempt deletes if that’s acceptable)
- Backfill/migrate any existing nulls (should be none)

### Option B: allow null in domain (content can change)

- Change `Attempt.selectedChoiceId` to `string | null`
- Update consumers to handle “choice deleted” state explicitly
- Adjust repository mapping and tests

### Option C: keep current behavior but document it as an invariant

- Keep schema as-is
- Keep repository throwing `INTERNAL_ERROR` for null
- Add explicit documentation: “choices must never be deleted once attempts exist”
- Add monitoring/alerting for this invariant violation

## Acceptance Criteria

- A single explicit policy exists (and is enforced).
- Storage + domain model + adapters are consistent with that policy.
- Tests cover the chosen behavior (including migration/backfill if applicable).

