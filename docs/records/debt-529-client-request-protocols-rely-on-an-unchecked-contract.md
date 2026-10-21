# DEBT-529: The Per-Screen Request Protocols Rely on a Contract Nothing Checks, and Their Safe Defaults Are Opt-In

**Status:** Verifying — promotion to main; due 2026-10-24
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Each practice screen owns its own request lifecycle:
- which request an idempotency key belongs to;
- when the key is replaced;
- which outcomes are cached;
- how a stale response is dropped.

The family has needed repeated fixes: BUG-289–291, BUG-295 and BUG-298–303 in July, after BUG-085, BUG-194, BUG-231 and BUG-264 earlier.

On 2026-07-23 the owner ruled DEBT-461's runtime consolidation NO-GO. The accepted design keeps the per-surface implementations, and requires `app/(app)/app/practice/shared/idempotency-protocol-contract.md` for every surface. This record does not reopen that ruling. The reference guard, required cache policies and required sequencing hooks are built. The original gaps were:

1. **The contract's line links had drifted.** At baseline `134b0578`, it had 119 `#L` links: 48 to code and 71 to tests. Against the commit that wrote them (`e808225a`), 13 code links and 55 test links no longer point at their original line. Eighteen test lines are gone from the linked file: 16 tests moved to split files, and two titles no longer exist.
   - `question-flow-actions.test.ts` has 492 lines, yet links point to #L660/#L781; those tests moved to `question-flow-actions-submit.test.ts:163,284`.
   - A #L1013 test link into `practice-session-page-logic.test.ts` now belongs to `practice-session-page-logic-end-session.test.ts:380`.
   - Code examples: `submitAnswerForQuestion` #L118 is now 139, `endSession` #L210 is now 275, and `commitChoice` #L412 is now 425.

   The anchors originated with the contract (`e808225a`, 2026-07-21). No check then validated its symbol/test references. The contract now names declarations and running test titles, including the moved tests. `tests/idempotency-protocol-contract.test.ts` rejects missing files, declarations and proofs, plus line anchors and unnamed source links.
2. **The server cached errors thrown by `execute()` when a caller passed no policy.** Admission/claim failures have separate behavior. ADR-015's 2026-10-13 amendment records this default and the rule "every keyed action therefore passes a policy".
   - All twelve callers did, but nothing failed if a thirteenth did not.
   - BUG-278 and BUG-289 were this default: a transient execution error cached for 24 hours under a key that never changed.
3. **The stale-response guard was optional.** The shared question-flow helpers took an optional `isLatestRequest`, and defaulted to "latest" when a caller passed neither sequencing hook. They threw only when a caller passed one hook without the other (`assertRequestSequencingHooks`).
   - BUG-194 was a submit path with only the unmount guard, while its sibling load path checked for the latest request.

## Evidence

The locations below describe baseline `134b0578`, before these changes.

**The anchors at baseline `134b0578`:** the contract's matrix linked `#Lnn` line anchors. `submitAnswerForQuestion` is now at `app/(app)/app/practice/practice-page-logic.ts:139` and `[sessionId]/practice-session-page-logic.ts:197`; `submitSelectedAnswer` at `app/(app)/app/questions/[slug]/question-page-logic.ts:229`; `endSession` at `practice-session-page-logic.ts:275`; `commitChoice` at `use-practice-session-question-flow.ts:425`. Before this fix, no later commit had changed a code or test link.

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

The contract references had drifted. The reference guard now checks their targets. All twelve current keyed-controller callers supply policies, and no current product failure from an omitted sequencing pair was established. The former permissive defaults could admit an unsafe future caller. P3 for these enforcement gaps.

## Options

1. **Enforce the accepted design.** *Recommended:* it keeps the owner's ruling and closes the gaps it relies on.
   - Anchor the contract by symbol and test name instead of line number, and test that each named symbol or test exists in its file. A line-number check would fail on every unrelated edit.
   - Require `shouldCacheError` on every keyed action, and both sequencing hooks on the shared flow helpers. Each action keeps its own cache decisions. That enforces ADR-015's rule and the existing hook-pair invariant.
2. **Reopen runtime consolidation only under DEBT-461's full criteria.** A new owner direction must explicitly reference the July 23 NO-GO. Show at least two live surfaces with identical complete transitions, no surface-mode flags or strategy callbacks, no weakened tests and net deletion of production branches, state and comments. BUG-304, the only later defect, does not meet them.

## Resolution (decided)

Option 1. The reference check failed on the original contract and now passes with declaration and test-name links.

`executeIdempotent` and `withIdempotency` require an explicit `shouldCacheError`. Their four type assertions failed before the policy and sequencing inputs became required. The twelve controller callers retain their policies, including Zod-error caching and the action-aware rules. A throwing policy still preserves the original error and caches it.

Both shared question flows require the complete sequencing pair, and their page helpers carry that requirement to callers. They reject an absent or partial pair before starting a request. The two absent-pair tests failed before the runtime guard changed. Existing stale-response, key-binding, replay, rotation and recovery cases remain.

Another defect alone neither satisfies option 2 nor authorizes it. Option 1 leaves the NO-GO intact. Reference-existence tests do not prove behavior; retain the production-shaped protocol tests and documented per-surface exceptions.

## Verification

- [x] A test fails when a contract entry names a declaration or running test that no longer exists in its file. The guard failed on the original contract; its missing, moved, renamed, commented-out and skipped proof cases pass.
- [x] Keyed actions require a cache policy; shared flow helpers require the complete sequencing pair. Behavioral protocol cases remain in place.
- [ ] Promote the fix to main.

## Related

- DEBT-461 (closed): the contract and the owner's NO-GO on runtime consolidation.
- DEBT-320 (closed): the deferred data-fetching abstraction.
