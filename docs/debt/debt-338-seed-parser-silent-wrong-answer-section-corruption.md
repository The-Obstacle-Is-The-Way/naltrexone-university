# DEBT-338: Seed Parser Silently Accepts Malformed Wrong-Answer Sections

**Priority:** P2
**Created:** 2026-03-24
**Source:** Codebase-wide audit after DEBT-335 / adjacent to [DEBT-336](./debt-336-content-markdown-quality-pass.md)
**Scope:** `scripts/seed-helpers.ts`, `scripts/seed/question-parser.ts`, parser tests

---

## Problem

The feedback UI no longer hides all wrong-answer explanations when one sibling is missing. That part is fixed by DEBT-335.

But the seed/import pipeline still has a separate integrity gap: `parseChoiceExplanations()` in `scripts/seed-helpers.ts` treats the `**Why other answers are wrong:**` subsection as best-effort and silently accepts malformed structure instead of failing fast.

Today, malformed content can be:

- silently dropped
- silently attached to the wrong choice explanation
- silently converted to `null`

without any seed-time error from `parseSeedQuestionFile()` or `syncQuestionsFromFiles()`.

---

## Concrete Reproduction

Given this explanation body:

```markdown
General explanation.

**Why other answers are wrong:**
This line is not a bullet.
- A) Because A is wrong.
- F) Bogus label that should not pass.
- B)
```

the current parser accepts it and produces this shape:

- `generalExplanation` = `General explanation.`
- choice `A` explanation = `Because A is wrong.\n- F) Bogus label that should not pass.`
- choice `B` explanation = `null`
- the stray line `This line is not a bullet.` disappears entirely

That is silent content corruption, not graceful degradation.

---

## Why This Matters

This is different from DEBT-336.

- DEBT-336 is about incomplete authored content in the external question repo.
- DEBT-338 is about this repo's parser silently accepting malformed structure and producing wrong seeded data.

Impact:

- A typo in authored markdown can contaminate the wrong choice explanation shown to learners
- Useful content can disappear during import with no error
- Seed output can look structurally valid while being semantically wrong
- Debugging becomes hard because the corruption happens at import time, not in the UI

If the source content is malformed, the import should fail loudly with an actionable error. It should not guess.

---

## Current Root Cause

`parseChoiceExplanations()` currently:

1. strips everything before `**Why other answers are wrong:**` into `generalExplanation`
2. scans the subsection line-by-line
3. starts a new choice explanation only when a line matches `CHOICE_BULLET_PATTERN`
4. ignores any non-empty lines before the first parsed bullet
5. appends unmatched non-empty lines to the current bullet body if one is open
6. silently drops blank bullet bodies by not writing them to `perChoice`

`parseSeedQuestionFile()` validates only that parsed labels are present in frontmatter choices. It does not reject malformed wrong-answer subsection structure that never made it cleanly into `perChoice`.

---

## Desired Behavior

If `**Why other answers are wrong:**` is present, parsing should be strict enough to prevent silent corruption.

Acceptable:

- heading absent entirely
- well-formed bullets for some incorrect choices and omitted bullets for others
  - incomplete coverage is still a content debt tracked by DEBT-336

Not acceptable:

- non-empty stray text inside the section before the first bullet
- invalid bullet labels such as `F`
- duplicate bullet labels
- heading present with non-empty subsection content but zero valid parsed bullets
- malformed lines being silently attached to the previous choice explanation

---

## Implementation Direction

Follow TDD.

1. Add failing parser tests in `scripts/seed-helpers.test.ts` and `scripts/seed.test.ts`
2. Tighten `parseChoiceExplanations()` so malformed wrong-answer sections throw instead of silently degrading
3. Ensure thrown errors are actionable and include enough context to identify the file/question slug during seed
4. Keep syntactically valid partial coverage compatible with DEBT-336

Possible rule set:

- once inside the wrong-answer subsection, any non-empty line before the first valid bullet is an error
- any bullet-like line with an invalid label is an error
- any duplicate parsed label is an error
- if the subsection contains non-empty content but no valid bullet survives parsing, throw

---

## Acceptance Criteria

- [ ] `scripts/seed-helpers.test.ts` has regression coverage for stray non-bullet text, invalid labels, duplicate labels, and heading-with-no-valid-bullets
- [ ] `scripts/seed.test.ts` verifies `parseSeedQuestionFile()` fails fast on malformed wrong-answer sections
- [ ] Errors identify the offending question/file context clearly enough for content authors to fix quickly
- [ ] Well-formed partial wrong-answer sections still parse successfully
- [ ] No malformed subsection content is silently dropped or silently attached to the wrong choice explanation

---

## Relationship to Existing Debt

- [DEBT-336](./debt-336-content-markdown-quality-pass.md): external content completeness/format cleanup
- DEBT-338: internal parser validation so malformed content cannot silently corrupt seeded data
