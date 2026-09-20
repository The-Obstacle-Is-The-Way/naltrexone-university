# DEBT-487: Frontmatter Order Can Silently Omit Questions

**Status:** In Progress — merged to dev; production promotion pending
**Priority:** P1
**Date:** 2026-09-20
**ID reconciliation:** Renumbered from DEBT-481 after PR #937 collided with the owner's reserved public-surface IDs; original evidence and status are preserved.
**Confidence:** CONFIRMED

## Evidence

The following evidence describes the pre-fix tree. The dated implementation
receipt below supersedes that behavior, without claiming a production omission.

scripts/draft-question-import.ts:107 recognizes only a delimiter immediately
followed by qid. At :120 it returns an empty array when no such block is found.
scripts/import-draft-questions.ts:77 rejects zero discovered files, but :84
does not reject zero blocks within a discovered file. :111 prints aggregate
success counts. Snapshot: 6199084a1a4407d4d9d800bd798b37c422662b66.

The authoring ordering rule is content/drafts/questions/SCHEMA.md:201. A format
violation should be rejected, not treated as absent input.

## Reproduction

Run [DEBT-485's synthetic fixture](../_archive/debt/debt-485-import-output-path-traversal.md#read-only-reproduction-and-shared-fixture)
with PROBE=reordered. It places type before qid.

Observed: blocks=0, outputs=[], uniqueOutputs=0, seed=[]; no exception.
The CLI's file loop then processes no block for that discovered file, by :84-106.

## Failure scenario

A generator changes YAML key ordering and a whole file disappears from the
import while the overall command reports success. In a mixed file, malformed
blocks may instead be folded into an adjacent block; complete consumption must
also be checked, not merely an overall nonzero count.

## Smallest fix

Fail on unconsumed or malformed candidate blocks, and on zero questions in any
discovered question file. Either support arbitrary YAML key order deliberately
or enforce qid-first with an explicit error. Do not silently relax the format
contract as a side effect of a splitter change.

## Verification

Reordered first, middle, and last blocks, CRLF input, preambles, and adjacent
blocks must produce explicit acceptance or rejection without omission or
absorption. Assert discovered/parsed identities and full block consumption.
A corpus-wide positive total alone cannot close this debt.

## Implementation receipt — 2026-09-20

**CONFIRMED:** the original splitter silently omitted or absorbed reordered
blocks. Against unchanged runtime code from `d4c5a7a6`, running
`pnpm test --run scripts/draft-question-split.test.ts scripts/import-draft-questions.test.ts`
produced **14 failed / 11 passed**. The real CLI returned exit 0 for both an
empty discovered file and a later reordered block; the latter reported
`files=1 questions=1 written=1` despite two supplied questions. Dry runs also
reported success. These tests use synthetic content in disposable directories.

The replacement in `scripts/draft-question-import.ts:splitDraftQuestionsFile`
consumes delimiter-framed blocks sequentially and explicitly enforces the
existing `qid`-first rule. It rejects empty files, unsupported preambles,
unclosed frontmatter, missing opening delimiters, and unexpected text after a
question separator. Errors report a line number; the CLI adds the input path
and preserves its preflight-before-write behavior. YAML schema and body
validation remain separate; this does not resolve DEBT-486.

Compatibility is explicit: LF/CRLF, adjacent blocks, closing/opening delimiter
pairs, optional final separators, and existing title/quoted-source preambles
are covered. A corpus check found 36 preambles also end in a horizontal rule;
that valid form first failed a new test (**1 failed / 13 passed**), then passed
after the narrow compatibility correction. Top-level `---` remains structural,
and arbitrary prose before the first block is rejected rather than discarded.

`pnpm test --run scripts/draft-question-import.test.ts scripts/draft-question-split.test.ts scripts/import-draft-questions.test.ts`
then passed **60/60**. The tests compare identities, stems, and entire
explanations across adjacent blocks, and real process tests prove both normal
and dry-run refusal occurs before the output root is created.

A read-only comparison parsed every local draft with both the old splitter
expression (`/^---\nqid:/gm`) and the replacement, then compared the complete
`parseDraftQuestionBlock` result for each index:

```json
{"files":170,"parsed":948,"uniqueIds":948,"identicalParsedQuestions":948}
```

This proves compatibility with the local corpus, not production cardinality or
absence of other content defects. No imported content or database was changed.
The full local gate passed: typecheck, lint, **4,330 unit / 411 browser / 293
integration** tests (six existing opt-in skips), production build, and **44
authenticated E2E** tests without retries. Clerk/Stripe credentials were
confirmed TEST-mode; integration and E2E used this clone's isolated Docker
database.

[PR #943](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/943)
merged to dev as `95c8f93e` at 2026-09-20T19:04:43Z after CodeRabbit review
`5261420106` approved exact head `df8a4baf`, zero unresolved threads, and all
checks passed. [CI 35530510447](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35530510447)
also passed 44 E2E tests without retries. [Closeout and warning adjudication](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/943#issuecomment-5751958877).
Production promotion remains pending; no production import or seed was run.

## Related

- [DEBT-482](debt-482-duplicate-qid-output-collision.md)
