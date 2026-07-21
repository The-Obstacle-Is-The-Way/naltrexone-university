# DEBT-461: Practice-Client Idempotency/Determinacy Machinery Needs One Contract Before Any Consolidation

**Status:** Open
**Priority:** P3
**Date:** 2026-07-21

---

## Direction (2026-07-21 filing review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| Phase A — characterize the current laws | **FIX (Option 1, Phase A only; minimal form)** | Add one source-adjacent Markdown contract with a per-surface law/owner matrix, links to the existing behavior tests, and explicit exceptions. This documentation-only phase is **sequence-free** because it can use a new file and need not edit any FW-2-contested implementation or test file. | Starting extraction before the inventory; requiring new executable characterization tests when existing tests already prove a row; waiting for FW-2 merely to write the contract. | (a) One contract deletes archaeology without adding runtime machinery; (b) the BUG-289/290/291/295/298/300-303 history proves repeated cross-surface misses; (c) blast radius is future change amplification, while the fix cost is one bounded document; (d) it consolidates duplicated knowledge; (e) it records which laws are shared instead of falsely declaring every law universal. |
| Phase B — extract shared runtime behavior | **DIRECTION-GATED** | After Phase A **and** the complete FW-2 set (DEBT-456, DEBT-457.1, DEBT-458, DEBT-443.3) land, obtain a new recorded go/no-go direction ruling. Proceed only if the matrix identifies at least two live surfaces with the same state transitions and a smallest-surface prototype needs no surface-mode flags/strategy callbacks, weakens no behavior test, and reduces the combined production branches/state/comments; otherwise stop at Option 3's documented per-surface design. | Option 1's pre-approved “one primitive” migration; Option 2 as a primary server-led redesign. Option 2 remains only a Phase A per-law question and may not reopen DEBT-437's accepted write skew or DEBT-426's removed parent lock. | (a) Prevents a speculative abstraction from becoming a new framework; (b) recurrence proves documentation need, not that one runtime shape fits every owner; (c) extracting invariant-dense async state is scarier than the current maintainability cost until the prototype proves net deletion; (d) retains existing production-shaped tests; (e) FW-2 and DEBT-437 remain binding. |

The binding default is Phase A alone; Phase B is not authorized by this filing. The current code already shares fingerprint/key-slot helpers, while start uncertainty, dialog ownership, draft saves, and end/finalize determinacy have different owners and do not all implement the same state machine. FW-2 is still the Phase B semantic boundary, but only DEBT-456/457.1 directly finalize the client recovery/determinacy behavior; DEBT-458 and DEBT-443.3 supply adjacent error-ownership and fake-fidelity laws rather than same-file edits.

**2026-07-21 filing-review corrections:** the original filing reported `use-practice-session-start.ts` as 313 lines and the practice client as about 9,765 of about 40,500 production TS/TSX lines (about 24%). Re-running `find | wc` with tests, specs, fixtures, browser probes, and test-helper files/directories excluded gives 312 lines for that file, **8,811** production TS/TSX lines under `app/(app)/app/practice`, and **41,151** across `app`, `components`, `lib`, `src`, `db`, plus the root runtime TS files — **21.4%**, not 24%. The filing also described one six-law protocol in every listed file and said all FW-2 items edit those same files; source instead shows a family of partially shared mechanisms (including a non-idempotent draft-save path), composition-only owners, and direct client-file overlap only from DEBT-456/457.1. The owner-fence attribution is narrowed as well: BUG-300 added typed concurrent-start discrimination, while BUG-301/302 own the reusable key-slot and dialog-generation fences.

**Priority ruling:** keep **P3**. No current behavior is wrong, but the nine cited production bug records demonstrate realized cross-surface change amplification rather than speculative cleanliness, and the only authorized work is the small Phase A contract; runtime abstraction remains separately gated.

## Description

The practice client surface implements a correct but dispersed family of distributed-systems-style protocols for idempotent mutations, async ownership, and conflict recovery. Some laws already use shared helpers, while others are necessarily surface-specific; there is no single contract showing which law applies where. The family accreted one bug-fix at a time across BUG-289/290/291/295/298/300-303 and the DEBT-438/456/457 conflict-reason work; each fix was individually verified and production-proven, but no complete law/owner matrix was extracted. This is a maintainability/change-amplification finding, not a correctness defect: no current behavior is wrong.

### The protocol, as it exists today

The client-side "register law" built by the fix waves comprises six recurring concerns; Phase A must record applicability and exceptions rather than assume every concern exists on every mutation surface:

1. **Key-to-intent binding** — the idempotency key is bound to the exact request identity; changing intent rotates the key (BUG-295 and its wave-2 sweep).
2. **Determinacy-gated rotation** — the key is preserved across indeterminate outcomes (thrown transport/timeout) and rotated only on consumed/determinate outcomes (BUG-289/290/291; extended to end/finalize by DEBT-457.1's pinned direction, FW-2 pending).
3. **Generation-CAS slot ownership** — token slots guarded by generation counters so stale continuations cannot clobber newer intents (BUG-301, `idempotency-request-key.ts`).
4. **Claim/uncertainty tracking** — per-invocation claim IDs plus a concurrent-execution-uncertainty version so retirement is refused while any same-key execution may still commit (BUG-303).
5. **Owner-fenced continuations** — success/failure continuations verify they still own the relevant token or UI surface before mutating it (BUG-301 key-slot generation fencing and BUG-302 dialog-generation fencing); BUG-300 separately contributes typed `ConcurrentRequestInProgress` discrimination to the start lifecycle.
6. **Reason-discriminated recovery** — CONFLICT routing by `details.reason` with fail-safe defaults (DEBT-438; DEBT-456's pinned direction, FW-2 pending).

### Where it lives (verified 2026-07-21 against `dev` at `fc3c910c`)

- [`use-practice-session-start.ts`](<../../app/(app)/app/practice/hooks/use-practice-session-start.ts>) (312 lines) carries the densest instance: the `StartExecutionUncertainty` structure (`idempotencyKey`, `nextClaimId`, `unsettledClaimIds`, `concurrentUncertaintyVersion`, `concurrentExecutionMayStillFinish`, lines 45-51), `claimStartExecutionUncertainty` (98-168), and `captureIdempotencyKeyRetirement` (173-189). Two multi-sentence causality comments (103-106, 146-152) explain ordering constraints the types cannot express — evidence that the contract is hard to reconstruct, but not proof that all surfaces need this state machine.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts>) (567 lines) mostly composes the actual bookmark, feedback, mark, question-flow, and review-stage owners. [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts>) (529 lines), [`practice-session-page-logic.ts`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts>) (453 lines), and [`question-page-logic.ts`](<../../app/(app)/app/questions/[slug]/question-page-logic.ts>) (478 lines) own or delegate different subsets of key lifecycle, request sequencing, and conflict recovery. Exam draft save has request sequencing/conflict recovery but no client idempotency key; mark, bookmark, feedback, and end/finalize key owners live in additional hooks/shared helpers that Phase A must inventory.
- Re-measured 2026-07-21 with tests, specs, fixtures, browser probes, and test-helper files/directories excluded: `find 'app/(app)/app/practice' ... -print0 | xargs -0 wc -l` totals **8,811** production TS/TSX lines. The corresponding production roots (`app`, `components`, `lib`, `src`, `db`, plus root runtime TS files) total **41,151**, so the practice directory is **21.4%**, not 24%.

### The cost

- **Change amplification:** a new mutation surface (or a new register-law refinement) must be hand-woven into each surface's local variation; the BUG-295 wave-2 sweep (BUG-298) exists precisely because one law had to be re-applied surface-by-surface and some surfaces were missed the first time.
- **Comprehension:** the protocol as a *unit* is documented nowhere in source; it is reconstructable only from ~10 archived bug docs. Paragraph-length causality comments at call sites are the compensating mechanism.
- **Certification asymmetry:** each surface's tests pin its local variation, but no matrix identifies which shared law and exception each suite proves. The earlier submit/mark/start determinacy fixes still missed the end/finalize thrown arm later pinned by DEBT-457.1.

## Impact

No current wrong behavior — the machinery is correct and heavily tested. The cost is recurring: every future mutation surface or law refinement requires rediscovering which shared and surface-specific rules apply, and every new session/agent must re-derive that ownership map from archaeology. At 21.4% of the measured production TS/TSX scope, the practice directory is a large complexity pocket and a high-risk area for a well-meaning "simplification" that silently drops an invariant.

## Proposed Resolution

**Sequencing constraint (binding):** Phase A is sequence-free: its source-adjacent Markdown contract and matrix can be added without touching contested implementation/tests. Any Phase B runtime extraction MUST wait until all of fix-wave FW-2 (DEBT-456, DEBT-457.1, DEBT-458, DEBT-443.3) lands and then receive a new direction ruling. DEBT-456/457.1 directly finalize client reason-routing/determinacy; DEBT-458 and DEBT-443.3 are adjacent error-ownership/fake-fidelity constraints, not same-file overlap.

1. **Option 1, Phase A (CHOSEN, minimal form):** write one source-adjacent Markdown contract containing the six candidate laws, their trigger bugs, the real owner file/helper, applicable surfaces, explicit non-applicable cases, and links to current behavior tests. The matrix is documentation, not a requirement to add duplicate executable tests where coverage already exists. No behavior change and no FW-2 sequencing dependency.
   - **Option 1, Phase B (DIRECTION-GATED; not authorized):** after Phase A and FW-2, request a new go/no-go ruling. A smallest-surface prototype may support approval only if at least two live surfaces share identical state transitions, the primitive needs no surface-mode flags or strategy callbacks, no behavior assertion is weakened/removed, and the combined primitive-plus-consumer production branches/state/comments decrease. Failure of any condition invokes Option 3 immediately; no surface-by-surface migration campaign begins under this filing.
2. **Option 2 (REJECTED BY DIRECTION REVIEW as primary):** push more dedup responsibility server-side so client fences become unnecessary. The server already owns `withIdempotency` and row-version CAS, but client-only concerns — double-submit, stale renders, dialog ownership, and navigation races — remain. Retain only as a Phase A per-law question; it may not reintroduce DEBT-426's parent lock or reopen DEBT-437's accepted tutor-submit/end write skew.
3. **Option 3 (CHOSEN fallback after Phase A):** unless a later direction ruling approves Phase B under every stop-loss condition, accept the per-surface implementations as the permanent design and make the written contract the mandatory template for new surfaces. This is the binding default, not merely an emergency fallback.

## Verification

- Phase A: one source-adjacent Markdown contract names the six candidate laws with accurate bug/debt attributions and inventories each real owner, consumer, explicit exception, and existing behavior test. A reviewer can answer both “what must this new mutation do?” and “which laws do not apply?” without archived-bug archaeology.
- Phase A changes no runtime or test behavior and need not wait for FW-2; its review confirms it does not soften DEBT-437's accepted failure or propose DEBT-426's removed parent lock.
- Phase B remains unauthorized until Phase A + all FW-2 items are complete and a new direction ruling records evidence for every stop-loss condition above.

## Related

- Archived arc that built the family: BUG-289 (billing/bookmark/feedback caching and determinate rotation), BUG-290 (submit/mark caching and determinacy), BUG-291 (start determinacy), BUG-295 + BUG-298 (key-to-intent binding + sweep), BUG-300 (typed concurrent-start discrimination), BUG-301 (generation-CAS), BUG-302 (dialog fencing), and BUG-303 (claim/uncertainty retirement fences).
- [DEBT-426 (archived, resolved 2026-07-03)](../_archive/debt/debt-426-session-wide-lock-defeats-row-concurrency.md) — the server-side concurrency redesign; its resolution did not touch the client machinery.
- [DEBT-456](./debt-456-client-conflict-reason-discrimination-gaps.md) / [DEBT-457](./debt-457-wave2-determinacy-and-test-hygiene-residues.md) — pinned FW-2 directions that finalize client recovery/determinacy semantics; hard sequencing dependency for Phase B only.
- Direction-campaign precedent: PARK/measure-first discipline does not apply here (this is maintainability, not scale) — but the "minimal chosen option" law does: Phase A is mandatory before any Phase B code.
- Filed 2026-07-21 from the post-campaign complexity assessment (owner-requested); facts verified against source at `fc3c910c`.
