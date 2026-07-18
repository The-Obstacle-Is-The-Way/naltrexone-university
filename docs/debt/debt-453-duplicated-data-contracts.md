# DEBT-453: Duplicated Data Contracts — Difficulty Set Re-encoded Across 10 Production Files, Effective Selection Computed Four Times, Write/Read Schema Coupling, Dead `deleteById` Port Method

**Status:** Open
**Priority:** P4
**Date:** 2026-07-09
**Re-verified accurate against `ddad8eee` on 2026-07-18.**

---

## Description

Four independently verified findings share one root pattern: a data contract that exists in the codebase more than once (or serves two roles at once), with nothing — no shared symbol, no cross-pinning test, no comment — tying the copies together. Each is harmless today; each adds change amplification or a future drift/fail-closed risk.

### 1. Write/read schema conflation in `practice-session-params.ts`

[`practiceSessionParamsSchema`](../../src/adapters/repositories/practice-session-params.ts#L17) serves two persistence roles: [`create()`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L367) parses new repository input with `VALIDATION_ERROR` ([lines 372-375](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L372)), while [`parsePersistedParamsJson`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L180) parses stored rows with `INTERNAL_ERROR`. The start-session controller has a **separate** schema in [`practice-schemas.ts`](../../src/adapters/controllers/practice-schemas.ts#L20) that reuses the same limit constants; it does not call `parsePracticeSessionParamsJson`.

The persistence schema embeds mutable product/input limits — [`MAX_PRACTICE_SESSION_QUESTIONS = 200`](../../src/adapters/shared/validation-limits.ts#L33), 50 tag filters, 3 difficulty filters, and 255-character slugs — plus the closed difficulty enum ([practice-session-params.ts#L15-L45](../../src/adapters/repositories/practice-session-params.ts#L15)). A persisted-row failure becomes `CorruptPracticeSessionRowError` ([drizzle-practice-session-repository.ts#L180-L191](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L180)): completed-list and latest-incomplete reads skip and log it ([lines 284-295](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L284), [lines 336-355](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L336)), while direct session reads fail loud. Returning `null` for a skipped active row can hide the resume card and let a subsequent start attempt reach the partial-unique CONFLICT; it does not reset or mutate the session. Completed pagination can similarly return fewer rows than its unchanged `total` count.

[`validation-limits.ts`](../../src/adapters/shared/validation-limits.ts#L25) describes these values as current input/performance bounds, and no test round-trips a persisted fixture at every current maximum. A limit reduction can therefore pass current tests while making previously valid rows unreadable. The inverse risk exists after a limit increase followed by an application rollback: sessions written above the old limit become unreadable to the rolled-back code. Difficulty-set evolution has additional compiler and write-boundary checks described in part 4 and is not a clean green-CI example here. DEBT-428 is useful repair precedent, but its concrete Development row was a double-encoded JSON string that failed both the old and new object schemas; it does **not** prove that tightening a business limit has already invalidated formerly conforming data.

### 2. Effective-selection rule is computed at four server sites

The derivation deciding which choice counts for an active exam is maintained in four server-side places. Three byte-identical private functions apply the full mode/ended-state rule: [`getIncompleteSelectedChoiceId`](../../src/application/use-cases/get-incomplete-practice-session.ts#L20) (resume-card count), [`getReviewSelectedChoiceId`](../../src/application/use-cases/get-practice-session-review.ts#L56) (review-grid count/rows), and [`getSessionSelectedChoiceId`](../../src/application/use-cases/get-next-question.ts#L87) (next-unanswered navigation). A fourth expression maps the returned active-exam `draftSelectedChoiceId` as `draft ?? latest` ([get-next-question.ts#L262-L284](../../src/application/use-cases/get-next-question.ts#L262)); `executeForSession` has already rejected ended sessions at lines 178-180, so this is the same effective-selection fallback under its reachable exam precondition even though it omits the redundant `endedAt` check.

The natural shared home, [`src/application/shared/practice-session-state.ts`](../../src/application/shared/practice-session-state.ts#L1), is already imported by all three use-case files but hosts no selection helper. Per-site tests can keep passing if a future stale-draft/grace-window rule is updated in fewer than all four computations, leaving resume counts, review rows, next-unanswered navigation, or the selected choice returned to the client inconsistent for the same active exam. The rule is also recorded in [master_spec.md §4.5](../../docs/specs/master_spec.md#L1077), but prose does not couple the implementations.

### 3. Dead `AttemptWriter.deleteById` since the BUG-197 transaction fix

[`AttemptWriter.deleteById(id, userId)`](../../src/application/ports/attempt-repository.ts#L59) has zero production **and zero test** call sites; repository-wide grep finds only the port, Drizzle implementation, fake implementation, and documentation/archive references. Its former consumer was the manual submit-answer compensation removed by BUG-197 ("The manual rollback pattern... has been fully removed" — [archived BUG-197](../_archive/bugs/bug-197-submit-answer-two-phase-write-without-transaction.md)). The Drizzle method ([drizzle-attempt-repository.ts#L214-L220](../../src/adapters/repositories/drizzle-attempt-repository.ts#L214)) deletes only the attempt row, outside any caller-owned compensation contract. For a session-linked attempt, it does not clear the matching state's [`latest_selected_choice_id`/`latest_is_correct`](../../db/schema.ts#L494), so resurrecting the method for per-attempt retraction could make state-backed summary/review counts disagree with attempt-backed dashboard/history-question counts. Account deletion is a separate cascade workflow and does not need this method. Today the cost is dead port/adapter/fake code ([fake-attempt-repository.ts#L83-L89](../../src/application/test-helpers/fakes/fake-attempt-repository.ts#L83)) plus the live [architecture guide](../../docs/practice-engine/architecture-layers.md#L113) advertising it at line 117.

### 4. Difficulty set is re-encoded across 10 production files

The canonical set is [`AllDifficulties`](../../src/domain/value-objects/question-difficulty.ts#L4), with `QuestionDifficulty` and `isValidDifficulty` already derived beside it. Nine additional production files encode the same closed set or an equivalent boundary:

1. [`zDifficulty`](../../src/adapters/shared/zod-schemas.ts#L6) hardcodes the array even though `zQuestionProgressStatus` directly below derives from its domain constant.
2. [`practice-session-params.ts`](../../src/adapters/repositories/practice-session-params.ts#L15) defines another local Zod enum despite importing `zUuid` from the shared schema module.
3. [`review-controller.ts`](../../src/adapters/controllers/review-controller.ts#L18) defines an inline difficulty Zod enum at line 24.
4. [`lib/content/schemas.ts`](../../lib/content/schemas.ts#L69) independently validates question frontmatter with the same Zod literals at line 75.
5. [`question-view-controller.ts`](../../src/adapters/controllers/question-view-controller.ts#L31), [`get-practice-session-review.ts`](../../src/application/use-cases/get-practice-session-review.ts#L25), and [`get-completed-session-questions-with-feedback.ts`](../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L34) each publish the same inline TypeScript union instead of `QuestionDifficulty`.
6. [`db/schema.ts`](../../db/schema.ts#L30) repeats the values in the live `pgEnum` definition.
7. [`history-search-params.ts`](<../../app/(app)/app/history/history-search-params.ts#L5>) repeats both the TypeScript union at line 8 and the three-value parser at lines 52-59 instead of using `QuestionDifficulty`/`isValidDifficulty`.

That is 10 production files including the canonical definition (and 11 non-migration encodings because the history file contains two). Exhaustive display mappings such as `difficultyDisplayLabel` are intentionally value-specific and compiler-checked; frozen migration SQL and test fixtures are also not active contract copies. This is the same controller-schema class [DEBT-172](../_archive/debt/debt-172-duplicate-zod-schemas-across-controllers.md) previously consolidated, but current residue extends beyond controllers.

**The corruption cascade remains refuted.** Widening `AllDifficulties` without updating the narrower persistence/output copies fails typecheck: [`toPracticeSessionParamsJson`](../../src/adapters/repositories/practice-session-params.ts#L79) assigns `QuestionDifficulty[]` into the schema-inferred narrow array at line 85, and output mappers such as [`get-practice-session-review.ts#L144`](../../src/application/use-cases/get-practice-session-review.ts#L144) hit the same mismatch. Even after those compile errors are addressed, repository [`create()`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L372) uses the same params schema later used for reads, so the application cannot persist a new difficulty that this parser subsequently rejects. The active risks are co-evolution burden and fail-closed feature gaps: stale shared/controller/history validators reject or ignore a new filter, stale content validation blocks importing new-difficulty content, and the DB enum requires an intentional migration. Those are launch/integration failures, not silent persisted-data corruption.

## Impact

Today: zero user-visible breakage from any part — no persisted row trips part 1 (post-0026/0027 proofs), all four part-2 computations agree over their reachable inputs, part 3 has zero callers, and part 4's copies all agree. All cost is latent and triggers only on a future edit:

- **Part 1** is the sharpest edge within P4: a green-CI limit tightening can hide historical sessions from list surfaces (with a warning) or make direct reads fail. DEBT-428 supplies a repair-migration pattern, not a prior conforming-row instance of this exact trigger.
- **Part 2** produces user-visible disagreement (resume count, review grid, next-unanswered navigation, or returned exam selection) if the rule is edited at fewer than all four sites.
- **Part 3** is comprehension/hygiene today; if resurrected it silently breaks the attempts↔session-state invariant with no signal.
- **Part 4** is a developer scavenger hunt per enum change plus several compiler-silent, fail-closed authoring/filter boundaries. No data-corruption path exists.

## Proposed Resolution

**Part 1 — write/read schema coupling:**
- **Option 1 (RECOMMENDED, cheapest, matches the in-file DEBT-433 precedent):** add a load-bearing comment block in `practice-session-params.ts` (plus a one-line cross-reference in `validation-limits.ts`) stating the schema is also the read-time compatibility contract for all persisted `params_json` rows — any tightening of an imported limit or the difficulty enum retroactively reclassifies conforming historical rows as corrupt and MUST be paired with a data audit/repair migration per the DEBT-428 playbook.
- Option 2 (structural, if the schema is touched anyway): version the persisted payload or split current-write validation from a durable read/upcast contract. The read side may relax mutable maxima, but it must still map every accepted historical enum/value into the current domain type; replacing the difficulty enum with arbitrary strings would merely move the failure downstream. Keep `zUuid`, uniqueness, and `count === questionIds.length` as storage invariants.
- Option 3 (pinning test): a characterization test round-tripping fixtures at the exact historical maxima (count=200, 50 tagSlugs, 3 difficulties, 255-char slug, every enum value) through `parsePracticeSessionParamsJson`, named/commented to direct anyone who breaks it to write a repair migration first.

**Part 2 — effective-selection rule:**
- **Option 1 (RECOMMENDED):** extract one exported helper — e.g. `getEffectiveSelectedChoiceId(session: Pick<PracticeSession, 'mode' | 'endedAt'>, state: Pick<PracticeSessionQuestionState, 'latestSelectedChoiceId' | 'draftSelectedChoiceId'>)` — into `src/application/shared/practice-session-state.ts`, replace all three private functions **and** the active-exam output fallback in `get-next-question.ts`, and unit-test the helper directly.
- Option 2 (minimal): add one parity test across all four computations over a branch-covering matrix. This is weaker than extraction because private implementations remain independently editable.
- Option 3: do nothing and accept documented drift risk (the rule lives prose-only in `master_spec.md`).

**Part 3 — dead `deleteById`:**
- **Option 1 (RECOMMENDED):** delete `deleteById` from the port, `DrizzleAttemptRepository`, and `FakeAttemptRepository`; update `architecture-layers.md` to `AttemptWriter — insert`. Zero callers means a pure deletion verified by typecheck.
- Option 2: if a retraction/deletion feature is genuinely imminent, keep it but add a port doc comment requiring callers to run inside a transaction that also compensates `practice_session_question_states`, plus a lint/test guard against direct use.
- Option 3: move it to a separate `AttemptDeleter` port not extended by `AttemptRepository`, so any future consumer opts in explicitly and confronts the invariant.

**Part 4 — difficulty literals:**
- **Option 1 (RECOMMENDED):** derive and consolidate — `zDifficulty = z.enum(AllDifficulties)`; reuse it in practice-session params and the review controller; derive content validation and the live `pgEnum` from `AllDifficulties`; replace inline output unions with `QuestionDifficulty`; and use the existing `isValidDifficulty` in history search-param parsing. Migration SQL remains an intentional frozen copy, and exhaustive display mappings remain explicit.
- Option 2 (minimal): fix the compiler-silent Zod/content/history copies first, while leaving compiler-guarded output unions and the deliberately migration-coupled `pgEnum` for the next enum change.
- Option 3 (tripwire only): a parity test over the public shared schema, content schema, controller input behavior, history parser, and Drizzle enum values. Private schemas should be exercised through public behavior rather than exported solely for a test.

## Verification

- **Part 1:** the comment block exists in `practice-session-params.ts` and `validation-limits.ts` cross-references it; if Option 3 is taken, the historical-maxima characterization test passes and its name references the repair-migration requirement.
- **Part 2:** three private functions and the fourth inline fallback are gone, one exported helper has active-exam-draft / active-exam-latest-fallback / ended-exam / tutor coverage, and existing per-site tests stay green.
- **Part 3:** production/test grep under `src/` finds no `deleteById`; the live architecture guide reads `AttemptWriter — insert`; archived historical references remain untouched.
- **Part 4:** production grep finds the value-array definition only at the canonical domain source plus intentionally explicit display mappings; the Drizzle enum derives from that source and frozen migrations remain unchanged. If Option 3 is chosen, public boundary parity tests cover every compiler-silent site listed above.

## Related

- [DEBT-428 (archived)](../_archive/debt/debt-428-question-ids-narrowed-unverified-against-legacy-data.md) — repair-migration precedent for malformed persisted params; its double-encoded Development row was not a formerly conforming row invalidated by a later limit change.
- [DEBT-439 (archived)](../_archive/debt/debt-439-params-json-shape-guard-and-corrupt-row-blast-radius.md) — established the skip-and-log corrupt-row behavior that makes part 1's failure mode silent for list reads.
- [DEBT-433 (archived)](../_archive/debt/debt-433-question-order-invariant-unenforced-at-db-level.md) — precedent for the load-bearing-comment resolution recommended for part 1 (its comment already sits inside `practice-session-params.ts`).
- [DEBT-429 (archived)](../_archive/debt/debt-429-duplicated-question-state-mapper-and-test-helpers.md) — consolidated a different duplication on the same surface as part 2; precedent for the extraction pattern.
- [BUG-197 (archived)](../_archive/bugs/bug-197-submit-answer-two-phase-write-without-transaction.md) — the transaction fix that orphaned part 3's `deleteById`.
- [DEBT-172 (archived)](../_archive/debt/debt-172-duplicate-zod-schemas-across-controllers.md) — resolved the 2026-02 controller-scoped instance of part 4's class and created `zod-schemas.ts`; the sites cited here are post-resolution residue plus the shared schema's own non-derivation.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
