# DEBT-529: The Per-Screen Request Protocols Rely on a Contract Nothing Checks, and Their Safe Defaults Are Opt-In

**Status:** Open — check the protocol contract's anchors, and make the cache policy and stale-response guard required parameters
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Each practice screen owns its own request lifecycle:
- which request an idempotency key belongs to;
- when the key is replaced;
- which outcomes are cached;
- how a stale response is dropped.

This family is one of the largest sets of repeat fixes outside billing: BUG-289 to BUG-303 in July, after BUG-085, BUG-194, BUG-231 and BUG-264 earlier.

On 2026-07-23 the owner ruled DEBT-461's runtime consolidation NO-GO. The accepted design keeps the per-surface implementations and requires `app/(app)/app/practice/shared/idempotency-protocol-contract.md` for every surface. This record does not reopen that ruling. It finds that the accepted design's safeguards are not enforced:

1. **The contract's code anchors have drifted.** Three of its owner links point at the wrong lines four days after its last edit:
   - `practice-page-logic.ts#L118` should be 139;
   - `practice-session-page-logic.ts#L139` should be 197;
   - `question-page-logic.ts#L211` should be 229.

   Nothing checks them, so the document a new surface must follow is already out of date.
2. **The server caches every error when a caller passes no policy.** The idempotency wrapper treats a missing `shouldCacheError` as "cache everything". BUG-278 and BUG-289 were exactly that: a passing error cached for 24 hours under a key that never changed. All twelve current callers pass a policy, but nothing fails if the thirteenth does not.
3. **The stale-response guard is optional.** The shared question-flow helpers take an optional `isLatestRequest` and default to "latest". BUG-194 was a submit path with only the unmount guard while its sibling load path checked for the latest request.

## Evidence

**The anchors:** the contract's matrix rows for quick submit, tutor submit and standalone submit link `#L118`, `#L139` and `#L211`. The functions are at `app/(app)/app/practice/practice-page-logic.ts:139`, `[sessionId]/practice-session-page-logic.ts:197` and `app/(app)/app/questions/[slug]/question-page-logic.ts:229`. The other anchors I checked still resolve. The contract was last changed on 2026-10-13 (`94017438`).

**The default cache policy:**
- `src/adapters/shared/with-idempotency.ts:57-66`: `if (!shouldCacheError) return true;`.
- `src/adapters/controllers/shared/execute-idempotent.ts:40` makes the policy optional; `:64-65` caches when the policy is absent (`!== false`).

**The optional guard:** `app/(app)/app/practice/shared/question-flow-actions.ts:127,136` and `:364,376`: `isLatestRequest?: …` with `input.isLatestRequest?.(requestId) ?? true`.

**Other copies:**
- Stale-result guards are built by hand from request counters, version refs, token maps and generation refs in `use-history-sessions.ts`, `use-question-page-bookmarks.ts`, `use-question-page-previous-attempt.ts`, `use-practice-question-feedback.ts` and `components/question/question-report-dialog.tsx`.
- `question-page-logic.ts:256-264` copies `buildTimeSpentSeconds` from `question-flow-actions.ts:101-108`.
- The server fences a claim by matching `claimed_at` exactly (`drizzle-idempotency-key-repository.ts:171,205,229`). That works only because claims write JavaScript millisecond times; the column's default is the database's microsecond `now()`, so a writer that relied on the default would fail every later fence.

**History:**
- BUG-085, BUG-194, BUG-301, BUG-302: stale responses.
- BUG-231, BUG-264: a remove implemented as a toggle, so a replay re-added.
- BUG-278, BUG-289 to BUG-291, BUG-295, BUG-298 to BUG-300, BUG-303: key binding, rotation and caching.
- DEBT-320: deferred a data-fetching abstraction "if fetch-related bugs increase".
- DEBT-461: the contract, and the NO-GO.
- Since the ruling: BUG-304, a Start session click that did nothing.

## Impact

None of the three is a live defect today. Each is the exact shape of a past one, and the accepted design depends on the contract being right. P3.

## Options

1. **Enforce the accepted design.** *Recommended:* it keeps the owner's ruling and closes the gaps it relied on.
   - A test that resolves each contract anchor to the symbol it names.
   - Make `shouldCacheError` and `isLatestRequest` required, so each caller states its choice.
   - Fence idempotency claims on a generated token, not a timestamp.
2. **Ask the owner to revisit DEBT-461's NO-GO** with the evidence since. Since 2026-07-23 one more defect (BUG-304) has landed in this family, which does not by itself meet DEBT-461's two-live-surface criterion.

## Resolution (proposed)

Option 1, red first: the anchor test fails on today's three rows; the type change fails to compile at a caller that omits a policy. Option 2 only if the family produces another defect.

## Verification

- [ ] A test fails when a contract anchor no longer resolves to its symbol.
- [ ] No idempotent action or shared flow helper accepts an omitted cache policy or stale guard.

## Related

- DEBT-461 (closed): the contract and the owner's NO-GO on runtime consolidation.
- DEBT-320 (closed): the deferred data-fetching abstraction.
