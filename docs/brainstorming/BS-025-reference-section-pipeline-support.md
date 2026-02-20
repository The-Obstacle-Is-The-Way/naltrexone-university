# BS-025: Reference Section Pipeline Support

> **Status:** Implemented via [SPEC-035](../specs/spec-035-reference-field-and-content-import.md)
> **Created:** 2026-02-19
> **Context:** New draft questions include `### Reference` sections with AMA-format citations. The current pipeline silently drops them during seeding. This document traces the problem from first principles and proposes the architecturally correct fix.

---

## 1. How Every Part of a Question Flows Today (Vertical Trace)

Before proposing anything, we must understand exactly how each content field travels from draft to UI. There are four content fields that reach the user:

### Field 1: `stemMd` (Question Stem)

```
Draft .md      →  ## Question section body
Import script  →  extractBetweenHeadings('## Question', '## Choices') → stemMd
MDX file       →  ## Stem section body
Seed script    →  parseMdxQuestionBody() extracts between ## Stem / ## Explanation
DB column      →  questions.stem_md (text, NOT NULL)
Domain entity  →  Question.stemMd: string
Use case       →  GetNextQuestion returns stemMd directly
Controller     →  NextQuestion.stemMd passed through
UI component   →  QuestionCard receives stemMd prop
Renderer       →  <Markdown content={stemMd} /> → ReactMarkdown → HTML
```

### Field 2: `explanationMd` (General Explanation)

```
Draft .md      →  ## Explanation section body (everything after ## Explanation heading)
Import script  →  extractAfterHeading('## Explanation') captures ALL content including
                  "Why other answers are wrong" AND "### Reference"
MDX file       →  ## Explanation section body (full content preserved)
Seed script    →  parseChoiceExplanations() SPLITS the content:
                    - Lines BEFORE "**Why other answers are wrong:**" → generalExplanation
                    - Lines AFTER that heading → per-choice parsing (see Field 3)
                    - "### Reference" triggers break → SILENTLY DROPPED
DB column      →  questions.explanation_md (text, NOT NULL) — stores ONLY generalExplanation
Domain entity  →  Question.explanationMd: string
Use case       →  SubmitAnswer returns explanationMd (null in exam mode)
                  GetNextQuestion returns in PreviousSubmission.explanationMd
Controller     →  SubmitAnswerOutput.explanationMd: string | null
UI component   →  Feedback receives explanationMd prop
Renderer       →  <Markdown content={explanationMd} /> → ReactMarkdown → HTML
                  Rendered inside a Card with "Explanation" label above it
```

### Field 3: `choice.explanationMd` (Per-Choice Explanations)

```
Draft .md      →  Bullets under "**Why other answers are wrong:**" heading
                  e.g., "- A) The guideline explicitly states..."
Import script  →  Preserved as part of ## Explanation body (not parsed separately)
MDX file       →  Part of ## Explanation body (not a separate section)
Seed script    →  parseChoiceExplanations() extracts each "- X)" bullet
                  into a Map<label, text>. Parsing STOPS at any ### heading.
                  seed-helpers.ts:72-73:
                    if (SECTION_HEADING_PATTERN.test(line)) { break; }
DB column      →  choices.explanation_md (text, nullable) — one per choice row
Domain entity  →  Choice.explanationMd: string | null
Use case       →  SubmitAnswer.mapChoiceExplanations() builds array with displayLabel
Controller     →  SubmitAnswerOutput.choiceExplanations[].explanationMd
UI component   →  Feedback renders each in a bordered card with shuffled label
Renderer       →  <Markdown content={choice.explanationMd} /> per choice
                  Rendered in "Why other answers are wrong:" section of Feedback
```

### Field 4: `### Reference` (Citation) — DOES NOT EXIST IN PIPELINE

```
Draft .md      →  ### Reference section after per-choice bullets
Import script  →  Preserved in ## Explanation body (captured by extractAfterHeading)
MDX file       →  Present in the explanation body text
Seed script    →  parseChoiceExplanations() hits ### Reference heading → break
                  Content falls into void: not in generalExplanation (that's everything
                  BEFORE "Why other answers are wrong"), not in any perChoice entry
                  (parsing already stopped), not captured anywhere else
DB column      →  DOES NOT EXIST — no column for reference content
Domain entity  →  DOES NOT EXIST — no referenceMd field
Use case       →  DOES NOT EXIST — never propagated
Controller     →  DOES NOT EXIST — never in output
UI component   →  DOES NOT EXIST — never rendered
Renderer       →  NEVER REACHED
```

**The reference is silently lost at the seed parsing step.** The data exists in the MDX file on disk but enters a parsing gap where no code captures it.

---

## 2. Exactly Where It Breaks (Code Trace)

**File:** `scripts/seed-helpers.ts`, lines 36-101 (`parseChoiceExplanations`)

```typescript
// Step 1: Split at "Why other answers are wrong" heading
const headingIndex = lines.findIndex(line => WRONG_ANSWERS_HEADING_PATTERN.test(line));
const generalExplanation = lines.slice(0, headingIndex).join('\n');  // ← Before heading

// Step 2: Parse per-choice bullets AFTER the heading
for (const line of lines.slice(headingIndex + 1)) {
  if (SECTION_HEADING_PATTERN.test(line)) {      // ← line 72: matches "### Reference"
    break;                                         // ← line 73: STOPS HERE
  }
  // ... parse choice bullets ...
}

// Step 3: Return — reference content is in neither bucket
return { generalExplanation, perChoice };          // ← No third field
```

**Why `generalExplanation` doesn't contain it:** `generalExplanation` is `lines.slice(0, headingIndex)` — everything BEFORE "Why other answers are wrong". The reference comes AFTER the per-choice bullets.

**Why `perChoice` doesn't contain it:** The per-choice parser breaks at any `#{1,6}` heading. `### Reference` is a heading, so parsing stops before it.

**The gap:** Content between the `break` and the end of the string is never assigned to any variable.

---

## 3. The Draft Content Structure

Here's what the new drafts look like (948 questions across all sources):

```markdown
## Explanation

[General explanation — clinical reasoning, mechanism, context]

**Clinical pearl:** [Practical takeaway]

**Why other answers are wrong:**
- A) [Why A is wrong — teaches a concept]
- C) [Why C is wrong — corrects a misconception]
- D) [Why D is wrong — provides context]

### Reference

Anton RF, O'Malley SS, Ciraulo DA, et al. Combined pharmacotherapies and
behavioral interventions for alcohol dependence: the COMBINE study: a
randomized controlled trial. JAMA. 2006;295(17):2003-2017.
```

The reference is semantically distinct from the explanation. It is metadata about the source material, not teaching content. A citation is not an explanation — it tells the learner WHERE to go, not WHAT to understand.

---

## 4. Options Evaluated from First Principles

### Option A: Append reference to `generalExplanation` (hack)

Modify `parseChoiceExplanations()` to capture post-break lines and append to `generalExplanation`.

**Why this violates Clean Architecture:** It conflates two semantically different things (teaching content and bibliographic metadata) in one field. The `explanation_md` column would contain explanation + citation, making it impossible to:
- Render the citation with different styling
- Query whether a question has a citation
- Update citations independently of explanations
- Add structured citation features later (DOI links, PubMed lookups)

**Verdict: Rejected.** This is a hack that creates technical debt. Uncle Bob would not approve.

---

### Option B: New `reference_md` column — full vertical slice (correct fix)

Add `referenceMd` as a first-class field that travels through every layer, just like `stemMd` and `explanationMd` do today.

**The complete change set:**

```
Draft .md      →  ### Reference section (no change — authors already write it here)
Import script  →  No change needed — reference preserved in ## Explanation body
MDX file       →  No change needed — reference present in explanation body
Seed parsing   →  parseChoiceExplanations() returns { generalExplanation, perChoice, referenceMd }
                  Captures lines after the per-choice break that start with ### Reference
DB column      →  ADD questions.reference_md (text, nullable)
Domain entity  →  ADD Question.referenceMd: string | null
Repository     →  Map new column to domain field (trivial — same name pattern as all others)
Use cases      →  SubmitAnswer propagates referenceMd in output
                  GetNextQuestion propagates in PreviousSubmission
Controllers    →  Add referenceMd to output schemas
UI component   →  Feedback renders reference in a dedicated section after per-choice cards
Renderer       →  <Markdown content={referenceMd} /> with citation-appropriate styling
```

**Why this is correct:**
- Single Responsibility: Each field holds one concept (stem, explanation, per-choice, reference)
- Open/Closed: Adding a reference doesn't modify existing explanation logic
- Dependency Inversion: Every layer propagates the field the same way as existing fields
- Follows the exact same pattern as every other content field in the system
- The vertical trace for `referenceMd` is identical in structure to `explanationMd`

**Effort:** Medium. Touches 10-12 files across all layers. But each change is small and follows existing patterns exactly.

---

### Option C: Citation in YAML frontmatter (over-engineered)

Move reference text from `## Explanation` body into YAML frontmatter.

**Why this is wrong for now:**
- Requires changing DraftFrontmatterSchema AND QuestionFrontmatterSchema (both `.strict()`)
- Requires all 948 draft questions to move citation from body to YAML
- YAML is for structured metadata (slugs, enums, arrays). AMA citations are prose.
- The current `### Reference` in the body is natural for authors — it reads like a paper
- If we later need structured fields (DOI, PubMed ID, journal, year), THAT is when YAML makes sense — but that's a different feature

**Verdict: Premature.** Solve the right problem at the right time.

---

### Option D: Strip references explicitly (do nothing)

Modify the import script to remove `### Reference` before writing MDX.

**Why this is wrong:**
- We have 948 questions with carefully authored AMA citations
- Stripping them discards real value that authors spent time creating
- Citations are important for a board-prep product — learners need to know the source
- We'd have to re-add them later anyway

**Verdict: Rejected.** We have the data. Ship it.

---

## 5. Recommendation: Option B — Full Vertical Slice

### Implementation Plan (minimum vertical slice, ordered by dependency)

#### Layer 1: Database Schema

**File:** `db/schema.ts`
```typescript
// Add to questions table definition:
referenceMd: text('reference_md'),  // nullable — not all questions have references
```

Then: `pnpm db:generate` to create migration.

#### Layer 2: Seed Parsing

**File:** `scripts/seed-helpers.ts`

Modify `parseChoiceExplanations()` return type:
```typescript
export function parseChoiceExplanations(explanationMd: string): {
  generalExplanation: string;
  perChoice: Map<string, string>;
  referenceMd: string | null;        // NEW
}
```

After the per-choice `break`, capture remaining lines that follow `### Reference`:
```typescript
// After the for loop breaks at ### Reference:
// Scan remaining lines for reference content
let referenceMd: string | null = null;
// ... capture lines after ### Reference heading ...
```

**File:** `scripts/seed-helpers.test.ts` — Add tests for reference extraction.

#### Layer 3: Seed Pipeline

**File:** `scripts/seed/question-parser.ts`

Add `reference_md` to `SeedQuestionRep`:
```typescript
export type SeedQuestionRep = {
  slug: string;
  stem_md: string;
  explanation_md: string;
  reference_md: string | null;      // NEW
  // ... rest unchanged
};
```

Wire up in `buildSeedRepFromParsed()`:
```typescript
const parsedExplanations = parseChoiceExplanations(parsed.explanationMd);
return {
  // ...
  explanation_md: parsedExplanations.generalExplanation,
  reference_md: parsedExplanations.referenceMd,    // NEW
  // ...
};
```

**File:** `scripts/seed/question-syncer.ts` — Include `referenceMd` in insert and update queries.

**File:** `scripts/seed.test.ts` — Update seed rep tests.

#### Layer 4: Domain Entity

**File:** `src/domain/entities/question.ts` (or wherever Question type lives)
```typescript
type Question = {
  // ... existing fields ...
  readonly referenceMd: string | null;   // NEW
};
```

#### Layer 5: Repository

**File:** `src/adapters/repositories/drizzle-question-repository.ts`

Add to `toDomain()` mapping:
```typescript
referenceMd: row.referenceMd ?? null,   // NEW — same pattern as all other fields
```

#### Layer 6: Use Cases

**File:** `src/application/use-cases/submit-answer.ts`

Add `referenceMd` to `SubmitAnswerOutput`:
```typescript
return {
  // ...
  explanationMd,
  referenceMd: shouldShowExplanation ? question.referenceMd : null,   // NEW
  choiceExplanations,
};
```

**File:** `src/application/use-cases/get-next-question.ts`

Add to `PreviousSubmission` type:
```typescript
return {
  correctChoiceId: correctChoice.id,
  explanationMd: question.explanationMd,
  referenceMd: question.referenceMd,     // NEW
  choiceExplanations: // ...
};
```

**File:** `src/application/use-cases/get-previous-attempt.ts`

Add `referenceMd` to review payload so History/Review pages can render citations:
```typescript
return {
  // ...
  explanationMd: question.explanationMd,
  referenceMd: question.referenceMd,     // NEW
  choiceExplanations,
};
```

#### Layer 7: Controllers

Update controller output contracts to include `referenceMd: z.string().nullable()` where runtime schemas exist (e.g., `submitAnswer`), and propagate the new field through review payloads.

#### Layer 8: UI

**File:** `components/question/feedback.tsx`

Add a reference section after the per-choice explanations:
```tsx
{referenceMd ? (
  <div className="mt-4 border-t border-border/40 pt-3">
    <div className="text-xs font-medium text-muted-foreground">Reference</div>
    <Markdown content={referenceMd} className="mt-1 text-xs text-muted-foreground" />
  </div>
) : null}
```

Smaller text, muted color, border separator — visually distinct from teaching content.

---

## 6. What This Looks Like in the UI

```
┌──────────────────────────────────────────────────────────┐
│  ✓ Correct                                               │
│                                                          │
│  Explanation                                             │
│  The COMBINE study demonstrated that naltrexone          │
│  (100 mg/d) was effective for alcohol use disorder...    │
│                                                          │
│  Clinical pearl: Medical management in the COMBINE       │
│  study consisted of 9 sessions over 16 weeks...          │
│                                                          │
│  Why other answers are wrong:                            │
│  ┌──────────────────────────────────────────────────┐    │
│  │ A) Acamprosate showed no evidence of efficacy... │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │ C) Disulfiram was not studied in the COMBINE...  │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │ D) Topiramate was not studied in the COMBINE...  │    │
│  └──────────────────────────────────────────────────┘    │
│  ─────────────────────────────────────────────────────   │
│  Reference                                               │
│  Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA.        │
│  2006;295(17):2003-2017.                                │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Why Not Later?

We have 948 questions with citations ready to import. The pipeline needs to handle references BEFORE the first import run, not after. Running `pnpm db:seed` without this fix silently discards every citation. Re-importing later wastes a full seed cycle and risks data inconsistency.

Build it once, build it right, build it now.

---

## 8. Test Plan

1. **Unit test** (`seed-helpers.test.ts`): `parseChoiceExplanations` extracts `referenceMd` from content with `### Reference` section
2. **Unit test** (`seed-helpers.test.ts`): Returns `null` when no `### Reference` present
3. **Unit test** (`question-parser.test.ts` or `seed.test.ts`): `SeedQuestionRep` carries `reference_md` through
4. **Unit test** (`Feedback.test.tsx`): Feedback renders reference section when `referenceMd` is non-null
5. **Unit test** (`Feedback.test.tsx`): Feedback hides reference section when `referenceMd` is null
6. **Integration**: `pnpm content:import:drafts -- --dry-run` passes on new drafts
7. **Integration**: `pnpm db:seed` stores reference content in new column
8. **Visual**: Reference appears in UI after answering a question

---

## 9. Files Changed (Complete List)

| File | Change | Layer |
|------|--------|-------|
| `db/schema.ts` | Add `referenceMd` column to questions | Database |
| `db/migrations/0011_*.sql` | Auto-generated by `pnpm db:generate` | Database |
| `scripts/seed-helpers.ts` | Extract `### Reference` as third return value | Seed parsing |
| `scripts/seed-helpers.test.ts` | Add reference extraction tests | Test |
| `scripts/seed/question-parser.ts` | Add `reference_md` to `SeedQuestionRep` + `buildSeedRepFromDb` | Seed pipeline |
| `scripts/seed/question-syncer.ts` | Include `referenceMd` in insert/update | Seed pipeline |
| `scripts/seed.test.ts` | Update seed rep assertions | Test |
| `src/domain/entities/question.ts` | Add `referenceMd` field | Domain |
| `src/adapters/repositories/drizzle-question-repository.ts` | Map new column | Repository |
| `src/application/use-cases/submit-answer.ts` | Propagate `referenceMd` | Use case |
| `src/application/use-cases/get-next-question.ts` | Propagate in `PreviousSubmission` | Use case |
| `src/application/use-cases/get-previous-attempt.ts` | Propagate for review payloads | Use case |
| `src/adapters/controllers/question-controller.ts` | Add to output schema | Controller |
| `app/(app)/app/practice/shared/use-question-flow-core.ts` | Restore `referenceMd` from tutor session previousSubmission | Practice UI state |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | Map review payload `referenceMd` into submitResult | Review UI state |
| `components/question/feedback.tsx` | Render reference section | UI |
| `components/question/Feedback.test.tsx` | Add reference rendering tests | Test |

---

## 10. Decision

**Implement Option B before running the import pipeline on the new drafts.**

This is the only option that:
- Treats citations as the semantically distinct data they are
- Follows the exact same vertical pattern as every other content field
- Enables future citation features without refactoring
- Respects Single Responsibility at every layer
- Doesn't silently discard author work
