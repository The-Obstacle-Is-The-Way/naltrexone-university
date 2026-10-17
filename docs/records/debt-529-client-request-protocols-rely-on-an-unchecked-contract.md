# DEBT-529: The Per-Screen Request Protocols Rely on a Contract Nothing Checks, and Their Safe Defaults Are Opt-In

**Status:** Open — anchor the protocol contract by symbol and test that each exists; make the cache policy and stale-response guard required
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Each practice screen owns its own request lifecycle:
- which request an idempotency key belongs to;
- when the key is replaced;
- which outcomes are cached;
- how a stale response is dropped.

The family has needed repeated fixes: BUG-289 to BUG-303 in July, after BUG-085, BUG-194, BUG-231 and BUG-264 earlier.

On 2026-07-23 the owner ruled DEBT-461's runtime consolidation NO-GO. The accepted design keeps the per-surface implementations, and requires `app/(app)/app/practice/shared/idempotency-protocol-contract.md` for every surface. This record does not reopen that ruling. It finds that the safeguards the accepted design relies on are not enforced:

1. **The contract's line anchors have drifted.** Among the anchors that name a symbol or test I could find by text:
   - 15 of 46 code anchors no longer point at it. For example, `submitAnswerForQuestion` `#L118` is now line 139, `endSession` `#L210` is now 275, and `commitChoice` `#L412` is now 425.
   - 19 of 24 test anchors no longer point at it.

   The anchors were written with the contract (`e808225a`, 2026-07-21), and nothing checks them. The document a new surface must follow already points at the wrong code.
2. **The server caches every error when a caller passes no policy.** ADR-015's 2026-10-13 amendment records this default and the rule "every keyed action therefore passes a policy".
   - All twelve current callers do, but nothing fails if the thirteenth does not.
   - BUG-278 and BUG-289 were this default: a passing error cached for 24 hours under a key that never changed.
3. **The stale-response guard is optional.** The shared question-flow helpers take an optional `isLatestRequest`, and default to "latest" when a caller passes neither sequencing hook. They throw only when a caller passes one hook without the other (`assertRequestSequencingHooks`).
   - BUG-194 was a submit path with only the unmount guard, while its sibling load path checked for the latest request.

## Evidence

**The anchors:** the contract's matrix links `#Lnn` line anchors. `submitAnswerForQuestion` is now at `app/(app)/app/practice/practice-page-logic.ts:139` and `[sessionId]/practice-session-page-logic.ts:197`; `submitSelectedAnswer` at `app/(app)/app/questions/[slug]/question-page-logic.ts:229`; `endSession` at `practice-session-page-logic.ts:275`; `commitChoice` at `use-practice-session-question-flow.ts:425`. `94017438` (2026-10-13) changed only the contract's record citations.

**The default cache policy:**
- `src/adapters/controllers/shared/execute-idempotent.ts:40` makes the policy optional; `:64-65` caches when it is absent (`!== false`).
- `executeIdempotent` is `withIdempotency`'s only production caller. `withIdempotency` itself treats a missing policy as "cache everything" (`src/adapters/shared/with-idempotency.ts:57-66`).
- ADR-015, "An error is cached only when the action's policy says so".

**The optional guard:** `app/(app)/app/practice/shared/question-flow-actions.ts`:
- `:127,136` and `:364,376`: `isLatestRequest?: …` with `input.isLatestRequest?.(requestId) ?? true`;
- `:62-74`: `assertRequestSequencingHooks`.

**Other copies:**
- Stale-result guards are built by hand, from request counters, version refs, token maps or generation refs, in:
  - `use-history-sessions.ts`
  - `use-question-page-bookmarks.ts`
  - `use-question-page-previous-attempt.ts`
  - `use-practice-question-feedback.ts`
  - `components/question/question-report-dialog.tsx`
- `question-page-logic.ts:256-264` copies `buildTimeSpentSeconds` from `question-flow-actions.ts:101-108`.

**History:**
- BUG-085, BUG-194, BUG-301 and BUG-302: stale responses.
- BUG-231 and BUG-264: a remove implemented as a toggle, so a replay re-added.
- BUG-278, BUG-289 to BUG-291, BUG-295, BUG-298 to BUG-300 and BUG-303: key binding, rotation and caching.
- DEBT-320: deferred a data-fetching abstraction "if fetch-related bugs increase".
- DEBT-461: the contract, and the NO-GO.
- Since the ruling: BUG-304, a Start session click that did nothing.

## Impact

None of the three is a live defect today. Each is the exact shape of a past one, and the accepted design depends on the contract being right. P3.

## Options

1. **Enforce the accepted design.** *Recommended:* it keeps the owner's ruling and closes the gaps it relies on.
   - Anchor the contract by symbol and test name instead of line number, and test that each named symbol or test exists in its file. A line-number check would fail on every unrelated edit.
   - Make `shouldCacheError` and `isLatestRequest` required, so each caller states its choice. That enforces ADR-015's rule.
2. **Ask the owner to revisit DEBT-461's NO-GO** with the evidence since. Since 2026-07-23 one more defect (BUG-304) has landed in this family, which does not by itself meet DEBT-461's two-live-surface criterion.

## Resolution (proposed)

Option 1, red first:
- the symbol check fails on today's contract;
- the type change fails to compile at a caller that omits a policy.

Option 2 only if the family produces another defect.

## Verification

- [ ] A test fails when a contract entry names a symbol or test that no longer exists in its file.
- [ ] No idempotent action or shared flow helper accepts an omitted cache policy or stale guard.

## Related

- DEBT-461 (closed): the contract and the owner's NO-GO on runtime consolidation.
- DEBT-320 (closed): the deferred data-fetching abstraction.
