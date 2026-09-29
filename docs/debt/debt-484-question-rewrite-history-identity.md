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

## Phase 2a, third increment, part three (i): reviews show the revision that was answered — 2026-09-29

Part 3c lands in two halves. This one covers reviews that show choices and correctness: a session's review, a completed session's feedback, and an earlier attempt, including an unanswered item revealed after its session ended. The other half covers the attempted-questions list, recent activity and bookmarks.

Until now, once a question gained a newer revision, reviewing an earlier session or attempt would have shown the new revision: a different stem, a different correct answer and a different explanation. A learner would have seen a correct answer they were never graded against.
- **Domain.** An attempt carries `questionRevisionId`: the revision it graded, or null for a row a deployment older than binding wrote. The attempt row type requires the field, so every query that maps an attempt must select it; the recent-attempts query did not, and now does.
- **Port.** The binding type now covers any row bound to a revision: a session item or an attempt. `findPublishedByBinding` and `findPublishedByBindings` read a published question as its binding's revision, else as its current one. The adapter shares one resolution path with the session lookups, and refuses a revision that is not the question's, which the attempts and session-state composite keys already prevent.
- **Use cases.** Session review and completed-session feedback read the session's items as bound. The previous-attempt view reads the attempt as bound, and reads an unanswered item of an ended session as its item was bound. Withdrawn questions stay unavailable, as before; the notice is increment 5.
- **Request cache.** The published binding lookup is cached by its exact binding list. Two attempts can bind one question at different revisions, so results are never mapped back by question id.
- **Tests.**
  - Six real-Postgres cases in `question-revision-review-reads.integration.test.ts`, with the questions revised after the session ended: the attempt carries its revision; the session review; completed-session feedback, with choices, selection, correct answer and explanation; an earlier session attempt; an earlier attempt outside a session; and an unanswered item's reveal. All six were red first.
  - The attempt round-trip case now expects the revision on every read, including recent activity.
  - Use-case cases on the fakes for the review and the previous attempt, and fake and request-cache cases for the binding lookups.
  - Break-it proofs: dropping the binding fails both use-case cases and five of the six Postgres cases. The sixth checks the attempt's own field.

## Phase 2a, third increment, part three (ii): lists show the revision that was answered — 2026-09-29

This half covers lists of earlier answers, and bookmarks.
- **Attempted questions.** The list query joins the revision each question's latest attempt was answered against, else (an attempt an older deployment left unbound) its current revision. The difficulty filter and the difficulty sort use that revision, so a filter and the row it returns can never disagree. Each row shows that revision, through the binding.
- **Recent activity.** Each attempt shows the revision it graded. Two attempts of one question can differ, so questions are keyed by the whole binding, never by question id.
  - The port now states the pairing rule: an unpublished question is omitted for every binding of it, and every other binding yields exactly one question, in order.
  - The shared helper checks every pair, including a bound binding's revision, and fails with `INTERNAL_ERROR` if a repository breaks the rule.
- **Bookmarks.** A bookmark binds no revision, so it shows the question's current revision, through a join, not the legacy columns.
- **Removed.** The id-keyed fetch helper had no callers left, so it and its test are deleted, and the practice-engine file index now lists every shared helper.
- **Fakes.** `FakeAttemptRepository` filters and sorts the attempted list by the revision each attempt answered, when a test lists several revisions of a question.
- **Fixtures.** Two integration fixtures that write attempt rows directly now bind the question's current revision, as the app does.
- **Tests.**
  - Four real-Postgres cases in `question-revision-list-reads.integration.test.ts`: the attempted filter, the attempted sort, recent activity with two attempts of one question at different revisions, and a bookmark. Each case rewrites the legacy row as the seed does, so a read of the legacy columns is caught. All four were red first.
  - Use-case cases on the fakes for the attempted list and recent activity. Helper cases cover distinct bindings, an unpublished question, and a repository that returns questions out of order, extra, or with two revisions of one question swapped.
  - A fake case covers the attempted list's difficulty sort: the answered revision, unpublished questions and ties by recency. That sort had no test before.
  - Break-it proofs: a helper that ignores revisions fails the helper and both use-case cases; restoring the legacy difficulty column fails the Postgres filter and sort cases.

## Phase 2a, fourth increment: the seed waits for learners mid-session — 2026-09-29

Until phase 2b, a content correction still refreshes revision 1 in place. #951's guard refuses a rewrite once graded history exists: attempts, or session states with a graded answer.
- **The gap.** A learner who has started a session but not yet answered a question has no graded history. The seed would rewrite the question and refresh revision 1 under that session, so its stem, choices or difficulty could change between reading and answering. A difficulty change is not "content" to #951 at all.
- **The rule.** The seed refreshes a question's revision 1 only while no incomplete practice session binds it. Before mirroring, it compares the content it would write with the revision's stored hash. If they differ and an incomplete session binds the revision, the question's transaction rolls back, and both the legacy row and revision 1 stay unchanged.
- **Deferred, not failed.** The run applies every other question, then exits non-zero, naming each deferred slug with its session count and asking for a rerun after those sessions end. Aborting the whole run instead would let one abandoned session block every other correction. No override exists: changing content under a learner is never correct.
- **Unchanged.**
  - #951 still governs graded history.
  - Tag-only and status changes do not change the revision's content, so they still apply.
  - The graded-history suite now ends its arranged session, so it exercises #951 alone, and the new suite owns incomplete sessions.
- **Operations.** Production seeding is a manual operator command, never a deploy step, so a deferral cannot block a release. Local E2E seeding can defer if a content change meets an incomplete session an earlier E2E run left behind; the message names the question. The deployment procedure and the tag-taxonomy pipeline document the rule.
- **Tests.**
  - Four real-Postgres cases in `seed-active-session-deferral.integration.test.ts`: a rewrite deferred with nothing changed; a difficulty-only change deferred; the same rewrite applied once the session ends; and the run's other questions still applied. All four were red first; the first showed the rewrite applied under the active session.
  - Unit cases for the seed's report.
- **Review (#1208).**
  - Session creation read the question's current revision without a lock, so a session created while a seed transaction was running could bind the revision just after the seed counted sessions, and see the refresh.
  - It now reads the question rows `FOR SHARE`. Session creations still run concurrently, but each waits for, or blocks, a seed transaction's `FOR UPDATE`.
  - A Postgres case holding the seed's lock shows creation waiting; it was red first.
  - **Residual, recorded.** Grading an answer outside a session reads the question before the attempt is written, so a seed refresh landing in that window could bind the attempt to refreshed content. That is the pre-existing #951 race class, not introduced here. Phase 2b removes it: revisions become immutable, so nothing is refreshed in place.

## Phase 2a, fifth increment, part one: the withdrawal notice pattern — 2026-09-29

ADR-021 §3 keeps a withdrawn question reviewable by learners who attempted it, as the revision they answered, and marks every such view. The Pattern Registry needs the notice before any UI lands, so this part adds it as F-11, reviewed on its own.
- **What exists today.** Seven surfaces show an attempted withdrawn question as gone: `[Question no longer available]` rows in History, the Dashboard, the session breakdown and Review & Submit; `Question no longer available.` in post-exam review; and `Question not found` from the question page and in an active session. None says the question was withdrawn, and none lets the learner see what they answered.
- **F-11, Withdrawal Notice.**
  - Review views: an S-1 Status notice above the stem, "This question has been withdrawn. You can still review your answer. It no longer appears in new practice." The answer, correct choice and explanation show as answered.
  - List rows: the row stays clickable into the review, shows the answered revision's stem, and reads `Withdrawn` where the difficulty would be.
  - Active session: the same notice replaces `Question not found`: "This question was withdrawn after your session began. It can't be answered here. Continue to the next question."
  - Never attempted, such as a bookmark only: unchanged. The learner never answered it, so its content is not shown.
  - No new surface, token, opacity value or color pair.
- **Open decision for the owner: scoring.** An exam item withdrawn mid-session and left unanswered is finalized as omitted, which is graded incorrect. Whether a withdrawn item should instead be left out of the session's score is a product and fairness question, not an engineering one. The notice makes no claim about scoring until it is decided.
- **Next parts.**
  - Part two: history and review reads return an attempted withdrawn question as bound, marked withdrawn, only to the learner who attempted it.
  - Part three: the seven surfaces adopt F-11, and eleven tests pin today's strings.

## Related

- [DEBT-483](debt-483-content-withdrawal-and-release-rollback.md)
- Content SPEC-005 approval hashes and SPEC-007 release identity.
