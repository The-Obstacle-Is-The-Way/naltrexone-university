# DEBT-461: Practice-Client Idempotency/Determinacy Machinery Is a Bespoke Per-Surface Protocol — Consolidate Into One Shared Primitive (Direction-First)

**Status:** Open
**Priority:** P3
**Date:** 2026-07-21

---

## Description

The practice client surface implements a correct but bespoke distributed-systems-style protocol for idempotent mutations, re-implemented with local variations at every mutation surface instead of owned by one shared primitive. The protocol accreted one bug-fix at a time across the BUG-289→BUG-303 arc and the DEBT-438/456/457 conflict-reason work; each fix was individually verified and production-proven, but no abstraction was ever extracted. This is a maintainability/change-amplification finding, not a correctness defect: no current behavior is wrong.

### The protocol, as it exists today

The client-side "register law" built by the fix waves comprises, per mutation surface:

1. **Key-to-intent binding** — the idempotency key is bound to the exact request identity; changing intent rotates the key (BUG-295 and its wave-2 sweep).
2. **Determinacy-gated rotation** — the key is preserved across indeterminate outcomes (thrown transport/timeout) and rotated only on consumed/determinate outcomes (BUG-291; extended to end/finalize by DEBT-457.1's pinned direction, FW-2 pending).
3. **Generation-CAS slot ownership** — token slots guarded by generation counters so stale continuations cannot clobber newer intents (BUG-301, `idempotency-request-key.ts`).
4. **Claim/uncertainty tracking** — per-invocation claim IDs plus a concurrent-execution-uncertainty version so retirement is refused while any same-key execution may still commit (BUG-303).
5. **Owner-fenced continuations** — success/failure continuations verify they still own the UI surface before mutating it (BUG-300 typed `ConcurrentRequestInProgress` discrimination; BUG-302 dialog-generation fencing in `question-report-dialog.tsx`).
6. **Reason-discriminated recovery** — CONFLICT routing by `details.reason` with fail-safe defaults (DEBT-438; DEBT-456's pinned direction, FW-2 pending).

### Where it lives (verified 2026-07-21 against `dev` at `fc3c910c`)

- [`use-practice-session-start.ts`](<../../app/(app)/app/practice/hooks/use-practice-session-start.ts>) (313 lines) carries the densest instance: the `StartExecutionUncertainty` structure (`idempotencyKey`, `nextClaimId`, `unsettledClaimIds`, `concurrentUncertaintyVersion`, `concurrentExecutionMayStillFinish`, lines 45-51), `claimStartExecutionUncertainty` (98-168), and `captureIdempotencyKeyRetirement` (173-189). Two multi-sentence causality comments (103-106, 146-152) explain ordering constraints the types cannot express — the campaign's own "missing abstraction" signal.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts>) (567 lines), [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts>) (529 lines), [`practice-session-page-logic.ts`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts>) (453 lines), and [`question-page-logic.ts`](<../../app/(app)/app/questions/[slug]/question-page-logic.ts>) (478 lines) each carry surface-local key lifecycle, retirement, and conflict-recovery logic for their mutations (start, submit, draft-save, mark, bookmark, feedback, end/finalize).
- The practice client totals ~9,765 production lines — roughly 24% of the ~40,500-line production codebase (measured 2026-07-21, tests excluded).

### The cost

- **Change amplification:** a new mutation surface (or a new register-law refinement) must be hand-woven into each surface's local variation; the BUG-295 wave-2 sweep (BUG-298) exists precisely because one law had to be re-applied surface-by-surface and some surfaces were missed the first time.
- **Comprehension:** the protocol as a *unit* is documented nowhere in source; it is reconstructable only from ~10 archived bug docs. Paragraph-length causality comments at call sites are the compensating mechanism.
- **Certification asymmetry:** each surface's tests pin that surface's variation; nothing pins that all surfaces implement the *same* law, so semantic drift between surfaces (the BUG-290-vs-BUG-291 rotation-doctrine divergence, later DEBT-457 item 1) can recur.

## Impact

No current wrong behavior — the machinery is correct and heavily tested. The cost is recurring: every future mutation surface or law refinement multiplies bespoke code, and every new session/agent must re-derive the protocol from archaeology. At ~24% of production code, the practice client is the codebase's single densest complexity pocket and its highest-risk area for a well-meaning "simplification" that silently drops an invariant.

## Proposed Resolution

**Sequencing constraint (binding):** consolidation MUST NOT begin until fix-wave FW-2 (DEBT-456, DEBT-457.1, DEBT-458, DEBT-443.3) has landed, because FW-2 edits these same files and finalizes the determinacy/reason-routing semantics the primitive must absorb. Consolidating mid-flight would chase a moving contract.

1. **Option 1 (RECOMMENDED, direction-first):** two phases, each its own reviewed PR chain.
   - *Phase A — characterize:* write the protocol down as one source-level contract (a `README`/module doc plus a law-matrix test table): the six laws above, their trigger bugs, and the per-surface variation inventory. No behavior change. This alone removes the archaeology cost and is cheap.
   - *Phase B — extract and migrate incrementally:* implement ONE shared client primitive (e.g. an `idempotent-mutation-slot` module under `app/(app)/app/practice/shared/` exposing claim/observe/retire/rotate with determinacy-gated rotation and generation-CAS ownership), unit-tested against the full law matrix. Migrate one surface per PR — smallest first (bookmark or feedback) — with the surface's existing tests kept green **unmodified** as the behavior-invariance harness. Stop-loss rule: if any surface's migration requires weakening an existing test, halt and re-derive direction.
2. **Option 2 (server-led simplification):** push more dedup responsibility server-side so client fences become unnecessary. REJECTED-leaning as primary: the server already owns `withIdempotency` + row-version CAS (archived DEBT-426 resolved the server-side lock design), and the client machinery exists for client-only concerns — double-submit, stale renders, dialog ownership, navigation races — that no server change can fence. Retain only as a per-law question during Phase A (any law that turns out to be server-enforceable gets noted, not assumed).
3. **Option 3 (ACCEPT + protocol doc):** if Phase B's first migration proves riskier than its value, stop after Phase A: accept the per-surface implementations as the permanent design and make the written protocol contract the mandatory template for new surfaces. This is the honest fallback, not the default.

## Verification

- Phase A: the protocol contract document exists in-source, names all six laws with their originating bug docs, and inventories every surface's implementation site; a review agent can answer "what must a new mutation surface do?" from it alone without reading archived bugs.
- Phase B (if taken): the primitive's unit tests cover the law matrix (indeterminate-preserve, determinate-rotate, stale-claim rejection, uncertainty-blocked retirement, generation-CAS clobber rejection, owner-fence refusal); each migrated surface's pre-existing tests pass unmodified; a final source scan shows no surface-local claim/uncertainty structures outside the primitive; the net production line-count delta for the practice client is recorded in this doc at close.
- Either way: FW-2's pinned behaviors (DEBT-456 reason routing, DEBT-457.1 thrown-arm preservation) remain green throughout.

## Related

- Archived arc that built the protocol: BUG-289/290/291 (start determinacy), BUG-295 + BUG-298 (register law + sweep), BUG-300 (typed concurrent discrimination), BUG-301 (generation-CAS), BUG-302 (dialog fencing), BUG-303 (claim/uncertainty retirement fences).
- [DEBT-426 (archived, resolved 2026-07-03)](../_archive/debt/debt-426-session-wide-lock-defeats-row-concurrency.md) — the server-side concurrency redesign; its resolution did not touch the client machinery.
- [DEBT-456](./debt-456-client-conflict-reason-discrimination-gaps.md) / [DEBT-457](./debt-457-wave2-determinacy-and-test-hygiene-residues.md) — pinned FW-2 directions that finalize the semantics this consolidation must absorb; hard sequencing dependency.
- Direction-campaign precedent: PARK/measure-first discipline does not apply here (this is maintainability, not scale) — but the "minimal chosen option" law does: Phase A is mandatory before any Phase B code.
- Filed 2026-07-21 from the post-campaign complexity assessment (owner-requested); facts verified against source at `fc3c910c`.
