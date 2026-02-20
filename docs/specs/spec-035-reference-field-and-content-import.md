# SPEC-035: Reference Field & Content Import Pipeline

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development. Write failing tests FIRST for every behavioral change.

**Status:** Proposed
**Layer:** Feature
**Date:** 2026-02-20
**Resolves:** [BS-025](../brainstorming/BS-025-reference-section-pipeline-support.md)

---

## 1. Overview

The revised question bank (948 questions across 170 files from `addiction-final-2026`) has been dropped into `content/drafts/questions/`. Every question now includes a `### Reference` section with an AMA-format citation. The current pipeline silently discards these citations during seeding.

This spec adds `referenceMd` as a first-class content field — following the exact same vertical pattern as `stemMd` and `explanationMd` — and then runs the full import pipeline to seed the database.

### Verified code-truth baseline (authoritative)

1. **Draft validation passes.** `pnpm content:import:drafts -- --dry-run` processes all 170 files / 948 questions with zero validation errors.
2. **All tags are canonical.** Every `topics`, `substances`, `treatments`, and `diagnoses` slug matches `lib/content/draftTaxonomy.ts` (SPEC-033 taxonomy). No legacy or rogue slugs.
3. **Import script preserves references.** `extractAfterHeading('## Explanation')` captures `### Reference` content into the MDX `## Explanation` section body. No import changes needed.
4. **Seed script drops references.** `parseChoiceExplanations()` in `scripts/seed-helpers.ts:72-73` hits `### Reference` heading and `break`s — content after the break is never assigned to any variable.
5. **No `reference_md` column exists.** `db/schema.ts` `questions` table has `stem_md` and `explanation_md` but no reference field.
6. **Domain entity lacks field.** `src/domain/entities/question.ts` `Question` type has `stemMd` and `explanationMd` but no `referenceMd`.
7. **Feedback component has no reference rendering.** `components/question/feedback.tsx` renders `explanationMd` and per-choice explanations only.
8. **Existing test file.** `components/question/Feedback.test.tsx` exists with 4 tests (correct/incorrect rendering, a11y alert role, per-choice display order, fallback behavior).

### Scope boundaries

In scope:
- `referenceMd` vertical slice: DB column → domain → repository → use case → controller → UI
- Seed parsing: extract `### Reference` content from explanation body
- Content import: run `pnpm content:import:drafts` on new drafts
- Database seed: run `pnpm db:seed` with reference support
- Feedback UI: render citation below per-choice explanations

Out of scope:
- Structured citation fields (DOI, PubMed ID, journal, year) — future feature
- Citation search or linking — future feature
- Draft content quality improvements (Prescriber's Guide rewrite queue, DSM-5 sweep)
- Database migration 0010 sync (tracked separately in SPEC-033 §14)

---

## 2. Resolved Decisions

| BS-025 Option | Resolution | Rationale |
|---|---|---|
| A) Append reference to `generalExplanation` | **Rejected** | Conflates teaching content with bibliographic metadata. Violates SRP. |
| B) New `reference_md` column — full vertical slice | **Accepted** | Same pattern as every other content field. Enables future citation features. |
| C) Citation in YAML frontmatter | **Rejected (premature)** | AMA citations are prose, not structured metadata. All 948 drafts already have `### Reference` in body. |
| D) Strip references explicitly | **Rejected** | Discards author work. Citations are valuable for a board-prep product. |

### Additional decisions

| Question | Resolution | Rationale |
|---|---|---|
| Is `reference_md` nullable? | **Yes** — not all questions have references | Existing placeholder questions and any future questions without citations should not require a reference. |
| Show reference in exam mode? | **Yes, same visibility as `explanationMd`** | Reference is part of the educational feedback, gated by `shouldShowExplanation`. Hidden during active exam, shown in exam review. |
| Reference styling? | **Muted, smaller text, border separator** | Visually distinct from teaching content. Citation is metadata, not explanation. |

---

## 3. Phase 1: Seed Parsing — Extract Reference

### 3.1 `scripts/seed-helpers.ts`

Modify `parseChoiceExplanations()` to return a third field:

```typescript
export function parseChoiceExplanations(explanationMd: string): {
  generalExplanation: string;
  perChoice: Map<string, string>;
  referenceMd: string | null;  // NEW
}
```

**Implementation:** After the per-choice `for` loop breaks at `### Reference`, scan the remaining lines of the input for reference content. If the break was triggered by a `### Reference` heading, capture all subsequent non-empty lines as `referenceMd`. If no `### Reference` heading caused the break (or no break occurred), return `null`.

**Key constraint:** The function currently iterates `lines.slice(headingIndex + 1)` with a `break` on any heading. After the break, the remaining lines are available via the original `lines` array and the break index. The reference extraction must use the remaining lines from the original input, not just the loop iterator.

### 3.2 `scripts/seed-helpers.test.ts`

Add tests (details in §8).

---

## 4. Phase 2: Database Schema

### 4.1 `db/schema.ts`

Add to `questions` table definition:

```typescript
referenceMd: text('reference_md'),  // nullable — not all questions have references
```

### 4.2 Migration

Run `pnpm db:generate` to produce migration `0011_*.sql` (or next index). The migration adds a nullable `reference_md TEXT` column to `questions`.

**Note:** This is a non-destructive, additive migration. No data loss. Existing rows get `NULL` for the new column.

---

## 5. Phase 3: Seed Pipeline

### 5.1 `scripts/seed/question-parser.ts`

Add `reference_md` to `SeedQuestionRep`:

```typescript
export type SeedQuestionRep = {
  slug: string;
  stem_md: string;
  explanation_md: string;
  reference_md: string | null;  // NEW
  // ... rest unchanged
};
```

Wire up in `buildSeedRepFromParsed()`:

```typescript
const parsedExplanations = parseChoiceExplanations(parsed.explanationMd);
return {
  // ...
  explanation_md: parsedExplanations.generalExplanation,
  reference_md: parsedExplanations.referenceMd,  // NEW
  // ...
};
```

Wire up in `buildSeedRepFromDb()`:

```typescript
return {
  // ...
  explanation_md: canonicalizeMarkdown(question.explanationMd),
  reference_md: question.referenceMd
    ? canonicalizeMarkdown(question.referenceMd)
    : null,  // NEW
  // ...
};
```

### 5.2 `scripts/seed/question-syncer.ts`

Include `referenceMd` in both insert and update operations:

**Insert:**
```typescript
.values({
  slug: seedFromFile.slug,
  stemMd: seedFromFile.stem_md,
  explanationMd: seedFromFile.explanation_md,
  referenceMd: seedFromFile.reference_md,  // NEW
  difficulty: seedFromFile.difficulty,
  status: seedFromFile.status,
})
```

**Update:**
```typescript
.set({
  stemMd: seedFromFile.stem_md,
  explanationMd: seedFromFile.explanation_md,
  referenceMd: seedFromFile.reference_md,  // NEW
  difficulty: seedFromFile.difficulty,
  status: seedFromFile.status,
  updatedAt: new Date(),
})
```

---

## 6. Phase 4: Domain → Use Case → Controller

### 6.1 `src/domain/entities/question.ts`

```typescript
export type Question = {
  // ... existing fields ...
  readonly referenceMd: string | null;  // NEW
};
```

### 6.2 `src/adapters/repositories/drizzle-question-repository.ts`

Add to `toDomain()` mapping:

```typescript
referenceMd: row.referenceMd ?? null,
```

### 6.3 `src/application/use-cases/submit-answer.ts`

Add `referenceMd` to `SubmitAnswerOutput`:

```typescript
export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string | null;
  explanationMd: string | null;
  referenceMd: string | null;  // NEW
  choiceExplanations: ChoiceExplanation[];
};
```

In the return statement:

```typescript
return {
  attemptId: attempt.id,
  isCorrect: grade.isCorrect,
  correctChoiceId: shouldShowExplanation ? grade.correctChoiceId : null,
  explanationMd,
  referenceMd: shouldShowExplanation ? question.referenceMd : null,  // NEW
  choiceExplanations,
};
```

### 6.4 `src/application/use-cases/get-next-question.ts`

Add to `PreviousSubmission` type:

```typescript
export type PreviousSubmission = {
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;  // NEW
  choiceExplanations: ChoiceExplanation[];
};
```

In `buildPreviousSubmission()`:

```typescript
return {
  correctChoiceId: correctChoice.id,
  explanationMd: question.explanationMd,
  referenceMd: question.referenceMd,  // NEW
  choiceExplanations: choiceViews.map(/* ... */),
};
```

### 6.5 `src/adapters/controllers/question-controller.ts`

Add to `SubmitAnswerOutputSchema`:

```typescript
referenceMd: z.string().nullable(),  // NEW — after explanationMd
```

Add to `NextQuestionOutputSchema`'s `previousSubmission` shape (if it has one) or wherever `PreviousSubmission` is validated.

---

## 7. Phase 5: UI

### 7.1 `components/question/feedback.tsx`

Add `referenceMd` to `FeedbackProps`:

```typescript
export type FeedbackProps = {
  isCorrect: boolean;
  explanationMd: string | null;
  referenceMd?: string | null;  // NEW — optional for backward compat
  choiceExplanations?: readonly FeedbackChoiceExplanation[];
};
```

Render after per-choice explanations, before closing `</Card>`:

```tsx
{referenceMd ? (
  <div className="mt-4 border-t border-border/40 pt-3">
    <div className="text-xs font-medium text-muted-foreground">Reference</div>
    <Markdown content={referenceMd} className="mt-1 text-xs text-muted-foreground" />
  </div>
) : null}
```

### 7.2 Wiring — callers of `<Feedback>`

Update all components that render `<Feedback>` to pass `referenceMd` through. Trace from controller output to the component prop. These are likely in:
- `app/(app)/app/questions/[slug]/question-page-client.tsx` (or similar)
- Practice session question flow components

---

## 8. Tests First

Every behavioral change follows Red → Green → Refactor.

### Phase 1 tests (seed parsing)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `scripts/seed-helpers.test.ts` | `extracts referenceMd from content with ### Reference section` | `referenceMd` equals the citation text after the heading | Unit |
| `scripts/seed-helpers.test.ts` | `returns null referenceMd when no ### Reference present` | `referenceMd` is `null` | Unit |
| `scripts/seed-helpers.test.ts` | `extracts referenceMd with multi-line citation` | Multi-line AMA citation is fully captured | Unit |
| `scripts/seed-helpers.test.ts` | `preserves existing generalExplanation and perChoice when reference present` | Adding a reference doesn't break other fields | Unit |

### Phase 3 tests (seed pipeline)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `scripts/seed.test.ts` | `SeedQuestionRep includes reference_md from parsed content` | `reference_md` is non-null when source has reference | Unit |
| `scripts/seed.test.ts` | `SeedQuestionRep has null reference_md when source lacks reference` | `reference_md` is `null` | Unit |

### Phase 4 tests (domain → controller)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `src/application/use-cases/submit-answer.test.ts` | `returns referenceMd when shouldShowExplanation is true` | Output includes `referenceMd` from question | Unit |
| `src/application/use-cases/submit-answer.test.ts` | `returns null referenceMd in exam mode` | Output `referenceMd` is `null` when explanation hidden | Unit |
| `src/application/use-cases/get-next-question.test.ts` | `includes referenceMd in PreviousSubmission` | `previousSubmission.referenceMd` matches question | Unit |
| `src/adapters/controllers/question-controller.test.ts` | `validates referenceMd in SubmitAnswerOutput schema` | Schema accepts `referenceMd: string` and `referenceMd: null` | Unit |

### Phase 5 tests (UI)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `components/question/Feedback.test.tsx` | `renders reference section when referenceMd is non-null` | Output contains "Reference" label and citation text | Component (jsdom) |
| `components/question/Feedback.test.tsx` | `hides reference section when referenceMd is null` | Output does not contain "Reference" label | Component (jsdom) |

### Test convention enforcement

- Every `*.test.tsx` starts with `// @vitest-environment jsdom` on line 1.
- Render-output tests use `renderToStaticMarkup`.
- Use existing fakes from `src/application/test-helpers/fakes/` (no module mocks for app code).
- Use `createQuestion()` and `createChoice()` factories from `src/domain/test-helpers/`.

---

## 9. Post-Implementation: Content Import Workflow

After the reference field is implemented, run the full pipeline:

### Step 1: Import drafts → MDX

```bash
# Dry run first — verify all 948 questions pass
pnpm content:import:drafts -- --dry-run

# Import with published status
pnpm content:import:drafts -- --status published
```

**Expected:** 170 files → 948 MDX files in `content/questions/imported/`.

### Step 2: Seed database

```bash
pnpm db:seed
```

**Expected:** 948 questions inserted/updated with `stem_md`, `explanation_md`, `reference_md`, choices, and tags. SHA256 change detection handles idempotent re-runs.

### Step 3: Verify

```bash
# Typecheck + lint + tests
pnpm typecheck && pnpm lint && pnpm test --run
```

```sql
-- Verify reference_md is populated
SELECT COUNT(*) AS total,
       COUNT(reference_md) AS with_reference
FROM questions;
-- Expected: total=948, with_reference=948
```

---

## 10. Non-Functional Requirements

1. Existing attempts, sessions, and bookmarks remain unchanged. No user data is affected.
2. The `reference_md` column is nullable — no `NOT NULL` constraint. Questions without references (placeholders, future questions) work without modification.
3. The migration is additive (new column, no destructive changes). Safe to apply to any environment.
4. SHA256 change detection in the seed script means re-running `pnpm db:seed` after implementation will detect content changes (the reference field changes the hash) and update accordingly.
5. No performance regression — `reference_md` is a text column read alongside existing columns. No additional queries.

---

## 11. Files Changed (Complete List)

| # | File | Change | Layer |
|---|------|--------|-------|
| 1 | `db/schema.ts` | Add `referenceMd` column to `questions` | Database |
| 2 | `db/migrations/0011_*.sql` | Auto-generated by `pnpm db:generate` | Database |
| 3 | `scripts/seed-helpers.ts` | Extract `### Reference` as third return value | Seed parsing |
| 4 | `scripts/seed-helpers.test.ts` | Add reference extraction tests | Test |
| 5 | `scripts/seed/question-parser.ts` | Add `reference_md` to `SeedQuestionRep` + `buildSeedRepFromDb` | Seed pipeline |
| 6 | `scripts/seed/question-syncer.ts` | Include `referenceMd` in insert/update | Seed pipeline |
| 7 | `scripts/seed.test.ts` | Update seed rep assertions | Test |
| 8 | `src/domain/entities/question.ts` | Add `referenceMd` field | Domain |
| 9 | `src/adapters/repositories/drizzle-question-repository.ts` | Map new column in `toDomain()` | Repository |
| 10 | `src/application/use-cases/submit-answer.ts` | Propagate `referenceMd` in output | Use case |
| 11 | `src/application/use-cases/get-next-question.ts` | Propagate in `PreviousSubmission` | Use case |
| 12 | `src/adapters/controllers/question-controller.ts` | Add to output Zod schemas | Controller |
| 13 | `components/question/feedback.tsx` | Render reference section | UI |
| 14 | `components/question/Feedback.test.tsx` | Add reference rendering tests | Test |

---

## 12. Implementation Notes

### Recommended PR sequencing

Single PR is appropriate — the change is a coherent vertical slice with no intermediate deployable state that makes sense independently. Each layer change is small and follows existing patterns exactly.

### Ordering dependencies (within the PR)

1. DB schema + migration first (column must exist before seed writes to it)
2. Seed parsing + pipeline (captures reference from MDX)
3. Domain + repository (maps column to entity)
4. Use cases + controller (propagates through application layer)
5. UI (renders the field)
6. Content import + seed run (populates the database)

### Rollback strategy

- Column addition is safe to leave in place even if code is reverted.
- To fully rollback: revert code, drop `reference_md` column, re-seed.
- No user data depends on this column, so rollback has zero data loss risk.

---

## 13. Success Criteria

1. `parseChoiceExplanations()` returns `referenceMd` as a separate field.
2. `questions.reference_md` column exists in database schema.
3. `pnpm db:seed` populates `reference_md` for all 948 imported questions.
4. Feedback UI renders citation in muted styling below per-choice explanations.
5. Reference is hidden in exam mode (same gating as `explanationMd`).
6. Reference is shown in exam review mode (same as `explanationMd`).
7. `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, and `pnpm build` pass.
8. All 14 files in §11 are the only files changed.

---

## 14. Deferred Items

1. **Structured citation fields** (DOI, PubMed ID, journal, year) — future spec when product needs search/linking.
2. **Citation auto-linking** — hyperlink DOIs or PubMed IDs in rendered citations.
3. **Multiple references per question** — current format is single reference; extend if needed.
4. **SPEC-033 §14 database sync** — migration 0010 application tracked separately.

---

## 15. Related

- [BS-025](../brainstorming/BS-025-reference-section-pipeline-support.md) — First-principles analysis and option evaluation
- [SPEC-033](spec-033-tag-taxonomy-migration.md) — Tag taxonomy (prerequisite, completed)
- [Question Format Spec](../content/question-format-spec.md) — Pipeline reference
- [`content/drafts/questions/SCHEMA.md`](../../content/drafts/questions/SCHEMA.md) — Authoring format
