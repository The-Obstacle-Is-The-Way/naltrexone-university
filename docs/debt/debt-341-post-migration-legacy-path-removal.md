# DEBT-341: Post-Migration Legacy Path Removal

**Priority:** P2
**Created:** 2026-03-28
**Status:** Resolved
**Resolved:** 2026-03-28
**Parent:** [DEBT-338](./debt-338-seed-parser-silent-wrong-answer-section-corruption.md) (Phase 2 complete; this is the cleanup)
**Scope:** `scripts/`, `lib/content/`, test fixtures

---

## Resolution

Implemented on `docs/debt-340-341-post-migration-tightening`.

Completed:

- Removed the legacy draft import path from `scripts/draft-question-import.ts`: `LegacyDraftFrontmatterSchema`, the legacy/new-format `z.union(...)`, `ParsedMarkdownChoice`, `parseChoicesBlock()`, and the legacy `answer` / `## Choices` branch in `parseDraftQuestionBlock()`
- Removed the legacy seed wrong-answer parser from `scripts/seed-helpers.ts`: `parseChoiceExplanations()`, its regex helpers, and `createWrongAnswerValidationError()`
- Removed the legacy seed branch from `scripts/seed/question-parser.ts` so `buildSeedRepFromParsed()` now has a single YAML-backed path
- Tightened `lib/content/schemas.ts` so `QuestionFrontmatterSchema.superRefine()` now rejects `correct: false` choices without `explanation`, while still forbidding explanations on `correct: true`
- Deleted legacy-only test coverage from `scripts/seed-helpers.test.ts`, `scripts/seed.test.ts`, and `scripts/draft-question-import.test.ts`, while preserving all new-format coverage

What intentionally stays:

- `parseExplanationAndReference()`
- `containsWrongAnswersHeading()`
- `WRONG_ANSWERS_HEADING_PATTERN`
- `SECTION_HEADING_PATTERN`
- `REFERENCE_HEADING_PATTERN`

These are still part of the single-format YAML pipeline.

---

## Problem

DEBT-338 Phase 2 migrated all 948 questions from legacy markdown-prose format to structured YAML frontmatter. The migration added dual-format support so both old and new questions could coexist during the transition. That transition is now complete — **zero legacy-format questions exist** in either the external authoring repo or the app content directory.

The dual-format code paths remain. They are dead code: reachable only by inputs that no longer exist. Keeping them:

- Adds ~260 lines of dual-format parse / compat logic nobody exercises against the current corpus
- Maintains roughly 40–50 explicitly legacy-focused tests plus shared fixtures/assertions tied to a defunct format
- Forces every future reader to understand two code paths instead of one
- Leaves the `explanation` field `.optional()` in schema instead of enforcing the invariant that wrong choices always have explanations

---

## What Gets Removed

### 1. Draft import pipeline (`scripts/draft-question-import.ts`)

| Item | Lines | Why it exists |
|------|-------|---------------|
| `LegacyDraftFrontmatterSchema` | 49–51 | Accepts `answer: "B"` field |
| `z.union([Legacy, New])` | 95–98 | Discriminates between formats |
| `ParsedMarkdownChoice` type | 116 | Only used by `parseChoicesBlock()` |
| `parseChoicesBlock()` | 191–222 | Parses `## Choices` markdown bullets |
| Legacy else-branch in `parseDraftQuestionBlock()` | 257–272 | Extracts stem via `## Choices` heading, maps `answer` to `correct` |

**After removal:** `DraftFrontmatterSchema` becomes `NewFormatDraftFrontmatterSchema` directly (rename). The parser has one path. No `## Choices` heading handling. No `answer` field.

### 2. Seed helpers (`scripts/seed-helpers.ts`)

| Item | Lines | Why it exists |
|------|-------|---------------|
| `parseChoiceExplanations()` | 98–284 | Regex state machine parsing `**Why other answers are wrong:**` bullets from markdown |
| `CHOICE_BULLET_PATTERN` | 35 | Only used by `parseChoiceExplanations()` |
| `SINGLE_LETTER_BULLET_PATTERN` | 37–38 | Only used by `parseChoiceExplanations()` |
| `COMBINED_LABEL_BULLET_PATTERN` | 39 | Only used by `parseChoiceExplanations()` |
| `NUMBERED_LIST_PATTERN` | 40 | Only used by `parseChoiceExplanations()` |
| `NESTED_MARKDOWN_CONTINUATION_PATTERN` | 41–42 | Only used by `parseChoiceExplanations()` |
| `INDENTED_CONTINUATION_PATTERN` | 43 | Only used by `parseChoiceExplanations()` |
| `createWrongAnswerValidationError()` | 45–49 | Only used by `parseChoiceExplanations()` |

**Keep:** `parseExplanationAndReference()` (still needed), `containsWrongAnswersHeading()` (still useful as a guard against accidental legacy content, and it's 5 lines — removal is optional).

### 3. Seed question parser (`scripts/seed/question-parser.ts`)

| Item | Lines | Why it exists |
|------|-------|---------------|
| `import { parseChoiceExplanations }` | 19 | Dead import after function removal |
| Legacy else-branch in `buildSeedRepFromParsed()` | 91–112 | Calls `parseChoiceExplanations()` when no YAML explanations exist |

**After removal:** The `hasYamlExplanations` check and its if/else collapse to a single code path. All questions have YAML explanations.

### 4. Schema tightening (`lib/content/schemas.ts`)

| Item | Line | Change |
|------|------|--------|
| `explanation: ChoiceExplanationSchema.optional()` | 23 | Keep the field structurally optional, but tighten `QuestionFrontmatterSchema.superRefine()` so `correct: false` without `explanation` is rejected. |

**Why keep `.optional()`:** the choice-level object still has to allow `correct: true` choices with no `explanation` key. The invariant belongs in `QuestionFrontmatterSchema.superRefine()`: `correct: true` + `explanation` is rejected, and `correct: false` without `explanation` is also rejected.

### 5. Test fixtures and test suites

| File | What to remove |
|------|----------------|
| `scripts/draft-question-import.test.ts` | Multiple legacy `answer:` fixtures plus the explicit legacy parser / conversion assertions |
| `scripts/seed-helpers.test.ts` | Entire `parseChoiceExplanations` coverage surface (~31 tests) |
| `scripts/seed.test.ts` | Legacy-MDX regression coverage and corruption fixtures that only protect the legacy parser path |
| `lib/content/schemas.test.ts` | Legacy-compat assertion that a wrong choice may omit `explanation` (will fail by design after tightening) |

---

## What Stays

| Item | Why |
|------|-----|
| `parseExplanationAndReference()` | Still splits general explanation from `### Reference` for new-format questions |
| `containsWrongAnswersHeading()` | 5-line guard; useful to reject accidental legacy content during authoring. Optional to remove. |
| `WRONG_ANSWERS_HEADING_PATTERN` | Used by `containsWrongAnswersHeading()` |
| `SECTION_HEADING_PATTERN` | Used by `parseExplanationAndReference()` |
| `REFERENCE_HEADING_PATTERN` | Used by `parseExplanationAndReference()` |

---

## Risk Assessment

**Risk: Low.** This is almost entirely deletion plus one schema tightening.

- All 948 production questions are new-format (verified by successful seed with zero legacy-path hits)
- No additional runtime consumers of the removed functions; remaining references are tests/docs
- The schema tightening makes an existing runtime invariant into a compile-time guarantee
- Test removal matches code removal 1:1

**One caution:** If someone later authors a legacy-format draft by mistake, the pipeline will now reject it at schema validation instead of silently accepting it. This is the desired behavior.

---

## Verification

Completed:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- `pnpm test:browser`
- `pnpm test:integration`
- `pnpm build`
- `pnpm content:import:drafts -- --dry-run` → `files=170 questions=948 written=0 (dry-run)`

---

## Estimated Effort

Small. This is primarily deletion (~260 lines of code and roughly 40–50 explicitly legacy-focused tests, plus a handful of shared fixtures/assertions) plus one schema field change. No new logic needed.
