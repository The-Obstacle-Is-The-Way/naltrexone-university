# DEBT-484: Substantive Rewrites Can Reinterpret Historical Attempts

**Status:** In Progress — initial guard merged in #951; the revision design is decided in [ADR-021](../adr/adr-021-question-revisions-and-content-releases.md) (2026-09-27); phase 1 (revisions mirror the live rows) landed 2026-09-28; immutable revision binding and review milestones remain open
**Priority:** P1
**Date:** 2026-09-20
**Confidence:** CONFIRMED behavior boundary; affected production attempts unknown

## Evidence

**2026-09-21 release readback.** #951's merge `269ffeec` is an ancestor of deployed main `76e65e9c`; formal review `5261726459` approved its exact head `d8bf8adc`, and CI `35536461282` succeeded. The guard is shipped, not pending release: `scripts/seed/question-syncer.ts:320-329` checks substantive content changes as well as answer-key changes before updates. The original key-only behavior below is a pre-fix receipt. This does not provide immutable revision identity for attempts/sessions, prevent the active-ungraded-session race, or restore archived-question review. Those remain Open. The separate content repository's authoring-policy line references were not reauthenticated in this app-tree audit and remain attributed historical evidence. [Audit ledger](./assets/active-audit-2026-09-21/verification.md).

The original inspection below predates the initial guard. The dated implementation
receipt records its narrower protection and the revision support still missing.

scripts/seed/question-syncer.ts:79 skips the graded-history policy when
answer-key changes are empty. At :257 the compared payload contains labels and
isCorrect, not learning objective or stem. At :278 the existing question's stem,
explanation, reference, and difficulty are overwritten.
db/schema.ts:870 defines attempts referencing questionId without content revision.
scripts/seed-helpers.ts:75 computes answer-key changes.

The content authoring policy retains QIDs for rewrites, including replacements
of the learning objective (.claude/skills/generate-questions/SKILL.md:422 and
docs/content-debt/CDEBT-02-question-quality-anti-patterns.md:352 in the separate
content repository). This policy is evidence of the reachable trigger, not a
request to copy proprietary question text into public documentation.

## Reproduction

Read-only from app root:

    sed -n '75,115p' scripts/seed-helpers.ts
    sed -n '73,100p' scripts/seed/question-syncer.ts
    sed -n '250,288p' scripts/seed/question-syncer.ts
    sed -n '870,896p' db/schema.ts

Observed: the key-change comparison uses labels/correctness, its empty result
returns before history checking, content updates target the same question ID,
and attempts carry no immutable content version. Changing a stem and all option
meanings while retaining labels/correctness does not change that comparison.

A future disposable-DB reproduction should record an attempt on synthetic item
A, rewrite its clinical task under the same slug with the same correct label,
seed, and inspect historical review. No production history was queried here.

## Failure scenario

A learner's old attempt displays a different question and explanation than the
one answered. Performance statistics mix old and new learning objectives even
when correctness flags are unchanged.

## Smallest fix

The initial rewrite-guard milestone has no SPEC-007 prerequisite.
Until immutable revisions exist, reject substantive same-identity rewrites over
graded history and require a new QID plus explicit archival/replacement.
Define permitted copy edits narrowly; unchanged correct label is not semantic
equivalence. Record that safeguard as partial, not full revision support.
The later SPEC-007 release interface must bind attempts and active
sessions to immutable content revisions. Reconcile the content rewrite policy
in a later authorized authoring-instruction change.

## Verification

Changing learning objective/stem/option meaning with unchanged labels must not
rewrite historical meaning. Minor permitted copy edits have explicit tests.
Old attempts remain reviewable and analytics separate revisions. Preserve the
existing answer-key-change protection rather than weakening it.

## Initial guard receipt — 2026-09-20

**CONFIRMED:** against `b0955d02`, before changing runtime code,
`pnpm test:integration tests/integration/seed-content-rewrite.integration.test.ts tests/integration/bug-regression-seed-choice-sync.integration.test.ts`
produced **18 failed / 12 passed** against this clone's isolated Docker Postgres.
The failures resolved with `{inserted: 0, updated: 1, skipped: 0}` instead of
refusing the rewrite. Eight mutations ran independently over an attempt and
normalized graded session state: stem, general explanation, reference, correct
option text, wrong option text, wrong-option feedback, an added option, and a
removed option. The correct label stayed unchanged in those cases. A separate
case combined a clinical rewrite with an explicitly overridden key flip; the
old code accepted that too. The existing text-only-history test was changed
red-first from permitting the overwrite to requiring refusal.

The seed sync now computes changed content fields from the canonical existing
and incoming representations while holding the question row lock. Its graded-
history policy checks both answer-key changes and those content changes before
any question, choice, or tag update. If an attempt or a graded session state
exists, a content rewrite fails with the slug, changed field names and history
counts, and directs the operator to use a new question ID plus explicit archival.
It does not print clinical text and has no content-rewrite override.

### Deliberate boundaries

- Protected fields: stem, general explanation, reference, option labels/membership,
  option text, and wrong-option feedback when that option's correctness is
  unchanged. Equality uses the existing Markdown canonicalization: CRLF/CR
  normalization, trailing line whitespace removal and outer trimming. It does
  **not** attempt semantic equivalence or permit arbitrary typo/copy edits.
- The existing explicit answer-key correction policy is retained. Flipping
  correctness necessarily adds/removes wrong-option feedback under the schema;
  those transitions belong to that policy. An authorized key correction still
  logs its history counts. Its environment flag does not authorize a simultaneous
  stem, general explanation, reference, option-text or option-membership rewrite.
- Publication status and classification metadata are not frozen. Explicit
  archival remains possible without deleting attempts or changing their text.
  This guard is not a promise of immutable historical classification/analytics.
  **CONFIRMED review boundary:** `get-previous-attempt.ts:169-178,206-213`
  requires `findPublishedById`; `drizzle-question-repository.ts:107-119`
  filters by `status=published` for ID/slug lookups. An archived question returns
  null through those paths even though its attempts remain stored. Historical
  review after archival is therefore still part of the revision milestone;
  row-preservation tests do not establish that user-facing outcome.
- With no graded history, the current same-ID update remains allowed. The later
  SPEC-007 design still needs immutable revisions for attempts and active sessions,
  including a learner viewing an ungraded item while a seed changes it. This
  initial safeguard does not solve that concurrent active-session boundary or
  whole-release atomicity (DEBT-483), and does not close this debt.

### Verification

After the guard, the same focused command passed **30/30**. Each rejected
rewrite compares full question, choice, attempt and normalized-session rows
before/after and requires no mutation. Positive cases retain canonical whitespace
normalization, explicit archival and ungraded updates. Existing key-flip default
refusal, explicit override and ungraded-key behavior still pass; fixtures were
initialized to valid canonical content before adding history so that those tests
continue to isolate key correction.

The existing real-lock race test first failed on its old deletion-specific error
expectation: the new guard refused sooner with `graded history exists`,
`attempts=1`, and `choice_labels`. Its assertion now requires that precise rewrite
refusal and verifies all original choice rows are unchanged. The separate
ungraded-draft-state deletion guard still passes unchanged. The new assertion
preserves the race's refusal/integrity property; it does not accept a SQL foreign-
key error or a successful destructive sync.

The full local gate on parent `b0955d02` passed: typecheck, lint, **4,407 unit /
411 browser / 313 integration** tests (6 existing skips), production build, and
**44 authenticated E2E** tests without retries. Clerk/Stripe were TEST-mode and
the database lanes used clone-isolated Docker. After rebasing onto PR #949's updated head `852c26d5` (including dev PR #948),
the full gate passed again: **4,421 unit / 411 browser / 313 integration**
tests (6 existing skips), build, and **44 E2E** tests with no retries; typecheck
and lint passed as well.
No real content or remote database was changed. **CONFIRMED:** [#951](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/951)
merged as `269ffeec` at 21:03:24 UTC after review `5261726459` approved exact
head `d8bf8adc`, zero unresolved threads, and green [CI 35536461282](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35536461282).
The [review adjudication](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/951#issuecomment-5752644555)
retains the mutation evidence for canonical whitespace coverage. The
[reconciliation snapshot](assets/content-integrity-2026-09-20/verification.md#reconciliation-snapshot)
separates that dev merge from the release readback. Immutable revision binding,
active-session behavior and archived-question review remain open regardless of
that deployment milestone.

## Decision — 2026-09-27

[ADR-021](../adr/adr-021-question-revisions-and-content-releases.md) decides the structure this record asks for:
- **Revisions.** Learner-visible content moves into immutable `question_revisions`. Each choice belongs to one revision, and existing choice IDs attach to revision 1 so every stored selection still resolves.
- **Binding.** Session states bind each item's revision when the session is created, and attempts bind the revision they graded. Grading uses the bound revision, which closes the active-session race. Composite `(choice, revision)` foreign keys make the database reject a selected choice from any other revision of the same question (#1166 review).
- **Review.** History, session review, previous-attempt and bookmark reads resolve content through the bound revision, not `status = 'published'`. A withdrawn question stays reviewable, with a visible withdrawal notice, by learners who attempted it, following COPE retraction practice. The notice needs a Pattern Registry entry before its UI lands.

This record closes after ADR-021's phases 1–3: revisions, binding and review, then the contract step that makes the bindings `NOT NULL` and drops the legacy text columns. The #951 guard stays in force until revisions replace it.

## Phase 1: revisions mirror the live rows — 2026-09-28

ADR-021 phase 1 is the expand step of a parallel change. Its [phasing note](../adr/adr-021-question-revisions-and-content-releases.md#why-phase-1-mirrors-instead-of-appending-2026-09-28) records why phase 1 mirrors content rather than appending revisions.
- **Schema (migration `0039`).**
  - `question_revisions` holds each question's stem, explanation, reference and difficulty, with its canonicalization version and `stored-fields-json-v1` content hash. A check constraint requires the hash to be lowercase hex.
  - `questions.current_revision_id`, `choices.question_revision_id`, `attempts.question_revision_id` and `practice_session_question_states.question_revision_id` are added, all nullable.
  - Each is keyed by `(revision id, question id)`, so a row can point only at a revision of its own question.
  - The two history-table keys are added `NOT VALID`: no scan, while every later write is checked. The contract phase validates them without blocking writes.
- **Mirror.** `sync_question_revision_v1(question)` creates revision 1 from the legacy row, refreshes it when the legacy content changed, re-points the question and attaches its choices. It returns `created`, `refreshed` or `unchanged`. Choices keep their ids, so every stored selection resolves to a revision.
  - The seed calls it inside the transaction of every insert, rewrite and unchanged skip.
  - `sweep_question_revisions_v1()` runs it over every question and repairs rows any other writer changed.
  - The migration runs the sweep once and logs its counts, so the deploy log records production's counts.
- **Pre-flight data proof.** The keys are new and all their columns start NULL, so no existing row can violate them. The rows the backfill writes are the content corpus: 958 questions and 3,832 choices locally, the same corpus production is seeded from. On a scratch copy of the test database at migration `0038`, seeded with that corpus, the migration logged `958 created, 0 refreshed, 0 unchanged`, left no question or choice without a revision, and a second sweep returned `0 created, 0 refreshed, 958 unchanged`. The shared per-clone test database was not migrated until this branch was the gated one. In production the build applied `0039` on 2026-09-28 and logged `958 created, 0 refreshed, 0 unchanged`; the migration ledger matched the checkout afterwards (#1178).
- **Equivalence.** The SQL form is byte-identical to the reference implementation in `lib/content/question-revision-hash.ts`, whose tests pin digests computed independently with Python's standard library. An integration case checks this on hard strings (quotes, backslashes, control characters, a line separator, non-ASCII text and an emoji). Another checks it on every question in the corpus, both the canonical text and the stored hash.
- **Tests.** Twelve real-Postgres cases:
  - SQL↔TypeScript equivalence on hard strings and on the whole corpus;
  - creation;
  - refresh after another writer's change;
  - attachment of a later choice;
  - refusal of an unknown question;
  - refusal of a choice attached to another question's revision (`23503` on `choices_question_revision_fk`);
  - deletion of a question with its revisions;
  - four seed cases (a new question, a rewrite, a restored pointer on an unchanged skip, and a legacy question rewritten). The four seed cases were red before the seed called the sync.
- **What does not change.** Readers still read the legacy columns and choices by question, so nothing a learner sees changes. The #951 guard still governs rewrites. Sessions and attempts bind revisions and readers switch in phase 2a; revisions become append-only and immutable in phase 2b, a later deploy (#1177 review).

## Phase 2a, first increment: new sessions and attempts bind a revision — 2026-09-28

ADR-021 phase 2a switches readers to revisions. It lands as five reviewed increments, each safe with the N-1 deployment:
1. bind new rows (this increment);
2. bind older rows in a bounded, batched job, then validate the keys;
3. switch selection, grading and review reads to the bound revision, in three parts (3a, 3b, 3c);
4. refresh revision 1 only while no incomplete session binds it;
5. show the withdrawal notice to learners who attempted a withdrawn question.

This increment:
- **Binding.** A new practice session binds each item to its question's `current_revision_id`, read inside the creation transaction. A new attempt binds the revision it graded: the session item's bound revision, else the question's current one. The "else" covers an attempt outside a session, and one in a session the N-1 deployment created. While every question has exactly one revision, both are the content the learner was shown and graded against.
- **Schema (migration `0040`).**
  - It re-runs `sweep_question_revisions_v1()` first, so a question an N-1 writer changed since `0039` is mirrored before new code binds to it.
  - It adds the unique key `choices (id, question_revision_id)`.
  - It adds three keys: `attempts (selected_choice_id, question_revision_id)`, and the session states' latest and draft selections, each referencing that choices key. They are `NOT VALID`, so there is no scan, while every later write is checked: an attempt or a session selection can name only a choice of its bound revision (#1166 review).
- **N-1.** The serving deployment leaves the revision NULL, and `MATCH SIMPLE` keys accept it; a real-Postgres case proves this. Its readers are unchanged.
- **Pre-flight data proof.**
  - `choices.id` is already the primary key, so the new unique key cannot collide.
  - Every existing history row has a NULL revision, so no row can violate the new keys.
  - On a scratch copy at `0039`, seeded with the 958-question corpus, `0040` logged `0 created, 0 refreshed, 958 unchanged`. It left the three keys `NOT VALID` and no question or choice without a revision, and a second sweep returned `0 created, 0 refreshed, 958 unchanged`.
  - The shared per-clone test database was not migrated; this branch was proved on scratch databases while an earlier PR was still in the queue.
  - In production, the build applied `0040` on 2026-09-28 and logged `0 created, 0 refreshed, 958 unchanged`; the migration ledger matched the checkout afterwards (#1192).
- **Tests.**
  - Nine real-Postgres cases in `question-revision-binding.integration.test.ts`: session items; a session attempt; an attempt outside a session; an attempt in an unbound session; the N-1 NULL write; refusal of a mixed-revision attempt, latest selection and draft selection (`23503` on each new key); and the fixture mirror.
  - The seven binding and refusal cases were red first.
  - The schema contract pins the new key and the three foreign keys.
  - The integration `createQuestion` fixture now mirrors each question into its revision, as the seed does. The full integration suite passed on a seeded scratch database, except one suite that by design refuses any database other than the resolver's own.
- **Test doubles.** The attempt and session fakes do not model binding. The register records that as a known divergence, proved in Postgres instead, because no domain type carries the revision until reads switch (increment 3).
- **What does not change.** Readers, grading and the seed behave exactly as before. A seed rewrite still refreshes revision 1 in place; increment 4 stops that while an incomplete session binds it.

## Phase 2a, second increment: older history binds to its revision — 2026-09-28

Since the first increment, every new session state and attempt is bound. The serving deployment writes no unbound row, so the rows written before it are a fixed set. The ADR asks for a bounded, batched job to bind them.
- **Function.** `bind_history_revisions_v1(p_limit)` binds at most `p_limit` unbound rows per table and returns the rows bound and the rows still unbound. It follows the rule new rows follow: a session state binds its question's current revision, and an attempt binds its session state's revision, else its question's current one.
- **Skipped rows.** A row is bound only if its selections are choices of that revision, so the `(selected choice, revision)` keys can never reject the update. Any other row stays unbound and is counted. Phase 2b's migration refuses to run while any row remains unbound, so an anomaly surfaces loudly instead of failing a deploy here.
- **Migration `0041`.**
  - It runs the function once, capped at 50,000 rows per table, and logs the counts. Production's build log therefore measures its real history sizes, without anyone holding production credentials. Any remainder is bound by a later run before phase 2b.
  - It validates the five history keys that `0039` and `0040` added `NOT VALID`. `VALIDATE` takes a lock that blocks neither reads nor writes, and unbound rows' NULL revisions satisfy the `MATCH SIMPLE` keys.
- **Pre-flight data proof.** On a copy of the shared per-clone test database, its two E2E session states and two attempts were written before binding existed. `0041` logged `2 session states and 2 attempts bound; 0 and 0 remain unbound`, left no revision key `NOT VALID`, and a second run bound nothing. The copy was then dropped. The shared database itself was not migrated while other PRs were ahead in the queue.
- **Production.** On 2026-09-28 the build applied `0041` and logged `306 session states and 249 attempts bound; 0 and 0 remain unbound`. The five history keys validated, and the migration ledger matched the checkout afterwards (#1197). Every production history row is now bound to the revision it was shown or graded against, which is phase 2b's precondition.
- **Tests.** Six real-Postgres cases in `question-revision-backfill.integration.test.ts`, all red first:
  - an older session state and its attempt;
  - an older attempt outside a session;
  - the batch bound, with its remainder reported;
  - a second run that binds nothing;
  - a row whose selection is a choice of another revision, left unbound and reported;
  - all five keys validated.
- **What does not change.** Readers, grading and the seed behave as before.

## Phase 2a, third increment, part one: question content reads through the current revision — 2026-09-28

The third increment switches reads to revisions. It lands in three parts, so each reviewed change stays small:
- 3a, question content and selection read the question's current revision (this part);
- 3b, grading and in-session reads use the session item's or attempt's bound revision;
- 3c, history, review and bookmark reads use the bound revision.

This part:
- **Reads.** The question repository reads a question's stem, explanation, reference, difficulty and choices from its current revision, no longer from the legacy columns or from every choice with the question's id. Selection's difficulty filter matches the current revision's difficulty. Every lookup the application uses changes: by id, by slug, by several ids, and the two session lookups.
- **Invariant.** A question with no current revision is refused with `INTERNAL_ERROR`, not served from the legacy columns. Only the seed writes questions, and it mirrors each into its revision in the same transaction; `0040` re-ran the sweep. Serving such a question silently would create unbound history, which phase 2b's migration refuses.
- **N-1.** The serving deployment still reads the legacy columns. While each question has exactly one revision, both read the same content.
- **Tests.** Five real-Postgres cases in `question-revision-reads.integration.test.ts`:
  - content from the current revision;
  - only the current revision's choices, through all five lookups;
  - the difficulty filter, both matching and excluding, and the candidate count;
  - refusal of a question without a revision;
  - every published question in the corpus read exactly as its legacy columns and choices.

  The first three were red first. The refusal case was red against the legacy fallback, which this part removed. Restoring the legacy difficulty column in the filter fails the difficulty case.
- **What does not change.** Grading, history and review reads, and the seed.
- **Review.**
  - #1200's one finding was fixed: the corpus case now requires a nonempty corpus.
  - Promotion #1201's finding was declined. It proposed failing every candidate query when any published question lacks a current revision. That would let one bad row take down selection for every learner, the corrupt-row blast radius DEBT-439 retired.
  - Today the failure is contained. A difficulty-filtered selection cannot pick such a question, and an unfiltered pick fails with `INTERNAL_ERROR` for that one question; neither shows stale content.
  - The structural guard is phase 3's `NOT NULL` on `current_revision_id`. It cannot land earlier, because the seed inserts a question before the revision that references it.

## Phase 2a, third increment, part two: a session shows and grades its bound revision — 2026-09-28

What a session shows, what it grades and what its attempt records are now one revision: the one the item was bound to when the session began, else (an item an older deployment left unbound) the question's current one. That is the rule attempts already bind by.
- **Domain.** A session item carries `questionRevisionId`, and a question carries the `revisionId` whose content it holds.
- **Port.** The two session lookups take the session item, not a question id. The compiler therefore finds every caller, and none can drop the binding by accident. The adapter reads the bound revision's content and choices, and refuses a binding that is not a revision of the question with `INTERNAL_ERROR`; the session state's composite key already prevents one from being stored.
- **Use cases.**
  - The next-question read in a session shows the item's revision, with today's refusal of a question withdrawn since the session began kept; the withdrawal notice is increment 5.
  - Submitting an answer in a session grades against the item's revision. Its error order is unchanged: the session is read first, and a missing session or a question outside it is still refused by the existing checks.
  - Saving an exam draft and finalizing an exam validate and grade against the item's revision.
- **What learners were exposed to.** None yet, because each question has one revision. Once phase 2b adds a second, a session begun before the change would have shown the new text, and answering or saving a draft with the new revision's choice would have failed as a server error when the database's composite key refused the write. Both are now correct by construction.
- **Found while doing it.** The exam-draft controller spread the whole session item into its strict output schema. The new field would have failed every draft save, so the serializer now names each field the client receives, and the item's revision stays internal. The controller tests now give the item a bound revision, and they failed before the fix.
- **Request cache.** The per-render cache keys a session item by its binding, so an unbound and a bound read of the same question never share a cache entry.
- **Fakes.** `FakeQuestionRepository` models revisions: each listed question is one revision, the first listed per id is current, and a session item reads its bound one.
- **Tests.**
  - Six real-Postgres cases in `question-revision-session-reads.integration.test.ts`, with revision 2 made current after the session began: the item carries its binding; the next question shows revision 1; an unbound item shows revision 2; a tutor answer is graded against revision 1 and its attempt records revision 1; revision 2's choice is refused as not found and writes nothing; an exam draft of revision 2's choice is refused, revision 1's is saved, and finalizing grades it against revision 1.
  - Five of the six were red first. The unbound case passed already, because unbound items read the current revision, as the serving deployment does.
  - Four use-case cases on the fakes, and fake and request-cache cases for the binding.
  - Break-it proofs: dropping the binding in the next-question read, the submission or the draft save fails its use-case case, and dropping it in finalize fails the Postgres finalize case.
- **What does not change.** Attempts still bind in SQL by the same rule, and history and review reads are part 3c.

## Related

- [DEBT-483](debt-483-content-withdrawal-and-release-rollback.md)
- Content SPEC-005 approval hashes and SPEC-007 release identity.
