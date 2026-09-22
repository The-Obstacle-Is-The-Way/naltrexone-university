# DEBT-481: Master Spec Copies Still Prescribe Superseded Implementation Contracts

**Status:** Open
**Priority:** P2
**Date:** 2026-09-20

---

## Description

**2026-09-22 execution audit and reconciliation (publication/promotion pending).** All six filed contradictions still existed on `c7e59a7f`; #936's warning-only correction is confirmed by GitHub and ancestry on main. The current counts remain 21 physical tables, 29 controller `createAction` exports and 14 rate policies covering 18 operations. The later seed changes make the old example still less safe: ordinary questions now require a terminal reference, archived questions cannot silently reactivate, and content rewrites over graded history are refused. The master now links to those executable authorities instead of reproducing a partial schema, parser, seed algorithm or workflow. Its bookmark contract names explicit desired state. Its timing exclusion now distinguishes persisted per-question timing from optional advanced pacing analytics. The four split files are navigation views. No product/runtime behavior, scanner, gate or dependency changes.

The former split copies were not perfectly synchronized with the master: Part 2 had older portal/idempotency and previous-attempt signatures, and Part 3 still prescribed `questionStates` in `params_json`. Those unique lines were compared with `billing-controller.ts`, `question-view-controller.ts`, `get-previous-attempt.ts` and the normalized schema before replacement; no unique product requirement is being discarded. The master's other design narratives are not newly certified exact implementations. Unsupported “exact” qualifiers were removed, not used to claim a whole-product audit. The dated filing and warning history below remain unchanged.

### Current-tree reconciliation receipts (2026-09-22)

| Contract | Authority and observed property | Reconciliation |
| --- | --- | --- |
| Physical schema | `db/schema.ts:178-971`: 21 `pgTable` declarations; `db/migrations/meta/_journal.json` owns migration order | Master §3 links to schema/ledger; no stale 14-table implementation copy |
| Actions, limits, bookmark state | `src/adapters/controllers/shared/idempotency-error-policy.ts:9-19`; `bookmark-controller.ts:36-42,100-139`; `src/adapters/shared/rate-limits.ts:12-80`; SPEC-017 current inventory | §4.5.0 links to the configuration and inventory; §4.5.9 describes `setBookmark(questionId, bookmarked)` |
| Content validation | `lib/content/schemas.ts:14-157`; `scripts/seed/question-parser.ts:112-142` | §5 links to executable validation; wrong-choice explanations and terminal references are explicit |
| Seed/hash identity | `scripts/seed/question-parser.ts:27-98,130-163`; `scripts/seed/question-syncer.ts:80-114,263-444`; `scripts/seed-helpers.ts` | §5.5 names canonical reference/explanation fields, row locking, history refusal and identity-preserving synchronization; unconditional delete/reinsert removed |
| CI and release | `.github/workflows/ci.yml:43-157`; `docs/dev/deployment-procedure.md`; main CI `35687034621` success on `c7e59a7f` | §8.4 links to actual workflow, secret standard and Deployment Check; no copied tags, old toolchain, job-scoped provider secrets or echo gate |
| Timing | `src/application/use-cases/submit-answer.ts:193-208`; `finalize-exam-answers.ts:215-258`; practice-engine timing/secrecy contracts | §13 no longer says timing is always zero; optional richer analytics remains optional |

This is a docs-only correction; no failing behavioral test or mutation proof is claimed. The documentation guard, full gate, exact-head review and publication/promotion receipts are still required before closeout.

**2026-09-21 forward pointer.** #936 (`327f95ef`) shipped the warning banners and SPEC-016/017 corrections and is an ancestor of deployed main. The filing's “prepared PR B” qualifiers below are historical, not open deployment work. The six master/copy contradictions remain: the current schema has **21** tables versus **14** in the master, and there are **29** controller `createAction` declarations, distinct from **14** rate policies and **18** limited operations. Warning banners do not reconcile the stale schema, bookmark key, content/choice identity, workflow and timing examples. This remains an Open docs-ownership/reconciliation task, not a runtime change. [Audit receipts](./assets/active-audit-2026-09-21/verification.md).

**CONFIRMED:** the current master specification and its four readability copies contain demonstrably stale “complete”/“exact” implementation claims. `docs/specs/index.md` identifies the master as the technical SSOT; a new implementer can copy unsafe or incompatible examples. The [all-current-specs audit](./assets/adversarial-2026-09-20/review.md#all-current-specs-audit) covers all eight current files, including SPEC-016/017 corrections prepared for separate specs-only PR B.

Receipts at `5bc118f3` (warning banners are prepared for PR B, not included in this filing):

| Current spec claim | Contradicting current implementation |
| --- | --- |
| Master §3 / Part 1:87 “Complete Database Schema” contains 14 `pgTable` declarations | `db/schema.ts` contains 21. Missing spec tables: trial setup operations, renewal consent records, renewal notice deliveries, Clerk events, deleted Clerk users, pending Stripe cancellations, question feedback. |
| Master §4.5 / Part 2:252–266 old limit subset and `bookmark:toggleBookmark`; Part 2 header says all 17 actions | `src/adapters/controllers/shared/idempotency-error-policy.ts:13` uses `bookmark:setBookmark`; fourteen policies / eighteen limited operations in the prepared SPEC-017 correction, and 29 `export const … = createAction` declarations across controllers. These are three different counts, not interchangeable. |
| Master §5.4 / Part 3:94–143 “Exact” content schema without choice explanations | `lib/content/schemas.ts:105-122` requires explanations on wrong choices and forbids them on the correct choice. The old example cannot express the current required contract. |
| Master §5.5 / Part 3:208–211 replaces all choices on content update; canonical hash fields omit reference/choice explanations | `scripts/seed/question-syncer.ts:273-379` preserves referenced choice IDs and checks references; `scripts/seed/question-parser.ts:27-42,68-98` includes the omitted content fields. Copying the old pseudocode would erase protections or cause constraint errors. |
| Master:2750–2805 / Part 4 CI block puts provider keys and E2E credentials in job `env`, uses tag action refs, pnpm 10.9 and Node 22 | `.github/workflows/ci.yml` scopes real secrets to permitted steps, SHA-pins actions and uses current Node 24/package-manager setup; `tests/ci-workflow.test.ts` enforces that boundary. This is documentation drift, not a finding against today's workflow. |
| Master:3007 / Part 4:410 says time spent is always zero and not measured | `src/application/use-cases/submit-answer.ts:193-208` persists validated time; `finalize-exam-answers.ts:215-258` derives elapsed seconds. Master §4.5's own submit contract already permits timing. |

These are bounded confirmed contradictions, not a claim that every other normative sentence is wrong. This record does not duplicate DEBT-479's SPEC-016/017 repairs, DEBT-474's shipped CI-secret fix, or DEBT-475's source-scanner mechanisms. The new mechanism is **ownership/reconciliation of current duplicated specification contracts**.

## Impact

**CONFIRMED:** source and purportedly exact docs disagree. **UNPROVEN:** a runtime regression caused by copying them; none was observed. The risk is actionable before new implementation: obsolete CI/seed instructions can undo already-reviewed boundaries.

## Resolution

A docs-only reconciliation PR, preserving product decisions:

1. Designate one authoritative home per contract. Replace copied implementation/configuration blocks with links to current code or the owning current spec where an exact copy adds no distinct design requirement. Make the four readability parts navigational/extracted views, not independent sources that silently drift.
2. Reconcile the six confirmed rows above in the master and every remaining live copy. Use SPEC-017 for the limit inventory, `db/schema.ts`/migration ledger for physical schema, current content/seed files for parsing and identity preservation, workflow/runbook for CI, and practice-engine docs for timing. Record unresolved semantic disagreements explicitly rather than choosing whichever file looks newest.
3. Remove “complete/exact” claims that have not been checked. The warning banners prepared for PR B are containment, not completion. Do not change implementation to make it match an obsolete example.

No new document scanner, generated-spec framework, metric gate or runtime change is proposed. Keep this one documentation-ownership mechanism separate from future feature fixes it might uncover.

## Verification

Manually verify each matrix row against the current tree, with dated file-line receipts, and ensure every split-page link points to its chosen authority. Search all five master files for the old bookmark key, pnpm 10.9/Node 22 CI recipe, provider-secret job env, unconditional choice replacement and “time spent=0/no measurement” claim. Those must be removed or clearly quarantined as historical, never current guidance.

This pass proposes no automated gate, so no red test is claimed. If a later PR proposes a sync validator, first restore one superseded statement (for example `bookmark:toggleBookmark` in Part 2 only) while leaving the authority unchanged and demonstrate that the validator exits nonzero. A presence-only link test cannot prove semantic synchronization. Record the before/after review, links and docs-only diff; use the full gate before any push as AGENTS requires.

## Related

- [Current spec index](../specs/index.md)
- [Master spec](../specs/master_spec.md) and its four linked parts
- [SPEC-016](../_archive/specs/spec-016-observability.md), [SPEC-017](../_archive/specs/spec-017-rate-limiting.md)
- [DEBT-474](./debt-474-ci-secret-scope-and-action-immutability.md) — current workflow boundary, not reopened
- [DEBT-479](./debt-479-public-surface-discoverability-and-field-performance.md) — independently corrected public/spec scope
