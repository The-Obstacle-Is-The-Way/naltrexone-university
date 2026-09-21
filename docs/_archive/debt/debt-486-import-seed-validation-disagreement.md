# DEBT-486: Import and Seed Validation Disagreement

**Status:** Resolved — 2026-09-21; archived after release readback
**Priority:** P1
**Date:** 2026-09-20
**ID reconciliation:** Renumbered from DEBT-480 after PR #937 collided with the owner's reserved public-surface IDs; original evidence and status are preserved.
**Confidence:** CONFIRMED

## Closeout — 2026-09-21

The validator implementation was already complete; the missing release receipt is now verified. #949's merge `b2efba9c` is an ancestor of current main `76e65e9c` and was first promoted in #959 as `4cd9d442`. Source review `5261681489` formally approved exact head `852c26d5`; CI `35535698571` succeeded. #959 used the owner's explicit one-time waiver for an exact-head **formal review object** after its completed review; it must not be reported as a normal exact-head approval. Subsequent promotion #967 has formal exact-head approval, and main CI `35562531386` is green. Vercel serves that main commit, held its ready build until the main test check succeeded, and production home/health return 200. [Release and current-tree proof](../../debt/assets/active-audit-2026-09-21/verification.md).

The read-only local parser census again passed **958/958** MDX files: 948 authored and ten synthetic placeholders, with zero uncited authored files. The five named parser/import suites plus five workflow/provider/lane suites passed **232/232** in this audit. `convertDraftQuestionToMdx` calls the real seed parser; the reference exception still requires both the dedicated source directory and placeholder slug. This does not assert a production row count, live content re-seed, corpus-wide transaction or immutable release. Those remaining mechanisms belong to DEBT-483/484. The dated failed E2E attempt and original red proofs below remain intact; this closeout supersedes only their pending-release conclusion.

## Evidence

The snapshot and probe below describe the pre-fix behavior. The implementation
receipt at the end records the replacement contract and its explicit synthetic
placeholder exception.

At app commit 6199084a1a4407d4d9d800bd798b37c422662b66:
scripts/draft-question-import.ts:180 parses headings but does not reject an
empty extracted stem; :291 validates only MDX frontmatter.
lib/content/parse-mdx-question.ts:63 rejects an empty stem.
scripts/seed/question-parser.ts:91 invokes that stricter body parser.
content/drafts/questions/SCHEMA.md:284 requires a final Reference subsection.

Missing references expose a separate contract hole within this same body-
validation boundary: scripts/seed-helpers.ts:118 parses references and returns
null when absent. At that pre-fix snapshot, seed accepted missing references
too; the implementation receipt below records the changed boundary.

## Reproduction

Run [DEBT-485's read-only synthetic fixture](./debt-485-import-output-path-traversal.md#read-only-reproduction-and-shared-fixture)
twice, setting PROBE=empty and PROBE=no_reference.

Observed:

- empty: importer parses/converts one block; seed accepted=false,
  error="Stem markdown is empty after parsing".
- no_reference: importer parses/converts one block; seed accepted=true,
  reference=null.

No question files or database rows are modified by either probe.

## Failure scenario

A green import dry run produces content that fails during a later seed, possibly
after earlier files have committed. Separately, uncited content can pass both
validators despite the authoring contract.

## Smallest fix

Use one complete body-validation boundary for import and seed, including
nonempty canonicalized stem/explanation and the required nonempty final
reference. Preserve parsing/rendering semantics; sharing frontmatter Zod alone
is not the fix. Update any intentional exceptions explicitly in the contract
rather than silently accepting them.

## Verification

Positive fixture with body/reference passes both paths. Empty/whitespace body,
missing/empty reference, invalid heading order, and trailing material violating
the reference placement contract fail consistently before output writes.
Verify actual parseSeedQuestionFile parity without database access.

## Implementation receipt — 2026-09-20

**CONFIRMED:** before implementation at `7e41deaa`,
`pnpm test --run scripts/draft-question-body.test.ts scripts/seed.test.ts scripts/import-draft-questions.test.ts`
produced **19 failed / 50 passed**. The cases exercise empty/blank stems,
empty explanations, a reference-only explanation, missing/empty/blank
references, reversed headings, a heading after the terminal reference, and
placeholder-policy boundaries. Real CLI cases prove a later uncited file
formerly returned success in normal and dry-run modes.

`convertDraftQuestionToMdx` now calls the actual `parseSeedQuestionFile` on the
generated MDX before returning it. That shared boundary preserves the existing
stem/body parsing and terminal-reference handling, rejects an empty
canonicalized general explanation, and requires a nonempty reference. There
is no second body validator or alternative set of heading rules. The CLI's
existing all-files preflight therefore rejects invalid converted bodies before
any output write. Direct MDX input to seed receives the same validation.

### Explicit exception: synthetic seed placeholders

The 948 imported local questions all contain references. The ten uncited local
MDX files are the synthetic fixtures in `content/questions/placeholder/`;
`scripts/seed.test.ts` already exercises every tracked fixture, and
`scripts/seed/placeholder-archiver.ts` reserves the `placeholder-` namespace.
They are test/development scaffolding, not a relaxation for authored questions.

The parser permits reference omission only when **both** the supplied source
path is directly in that dedicated directory and the slug starts with
`placeholder-`. `syncQuestionsFromFiles` supplies the actual `absolutePath`
from the file reader. Import conversion supplies no source path, so even a
placeholder-named draft must contain a reference. A placeholder slug in an
imported path, a normal slug in the placeholder directory, or omitted path
context does not receive the exception. Empty body/general explanation and
nonterminal reference sections remain invalid for placeholders as well.

Existing positive importer/seed-sync fixtures gained synthetic citations;
their behavior assertions were retained. The former seed test expecting a null
reference for ordinary published content now requires rejection. Pure helper
parsing remains unchanged; the required-reference policy belongs to the shared
question-file boundary.

### Verification

`pnpm test --run scripts/draft-question-body.test.ts scripts/seed.test.ts scripts/import-draft-questions.test.ts scripts/draft-question-import.test.ts scripts/draft-question-split.test.ts`
passed **117/117**. The clone-isolated
`pnpm test:integration tests/integration/bug-regression-seed-choice-sync.integration.test.ts`
passed **10/10**, retaining the existing answer-key/history and choice-sync
assertions. Typecheck passed.

```text
pnpm exec tsx scripts/import-draft-questions.ts --in content/drafts/questions --out /tmp/content-integrity-2026-09-20/486-dry-run-output --dry-run
Imported draft questions: files=170 questions=948 written=0 (dry-run) uniqueQids=948
```

A read-only census called `parseSeedQuestionFile(raw, absolutePath)` for every
local MDX file and counted returned representations:

```json
{"files":958,"parsed":958,"uncitedSyntheticPlaceholders":10,"uncitedImported":0}
```

No real content or remote database rows were changed. Static whole-input seed
prevalidation subsequently landed under DEBT-483 in #952; atomic release/rollback
remains open there. Rejecting invalid files does not make the current per-question
seed transactions atomic across the corpus. The first full local gate passed typecheck, lint, 4,366 unit tests, 411 browser
tests, 293 integration tests (6 existing skips), and build, then failed E2E:
**43 passed / 1 failed**. `review-mode-audit.spec.ts:115` could not find the
Question heading (`helpers/question.ts:97`). The server logged Clerk
`api_response_error`, HTTP **503**, in `getCurrentUser`, digest **1426188838**;
the browser error page carried that same digest. This is a confirmed provider
error in a product test, not evidence that the product attempt passed. No
product retry or timeout policy was changed. After integrating PR #944's dev base (`eedc68a6`) and main promotion ancestry,
the fresh full gate passed: typecheck, lint, **4,407 unit / 411 browser / 293
integration** tests (6 existing skips), build, and **44 authenticated E2E** tests
with no retries. The previously failing history case passed in that fresh run.
The first run remains a failed attempt; the new result does not erase it.
Clerk/Stripe were TEST-mode and both database lanes used clone-isolated Docker.
[PR #949](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/949)
first received CodeRabbit approval `5261620430` on `b0955d02`, zero unresolved
threads, and [CI 35534593526](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35534593526)
passed (44 E2E, no retries). GitHub refused the merge with `Base branch was
modified` when PR #948 advanced dev to `e4e53598` between the final readiness
check and merge request. No override was used.

After integrating that base, the full gate passed again: typecheck, lint,
**4,421 unit / 411 browser / 293 integration** tests (6 existing skips), build,
and **44 authenticated E2E** tests without retries. The earlier approval did
not cover the updated head. **CONFIRMED:** fresh review `5261681489` approved
exact head `852c26d5`; zero unresolved threads and [CI 35535698571](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35535698571)
preceded merge `b2efba9c` at 20:41:24 UTC. [The closeout](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/949#issuecomment-5752527561)
retains that evidence. At the [reconciliation snapshot](../../debt/assets/content-integrity-2026-09-20/verification.md#reconciliation-snapshot),
main was still `7e41deaa`; this record remains Active for the later release
readback, not additional body-validator implementation.

## Related

- [DEBT-485](./debt-485-import-output-path-traversal.md)
- [DEBT-483](../../debt/debt-483-content-withdrawal-and-release-rollback.md)
